//upload.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { splitVideo, extractAudio, convertToMP3 } from "../services/ffmpegService.js";
import { transcribeAudio } from "../services/transcriptionService.js";
import pool from "../database/db.js";
import Sbd from "sbd";
import { performance } from "perf_hooks";
import AWS from 'aws-sdk';
import crypto from 'crypto';

const router = express.Router();
const upload = multer({ dest: "uploads/" });
const uploadToMemory = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

router.post("/", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  const uploadedPath = req.file.path;
  const originalName = req.file.originalname || req.file.filename;
  const chunksDir = path.join(__dirname, "../chunks");
  const audioDir = path.join(__dirname, "../audio_chunks");
  const tempMP3Path = path.join(__dirname, "../uploads", `temp_${Date.now()}_audio.mp3`);

  try {
    // Convert to MP3 first
    console.log(`🎵 Converting ${originalName} to MP3...`);
    await convertToMP3(uploadedPath, tempMP3Path, "64k");
    console.log(`✅ MP3 conversion complete`);
    
    // Delete original video to save space
    fs.unlink(uploadedPath, () => {});

    // cleanup/create directories
    if (fs.existsSync(chunksDir)) fs.rmSync(chunksDir, { recursive: true, force: true });
    if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true, force: true });
    fs.mkdirSync(chunksDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });

    // split MP3 into 5-min chunks (300s)
    await splitVideo(tempMP3Path, 300, chunksDir);

    const chunkFiles = fs.readdirSync(chunksDir)
      .filter(f => f.endsWith(".mp4")) // ffmpeg still outputs as .mp4 container
      .sort()
      .map(f => path.join(chunksDir, f));
    
    // Delete full MP3 to save space
    fs.unlink(tempMP3Path, () => {});

    // read optional consultant IDs from multipart form
    const consultantIds = req.body.consultant_ids ? JSON.parse(req.body.consultant_ids) : null;

    // create transcript entry (save consultant IDs if provided)
    const insertRes = await pool.query(
      `INSERT INTO transcripts (filename, content, created_at, consultant_ids)
       VALUES ($1, '', NOW(), $2) RETURNING id`,
      [originalName, consultantIds]
    );
    const transcriptId = insertRes.rows[0].id;
    

    const startTime = performance.now(); 
    // Process all chunks in parallel with batching
    const batchSize = 10; // Increased for MP3 chunks
    const allResults = [];
    
    for (let i = 0; i < chunkFiles.length; i += batchSize) {
      const batch = chunkFiles.slice(i, i + batchSize);
      console.log(`⚙️ Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunkFiles.length / batchSize)}`);
      
      const batchResults = await Promise.all(batch.map(async (chunkFile, batchIdx) => {
        const idx = i + batchIdx;
        const chunkStart = performance.now();

        // Transcribe MP3 chunk directly
        const transcript = await transcribeAudio(chunkFile);
        
        // Clean up chunk immediately
        fs.unlink(chunkFile, () => {});
        
        const sentences = Sbd.sentences(transcript);
        const chunkContent = sentences.join("\n");
   
        const chunkEnd = performance.now();
        console.log(`⏱️ Chunk ${idx + 1}/${chunkFiles.length} in ${((chunkEnd - chunkStart) / 1000).toFixed(1)}s`);
        return chunkContent;
      }));
      
      allResults.push(...batchResults);
    }

    const fullTranscript = allResults.join("\n\n");
    const endTime = performance.now();
    console.log(`✅ All chunks processed in ${((endTime - startTime) / 1000).toFixed(1)}s`);
    // update full transcript in main table (optional)
    await pool.query(
      `UPDATE transcripts SET content = $1 WHERE id = $2`,
      [fullTranscript.trim(), transcriptId]
    );
console.log(`in DATA BASE `);
    // return both transcript text and ID to frontend
    res.json({ transcript: fullTranscript.trim(), id: transcriptId });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing video");
  } finally {
    fs.unlink(uploadedPath, () => {});
  }
});

// Upload large video to S3 via backend (avoids CORS and Render 50MB limit)
router.post("/large", uploadToMemory.single("video"), async (req, res) => {

  console.log("Received large video upload request");
  if (!req.file) return res.status(400).send("No file uploaded.");

  // Check if AWS credentials are configured
  console.log("AWS_ACCESS_KEY_ID:", process.env.AWS_ACCESS_KEY_ID ? "✅ Set" : "❌ Missing");
  console.log("AWS_SECRET_ACCESS_KEY:", process.env.AWS_SECRET_ACCESS_KEY ? "✅ Set" : "❌ Missing");
  console.log("AWS_S3_BUCKET_NAME:", process.env.AWS_S3_BUCKET_NAME ? `✅ ${process.env.AWS_S3_BUCKET_NAME}` : "❌ Missing");
  console.log("AWS_REGION:", process.env.AWS_REGION || "us-east-1 (default)");
  
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET_NAME) {
    const missingVars = [];
    if (!process.env.AWS_ACCESS_KEY_ID) missingVars.push("AWS_ACCESS_KEY_ID");
    if (!process.env.AWS_SECRET_ACCESS_KEY) missingVars.push("AWS_SECRET_ACCESS_KEY");
    if (!process.env.AWS_S3_BUCKET_NAME) missingVars.push("AWS_S3_BUCKET_NAME");
    
    const errorMsg = `❌ AWS S3 not configured. Missing: ${missingVars.join(', ')}. Please add these to your .env file and restart the server.`;
    console.error(errorMsg);
    return res.status(500).json({ 
      error: errorMsg
    });
  }

  const originalName = req.file.originalname;
  const chunksDir = path.join(__dirname, "../chunks");
  const audioDir = path.join(__dirname, "../audio_chunks");
  let tempVideoPath = null;
  let tempMP3Path = null;

  try {
    // Convert to MP3 BEFORE uploading to S3
    console.log(`🎵 Converting ${originalName} (${(req.file.size / 1024 / 1024).toFixed(1)}MB) to MP3...`);
    
    // Save video buffer to temp file first
    tempVideoPath = path.join(__dirname, "../uploads", `temp_${Date.now()}_${originalName}`);
    fs.writeFileSync(tempVideoPath, req.file.buffer);
    
    // Convert to MP3
    tempMP3Path = path.join(__dirname, "../uploads", `temp_${Date.now()}_audio.mp3`);
    await convertToMP3(tempVideoPath, tempMP3Path, "64k");
    
    // Delete original video
    fs.unlinkSync(tempVideoPath);
    tempVideoPath = null;
    
    const mp3Stats = fs.statSync(tempMP3Path);
    console.log(`✅ MP3 conversion complete: ${(mp3Stats.size / 1024 / 1024).toFixed(1)}MB (${((1 - mp3Stats.size / req.file.size) * 100).toFixed(0)}% smaller)`);
    
    // Upload MP3 to S3 instead of video
    const s3Key = `audio/${crypto.randomUUID()}.mp3`;
    
    console.log(`📤 Uploading MP3 to S3...`);
    
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fs.createReadStream(tempMP3Path),
      ContentType: 'audio/mpeg',
      ACL: 'private'
    };

    const result = await s3.upload(uploadParams).promise();
    console.log(`✅ Uploaded to S3: ${s3Key}`);
    
    // Delete uploaded MP3
    fs.unlinkSync(tempMP3Path);

    // Download MP3 from S3 to process locally
    tempMP3Path = path.join(__dirname, "../uploads", `temp_${Date.now()}_downloaded.mp3`);
    console.log(`📥 Downloading MP3 from S3 for processing...`);
    
    const downloadParams = { Bucket: BUCKET_NAME, Key: s3Key };
    const downloadStream = s3.getObject(downloadParams).createReadStream();
    const writeStream = fs.createWriteStream(downloadMP3Path);
    
    await new Promise((resolve, reject) => {
      downloadStream.pipe(writeStream);
      downloadStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('close', resolve);
    });

    console.log(`✅ Downloaded MP3 for processing`);
    
    // Delete the temp upload file
    if (tempMP3Path && fs.existsSync(tempMP3Path)) {
      fs.unlinkSync(tempMP3Path);
    }
    
    // Use the downloaded MP3 for processing
    tempMP3Path = downloadMP3Path;

    // cleanup/create directories
    if (fs.existsSync(chunksDir)) fs.rmSync(chunksDir, { recursive: true, force: true });
    if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true, force: true });
    fs.mkdirSync(chunksDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });

    // split MP3 into 5-min chunks (300s)
    await splitVideo(tempMP3Path, 300, chunksDir);

    const chunkFiles = fs.readdirSync(chunksDir)
      .filter(f => f.endsWith(".mp4")) // ffmpeg still outputs as .mp4 container
      .sort()
      .map(f => path.join(chunksDir, f));
    
    // Delete full MP3 to save space
    fs.unlink(tempMP3Path, () => {});

    // read optional consultant IDs from multipart form
    const consultantIds = req.body.consultant_ids ? JSON.parse(req.body.consultant_ids) : null;

    // create transcript entry (save consultant IDs and S3 key)
    const insertRes = await pool.query(
      `INSERT INTO transcripts (filename, content, created_at, consultant_ids, s3_key)
       VALUES ($1, '', NOW(), $2, $3) RETURNING id`,
      [originalName, consultantIds, s3Key]
    );
    const transcriptId = insertRes.rows[0].id;

    const startTime = performance.now(); 
    // Process all chunks in parallel with batching
    const batchSize = 10; // Increased for MP3 chunks
    const allResults = [];
    
    for (let i = 0; i < chunkFiles.length; i += batchSize) {
      const batch = chunkFiles.slice(i, i + batchSize);
      console.log(`⚙️ Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunkFiles.length / batchSize)}`);
      
      const batchResults = await Promise.all(batch.map(async (chunkFile, batchIdx) => {
        const idx = i + batchIdx;
        const chunkStart = performance.now();

        // Transcribe MP3 chunk directly
        const transcript = await transcribeAudio(chunkFile);
        
        // Clean up chunk immediately
        fs.unlink(chunkFile, () => {});
        
        const sentences = Sbd.sentences(transcript);
        const chunkContent = sentences.join("\n");
   
        const chunkEnd = performance.now();
        console.log(`⏱️ Chunk ${idx + 1}/${chunkFiles.length} in ${((chunkEnd - chunkStart) / 1000).toFixed(1)}s`);
        return chunkContent;
      }));
      
      allResults.push(...batchResults);
    }

    const fullTranscript = allResults.join("\n\n");
    const endTime = performance.now();
    console.log(`✅ All chunks processed in ${((endTime - startTime) / 1000).toFixed(1)}s`);
    
    // update full transcript in main table
    await pool.query(
      `UPDATE transcripts SET content = $1 WHERE id = $2`,
      [fullTranscript.trim(), transcriptId]
    );
    console.log(`📄 Transcript saved to database`);

    // return both transcript text and ID to frontend
    res.json({ 
      transcript: fullTranscript.trim(), 
      id: transcriptId,
      s3Key: s3Key 
    });

  } catch (err) {
    console.error("❌ Error processing large video:", err);
    console.error("Error details:", err.message);
    console.error("Error stack:", err.stack);
    
    res.status(500).json({ 
      error: "Error processing video",
      details: err.message 
    });
  } finally {
    // Clean up temp files
    if (tempVideoPath && fs.existsSync(tempVideoPath)) {
      fs.unlink(tempVideoPath, () => {});
    }
    if (tempMP3Path && fs.existsSync(tempMP3Path)) {
      fs.unlink(tempMP3Path, () => {});
    }
  }
});

// Process video from S3 (after presigned upload)
router.post("/process-s3", async (req, res) => {
  const { s3Key, originalName, consultant_ids } = req.body;

  if (!s3Key || !originalName) {
    return res.status(400).json({ error: "s3Key and originalName are required" });
  }

  try {
    console.log(`📥 Starting async processing for ${originalName} from S3 key: ${s3Key}`);

    // Create transcript entry immediately
    const consultantIdsArray = consultant_ids || null;

    const insertRes = await pool.query(
      `INSERT INTO transcripts (filename, content, created_at, consultant_ids, s3_key)
       VALUES ($1, $2, NOW(), $3, $4) RETURNING id`,
      [originalName, 'Processing...', consultantIdsArray, s3Key]
    );
    const transcriptId = insertRes.rows[0].id;

    // Respond immediately with the transcript ID
    res.json({ 
      id: transcriptId,
      message: "Processing started",
      status: "processing"
    });

    // Process asynchronously (don't await)
    processVideoFromS3(transcriptId, s3Key, originalName).catch(err => {
      console.error(`❌ Failed to process transcript ${transcriptId}:`, err);
      pool.query(
        `UPDATE transcripts SET content = $1 WHERE id = $2`,
        [`Error processing video: ${err.message}`, transcriptId]
      ).catch(console.error);
    });

  } catch (err) {
    console.error("❌ Error starting S3 video processing:", err);
    res.status(500).json({ 
      error: "Error starting video processing",
      details: err.message 
    });
  }
});

// Async function to process video/audio from S3
async function processVideoFromS3(transcriptId, s3Key, originalName) {
  const chunksDir = path.join(__dirname, "../chunks");
  const audioDir = path.join(__dirname, "../audio_chunks");
  const tempDownloadPath = path.join(__dirname, "../uploads", `temp_${Date.now()}_${originalName}`);
  let tempMP3Path = null;

  try {
    console.log(`📥 Downloading ${originalName} from S3 for transcript ${transcriptId}`);

    // Download from S3
    const downloadParams = { Bucket: BUCKET_NAME, Key: s3Key };
    const downloadStream = s3.getObject(downloadParams).createReadStream();
    const writeStream = fs.createWriteStream(tempDownloadPath);
    
    await new Promise((resolve, reject) => {
      downloadStream.pipe(writeStream);
      downloadStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('close', resolve);
    });

    console.log(`✅ Downloaded: ${tempDownloadPath}`);

    // Check if it's already MP3 (from browser conversion) or needs conversion
    const isMP3 = s3Key.endsWith('.mp3') || originalName.toLowerCase().endsWith('.mp3');
    
    if (isMP3) {
      console.log(`🎵 File is already MP3, skipping conversion`);
      tempMP3Path = tempDownloadPath; // Use downloaded file directly
    } else {
      // Convert video to MP3 first
      console.log(`🎵 Converting to MP3 for transcript ${transcriptId}...`);
      tempMP3Path = path.join(__dirname, "../uploads", `temp_${Date.now()}_audio.mp3`);
      await convertToMP3(tempDownloadPath, tempMP3Path, "64k");
      console.log(`✅ MP3 conversion complete`);
      
      // Delete original video to save space
      fs.unlinkSync(tempDownloadPath);
    }

    // cleanup/create directories
    if (fs.existsSync(chunksDir)) fs.rmSync(chunksDir, { recursive: true, force: true });
    if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true, force: true });
    fs.mkdirSync(chunksDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });

    // split MP3 into 5-min chunks (300s)
    await splitVideo(tempMP3Path, 300, chunksDir);

    const chunkFiles = fs.readdirSync(chunksDir)
      .filter(f => f.endsWith(".mp4")) // ffmpeg still outputs as .mp4 container
      .sort()
      .map(f => path.join(chunksDir, f));
    
    // Delete full MP3 to save space
    fs.unlink(tempMP3Path, () => {});

    const startTime = performance.now(); 
    // Process all chunks in parallel with batching to avoid overwhelming the API
    const batchSize = 10; // Increased batch size since we're using smaller MP3 chunks
    const allResults = [];
    
    for (let i = 0; i < chunkFiles.length; i += batchSize) {
      const batch = chunkFiles.slice(i, i + batchSize);
      console.log(`⚙️ Transcript ${transcriptId} - Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunkFiles.length / batchSize)}`);
      
      const batchResults = await Promise.all(batch.map(async (chunkFile, batchIdx) => {
        const idx = i + batchIdx;
        const chunkStart = performance.now();

        // Transcribe MP3 chunk directly (no need to extract audio again!)
        const transcript = await transcribeAudio(chunkFile);
        
        // Clean up chunk immediately to save disk space
        fs.unlink(chunkFile, () => {});
        
        const sentences = Sbd.sentences(transcript);
        const chunkContent = sentences.join("\n");
   
        const chunkEnd = performance.now();
        console.log(`⏱️ Transcript ${transcriptId} - Chunk ${idx + 1}/${chunkFiles.length} in ${((chunkEnd - chunkStart) / 1000).toFixed(1)}s`);
        return chunkContent;
      }));
      
      allResults.push(...batchResults);
    }

    const fullTranscript = allResults.join("\n\n");
    const endTime = performance.now();
    console.log(`✅ Transcript ${transcriptId} - All chunks processed in ${(endTime - startTime) / 1000}s`);
    
    // update full transcript in database
    await pool.query(
      `UPDATE transcripts SET content = $1 WHERE id = $2`,
      [fullTranscript.trim(), transcriptId]
    );
    console.log(`📄 Transcript ${transcriptId} saved to database`);

  } finally {
    // Clean up temp files
    if (tempDownloadPath && fs.existsSync(tempDownloadPath)) {
      fs.unlink(tempDownloadPath, () => {});
    }
    if (tempMP3Path && tempMP3Path !== tempDownloadPath && fs.existsSync(tempMP3Path)) {
      fs.unlink(tempMP3Path, () => {});
    }
  }
}

export default router;

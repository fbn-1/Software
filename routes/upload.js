//upload.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { splitVideo, extractAudio } from "../services/ffmpegService.js";
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

  try {
    // cleanup/create directories
    if (fs.existsSync(chunksDir)) fs.rmSync(chunksDir, { recursive: true, force: true });
    if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true, force: true });
    fs.mkdirSync(chunksDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });

    // split video into 5-min chunks (300s)
    await splitVideo(uploadedPath, 300, chunksDir);

    const chunkFiles = fs.readdirSync(chunksDir)
      .filter(f => f.endsWith(".mp4"))
      .sort()
      .map(f => path.join(chunksDir, f));

    // read optional consultant metadata from multipart form (multer puts non-file fields on req.body)
    const consultantName = req.body.consultant_name || null;
    const consultantRating = req.body.consultant_rating ? Number(req.body.consultant_rating) : null;

    // create transcript entry (save consultant metadata if provided)
    const insertRes = await pool.query(
      `INSERT INTO transcripts (filename, content, created_at, consultant_name, consultant_rating)
       VALUES ($1, '', NOW(), $2, $3) RETURNING id`,
      [originalName, consultantName, consultantRating]
    );
    const transcriptId = insertRes.rows[0].id;


    const startTime = performance.now(); 
    // Process all chunks in parallel
    const chunkResults = await Promise.all(chunkFiles.map(async (chunkFile, idx) => {
  const chunkStart = performance.now()

      const baseName = path.basename(chunkFile, ".mp4");
      const audioPath = path.join(audioDir, `${baseName}.wav`);
      await extractAudio(chunkFile, audioPath);
      const transcript = await transcribeAudio(audioPath);
      // split transcript into sentences
      const sentences = Sbd.sentences(transcript);
      const chunkContent = sentences.join("\n");
   
       const chunkEnd = performance.now();
        console.log(
    `⏱️ Chunk ${idx + 1} processed in ${(chunkEnd - chunkStart) / 1000} seconds`
  );
      return chunkContent;
    }));

    const fullTranscript = chunkResults.join("\n\n");
    // console.log("fullTranscript",fullTranscript);
const endTime = performance.now();
console.log(`✅ All chunks processed in ${(endTime - startTime) / 1000} seconds`);
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

  try {
    // Upload to S3 first
    const fileExtension = originalName.split('.').pop();
    const s3Key = `videos/${crypto.randomUUID()}.${fileExtension}`;
    
    console.log(`📤 Uploading ${originalName} (${(req.file.size / 1024 / 1024).toFixed(1)}MB) to S3...`);
    
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'private'
    };

    const result = await s3.upload(uploadParams).promise();
    console.log(`✅ Uploaded to S3: ${s3Key}`);

    // Download from S3 to process locally
    tempVideoPath = path.join(__dirname, "../uploads", `temp_${Date.now()}_${originalName}`);
    console.log(`📥 Downloading from S3 for processing...`);
    
    const downloadParams = { Bucket: BUCKET_NAME, Key: s3Key };
    const downloadStream = s3.getObject(downloadParams).createReadStream();
    const writeStream = fs.createWriteStream(tempVideoPath);
    
    await new Promise((resolve, reject) => {
      downloadStream.pipe(writeStream);
      downloadStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('close', resolve);
    });

    console.log(`✅ Downloaded for processing: ${tempVideoPath}`);

    // cleanup/create directories
    if (fs.existsSync(chunksDir)) fs.rmSync(chunksDir, { recursive: true, force: true });
    if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true, force: true });
    fs.mkdirSync(chunksDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });

    // split video into 5-min chunks (300s)
    await splitVideo(tempVideoPath, 300, chunksDir);

    const chunkFiles = fs.readdirSync(chunksDir)
      .filter(f => f.endsWith(".mp4"))
      .sort()
      .map(f => path.join(chunksDir, f));

    // read optional consultant metadata from multipart form
    const consultantName = req.body.consultant_name || null;
    const consultantRating = req.body.consultant_rating ? Number(req.body.consultant_rating) : null;

    // create transcript entry (save consultant metadata and S3 key)
    const insertRes = await pool.query(
      `INSERT INTO transcripts (filename, content, created_at, consultant_name, consultant_rating, s3_key)
       VALUES ($1, '', NOW(), $2, $3, $4) RETURNING id`,
      [originalName, consultantName, consultantRating, s3Key]
    );
    const transcriptId = insertRes.rows[0].id;

    const startTime = performance.now(); 
    // Process all chunks in parallel
    const chunkResults = await Promise.all(chunkFiles.map(async (chunkFile, idx) => {
      const chunkStart = performance.now()

      const baseName = path.basename(chunkFile, ".mp4");
      const audioPath = path.join(audioDir, `${baseName}.wav`);
      await extractAudio(chunkFile, audioPath);
      const transcript = await transcribeAudio(audioPath);
      // split transcript into sentences
      const sentences = Sbd.sentences(transcript);
      const chunkContent = sentences.join("\n");
   
      const chunkEnd = performance.now();
      console.log(`⏱️ Chunk ${idx + 1} processed in ${(chunkEnd - chunkStart) / 1000} seconds`);
      return chunkContent;
    }));

    const fullTranscript = chunkResults.join("\n\n");
    const endTime = performance.now();
    console.log(`✅ All chunks processed in ${(endTime - startTime) / 1000} seconds`);
    
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
  }
});

export default router;

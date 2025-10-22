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

const router = express.Router();
const upload = multer({ dest: "uploads/" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

export default router;

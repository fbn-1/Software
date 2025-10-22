import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import uploadRoutes from "./routes/upload.js";
import transcriptRoutes from "./routes/transcripts.js";
import annotationsRouter from "./routes/annotations.js";
import bloombergRouter from "./routes/bloombergroute.js";
import pool from "./database/db.js";

dotenv.config();
const app = express();

app.use(express.json());



app.use(cors());

// CORS: allow only the frontend origin (set FRONTEND_URL in env or default to localhost)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
	origin: (origin, callback) => {
		// allow requests with no origin (like curl, server-to-server)
		if (!origin) return callback(null, true);
		if (origin === FRONTEND_URL) return callback(null, true);
		return callback(new Error('CORS policy: This origin is not allowed'));
	}
}));

// FFmpeg setup
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
console.log("✅ FFmpeg path set to:", ffmpegInstaller.path);

// Routes

app.use("/upload", uploadRoutes);
app.use("/transcripts", transcriptRoutes);
app.use("/annotations", annotationsRouter);
app.use("/bloombergdata", bloombergRouter);

// Serve frontend build (if present) so the same Render service can host both API and UI
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendBuildPath = path.join(__dirname, 'frontend', 'build');
app.use(express.static(frontendBuildPath));

// Health endpoint for readiness checks
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// For SPA client-side routing: return index.html for unknown GET requests that are not API routes
// Use a pathless middleware to avoid path-to-regexp parsing issues with '*' on some runtimes.
app.use((req, res, next) => {
	if (req.method !== 'GET') return next();
	const apiPrefixes = ['/upload', '/transcripts', '/annotations', '/bloombergdata', '/health', '/api'];
	if (apiPrefixes.some(p => req.path.startsWith(p))) return next();
	const indexHtml = path.join(frontendBuildPath, 'index.html');
	res.sendFile(indexHtml, err => {
		if (err) return next();
	});
});


// Ensure database columns/types we expect (convenience for development)
async function ensureSchema() {
	try {
		// Ensure the base tables exist (use safe CREATE TABLE IF NOT EXISTS)
		await pool.query(`
		CREATE TABLE IF NOT EXISTS transcripts (
		  id SERIAL PRIMARY KEY,
		  filename TEXT,
		  content TEXT,
		  created_at TIMESTAMP DEFAULT now(),
		  consultant_name TEXT,
		  consultant_rating NUMERIC
		);
		`);

		await pool.query(`
		CREATE TABLE IF NOT EXISTS annotations (
		  id SERIAL PRIMARY KEY,
		  transcript_id INTEGER REFERENCES transcripts(id) ON DELETE CASCADE,
		  text TEXT,
		  ticker TEXT,
		  sentiment VARCHAR(16),
		  created_at TIMESTAMP DEFAULT now(),
		  rating INTEGER,
		  subsectors TEXT,
		  datatitle TEXT
		);
		`);

		// Add consultant_name if missing (safe for existing table)
		await pool.query("ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS consultant_name TEXT");
		// Add consultant_rating as NUMERIC if missing
		await pool.query("ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS consultant_rating NUMERIC");
		// If consultant_rating exists but is integer, convert to NUMERIC (USING cast)
		try {
			await pool.query("ALTER TABLE transcripts ALTER COLUMN consultant_rating TYPE NUMERIC USING (consultant_rating::numeric)");
		} catch (e) {
			// ignore if alter not applicable
		}
		console.log("✅ Ensured transcripts and annotations tables and columns");
	} catch (err) {
		console.error("⚠️ Failed to ensure schema columns:", err.message);
	}
}

const PORT = process.env.PORT || 5000;

ensureSchema().then(() => {
	app.listen(PORT, () => { console.log(`🚀 Server started on port ${PORT}`); });
}).catch((err) => {
	console.error("Failed to start server due to schema setup error:", err);
	// Still attempt to start server so Render can see logs and you can debug
	app.listen(PORT, () => { console.log(`🚀 Server started on port ${PORT} (schema setup failed)`); });
});



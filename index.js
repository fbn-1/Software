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
import s3Router from "./routes/s3.js";
import usersRouter from "./routes/users.js";
import pool from "./database/db.js";

dotenv.config();
const app = express();

app.use(express.json());



// CORS policy: allow requests from the configured FRONTEND_URL or a comma-separated
// ALLOWED_ORIGINS list. Also allow no-origin requests (curl, server-to-server) and
// any localhost origin during development.
const FRONTEND_URL = process.env.FRONTEND_URL || null;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

function isLocalhostOrigin(origin) {
	try {
		const u = new URL(origin);
		// Allow localhost, 127.0.0.1, and local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
		return u.hostname === 'localhost' || 
		       u.hostname === '127.0.0.1' ||
		       u.hostname.startsWith('192.168.') ||
		       u.hostname.startsWith('10.') ||
		       /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(u.hostname);
	} catch (e) {
		return false;
	}
}


app.use(cors({
	origin: (origin, callback) => {
		// allow requests with no origin (like curl or local file://)
		if (!origin) return callback(null, true);
		if (FRONTEND_URL && origin === FRONTEND_URL) return callback(null, true);
		if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
		if (isLocalhostOrigin(origin)) return callback(null, true);
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
app.use("/s3", s3Router);
app.use("/users", usersRouter);

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
		  consultant_ids INTEGER[]
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
		  subsector TEXT,
		  datatitle TEXT
		);
		`);

		// Create users table
		await pool.query(`
		CREATE TABLE IF NOT EXISTS users (
		  user_id SERIAL PRIMARY KEY,
		  first_name TEXT NOT NULL,
		  last_name TEXT NOT NULL,
		  rating NUMERIC,
		  person_identity TEXT UNIQUE,
		  created_at TIMESTAMP DEFAULT now()
		);
		`);

		// Create transcript_consultants junction table
		await pool.query(`
		CREATE TABLE IF NOT EXISTS transcript_consultants (
		  id SERIAL PRIMARY KEY,
		  transcript_id INTEGER REFERENCES transcripts(id) ON DELETE CASCADE,
		  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
		  created_at TIMESTAMP DEFAULT now(),
		  UNIQUE(transcript_id, user_id)
		);
		`);

		// Add indexes
		await pool.query("CREATE INDEX IF NOT EXISTS idx_transcript_consultants_transcript ON transcript_consultants(transcript_id)");
		await pool.query("CREATE INDEX IF NOT EXISTS idx_transcript_consultants_user ON transcript_consultants(user_id)");
		await pool.query("CREATE INDEX IF NOT EXISTS idx_users_person_identity ON users(person_identity)");

		// Add consultant_ids array if missing
		await pool.query("ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS consultant_ids INTEGER[]");
		// Add s3_key column for S3 uploads
		await pool.query("ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS s3_key TEXT");
		// Drop old columns if they exist
		try {
			await pool.query("ALTER TABLE transcripts DROP COLUMN IF EXISTS consultant_name");
			await pool.query("ALTER TABLE transcripts DROP COLUMN IF EXISTS consultant_rating");
		} catch (e) {
			// ignore if columns don't exist
		}
		console.log("✅ Ensured transcripts, annotations, users and transcript_consultants tables");
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



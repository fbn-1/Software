import express from "express";
import pool from "../database/db.js";

const router = express.Router();

// 1️⃣ Get all transcripts
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM transcripts ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 2️⃣ Get single transcript metadata by id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM transcripts WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).send("Transcript not found");
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// GET /transcripts/:id/content
router.get("/:id/content", async (req, res) => {
  const transcriptId = req.params.id;
  try {
    // Return the transcript's full content as a simple object: { content: "..." }
    const tRes = await pool.query("SELECT content FROM transcripts WHERE id = $1", [transcriptId]);
    if (tRes.rows && tRes.rows.length > 0 && tRes.rows[0].content && tRes.rows[0].content.toString().trim() !== "") {
      return res.json({ content: tRes.rows[0].content });
    }

    // No transcript content available
    res.json({ content: null });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching transcript content");
  }
});

// 4️⃣ Save transcript manually (optional)
router.post("/", async (req, res) => {
  try {
    const { filename, content, lines, consultant_name, consultant_rating } = req.body;
    const text = content ?? (Array.isArray(lines) ? lines.join("\n") : "");

    if (!text || text.trim() === "") return res.status(400).send("No transcript content provided");

    const insert = await pool.query(
      "INSERT INTO transcripts (filename, content, consultant_name, consultant_rating) VALUES ($1, $2, $3, $4) RETURNING id, filename, created_at",
      [filename ?? "untitled", text, consultant_name ?? null, consultant_rating ?? null]
    );

    res.json({ id: insert.rows[0].id, filename: insert.rows[0].filename, created_at: insert.rows[0].created_at });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error saving transcript");
  }
});

// 5️⃣ Delete transcript (with chunks if ON DELETE CASCADE)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM transcripts WHERE id = $1", [id]);
    res.json({ message: "Transcript deleted" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error deleting transcript");
  }
});

// 6️⃣ Update transcript metadata (only update when title, consultant_name and consultant_rating are provided)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, consultant_name, consultant_rating } = req.body;

    // Require all three fields to be present (non-empty)
    if (!title || title.toString().trim() === "" || !consultant_name || consultant_name.toString().trim() === "" || (consultant_rating === undefined || consultant_rating === null || consultant_rating === "")) {
      return res.status(400).send("Require title, consultant_name and consultant_rating to update transcript");
    }

    const ratingNum = Number(consultant_rating);
    if (Number.isNaN(ratingNum)) {
      return res.status(400).send("consultant_rating must be a number");
    }

    const result = await pool.query(
      `UPDATE transcripts SET filename = $1, consultant_name = $2, consultant_rating = $3 WHERE id = $4 RETURNING *`,
      [title, consultant_name, ratingNum, id]
    );

    if (result.rows.length === 0) return res.status(404).send("Transcript not found");
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error updating transcript metadata");
  }
});

export default router;

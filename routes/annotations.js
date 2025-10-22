// routes/annotations.js
import express from "express";
import pool from "../database/db.js";

const router = express.Router();

// POST new annotation
router.post("/", async (req, res) => {
  const { transcript_id, text, ticker, subsectors, datatitle, sentiment, rating } = req.body;
  console.log('POST /annotations', req.body);
  if (!transcript_id || !text || !sentiment) {
    return res.status(400).send("transcript_id, text and sentiment are required");
  }

  const r = rating ? Number(rating) : null;
  if (r !== null && (isNaN(r) || r < 1 || r > 5)) {
    return res.status(400).send("rating must be an integer between 1 and 5");
  }

  try {
  
    const result = await pool.query(
      `INSERT INTO annotations (transcript_id, text, ticker, subsectors, datatitle, sentiment, rating, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
  [transcript_id, text, ticker, subsectors, datatitle || null, sentiment, r]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error saving annotation");
  }
});

// GET annotations for a transcript
router.get("/:transcriptId", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM annotations WHERE transcript_id = $1 ORDER BY created_at ASC",
      [req.params.transcriptId]
    );
    console.log('GET /annotations', req.params.transcriptId, result.rows.length, 'annotations found');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error fetching annotations");
  }
});




// UPDATE an annotation by ID
router.put("/:id", async (req, res) => {
  const { text, ticker, subsectors, datatitle, sentiment, rating } = req.body;
  const { id } = req.params;

  if (!text || !sentiment) {
    return res.status(400).send("text and sentiment are required");
  }

  const r = rating ? Number(rating) : null;
  if (r !== null && (isNaN(r) || r < 1 || r > 5)) {
    return res.status(400).send("rating must be an integer between 1 and 5");
  }

  try {
    const result = await pool.query(
      `UPDATE annotations
       SET text = $1, ticker = $2, subsectors = $3, datatitle = $4, sentiment = $5, rating = $6, created_at = NOW()
       WHERE id = $7
       RETURNING *`,
  [text, ticker, subsectors, datatitle || null, sentiment, r, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).send("Annotation not found");
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error updating annotation");
  }
});

// DELETE an annotation by ID
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM annotations WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).send("Annotation not found");
    }

    res.json({ message: "Annotation deleted", deleted: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error deleting annotation");
  }
});


export default router;
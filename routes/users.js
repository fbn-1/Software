import express from "express";
import pool from "../database/db.js";

const router = express.Router();

// 1️⃣ Get all users
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users ORDER BY last_name, first_name");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 2️⃣ Search users by name
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "") {
      return res.json([]);
    }
    
    const searchTerm = `%${q.trim()}%`;
    const result = await pool.query(
      `SELECT * FROM users 
       WHERE LOWER(first_name) LIKE LOWER($1) 
       OR LOWER(last_name) LIKE LOWER($1) 
       OR LOWER(person_identity) LIKE LOWER($1)
       ORDER BY last_name, first_name
       LIMIT 20`,
      [searchTerm]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 3️⃣ Get single user by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).send("User not found");
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 4️⃣ Create new user
router.post("/", async (req, res) => {
  console.log("Creating new user with data:");
  try {
    const { first_name, last_name, rating, person_identity } = req.body;
    
    if (!first_name || first_name.trim() === "") {
      return res.status(400).send("First name is required");
    }
    if (!last_name || last_name.trim() === "") {
      return res.status(400).send("Last name is required");
    }
    // Ensure required fields present; check for duplicate first+last name below.
    // Check if first_name + last_name already exists (case-insensitive)
    const existingByNamePost = await pool.query(
      `SELECT user_id FROM users WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2)`,
      [first_name.trim(), last_name.trim()]
    );

     
    if (existingByNamePost.rows.length > 0) {
     console.log("existingByNamePost", existingByNamePost.rows);
      return res.status(409).json({ 
        error: `User with  ${first_name.trim()} ${last_name.trim()} already exists`,
        user_id: existingByNamePost.rows[0].user_id
      });
    }
    
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, rating, person_identity) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [
        first_name.trim(), 
        last_name.trim(), 
        rating !== null && rating !== undefined ? Number(rating) : null,
        person_identity && person_identity.trim() !== "" ? person_identity.trim() : null
      ]
    );
     
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      console.log("Conflict error on user creation:", message);
      return res.status(409).json({ error: message , raw: detail || constraint });
    }
    res.status(500).send(err.message);
  }
});

// 5️⃣ Update user
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, rating, person_identity } = req.body;
    
    if (!first_name || first_name.trim() === "") {
      return res.status(400).send("First name is required");
    }
    if (!last_name || last_name.trim() === "") {
      return res.status(400).send("Last name is required");
    }
    // Check if another user already has the same first+last name (case-insensitive)
    const existingByNamePut = await pool.query(
      `SELECT user_id FROM users WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2) AND user_id != $3`,
      [first_name.trim(), last_name.trim(), id]
    );
    if (existingByNamePut.rows.length > 0) {
      return res.status(409).json({ error: `User with this ${first_name.trim()} ${last_name.trim()} already exists`, user_id: existingByNamePut.rows[0].user_id });
    }
    
    const result = await pool.query(
      `UPDATE users 
       SET first_name = $1, last_name = $2, rating = $3, person_identity = $4 
       WHERE user_id = $5 
       RETURNING *`,
      [
        first_name.trim(), 
        last_name.trim(), 
        rating !== null && rating !== undefined ? Number(rating) : null,
        person_identity && person_identity.trim() !== "" ? person_identity.trim() : null,
        id
      ]
    );
    console.log("Update result:", result.rows);
    if (result.rows.length === 0) return res.status(404).send("User not found");
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ error: message, raw: detail || constraint });
    }
    res.status(500).send(err.message);
  }
});

// 6️⃣ Delete user
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM users WHERE user_id = $1", [id]);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 7️⃣ Get consultants for a specific transcript
router.get("/transcript/:transcriptId", async (req, res) => {
  try {
    const { transcriptId } = req.params;
    const result = await pool.query(
      `SELECT u.* FROM users u
       JOIN transcript_consultants tc ON u.user_id = tc.user_id
       WHERE tc.transcript_id = $1
       ORDER BY u.last_name, u.first_name`,
      [transcriptId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 8️⃣ Link consultants to transcript
router.post("/transcript/:transcriptId/consultants", async (req, res) => {
  try {
    const { transcriptId } = req.params;
    const { user_ids } = req.body; // Array of user IDs
    
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).send("user_ids array is required");
    }
    
    // First, remove all existing consultant links for this transcript
    await pool.query("DELETE FROM transcript_consultants WHERE transcript_id = $1", [transcriptId]);
    
    // Then add the new links
    const values = user_ids.map(uid => `(${transcriptId}, ${uid})`).join(', ');
    await pool.query(`
      INSERT INTO transcript_consultants (transcript_id, user_id) 
      VALUES ${values}
      ON CONFLICT (transcript_id, user_id) DO NOTHING
    `);
    
    // Return the linked consultants
    const result = await pool.query(
      `SELECT u.* FROM users u
       JOIN transcript_consultants tc ON u.user_id = tc.user_id
       WHERE tc.transcript_id = $1
       ORDER BY u.last_name, u.first_name`,
      [transcriptId]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

export default router;

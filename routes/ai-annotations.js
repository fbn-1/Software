// routes/ai-annotations.js
import express from "express";
import { openai } from "../config/openai.js";
import pool from "../database/db.js";

const router = express.Router();

/**
 * Find the best matching text in transcript content.
 * Handles cases where AI-generated quotes don't match exactly due to:
 * - Speaker labels (Speaker A:, Speaker B:)
 * - Whitespace/newline differences
 * - Minor punctuation differences
 */
function findBestMatch(transcriptContent, aiQuote) {
  // First try exact match
  if (transcriptContent.includes(aiQuote)) {
    return aiQuote;
  }

  // Normalize both strings for comparison
  const normalizeForSearch = (str) => str
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .replace(/Speaker [A-Z]:\s*/gi, '') // Remove speaker labels for matching
    .trim();

  const normalizedQuote = normalizeForSearch(aiQuote);
  
  // Try to find the quote without speaker labels
  // Split transcript into chunks and find best match
  const lines = transcriptContent.split('\n');
  let bestMatch = null;
  let bestScore = 0;

  // Build sliding window of text to search
  for (let i = 0; i < lines.length; i++) {
    for (let windowSize = 1; windowSize <= Math.min(10, lines.length - i); windowSize++) {
      const chunk = lines.slice(i, i + windowSize).join('\n');
      const normalizedChunk = normalizeForSearch(chunk);
      
      // Check if normalized quote is contained in this chunk
      if (normalizedChunk.includes(normalizedQuote)) {
        // Find the exact portion that matches
        const startIdx = normalizedChunk.indexOf(normalizedQuote);
        
        // Score by length - prefer shorter matches that still contain the quote
        const score = 1000 - chunk.length + normalizedQuote.length;
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = chunk.trim();
        }
      }
    }
  }

  // If we found a match, return it; otherwise return original (won't highlight but saves data)
  return bestMatch || aiQuote;
}

// POST - Generate ALL annotations for entire transcript
router.post("/generate-all/:transcriptId", async (req, res) => {
  const { transcriptId } = req.params;

  try {
    // 1. Get transcript content
    const transcriptRes = await pool.query(
      `SELECT content, filename FROM transcripts WHERE id = $1`,
      [transcriptId]
    );

    if (transcriptRes.rows.length === 0) {
      return res.status(404).json({ error: "Transcript not found" });
    }

    const transcriptContent = transcriptRes.rows[0].content;
    const filename = transcriptRes.rows[0].filename;

    if (!transcriptContent || transcriptContent.trim() === "Processing...") {
      return res.status(400).json({ error: "Transcript is still processing or empty" });
    }

    // 2. Get existing annotations to learn style (RAG)
    const existingAnnotations = await pool.query(`
      SELECT text, ticker, subsector, datatitle, sentiment, rating 
      FROM annotations 
      WHERE ticker IS NOT NULL AND datatitle IS NOT NULL
      LIMIT 10
    `);

    const examplesText = existingAnnotations.rows.map((ex, i) => `
Example ${i + 1}:
Text: "${ex.text?.substring(0, 300)}..."
→ Ticker: ${ex.ticker}
→ Subsector: ${ex.subsector}
→ Data Title: ${ex.datatitle}
→ Sentiment: ${ex.sentiment}
→ Rating: ${ex.rating}
`).join('\n');

    // 3. Generate all annotations with GPT-4
    const prompt = `You are a financial research analyst. Analyze this transcript and extract ALL important data points as structured annotations.

${examplesText ? `Learn from these examples of how I annotate:\n${examplesText}\n` : ''}

TRANSCRIPT:
"""
${transcriptContent.substring(0, 15000)}
"""

Extract 15-30 key data points. For EACH data point, identify:
1. The EXACT quote from the transcript - COPY the text VERBATIM including speaker labels like "Speaker A:" or "Speaker B:" if present. Do NOT paraphrase or clean up the text.
2. Relevant stock ticker(s) - e.g., RBLX, META, NVDA, ORCL
3. Subsector - e.g., "DIGITAL MEDIA", "Video Games", "Cloud / SaaS", "AI", "Security", "Semis"
4. Data Title - Brief topic description (e.g., "Impact of Face Verification on Chats")
5. Sentiment: "++" (very positive), "+" (positive), "=" (neutral), "-" (negative), "--" (very negative)
6. Rating: 1-5 importance score (5 = most important)

IMPORTANT: The "text" field must be an EXACT copy from the transcript, character-for-character, including any speaker labels, punctuation, and line breaks. This is used for text highlighting.

Return a JSON array:
{
  "annotations": [
    {
      "text": "Speaker A: exact quote from transcript including speaker label",
      "tickers": ["ORCL"],
      "subsectors": ["Cloud / SaaS"],
      "dataTitle": "Topic Title Here",
      "sentiment": "=",
      "rating": 3
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are a financial analyst extracting structured data points from transcripts. Be thorough and extract all meaningful insights. Return valid JSON only." 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    const annotations = result.annotations || [];

    // 4. Save all generated annotations to database
    // Use findBestMatch to ensure text matches transcript exactly for highlighting
    const savedAnnotations = [];
    for (const ann of annotations) {
      try {
        // Find the best matching text in the transcript to ensure highlighting works
        const matchedText = findBestMatch(transcriptContent, ann.text);
        
        const insertRes = await pool.query(
          `INSERT INTO annotations (transcript_id, text, ticker, subsector, datatitle, sentiment, rating, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           RETURNING *`,
          [
            transcriptId,
            matchedText, // Use the matched text instead of AI's text
            ann.tickers?.join(', ') || null,
            ann.subsectors?.join(', ') || null,
            ann.dataTitle || null,
            ann.sentiment || '=',
            ann.rating || 3
          ]
        );
        savedAnnotations.push(insertRes.rows[0]);
      } catch (err) {
        console.error('Failed to save annotation:', err.message);
      }
    }

    res.json({
      success: true,
      generated: annotations.length,
      saved: savedAnnotations.length,
      annotations: savedAnnotations
    });

  } catch (err) {
    console.error("Bulk generation error:", err);
    res.status(500).json({ error: "Failed to generate annotations", details: err.message });
  }
});

// POST - Generate single annotation for selected text
router.post("/generate", async (req, res) => {
  const { transcript_id, selected_text, context } = req.body;

  if (!selected_text) {
    return res.status(400).json({ error: "selected_text is required" });
  }

  try {
    // Get existing annotations as examples (RAG style)
    const existingAnnotations = await pool.query(`
      SELECT text, ticker, subsector, datatitle, sentiment, rating 
      FROM annotations 
      WHERE ticker IS NOT NULL AND datatitle IS NOT NULL
      LIMIT 5
    `);

    const examplesText = existingAnnotations.rows.map((ex, i) => `
Example ${i + 1}:
Text: "${ex.text?.substring(0, 200)}..."
→ Ticker: ${ex.ticker}, Subsector: ${ex.subsector}
→ Title: ${ex.datatitle}
→ Sentiment: ${ex.sentiment}, Rating: ${ex.rating}
`).join('\n');

    const prompt = `You are a financial research analyst. Analyze this transcript excerpt and create a structured annotation.

${examplesText ? `Learn from these examples:\n${examplesText}\n` : ''}

SELECTED TEXT:
"${selected_text}"

${context ? `CONTEXT:\n"${context.substring(0, 500)}"` : ''}

Return JSON:
{
  "dataTitle": "Brief topic title",
  "tickers": ["TICKER"],
  "subsectors": ["SUBSECTOR"],
  "sentiment": "++|+|=|-|--",
  "rating": 1-5,
  "reasoning": "Brief explanation"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a financial analyst. Return valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    res.json(result);

  } catch (err) {
    console.error("Single generation error:", err);
    res.status(500).json({ error: "Failed to generate", details: err.message });
  }
});

export default router;

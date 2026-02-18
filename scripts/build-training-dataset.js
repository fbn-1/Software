// scripts/build-training-dataset.js
// Run with: node scripts/build-training-dataset.js

import pool from "../database/db.js";
import fs from "fs";
import path from "path";

async function buildDataset() {
  console.log("🔄 Building training dataset from annotations...\n");

  // Get all annotations with their transcript content
  const result = await pool.query(`
    SELECT 
      a.text as selected_text,
      a.ticker,
      a.subsector,
      a.datatitle,
      a.sentiment,
      a.rating,
      t.content as transcript_content
    FROM annotations a
    JOIN transcripts t ON a.transcript_id = t.id
    WHERE a.ticker IS NOT NULL 
      AND a.sentiment IS NOT NULL
      AND a.text IS NOT NULL
      AND LENGTH(a.text) > 20
  `);

  console.log(`Found ${result.rows.length} annotations for training\n`);

  if (result.rows.length === 0) {
    console.log("❌ No annotations found. Please create some annotations first.");
    process.exit(1);
  }

  // Create output directory
  const outputDir = path.join(process.cwd(), "training_data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Format 1: Instruction fine-tuning format (for Llama/Mistral)
  const instructionDataset = result.rows.map(row => {
    // Find context around the selected text
    const textIndex = row.transcript_content?.indexOf(row.selected_text) || 0;
    const context = row.transcript_content?.substring(
      Math.max(0, textIndex - 500),
      textIndex + row.selected_text.length + 500
    ) || row.selected_text;

    return {
      instruction: `Analyze this financial transcript excerpt and extract a structured annotation with ticker, subsector, topic title, sentiment (++/+/=/-/--), and importance rating (1-5).`,
      input: `Transcript excerpt:\n"${row.selected_text}"`,
      output: JSON.stringify({
        ticker: row.ticker,
        subsector: row.subsector,
        dataTitle: row.datatitle,
        sentiment: row.sentiment,
        rating: row.rating
      })
    };
  });

  // Format 2: Chat format (for OpenAI/ChatGPT-style fine-tuning)
  const chatDataset = result.rows.map(row => ({
    messages: [
      {
        role: "system",
        content: "You are a financial research analyst. Extract structured annotations from transcript excerpts. Return valid JSON."
      },
      {
        role: "user", 
        content: `Analyze this transcript excerpt:\n"${row.selected_text}"`
      },
      {
        role: "assistant",
        content: JSON.stringify({
          ticker: row.ticker,
          subsector: row.subsector,
          dataTitle: row.datatitle,
          sentiment: row.sentiment,
          rating: row.rating
        }, null, 2)
      }
    ]
  }));

  // Save datasets in JSONL format
  fs.writeFileSync(
    path.join(outputDir, 'dataset_instruction.jsonl'),
    instructionDataset.map(d => JSON.stringify(d)).join('\n')
  );

  fs.writeFileSync(
    path.join(outputDir, 'dataset_chat.jsonl'), 
    chatDataset.map(d => JSON.stringify(d)).join('\n')
  );

  // Also save as regular JSON for inspection
  fs.writeFileSync(
    path.join(outputDir, 'dataset_full.json'), 
    JSON.stringify({
      instruction_format: instructionDataset,
      chat_format: chatDataset,
      metadata: {
        total_examples: result.rows.length,
        created_at: new Date().toISOString()
      }
    }, null, 2)
  );

  // Split into train/validation (90/10)
  const shuffled = [...instructionDataset].sort(() => Math.random() - 0.5);
  const splitIndex = Math.floor(shuffled.length * 0.9);
  
  fs.writeFileSync(
    path.join(outputDir, 'train.jsonl'),
    shuffled.slice(0, splitIndex).map(d => JSON.stringify(d)).join('\n')
  );
  
  fs.writeFileSync(
    path.join(outputDir, 'validation.jsonl'),
    shuffled.slice(splitIndex).map(d => JSON.stringify(d)).join('\n')
  );

  // Chat format train/validation
  const shuffledChat = [...chatDataset].sort(() => Math.random() - 0.5);
  const splitIndexChat = Math.floor(shuffledChat.length * 0.9);

  fs.writeFileSync(
    path.join(outputDir, 'train_chat.jsonl'),
    shuffledChat.slice(0, splitIndexChat).map(d => JSON.stringify(d)).join('\n')
  );

  fs.writeFileSync(
    path.join(outputDir, 'validation_chat.jsonl'),
    shuffledChat.slice(splitIndexChat).map(d => JSON.stringify(d)).join('\n')
  );

  console.log(`✅ Created datasets in ${outputDir}:
  
  📁 For OpenAI Fine-tuning:
     - train_chat.jsonl (${splitIndexChat} examples)
     - validation_chat.jsonl (${shuffledChat.length - splitIndexChat} examples)
  
  📁 For Llama/Mistral Fine-tuning:
     - train.jsonl (${splitIndex} examples)
     - validation.jsonl (${shuffled.length - splitIndex} examples)
  
  📁 For Inspection:
     - dataset_full.json (all formats)
  
  Total: ${result.rows.length} training examples
  `);

  // Print sample
  console.log("\n📋 Sample training example:");
  console.log(JSON.stringify(chatDataset[0], null, 2));
}

buildDataset()
  .then(() => {
    console.log("\n✅ Dataset build complete!");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Error building dataset:", err);
    process.exit(1);
  });

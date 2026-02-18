// scripts/finetune-openai.js
// Run with: node scripts/finetune-openai.js

import { openai } from "../config/openai.js";
import fs from "fs";
import path from "path";

const TRAINING_FILE = path.join(process.cwd(), "training_data", "train_chat.jsonl");

async function fineTuneOpenAI() {
  console.log("🚀 Starting OpenAI Fine-tuning Process...\n");

  // Check if training file exists
  if (!fs.existsSync(TRAINING_FILE)) {
    console.log("❌ Training file not found. Run 'node scripts/build-training-dataset.js' first.");
    process.exit(1);
  }

  // Check minimum examples
  const lines = fs.readFileSync(TRAINING_FILE, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length < 10) {
    console.log(`❌ Need at least 10 training examples. Found: ${lines.length}`);
    console.log("Create more annotations first, then rebuild the dataset.");
    process.exit(1);
  }

  console.log(`📊 Training file has ${lines.length} examples\n`);

  try {
    // 1. Upload training file
    console.log("📤 Uploading training file...");
    const file = await openai.files.create({
      file: fs.createReadStream(TRAINING_FILE),
      purpose: "fine-tune"
    });
    console.log(`✅ Uploaded file: ${file.id}\n`);

    // 2. Create fine-tuning job
    console.log("🔧 Creating fine-tuning job...");
    const job = await openai.fineTuning.jobs.create({
      training_file: file.id,
      model: "gpt-4o-mini-2024-07-18", // Cost-effective option
      hyperparameters: {
        n_epochs: 3
      },
      suffix: "annotation-model"
    });

    console.log(`✅ Fine-tuning job created!
    
  Job ID: ${job.id}
  Status: ${job.status}
  Model: ${job.model}
  
  ⏳ Fine-tuning typically takes 10-30 minutes.
  
  Check status with:
    node scripts/check-finetune-status.js ${job.id}
  
  Or in OpenAI dashboard:
    https://platform.openai.com/finetune
`);

    // Save job info
    const jobInfo = {
      job_id: job.id,
      created_at: new Date().toISOString(),
      training_file: file.id,
      training_examples: lines.length,
      status: job.status
    };
    
    fs.writeFileSync(
      path.join(process.cwd(), "training_data", "finetune_job.json"),
      JSON.stringify(jobInfo, null, 2)
    );

  } catch (err) {
    console.error("❌ Fine-tuning error:", err.message);
    process.exit(1);
  }
}

fineTuneOpenAI();

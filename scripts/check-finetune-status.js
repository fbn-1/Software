// scripts/check-finetune-status.js
// Run with: node scripts/check-finetune-status.js <job_id>

import { openai } from "../config/openai.js";
import fs from "fs";
import path from "path";

async function checkStatus() {
  // Get job ID from command line or saved file
  let jobId = process.argv[2];
  
  if (!jobId) {
    const jobFile = path.join(process.cwd(), "training_data", "finetune_job.json");
    if (fs.existsSync(jobFile)) {
      const jobInfo = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
      jobId = jobInfo.job_id;
    }
  }

  if (!jobId) {
    console.log("❌ No job ID provided. Usage: node scripts/check-finetune-status.js <job_id>");
    process.exit(1);
  }

  console.log(`🔍 Checking fine-tuning job: ${jobId}\n`);

  try {
    const job = await openai.fineTuning.jobs.retrieve(jobId);

    console.log(`Status: ${job.status}`);
    console.log(`Model: ${job.model}`);
    console.log(`Created: ${new Date(job.created_at * 1000).toLocaleString()}`);
    
    if (job.finished_at) {
      console.log(`Finished: ${new Date(job.finished_at * 1000).toLocaleString()}`);
    }

    if (job.status === "succeeded") {
      console.log(`\n✅ Fine-tuning complete!`);
      console.log(`\n🎯 Your fine-tuned model: ${job.fine_tuned_model}`);
      console.log(`\nUpdate your code to use this model:`);
      console.log(`  const FINE_TUNED_MODEL = "${job.fine_tuned_model}";`);
      
      // Save model ID
      const modelInfo = {
        model_id: job.fine_tuned_model,
        job_id: jobId,
        completed_at: new Date().toISOString()
      };
      fs.writeFileSync(
        path.join(process.cwd(), "training_data", "model_info.json"),
        JSON.stringify(modelInfo, null, 2)
      );
    } else if (job.status === "failed") {
      console.log(`\n❌ Fine-tuning failed`);
      if (job.error) {
        console.log(`Error: ${job.error.message}`);
      }
    } else {
      console.log(`\n⏳ Still processing... Check again in a few minutes.`);
      
      // Show training metrics if available
      if (job.training_metrics) {
        console.log(`\nTraining metrics:`);
        console.log(JSON.stringify(job.training_metrics, null, 2));
      }
    }

    // List recent events
    console.log(`\n📋 Recent events:`);
    const events = await openai.fineTuning.jobs.listEvents(jobId, { limit: 5 });
    for (const event of events.data) {
      console.log(`  [${new Date(event.created_at * 1000).toLocaleTimeString()}] ${event.message}`);
    }

  } catch (err) {
    console.error("❌ Error checking status:", err.message);
    process.exit(1);
  }
}

checkStatus();

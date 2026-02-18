import fs from "fs";
import { openai } from "../config/openai.js";

// Change to "openai" to use OpenAI Whisper, "assemblyai" for AssemblyAI
const TRANSCRIPTION_PROVIDER = "assemblyai";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

async function transcribeWithWhisper(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const response = await openai.audio.transcriptions.create({
    file: fileStream,
    model: "whisper-1",
  });
  return response.text;
}

async function transcribeWithAssemblyAI(filePath) {
  console.log("Transcribing with AssemblyAI:", filePath);
  
  // Step 1: Upload the audio file
  const audioData = fs.readFileSync(filePath);
  console.log("Uploading audio file to AssemblyAI...");
  
  const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      "Content-Type": "application/octet-stream",
    },
    body: audioData,
  });
  
  const uploadResult = await uploadResponse.json();
  console.log("Upload response:", uploadResult);
  
  if (!uploadResult.upload_url) {
    throw new Error(`AssemblyAI upload failed: ${JSON.stringify(uploadResult)}`);
  }
  
  const { upload_url } = uploadResult;

  // Step 2: Request transcription
  console.log("Requesting transcription...");
  const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      audio_url: upload_url,
      speech_models: ["universal-3-pro"],
      speaker_labels: true,
    }),
  });
  
  const transcriptResult = await transcriptResponse.json();
  console.log("Transcript request response:", transcriptResult);
  
  if (!transcriptResult.id) {
    throw new Error(`AssemblyAI transcript request failed: ${JSON.stringify(transcriptResult)}`);
  }
  
  const { id } = transcriptResult;

  // Step 3: Poll for completion
  console.log("Polling for transcription completion...");
  while (true) {
    const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: ASSEMBLYAI_API_KEY },
    });
    const result = await pollingResponse.json();
    console.log("Poll status:", result.status);

    if (result.status === "completed") {
      console.log("Transcription completed!");
      
      // If speaker labels are available, format with speakers
      if (result.utterances && result.utterances.length > 0) {
        const formattedText = result.utterances
          .map(u => `Speaker ${u.speaker}: ${u.text}`)
          .join("\n\n");
        return formattedText;
      }
      
      return result.text;
    } else if (result.status === "error") {
      throw new Error(`AssemblyAI transcription failed: ${result.error}`);
    }

    // Wait 3 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export async function transcribeAudio(filePath) {
  if (TRANSCRIPTION_PROVIDER === "openai") {
    return transcribeWithWhisper(filePath);
  } else {
    return transcribeWithAssemblyAI(filePath);
  }
}

import fs from "fs";
import { openai } from "../config/openai.js";

export async function transcribeAudio(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const response = await openai.audio.transcriptions.create({
    file: fileStream,
    model: "whisper-1",
  });
  return response.text;
}

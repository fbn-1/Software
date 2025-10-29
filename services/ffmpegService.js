import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

export function splitVideo(inputPath, chunkDurationSec = 300, outputDir = "chunks") {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    ffmpeg(inputPath)
      .outputOptions([
        "-c copy",
        "-map 0",
        `-segment_time ${chunkDurationSec}`,
        "-f segment",
        "-reset_timestamps 1",
      ])
      .output(path.join(outputDir, "chunk_%03d.mp4"))
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

export function extractAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("pcm_s16le")
      .audioChannels(1)
      .audioFrequency(16000)
      .format("wav")
      .save(outputPath)
      .on("end", resolve)
      .on("error", reject);
  });
}

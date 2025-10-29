import React, { useState, useRef } from "react";
import axios from "axios";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export default function VideoUploader({ onTranscriptReady, title, setTitle, consultantName, setConsultantName, consultantRating, setConsultantRating, currentTranscriptId }) {
  const [file, setFile] = useState(null);
  const [uploadedId, setUploadedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conversionProgress, setConversionProgress] = useState('');
  const ffmpegRef = useRef(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError(null);
  };

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    
    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;
    
    ffmpeg.on('log', ({ message }) => {
      console.log(message);
    });
    
    ffmpeg.on('progress', ({ progress, time }) => {
      const percent = (progress * 100).toFixed(0);
      setConversionProgress(`Converting: ${percent}%`);
    });

    try {
      console.log('🔧 Loading FFmpeg...');
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      console.log('✅ FFmpeg loaded');
      setFfmpegLoaded(true);
      return ffmpeg;
    } catch (err) {
      console.error('❌ Failed to load FFmpeg:', err);
      throw err;
    }
  };

  const convertVideoToMP3 = async (videoFile) => {
    try {
      console.log(`🎵 Converting ${videoFile.name} to MP3...`);
      setConversionProgress('Loading FFmpeg...');
      
      const ffmpeg = await loadFFmpeg();
      
      setConversionProgress('Reading video file...');
      const videoData = await fetchFile(videoFile);
      
      // Write video to FFmpeg virtual filesystem
      await ffmpeg.writeFile('input.mp4', videoData);
      
      setConversionProgress('Converting to MP3...');
      // Convert to MP3 with 64kbps bitrate, mono, 16kHz
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vn', // No video
        '-acodec', 'libmp3lame',
        '-ac', '1', // Mono
        '-ar', '16000', // 16kHz sample rate
        '-b:a', '64k', // 64kbps bitrate
        'output.mp3'
      ]);
      
      setConversionProgress('Reading converted file...');
      // Read the output MP3
      const mp3Data = await ffmpeg.readFile('output.mp3');
      
      // Clean up
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp3');
      
      // Create a new File object from the MP3 data
      const mp3Blob = new Blob([mp3Data.buffer], { type: 'audio/mpeg' });
      const mp3File = new File(
        [mp3Blob], 
        videoFile.name.replace(/\.[^.]+$/, '.mp3'),
        { type: 'audio/mpeg' }
      );
      
      const originalSizeMB = (videoFile.size / 1024 / 1024).toFixed(1);
      const mp3SizeMB = (mp3File.size / 1024 / 1024).toFixed(1);
      const reduction = ((1 - mp3File.size / videoFile.size) * 100).toFixed(0);
      
      console.log(`✅ Conversion complete: ${originalSizeMB}MB → ${mp3SizeMB}MB (${reduction}% smaller)`);
      setConversionProgress('');
      
      return mp3File;
    } catch (err) {
      console.error('❌ Conversion failed:', err);
      setConversionProgress('');
      throw err;
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const fileSizeMB = file.size / (1024 * 1024);
      
      // Always use presigned S3 upload for production (Render) or files > 50MB
      const isProduction = window.location.hostname.includes('onrender.com');
      const useS3Upload = isProduction || fileSizeMB > 50;
      
      console.log(`📤 Uploading ${file.name} (${fileSizeMB.toFixed(1)}MB)${useS3Upload ? ' via presigned S3' : ' directly'}...`);

      if (useS3Upload) {
        // Convert to MP3 in browser first to bypass 50MB limit!
        let fileToUpload = file;
        
        if (file.type.startsWith('video/')) {
          try {
            setConversionProgress('Starting conversion...');
            fileToUpload = await convertVideoToMP3(file);
            console.log(`🎵 Will upload MP3 instead of video`);
          } catch (conversionError) {
            console.error('Conversion failed, uploading original file:', conversionError);
            setError(`⚠️ MP3 conversion failed. Upload may be slower with original video file.`);
            // Continue with original file if conversion fails
          }
        }

        // Step 1: Get presigned URL from backend
        console.log("🔗 Getting presigned URL...");
        const presignedResponse = await axios.post("/s3/presigned-url", {
          fileName: fileToUpload.name,
          fileType: fileToUpload.type
        });

        const { uploadUrl, s3Key } = presignedResponse.data;
        console.log("✅ Got presigned URL");

        // Step 2: Upload directly to S3
        console.log("📤 Uploading to S3...");
        await axios.put(uploadUrl, fileToUpload, {
          headers: {
            'Content-Type': fileToUpload.type
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setConversionProgress(`Uploading: ${percentCompleted}%`);
          }
        });
        console.log("✅ Upload to S3 completed");
        setConversionProgress('');

        // Step 3: Notify backend to process the audio from S3
        console.log("⚙️ Starting audio processing...");
        const processResponse = await axios.post("/upload/process-s3", {
          s3Key: s3Key,
          originalName: file.name, // Use original filename
          consultant_name: consultantName || "",
          consultant_rating: consultantRating
        });

        const id = processResponse.data && processResponse.data.id ? processResponse.data.id : null;
        setUploadedId(id);
        if (onTranscriptReady) onTranscriptReady(id);
        
        // Show success message with processing status
        alert("✅ Video uploaded successfully!\n\n⚙️ Processing started. The transcript will be available in a few minutes.\n\nYou can check the transcript list to see when it's ready.");
      } else {
        // Small files: upload directly through backend
        const formData = new FormData();
        formData.append("video", file);
        formData.append("consultant_name", consultantName || "");
        if (consultantRating !== null && consultantRating !== undefined && String(consultantRating).trim() !== "") {
          formData.append("consultant_rating", String(consultantRating));
        }
        formData.append("title", title || "");

        const res = await axios.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`Upload progress: ${percentCompleted}%`);
          }
        });

        const id = res.data && res.data.id ? res.data.id : null;
        setUploadedId(id);
        if (onTranscriptReady) onTranscriptReady(id);
        alert("✅ Video uploaded and transcribed successfully!");
      }
    } catch (err) {
      console.error("Upload error:", err);
      
      if (err.response?.status === 413) {
        setError("❌ File too large. Please use a smaller video file.");
      } else if (err.response?.status === 502) {
        setError("❌ Server timeout. Try again or use a smaller file.");
      } else if (err.response?.data?.error) {
        setError(`❌ ${err.response.data.error}`);
      } else {
        setError("❌ Error uploading or processing video.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMetadata = async () => {
    // Update the transcript record created by /upload (must have uploadedId)
    const idToUpdate = uploadedId || currentTranscriptId;
    if (!idToUpdate) {
      alert("Please upload a video first, then click Save to update that transcript's metadata.");
      return;
    }

    // Validate required fields are filled (not blank)
    const missing = [];
    if (!title || title.toString().trim() === "") missing.push("Title");
    if (!consultantName || consultantName.toString().trim() === "") missing.push("Consultant name");
    if (consultantRating === undefined || consultantRating === null || String(consultantRating).trim() === "") missing.push("Consultant rating");

    if (missing.length > 0) {
      alert(`Please fill the following fields before saving: ${missing.join(', ')}`);
      return;
    }

    try {
      const payload = {
        title: title,
        consultant_name: consultantName,
        consultant_rating: consultantRating
      };

      const res = await axios.put(`/transcripts/${idToUpdate}`, payload);
      alert(`✅ Updated transcript ${res.data.id}`);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to update metadata. See console.");
    }
  };

  return (
    <div style={{
      marginTop: "10px",
      marginBottom: "18px",
      padding: "6px 16px",
      background: "#f8f9fa",
      borderRadius: "6px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      width: "100%",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: 10
    }}>
      {/* Top row: upload label, file chooser, upload button and error */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <span style={{ fontWeight: 600, color: "#007bff", fontSize: 18, marginRight: 8 }}>🎥 Upload Video</span>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          style={{ flex: 1, minWidth: 0, marginRight: 8 }}
        />

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            padding: "7px 18px",
            background: loading ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 15
          }}
        >
          {loading ? (conversionProgress || "Processing...") : "Upload"}
        </button>
        {/* Save button moved to bottom row */}

        {error && <span style={{ color: "red", marginLeft: 8, fontSize: 14 }}>{error}</span>}
      </div>

      {/* Bottom row: Title, Consultant name and rating */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <input
          type="text"
          placeholder="Call Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: 420, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd" }}
        />

        <input
          type="text"
          placeholder="Consultant name"
          value={consultantName}
          onChange={(e) => setConsultantName(e.target.value)}
          style={{ width: 200, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd" }}
        />
        <select
          value={consultantRating === null ? "" : String(consultantRating)}
          onChange={(e) => setConsultantRating(e.target.value === "" ? null : Number(e.target.value))}
          style={{ width: 110, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd" }}
        >
          <option value="">Select rating</option>
          {Array.from({ length: 21 }, (_, i) => (i * 0.5)).map((v) => (
            <option key={v} value={String(v)}>
              {v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={handleSaveMetadata}
            style={{
              padding: "7px 12px",
              background: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export default function VideoUploader({ onTranscriptReady, title, setTitle, consultantName, setConsultantName, consultantRating, setConsultantRating, currentTranscriptId, onLoadTranscript, onTickersLoaded, onSubsectorsLoaded }) {
  const [file, setFile] = useState(null);
  const [uploadedId, setUploadedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conversionProgress, setConversionProgress] = useState('');
  const ffmpegRef = useRef(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      // Automatically start upload after file is selected
      handleUploadWithFile(selectedFile);
    }
  };

  const handleUploadButtonClick = () => {
    // Trigger file picker
    fileInputRef.current?.click();
  };

  const fetchSavedTranscripts = async () => {
    setLoadingTranscripts(true);
    try {
      const response = await axios.get("/transcripts");
      setTranscripts(response.data || []);
    } catch (err) {
      console.error('Error fetching transcripts:', err);
      setTranscripts([]);
    } finally {
      setLoadingTranscripts(false);
    }
  };

  const handleLoadSavedClick = async () => {
    if (!showDropdown) {
      await fetchSavedTranscripts();
    }
    setShowDropdown(!showDropdown);
  };

  const handleSelectTranscript = async (transcript) => {
    try {
      if (onLoadTranscript) onLoadTranscript(transcript.id);
      
      // Fetch annotations and extract tickers/subsectors
      const annRes = await axios.get(`/annotations/${transcript.id}`);
      const ann = annRes.data || [];
      
      const tickerSet = new Set();
      ann.forEach(a => {
        if (a.ticker) {
          a.ticker.split(',').forEach(t => {
            const tclean = t.trim();
            if (tclean) tickerSet.add(tclean.toUpperCase());
          });
        }
      });
      const tickers = Array.from(tickerSet).sort();
      if (onTickersLoaded) onTickersLoaded(tickers);

      const subsectorSet = new Set();
      ann.forEach(a => {
        if (a.subsector) {
          a.subsector.split(',').forEach(t => {
            const tclean = t.trim();
            if (tclean) subsectorSet.add(tclean.toUpperCase());
          });
        }
      });
      const subsectors = Array.from(subsectorSet).sort();
      if (onSubsectorsLoaded) onSubsectorsLoaded(subsectors);
      
      setShowDropdown(false);
    } catch (err) {
      console.error('Failed to load transcript', err);
    }
  };

  const deleteTranscript = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this transcript?')) return;
    
    try {
      await axios.delete(`/transcripts/${id}`);
      setTranscripts(transcripts.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Error deleting transcript:', err);
      alert('Failed to delete transcript');
    }
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
    await handleUploadWithFile(file);
  };

  const handleUploadWithFile = async (fileToUpload) => {
    if (!fileToUpload) return;
    setLoading(true);
    setError(null);

    try {
      const fileSizeMB = fileToUpload.size / (1024 * 1024);
      
      // Always use presigned S3 upload for production (Render) or files > 50MB
      const isProduction = window.location.hostname.includes('onrender.com');
      const useS3Upload = isProduction || fileSizeMB > 50;
      
      console.log(`📤 Uploading ${fileToUpload.name} (${fileSizeMB.toFixed(1)}MB)${useS3Upload ? ' via presigned S3' : ' directly'}...`);

      if (useS3Upload) {
        // Convert to MP3 in browser first to bypass 50MB limit!
        let fileForUpload = fileToUpload;
        
        if (fileToUpload.type.startsWith('video/')) {
          try {
            setConversionProgress('Starting conversion...');
            fileForUpload = await convertVideoToMP3(fileToUpload);
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
          fileName: fileForUpload.name,
          fileType: fileForUpload.type
        });

        const { uploadUrl, s3Key } = presignedResponse.data;
        console.log("✅ Got presigned URL");

        // Step 2: Upload directly to S3
        console.log("📤 Uploading to S3...");
        await axios.put(uploadUrl, fileForUpload, {
          headers: {
            'Content-Type': fileForUpload.type
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
          originalName: fileToUpload.name, // Use original filename
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
        formData.append("video", fileToUpload);
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
      marginTop: "1px",
      marginBottom: "1px",
      padding: "6px 2px",
      // background: "#f8f9fa",
      borderRadius: "6px",
      // boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      width: "100%",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: 10
    }}>
      {/* Top row: upload label, load saved button with dropdown, upload file button and error */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <span style={{ fontWeight: 600, color: "#080808ff", fontSize: 18, marginRight: 8 }}>Datapoint Creator</span>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* Show selected file name if a file is selected */}
        {file && !loading && (
          <span style={{ 
            flex: 1, 
            color: '#666', 
            fontSize: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {/* Selected: {file.name} */}
          </span>
        )}
        
        {loading && (
          <span style={{ 
            flex: 1, 
            color: '#007bff', 
            fontSize: '14px',
            fontWeight: 500
          }}>
            {conversionProgress || "Processing..."}
          </span>
        )}

        {!file && !loading && <div style={{ flex: 1 }} />}

        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={handleLoadSavedClick}
            disabled={loading}
            style={{
              padding: "7px 18px",
              background: loading ? "#ccc" : "#f6f6f7ff",
              color: "black",
              border: "1px solid black",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 15,
              whiteSpace: "nowrap"
            }}
          >
           Load Saved Templates {showDropdown ? '▴' : '▾'}
          </button>

          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: 'white',
              border: '1px solid #c4c3c3ff',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: '400px',
              maxHeight: '400px',
              overflowY: 'auto'
            }}>
              {loadingTranscripts ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                  Loading transcripts...
                </div>
              ) : transcripts.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                  No saved transcripts found
                </div>
              ) : (
                <div>
                  {transcripts.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      onClick={() => handleSelectTranscript(t)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                          {t.filename || t.title || 'Untitled'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {t.created_at ? new Date(t.created_at).toLocaleString() : ''}
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteTranscript(t.id, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '18px',
                          padding: '4px 8px',
                          borderRadius: '4px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Delete transcript"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleUploadButtonClick}
          disabled={loading}
          style={{
            padding: "7px 18px",
            background: loading ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 15,
            whiteSpace: "nowrap"
          }}
        >
          ☁️ Upload File
        </button>

        {error && <span style={{ color: "red", marginLeft: 8, fontSize: 14 }}>{error}</span>}
      </div>

      {/* Bottom row: Title, Consultant name and rating */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <input
          type="text"
          placeholder="Call Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: 520, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd" }}
        />

        <input
          type="text"
          placeholder="Consultant name"
          value={consultantName}
          onChange={(e) => setConsultantName(e.target.value)}
          style={{ width: 620, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd" }}
        />
        <select
          value={consultantRating === null ? "" : String(consultantRating)}
          onChange={(e) => setConsultantRating(e.target.value === "" ? null : Number(e.target.value))}
          style={{ width:410, padding: "6px 8px", borderRadius: 4,textAlign: "center", fontWeight:700 ,  border: "1px solid #ddd" }}
        >
          <option value="">Select rating</option>
          {Array.from({ length: 21 }, (_, i) => (i * 0.5)).map((v) => (
            <option key={v} value={String(v)} >
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
              width: 140,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

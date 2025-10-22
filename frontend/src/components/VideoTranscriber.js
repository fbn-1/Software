// src/components/VideoTranscriber.js
import React, { useState } from "react";
import axios from "axios";

export default function VideoTranscriber() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);
  const [savedTranscripts, setSavedTranscripts] = useState([]);

  // Handle file select
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // Upload & Transcribe
  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setTranscript("");
    setError(null);

    const formData = new FormData();
    formData.append("video", file);

    try {
      const response = await axios.post("http://localhost:5000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setTranscript(response.data.transcript);
      console.log("✅ Uploaded and transcribed");
    } catch (err) {
      console.error(err);
      setError("Error uploading or processing video.");
    } finally {
      setLoading(false);
    }
  };

  // Save edited transcript to DB
  const handleSave = async () => {
    if (!transcript) return;

    try {
      const lines = transcript.split("\n").filter((line) => line.trim() !== "");
      await axios.post("http://localhost:5000/transcripts", {
        filename: file ? file.name : "manual_entry.txt",
        lines,
      });
      alert("Transcript saved to database ✅");
    } catch (err) {
      console.error(err);
      setError("Error saving transcript.");
    }
  };

  // Fetch transcripts from DB (manual trigger)
  const fetchSavedTranscripts = async () => {
    try {
      const response = await axios.get("http://localhost:5000/transcripts");
      setSavedTranscripts(response.data);
    } catch (err) {
      console.error(err);
      setError("Error fetching transcripts.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f5f5f5",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "700px",
          background: "white",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ textAlign: "center" }}>🎥 Transcribed</h1>

        {/* Upload Section */}
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          style={{ display: "block", width: "100%", marginBottom: "10px" }}
        />
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            width: "100%",
            padding: "10px",
            background: loading ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            marginBottom: "10px",
          }}
        >
          {loading ? "Processing..." : "Upload & Transcribe"}
        </button>

        {error && <p style={{ color: "red" }}>{error}</p>}

        {/* Transcript Editor */}
        {transcript && (
          <div style={{ marginTop: "20px" }}>
            <h2>Transcript (Editable)</h2>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={12}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
            />
            <button
              onClick={handleSave}
              style={{
                marginTop: "10px",
                width: "100%",
                padding: "10px",
                background: "green",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              💾 Save to Database
            </button>
          </div>
        )}

        {/* Manual Fetch Saved Transcripts */}
        <div style={{ marginTop: "30px" }}>
          <button
            onClick={fetchSavedTranscripts}
            style={{
              width: "100%",
              padding: "10px",
              background: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginBottom: "15px",
            }}
          >
            📥 Load Saved Transcripts
          </button>

          {savedTranscripts.length > 0 && (
            <ul>
              {savedTranscripts.map((t) => (
                <li key={t.id}>
                  {t.filename} — {new Date(t.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

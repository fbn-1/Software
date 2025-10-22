import React, { useState } from "react";
import axios from "axios";

export default function VideoUploader({ onTranscriptReady, title, setTitle, consultantName, setConsultantName, consultantRating, setConsultantRating, currentTranscriptId }) {
  const [file, setFile] = useState(null);
  const [uploadedId, setUploadedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

      const formData = new FormData();
      formData.append("video", file);
      formData.append("consultant_name", consultantName || "");
      if (consultantRating !== null && consultantRating !== undefined && String(consultantRating).trim() !== "") {
        formData.append("consultant_rating", String(consultantRating));
      }
      formData.append("title", title || "");

    try {
      const res = await axios.post("http://localhost:5000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // store the transcript id returned by the upload route so Save can update the same record
  const id = res.data && res.data.id ? res.data.id : null;
  setUploadedId(id);
  if (onTranscriptReady) onTranscriptReady(id);
      alert("✅ Video uploaded and transcribed successfully!");
    } catch (err) {
      console.error(err);
      setError("❌ Error uploading or processing video.");
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

      const res = await axios.put(`http://localhost:5000/transcripts/${idToUpdate}`, payload);
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
          {loading ? "Processing..." : "Upload"}
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

// src/App.js
import React, { useState, useEffect } from "react";
import VideoUploader from "./components/VideoUploader";
import TranscriptEditor from "./components/TranscriptEditor";
import TranscriptList from "./components/TranscriptList";

function App() {
  const [transcriptId, setTranscriptId] = useState(null);
  const [sharedTickers, setSharedTickers] = useState([]);
  const [sharedSubsectors, setSharedSubsectors] = useState([]);
  const [title, setTitle] = useState("");
  const [consultantName, setConsultantName] = useState("");
  const [consultantRating, setConsultantRating] = useState(null);

  // Receive transcriptId from uploader
  const handleTranscriptReady = (id) => {
    setTranscriptId(id);
  };

  // When a transcript is selected, fetch its metadata and populate the uploader fields
  useEffect(() => {
    if (!transcriptId) return;
    const fetchMeta = async () => {
      try {
        const res = await fetch(`http://localhost:5000/transcripts/${transcriptId}`);
        if (!res.ok) return;
        const meta = await res.json();
        setTitle(meta.title || meta.filename || "");
        setConsultantName(meta.consultant_name || "");
        setConsultantRating(meta.consultant_rating === null || meta.consultant_rating === undefined ? null : meta.consultant_rating);
      } catch (err) {
        console.error('Failed to fetch transcript metadata', err);
      }
    };
    fetchMeta();
  }, [transcriptId]);

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <VideoUploader
        onTranscriptReady={handleTranscriptReady}
        title={title}
        setTitle={setTitle}
        consultantName={consultantName}
        setConsultantName={setConsultantName}
        consultantRating={consultantRating}
        setConsultantRating={setConsultantRating}
        currentTranscriptId={transcriptId}
      />
      <TranscriptList onSelectTranscript={setTranscriptId} onTickersLoaded={setSharedTickers} onSubsectorsLoaded={setSharedSubsectors} />
      {transcriptId ? (
        <TranscriptEditor transcriptId={transcriptId} externalTickers={sharedTickers} externalSubsectors={sharedSubsectors} />
      ) : (
        <p style={{ color: '#666', marginTop: 12 }}>Load a saved transcript or upload a new one to begin.</p>
      )}
    </div>
  );
}

export default App;

// src/App.js
import React, { useState, useEffect } from "react";
import VideoUploader from "./components/VideoUploader";
import TranscriptEditor from "./components/TranscriptEditor";

function App() {
  const [transcriptId, setTranscriptId] = useState(null);
  const [sharedTickers, setSharedTickers] = useState([]);
  const [sharedSubsectors, setSharedSubsectors] = useState([]);
  const [title, setTitle] = useState("");
  const [consultants, setConsultants] = useState([]);

  // Receive transcriptId from uploader
  const handleTranscriptReady = (id) => {
    setTranscriptId(id);
  };

  // When a transcript is selected, fetch its metadata and populate the uploader fields
  useEffect(() => {
    if (!transcriptId) return;
    const fetchMeta = async () => {
      try {
        const res = await fetch(`/transcripts/${transcriptId}`);
        if (!res.ok) return;
        const meta = await res.json();
        setTitle(meta.title || meta.filename || "");
        
        // Fetch consultants from the users table via transcript_consultants junction
        try {
          const consultantsRes = await fetch(`/users/transcript/${transcriptId}`);
          if (consultantsRes.ok) {
            const consultantsData = await consultantsRes.json();
            // Map database users to frontend format
            const mappedConsultants = consultantsData.map(u => ({
              user_id: u.user_id,
              firstName: u.first_name,
              lastName: u.last_name,
              rating: u.rating !== null && u.rating !== undefined ? Number(u.rating) : null,
              person_identity: u.person_identity
            }));
            setConsultants(mappedConsultants);
          } else {
            setConsultants([]);
          }
        } catch (err) {
          console.error('Failed to fetch consultants', err);
          setConsultants([]);
        }
      } catch (err) {
        console.error('Failed to fetch transcript metadata', err);
      }
    };
    fetchMeta();
  }, [transcriptId]);

  return (
    <div style={{ padding: "10px 100px", width: "100%", boxSizing: "border-box" }}>
      <VideoUploader
        onTranscriptReady={handleTranscriptReady}
        title={title}
        setTitle={setTitle}
        consultants={consultants}
        setConsultants={setConsultants}
        currentTranscriptId={transcriptId}
        onLoadTranscript={setTranscriptId}
        onTickersLoaded={setSharedTickers}
        onSubsectorsLoaded={setSharedSubsectors}
      />
      <div style={{ width: "100%" }}>
        {transcriptId && (
          <TranscriptEditor transcriptId={transcriptId} externalTickers={sharedTickers} externalSubsectors={sharedSubsectors} consultants={consultants} />
        )}
        {!transcriptId && (
          <p style={{ color: '#666', marginTop: "1px" }}>Load a saved transcript or upload a new one to begin.</p>
        )}
      </div>
                             
                                 


    </div>
  );
}


export default App;

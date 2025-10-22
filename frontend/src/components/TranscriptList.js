// src/components/TranscriptList.js
import React, { useState } from "react";
import axios from "axios";

export default function TranscriptList({ onSelectTranscript, onTickersLoaded, onSubsectorsLoaded }) {
  const [transcripts, setTranscripts] = useState([]);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const fetchSavedTranscripts = async () => {
    try {
      const response = await axios.get("http://localhost:5000/transcripts");
      setTranscripts(response.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Error fetching transcripts.");
    }
  };

  const toggleList = async () => {
    if (!isOpen) {
      // opening: fetch transcripts and show
      await fetchSavedTranscripts();
      setIsOpen(true);
    } else {
      // closing: hide list
      setIsOpen(false);
    }
  };

  const deleteTranscript = async (id) => {
    try {
      await axios.delete(`http://localhost:5000/transcripts/${id}`);
      setTranscripts(transcripts.filter((t) => t.id !== id));
    } catch (err) {
      console.error(err);
      setError("Error deleting transcript.");
    }
  };

  // When loading a transcript, also fetch its tickers and notify parent
  const handleLoad = async (id) => {
    try {
      if (onSelectTranscript) onSelectTranscript(id);
      // try to fetch annotations and extract unique tickers
      const annRes = await axios.get(`http://localhost:5000/annotations/${id}`);
      const ann = annRes.data || [];
      console.log(ann);
      const tickerSet = new Set();
      ann.forEach(a => {
        if (a.ticker) {
          a.ticker.split(',').forEach(t => {
            const tclean = t.trim();
            if (tclean) tickerSet.add(tclean.toUpperCase());
          })
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
          })
        }
      });
      const subsectors = Array.from(subsectorSet).sort();
      if (onSubsectorsLoaded) onSubsectorsLoaded(subsectors);
    } catch (err) {
      console.error('Failed to load annotations/subsectors for transcript', id, err);
    }
  };

  return (
    <div style={{ marginTop: "20px" }}>
      <h2>📜 Saved Transcripts</h2>
      <button onClick={toggleList}>{isOpen ? '▾ Hide Saved Transcripts' : '📥 Load Saved Transcripts'}</button>
      {isOpen && (
        <>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <ul>
            {transcripts.map((t) => (
              <li key={t.id}>
                <strong style={{ marginRight: 8 }}>{t.filename}</strong>
                <span style={{ color: '#666', marginRight: 8 }}>{t.created_at ? new Date(t.created_at).toLocaleString() : ''}</span>
                <button
                  onClick={() => handleLoad(t.id)}
                  style={{ marginLeft: "10px", background: '#17a2b8', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}
                >
                  ▶ Load
                </button>
                <button
                  onClick={() => deleteTranscript(t.id)}
                  style={{ marginLeft: "8px", color: "red", background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  🗑 Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

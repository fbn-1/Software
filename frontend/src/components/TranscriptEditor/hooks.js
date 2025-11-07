// TranscriptEditor/hooks.js - Custom React hooks for TranscriptEditor

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { DUMMY_TICKERS, DUMMY_SUBSECTORS } from './constants';
import { normalizeToUppercase, mergeUnique } from './utils';

/**
 * Hook to manage transcript metadata (title, consultant info)
 */
export const useTranscriptMetadata = (transcriptId) => {
  const [title, setTitle] = useState("");
  const [consultantName, setConsultantName] = useState("");
  const [consultantRating, setConsultantRating] = useState(null);

  useEffect(() => {
    if (!transcriptId) return;
    
    const fetchMeta = async () => {
      try {
        const res = await axios.get(`/transcripts/${transcriptId}`);
        const meta = res.data || {};
        setTitle(meta.filename || meta.title || "");
        setConsultantName(meta.consultant_name || "");
        setConsultantRating(meta.consultant_rating || null);
      } catch (err) {
        console.error('Failed to fetch transcript metadata', err);
      }
    };
    
    fetchMeta();
  }, [transcriptId]);

  const saveMetadata = async () => {
    if (!transcriptId) {
      alert("No transcript selected.");
      return;
    }

    const missing = [];
    if (!title?.trim()) missing.push("Title");
    if (!consultantName?.trim()) missing.push("Consultant Name");
    if (consultantRating === null || consultantRating === undefined || consultantRating === "") {
      missing.push("Consultant Rating");
    }
    
    if (missing.length > 0) {
      alert(`Please fill in: ${missing.join(", ")}`);
      return;
    }

    try {
      const payload = {
        title: title,
        consultant_name: consultantName,
        consultant_rating: Number(consultantRating)
      };
      const res = await axios.put(`/transcripts/${transcriptId}`, payload);
      alert(`✅ Updated transcript ${res.data.id}`);
    } catch (err) {
      console.error('Failed to update transcript metadata', err);
      alert('❌ Failed to update metadata. See console.');
    }
  };

  return {
    title,
    setTitle,
    consultantName,
    setConsultantName,
    consultantRating,
    setConsultantRating,
    saveMetadata
  };
};

/**
 * Hook to manage transcript content loading and polling
 */
export const useTranscriptContent = (transcriptId) => {
  const [chunkContent, setChunkContent] = useState("");
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!transcriptId) return;

    const fetchContent = async () => {
      try {
        setChunkContent("");
        const resp = await axios.get(`/transcripts/${transcriptId}/content`);
        
        const content = resp.data.content || "";
        if (content.includes("Processing...") || content.includes("Pending") || content === "") {
          console.log("🔄 Transcript is being processed. Starting polling...");
          setChunkContent(content || "Processing transcript...");
          setIsPolling(true);

          const pollInterval = setInterval(async () => {
            try {
              const checkResp = await axios.get(`/transcripts/${transcriptId}/content`);
              const checkContent = checkResp?.data?.content || "";
              
              if (checkContent && !checkContent.includes("Processing...") && !checkContent.includes("Pending") && checkContent.trim()) {
                console.log("✅ Transcript processing complete!");
                setChunkContent(checkContent);
                setIsPolling(false);
                clearInterval(pollInterval);
              }
            } catch (err) {
              console.error("❌ Error polling transcript:", err);
            }
          }, 5000);

          return () => clearInterval(pollInterval);
        } else {
          console.log("📄 Transcript content loaded successfully");
          setChunkContent(content);
        }
      } catch (err) {
        console.error('Failed to fetch transcript content:', err);
        setChunkContent("Error loading transcript content");
      }
    };

    fetchContent();
  }, [transcriptId]);

  return {
    chunkContent,
    setChunkContent,
    isPolling
  };
};

/**
 * Hook to manage master tickers and subsectors lists
 */
export const useMasterLists = (externalTickers, externalSubsectors) => {
  const masterTickers = useMemo(() => {
    const s = new Set(DUMMY_TICKERS.map(t => t.toUpperCase()));
    if (externalTickers && Array.isArray(externalTickers)) {
      externalTickers.forEach(t => {
        if (t) s.add(t.toUpperCase());
      });
    }
    return Array.from(s);
  }, [externalTickers]);

  const masterSubsectors = useMemo(() => {
    const s = new Set(DUMMY_SUBSECTORS.map(t => t.toUpperCase()));
    if (externalSubsectors && Array.isArray(externalSubsectors)) {
      externalSubsectors.forEach(t => {
        if (t) s.add(t.toUpperCase());
      });
    }
    return Array.from(s);
  }, [externalSubsectors]);

  return { masterTickers, masterSubsectors };
};

/**
 * Hook to manage selection and popup state
 */
export const useSelectionPopup = () => {
  const [selection, setSelection] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [anchorRect, setAnchorRect] = useState(null);

  const restoreSelection = useCallback(() => {
    if (!selection?.range || !showPopup) return;
    const sel = window.getSelection();
    if (!sel) return;
    try {
      sel.removeAllRanges();
      sel.addRange(selection.range);
    } catch (err) {
      console.error("Failed to restore selection", err);
    }
  }, [selection, showPopup]);

  return {
    selection,
    setSelection,
    showPopup,
    setShowPopup,
    popupPosition,
    setPopupPosition,
    anchorRect,
    setAnchorRect,
    restoreSelection
  };
};

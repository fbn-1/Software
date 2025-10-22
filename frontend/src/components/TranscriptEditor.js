// src/components/TranscriptEditor.js
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

const DUMMY_TICKERS = [
  // Semis
  "NVDA","AMD","TSM","INTC","AVGO",
  // Digital Media
  "META","GOOG","SNAP","NFLX","APP","AMZN","TTD","ROKU","RDDT",
  // Video Games
  "RBLX",
  // Cloud - SaaS / AI
  "MSFT","ORCL","FIG","SNOW",
  // Cloud-SaaS additional
  "TEAM","FRSH","GTLB","MNDY","CRM","NOW","TWLO",
  // Security
  "CHKP","CRWD","CYRB","FTNT","OKTA","PANW","QLYS","RBRK","S","VRNS","ZS"
];

const DUMMY_SUBSECTORS = [
  "Semis",
  "Digital Media",
  "Video Games",
  "Cloud / SaaS",
  "AI",
  "Privates",
  "Security"
];



const colorMap = {
  "++": "#2ecc71",
  "+": "#a3e4d7",
  "=": "#f9f79f",
  "-": "#f5b7b1",
  "--": "#e74c3c"
};


export default function TranscriptEditor({ transcriptId, externalTickers ,externalSubsectors }) {
  const [annotations, setAnnotations] = useState([]);
  const [selection, setSelection] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [anchorRect, setAnchorRect] = useState(null);
  const popupRef = useRef(null);
  const [formData, setFormData] = useState({dataTitle: "", tickers: [], subsectors: [] , sentiment: "=", rating: 5 });
  const [editingAnnotationId, setEditingAnnotationId] = useState(null);
  const [selectedTickers, setSelectedTickers] = useState([]);
  const [selectedSubsectors, setSelectedSubsectors] = useState([]);
  // Custom tickers added by the user at runtime
  const [customTickers, setCustomTickers] = useState([]);
  const [showAddTickerInput, setShowAddTickerInput] = useState(false);
  const [newTickerValue, setNewTickerValue] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [chunkContent, setChunkContent] = useState("");
const [title, setTitle] = useState("");
  const editorRef = useRef(null);

  
  const [consultantName, setConsultantName] = useState("");
  const [consultantRating, setConsultantRating] = useState(null);

  // Fetch transcript metadata when a transcript is selected
  useEffect(() => {
    if (!transcriptId) return;
    const fetchMeta = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/transcripts/${transcriptId}`);
        const meta = res.data || {};
        // Server stores title in filename (routes/transcripts uses filename)
        setTitle(meta.title || meta.filename || "");
        setConsultantName(meta.consultant_name || "");
        setConsultantRating(meta.consultant_rating === null || meta.consultant_rating === undefined ? null : meta.consultant_rating);
      } catch (err) {
        console.error('Failed to fetch transcript metadata', err);
      }
    };
    fetchMeta();
  }, [transcriptId]);

  const handleSaveMetadata = async () => {
    if (!transcriptId) {
      alert('No transcript loaded');
      return;
    }

    const missing = [];
    if (!title || title.toString().trim() === "") missing.push('Title');
    if (!consultantName || consultantName.toString().trim() === "") missing.push('Consultant name');
    if (consultantRating === undefined || consultantRating === null || String(consultantRating).trim() === "") missing.push('Consultant rating');

    if (missing.length > 0) {
      alert(`Please fill the following fields before saving: ${missing.join(', ')}`);
      return;
    }

    try {
      const payload = {
        title: title,
        consultant_name: consultantName,
        consultant_rating: Number(consultantRating)
      };
      const res = await axios.put(`http://localhost:5000/transcripts/${transcriptId}`, payload);
      alert(`✅ Updated transcript ${res.data.id}`);
    } catch (err) {
      console.error('Failed to update transcript metadata', err);
      alert('❌ Failed to update metadata. See console.');
    }
  };

  // When parent provides externalTickers (from the transcript load), sync them into state
  useEffect(() => {
    if (externalTickers && Array.isArray(externalTickers)) {
      // ensure values are uppercase and unique
      const normalized = Array.from(new Set(externalTickers.map(t => (t || '').toUpperCase()))).filter(Boolean);
      // selectedTickers should reflect only the tickers present for this transcript
      setSelectedTickers(normalized);
      setFormData((prev) => ({ ...prev, tickers: Array.from(new Set([...(prev.tickers || []), ...normalized])) }));
    }
  }, [externalTickers]);

//*copy
  useEffect(() => {
    if (externalSubsectors && Array.isArray(externalSubsectors)) {
      // ensure values are uppercase and unique
      const normalized = Array.from(new Set(externalSubsectors.map(t => (t || '').toUpperCase()))).filter(Boolean);
      // selectedSubsectors should reflect only the subsectors present for this transcript
      setSelectedSubsectors(normalized);
      setFormData((prev) => ({ ...prev, subsectors: Array.from(new Set([...(prev.subsectors || []), ...normalized])) }));
    }
  }, [externalSubsectors]);

  //*copy
  const masterSubsectors = React.useMemo(() => {
    const s = new Set(DUMMY_SUBSECTORS.map(t => t.toUpperCase()));
    if (externalSubsectors && Array.isArray(externalSubsectors)) {
      externalSubsectors.forEach(t => {
        if (t) s.add(t.toUpperCase());
      });
    }
    return Array.from(s);
  }, [externalSubsectors]);


  // masterTickers = DUMMY_TICKERS plus any external tickers (de-duplicated)
  const masterTickers = React.useMemo(() => {
    const s = new Set(DUMMY_TICKERS.map(t => t.toUpperCase()));
    if (externalTickers && Array.isArray(externalTickers)) {
      externalTickers.forEach(t => {
        if (t) s.add(t.toUpperCase());
      });
    }
    // include runtime-added custom tickers
    if (customTickers && Array.isArray(customTickers)) {
      customTickers.forEach(t => { if (t) s.add(t.toUpperCase()); });
    }
    return Array.from(s);
  }, [externalTickers, customTickers]);

  // Fetch transcript content. Prefer the simplified /content endpoint which returns { content: "..." }.

  useEffect(() => {
    if (!transcriptId) return;

    const fetchContent = async () => {
      try {
        // First try the simplified endpoint
        const resp = await axios.get(`http://localhost:5000/transcripts/${transcriptId}/content`);
        if (resp && Object.prototype.hasOwnProperty.call(resp.data, 'content')) {
          setChunkContent(resp.data.content || "");
          setTotalPages(1);
          setPage(1);
          return;
        }
      } catch (err) {
        console.error('Failed to fetch transcript content', err);
        setChunkContent("");
        setTotalPages(1);
        setPage(1);
      }
    };

    fetchContent();
  }, [transcriptId]);

  // Fetch annotations
  useEffect(() => {
    if (!transcriptId) return;
    fetchAnnotations();
  }, [transcriptId]);

  const fetchAnnotations = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/annotations/${transcriptId}`);
      setAnnotations(res.data);
      return res.data;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  /** Create a Word note (simple .doc) of all saved annotations */
  const createNote = async () => {
    try {
      // ensure we have latest annotations
      await fetchAnnotations();
      if (!annotations || annotations.length === 0) {
        alert("No annotations to include in the note.");
        return;
      }
      // Fetch transcript metadata to include as a heading
      let metadata = null;
      try {
        const metaRes = await axios.get(`http://localhost:5000/transcripts/${transcriptId}`);
        metadata = metaRes.data;
      } catch (err) {
        // metadata is optional; continue without it
        metadata = null;
      }

      // Build content: heading with Call Title, Consultant name, Consultant rating, a summary block, then annotations list
      const headerLines = [];
      if (metadata) {
        const t = metadata.filename || metadata.title || "(no title)";
        const cn = metadata.consultant_name || "(no consultant)";
        const cr = metadata.consultant_rating !== undefined && metadata.consultant_rating !== null ? metadata.consultant_rating : "(no rating)";
        headerLines.push(`[Title: ${t}] [Consultant: ${cn}] [Rating: ${cr}] `);
      }

      // Use freshest annotations returned by fetchAnnotations (falls back to state)
      const latest = await fetchAnnotations();
      const noteAnnotations = latest && latest.length ? latest : annotations;

      const totalAnn = noteAnnotations ? noteAnnotations.length : 0;
      const tickerSet = new Set();
      //*COPY
      const subsectorSet = new Set();
      const sentimentCounts = { '++': 0, '+': 0, '=': 0, '-': 0, '--': 0 };
      let ratingSum = 0;
      let ratingCount = 0;

      (noteAnnotations || []).forEach((a) => {
        if (a.ticker) {
          a.ticker.split(',').forEach((tt) => {
            const tclean = tt.trim();
            if (tclean) tickerSet.add(tclean.toUpperCase());
          });
        }
       //*copy 
        if (a.subsector) {
          a.subsector.split(',').forEach((ss) => {
            const ssclean = ss.trim();
            if (ssclean) subsectorSet.add(ssclean.toUpperCase());
          });
        }
        const s = a.sentiment || '=';
        if (sentimentCounts[s] !== undefined) sentimentCounts[s]++;
        const r = Number(a.rating);
        if (!Number.isNaN(r)) {
          ratingSum += r;
          ratingCount++;
        }
      });
  // don't reference 'a' here (it's only defined inside the forEach/map callbacks)

  const uniqueTickers = tickerSet.size;
  const uniqueTickersList = Array.from(tickerSet).sort();
     //*copy
  const uniqueSubsectors = subsectorSet.size;
  const uniqueSubsectorsList = Array.from(subsectorSet).sort();
     //

      const lines = (noteAnnotations || []).map((a) => {
        const ticker = a.ticker || "(no ticker)";
        //*copy
       const subsector = a.subsector || "(no subsector)";

        const sentiment = a.sentiment || "=";
        const text = a.text || "";
        const datatitle = a.datatitle || "(no data title)";

        return `[${ticker}]\n[${subsector}]  [${datatitle}]\n[${sentiment}][${a.rating}] ${text}`;
      });

      const contentSections = [];
      if (headerLines.length > 0) {
        contentSections.push(headerLines.map(l => l).join("\n"));
        contentSections.push("\n");
      }

      // Summary section after header
      const summaryLines = [];
      summaryLines.push(`Total data points: ${totalAnn}`);
      // Put count and actual tickers on the same line
      if (uniqueTickersList.length > 0) {
        summaryLines.push(`Unique tickers: ${uniqueTickers} ;  ${uniqueTickersList.join(', ')}`);
      } else {
        summaryLines.push(`Unique tickers: ${uniqueTickers}`);
      }
      summaryLines.push(`Sentiment counts: ++:${sentimentCounts['++']}  +:${sentimentCounts['+']}  =:${sentimentCounts['=']}  -:${sentimentCounts['-']}  --:${sentimentCounts['--']}`);


      if (summaryLines.length > 0) {
        contentSections.push(summaryLines.join("\n"));
        contentSections.push("\n");
      }

      contentSections.push(lines.join("\n\n"));

      const content = contentSections.join("\n");

      // Create a simple .doc file (Word can open plain text .doc)
      const blob = new Blob([content], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = transcriptId ? `transcript_${transcriptId}_annotations.doc` : `annotations.doc`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to create note:", err);
      alert("Failed to create note. See console for details.");
    }
  };

  /** Render transcript with highlights */
  useEffect(() => {
    if (!chunkContent) {
      if (editorRef.current) editorRef.current.innerHTML = "";
      return;
    }
    let rendered = chunkContent;
  annotations.forEach(({ id, text, ticker, subsector, sentiment, rating, datatitle }) => {
      const escapedText = text.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(escapedText, "g");

      const safeDatatitle = datatitle === null || datatitle === undefined ? '' : datatitle;
      rendered = rendered.replace(regex, `<span 
        data-id="${id}" 
        data-tickers="${ticker}" 
        data-subsectors="${subsector}" 
        data-datatitle="${safeDatatitle}" 
        data-sentiment="${sentiment}" 
        data-rating="${rating}" 
        style="background-color:${colorMap[sentiment]};padding:2px 4px;border-radius:3px;cursor:pointer;"
      >${text}</span>`);
    });
    if (editorRef.current) editorRef.current.innerHTML = rendered;
  }, [chunkContent, annotations]);

  /** Handle text selection */
    const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setShowPopup(false);
      return;
    }
    const text = sel.toString();
    if (text.trim()) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelection({ text, range });
      setPopupPosition({ top: rect.bottom + window.scrollY + 5, left: rect.left + window.scrollX });
      setShowPopup(true);
      setFormData((prev) => ({ ...prev, tickers: [], subsectors: [] }));
      setEditingAnnotationId(null);
    }
  };
  /** Handle click on existing annotation */
    const handleAnnotationClick = (e) => {
    const span = e.target.closest("span[data-id]");
    console.log('span', span);
    if (!span) return;
    const id = parseInt(span.dataset.id);
    const tickers = span.dataset.tickers ? span.dataset.tickers.split(",") : [];
  const subsectors = span.dataset.subsectors ? span.dataset.subsectors.split(",") : [];
  const datatitle = span.dataset.datatitle || "";
    const sentiment = span.dataset.sentiment || "=";
    // parse rating safely (handle strings, null, empty)
    let rating = 5;
    const rawRating = span.dataset.rating;
    if (rawRating !== undefined && rawRating !== null && rawRating !== "") {
      const parsed = Number(rawRating);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        rating = parsed;
      }
    }
    const text = span.innerText;

  setSelection({ text, range: null });
  setFormData({ tickers, subsectors, dataTitle: datatitle || "", sentiment, rating });
    setEditingAnnotationId(id);

    const rect = span.getBoundingClientRect();
    setPopupPosition({ top: rect.bottom + window.scrollY + 5, left: rect.left + window.scrollX });
    setShowPopup(true);
  };



  /** Save annotation */
  const handleSaveAnnotation = async () => {
    if (!selection) return;

    const r = Number(formData.rating);
    const annotationPayload = {
      text: selection.text,
      ticker: formData.tickers.join(","),
      subsector: formData.subsectors.join(","),
      datatitle: formData.dataTitle || "",
      sentiment: formData.sentiment,
      rating: Number.isNaN(r) ? null : r,
      transcript_id: transcriptId
    };

    try {
      if (editingAnnotationId) {
        const resp = await axios.put(`http://localhost:5000/annotations/${editingAnnotationId}`, annotationPayload);
        console.log('PUT /annotations response', resp.data);
      } else {
        const resp = await axios.post("http://localhost:5000/annotations", annotationPayload);
        console.log('POST /annotations response', resp.data);
      }

      // Do NOT overwrite chunkContent with editor innerText here.
      // Overwriting with innerText strips HTML which removes the highlight spans/styles.
      // We rely on re-fetching annotations and re-rendering highlights from `chunkContent` + `annotations`.

      const updated = await fetchAnnotations();
      if (updated) setAnnotations(updated);
    } catch (err) {
      console.error(err);
    }

  setShowPopup(false);
  setFormData({ dataTitle: "", tickers: [], subsectors: [], sentiment: "=", rating: 5 });
    setSelection(null);
    setEditingAnnotationId(null);
  };

  /** Delete annotation */
  const deleteAnnotation = async (annotationId) => {
    if (!annotationId) return;
    const ok = window.confirm("Delete this annotation? This will remove the highlight and delete it from the database.");
    if (!ok) return;
    try {
      // optimistic UI: remove locally
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      await axios.delete(`http://localhost:5000/annotations/${annotationId}`);
    } catch (err) {
      console.error(err);
      alert("Failed to delete annotation. Refreshing annotations.");
      await fetchAnnotations();
    } finally {
      setShowPopup(false);
      setEditingAnnotationId(null);
      setSelection(null);
    }
  };

  /** Ticker selection */
  const handleTopTickerClick = (ticker) => {
    if (selectedTickers.includes(ticker)) {
      // Check if ticker is used in any annotation (across all loaded chunks)
      const usedAnnotations = annotations.filter(a =>
        a.ticker && a.ticker.split(',').map(t => t.trim().toUpperCase()).includes(ticker.toUpperCase())
      );
      if (usedAnnotations.length > 0) {
        alert(`Ticker '${ticker}' is used in ${usedAnnotations.length} annotation(s). Cannot be deselected.`);
        return;
      }
    }
    setSelectedTickers((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker]
    );
  };

  /** SUBSECTOR SELECTION */
  const handleTopSubsectorClick = (sub) => {
    if (selectedSubsectors.includes(sub)) {
      // Check if subsector is used in any annotation (across all loaded chunks)
      const usedAnnotations = annotations.filter(a =>
        a.subsector && a.subsector.split(',').map(s => s.trim().toUpperCase()).includes(sub.toUpperCase())
      );
      if (usedAnnotations.length > 0) {
        alert(`Subsector '${sub}' is used in ${usedAnnotations.length} annotation(s). Cannot be deselected.`);
        return;
      }
    }
    setSelectedSubsectors((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  };


  // Handle ticker changes in the annotate popup
  const handlePopupTickerChange = (ticker) => {
    setFormData((prev) => {
      if (prev.tickers.includes(ticker)) {
        return { ...prev, tickers: prev.tickers.filter((t) => t !== ticker) };
      } else {
        return { ...prev, tickers: [...prev.tickers, ticker] };
      }
    });
  };

  // Handle subsector changes in the annotate popup
  const handlePopupSubsectorChange = (subsector) => {
    setFormData((prev) => {
      if (prev.subsectors.includes(subsector)) {
        return { ...prev, subsectors: prev.subsectors.filter((s) => s !== subsector) };
      } else {
        return { ...prev, subsectors: [...prev.subsectors, subsector] };
      }
    });
  };


  // Select All / Deselect All helper for the annotate popup
  const isAllSelected = selectedTickers.length > 0 && selectedTickers.every((t) => formData.tickers.includes(t));
  const handleSelectAllToggle = () => {
    if (!selectedTickers || selectedTickers.length === 0) return;
    if (isAllSelected) {
      // deselect all
      setFormData((prev) => ({ ...prev, tickers: prev.tickers.filter((t) => !selectedTickers.includes(t)) }));
    } else {
      // select all (merge with any existing selections)
      setFormData((prev) => ({ ...prev, tickers: Array.from(new Set([...(prev.tickers || []), ...selectedTickers])) }));
    }
  };

  const isAllSelectedSubsectors = selectedSubsectors.length > 0 && selectedSubsectors.every((s) => formData.subsectors.includes(s));
  const handleSelectAllToggleSubsectors = () => {
    if (!selectedSubsectors || selectedSubsectors.length === 0) return;
    if (isAllSelectedSubsectors) {
      // deselect all
      setFormData((prev) => ({ ...prev, subsectors: prev.subsectors.filter((s) => !selectedSubsectors.includes(s)) }));
    } else {
      // select all (merge with any existing selections)
      setFormData((prev) => ({ ...prev, subsectors: Array.from(new Set([...(prev.subsectors || []), ...selectedSubsectors])) }));
    }
  };



  return (
    <div style={{ marginTop: 20, position: "relative" }}>
    
      {/* Metadata moved to VideoUploader; no inputs here anymore */}
         <h3>TICKERS</h3>
      {/* Tickers at top */}
      <div style={{ marginBottom: "10px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: 'center' }}>
        {masterTickers.map((t) => (
          <span
            key={t}
            onClick={() => handleTopTickerClick(t)}
            style={{
              padding: "5px 10px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
              background: selectedTickers.includes(t) ? "#007bff" : "#f5f5f5",
              color: selectedTickers.includes(t) ? "white" : "black",
              fontSize: "14px"
            }}
          >
            {t}
          </span>
        ))}

        {/* Add-ticker '+' chip */}
        <span
          onClick={() => { setShowAddTickerInput((s) => !s); setNewTickerValue(''); }}
          style={{
            padding: "5px 10px",
            border: "1px dashed #999",
            borderRadius: "4px",
            cursor: "pointer",
            background: showAddTickerInput ? '#eef6ff' : '#fff',
            color: '#111',
            fontSize: "14px",
            fontWeight: 700
          }}
          title="Add ticker"
        >
          +
        </span>

        {/* Input shown when '+' clicked */}
        {showAddTickerInput && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={newTickerValue}
              onChange={(e) => setNewTickerValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (newTickerValue || '').toUpperCase().trim();
                  if (!v) return;
                  // avoid duplicates
                  if (masterTickers.map(m=>m.toUpperCase()).includes(v) || customTickers.map(c=>c.toUpperCase()).includes(v)) {
                    alert('Ticker already exists');
                    return;
                  }
                  setCustomTickers((prev) => [...prev, v]);
                  setShowAddTickerInput(false);
                  setNewTickerValue('');
                }
                if (e.key === 'Escape') {
                  setShowAddTickerInput(false);
                }
              }}
              placeholder="Ticker (e.g. AAPL)"
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
            />
            <button
              onClick={() => {
                const v = (newTickerValue || '').toUpperCase().trim();
                if (!v) return;
                if (masterTickers.map(m=>m.toUpperCase()).includes(v) || customTickers.map(c=>c.toUpperCase()).includes(v)) {
                  alert('Ticker already exists');
                  return;
                }
                setCustomTickers((prev) => [...prev, v]);
                setShowAddTickerInput(false);
                setNewTickerValue('');
              }}
              style={{ padding: '6px 8px', borderRadius: 6, border: 'none', background: '#007bff', color: '#fff' }}
            >Add</button>
          </div>
        )}
      </div>

      {/* Subsector chips */}
      <h3>SUBSECTORS</h3>
      <div style={{ marginBottom: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {masterSubsectors.map((s) => (
          <span
            key={s}
            onClick={() => handleTopSubsectorClick(s)}
            style={{
              padding: "5px 10px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
              background: selectedSubsectors.includes(s) ? "#665f5fff" : "#f5f5f5",
              color: selectedSubsectors.includes(s) ? "white" : "black",
              fontSize: "14px"
            }}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Transcript editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning={true}
        onMouseUp={handleMouseUp}
        onClick={handleAnnotationClick}
        style={{
          width: "100%",
          maxWidth: "100%",
          height: "calc(100vh - 320px)",
          minHeight: "320px",
          maxHeight: "calc(100vh - 320px)",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "6px",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          background: chunkContent ? "#fff" : "#f8d7da",
          overflowY: "auto",
          boxSizing: "border-box",
          margin: "0 auto"
        }}
      />



      {/* Popup for annotations */}
      {showPopup && (
        <div
          ref={popupRef}
          style={{
            position: "absolute", // place relative to the parent container (which is position: relative)
            top: "50%",
            right: "-400px",
            transform: "translateY(-50%)",
            background: "#fff",
            border: "1.5px solid #007bff",
            borderRadius: "12px",
            padding: "20px",
            zIndex: 2000,
            width: "300px",
            maxWidth: "90vw",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            boxSizing: "border-box"
          }}
        >
          {/* DATA POINT */}
        

          <div style={{ width: '100%', marginBottom: 10 }}>
            <label style={{fontWeight: 500, display: 'block', fontSize: 13, marginBottom: 6 }}>Data Title</label>
            <input
              type="text"
              value={formData.dataTitle || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, dataTitle: e.target.value }))}
              placeholder="Enter title"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>


          {selectedTickers.length > 0 ? (
            <div style={{ width: "100%", marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              <label style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="checkbox" checked={isAllSelected} onChange={handleSelectAllToggle} />
                <strong style={{ fontSize: 13 }}>Select all tickers</strong>
              </label>
              {selectedTickers.map((t) => (
                <label key={t} style={{ display: "flex", alignItems: "center", fontSize: 15, marginRight: 8, marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.tickers.includes(t)}
                    onChange={() => handlePopupTickerChange(t)}
                    style={{ marginRight: 4 }}
                  />
                  {t}
                </label>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: "#666", marginBottom: 12 }}>⚠️ No tickers selected</p>
          )}


          {selectedSubsectors.length > 0 ? (
            <div style={{ width: "100%", marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
              <label style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="checkbox" checked={isAllSelectedSubsectors} onChange={handleSelectAllToggleSubsectors} />
                <strong style={{ fontSize: 13 }}>Select all subsectors</strong>
              </label>
              {selectedSubsectors.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", fontSize: 15, marginRight: 8, marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.subsectors.includes(s)}
                    onChange={() => handlePopupSubsectorChange(s)}
                    style={{ marginRight: 4 }}
                  />
                  {s}
                </label>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: "#666", marginBottom: 12 }}>⚠️ No subsectors selected</p>
          )}


          <div style={{ marginBottom: 10, width: "100%", display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500, marginRight: 10, minWidth: 64 }}>Sentiment:</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 34px)', gap: 6, alignItems: 'center' }}>
              {["++", "+", "=", "-", "--"].map((s) => {
                const checked = formData.sentiment === s;
                const bg = checked ? (colorMap[s] || '#007bff') : '#fff';
                const textColor = checked ? '#fff' : '#111';
                const border = checked ? '2px solid rgba(0,0,0,0.08)' : '1px solid #ccc';
                return (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0' }}>
                    <input
                      type="radio"
                      name="sentiment"
                      value={s}
                      checked={checked}
                      onChange={() => setFormData({ ...formData, sentiment: s })}
                      style={{ display: 'none' }}
                      aria-label={`Sentiment ${s}`}
                    />
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        border,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        background: bg,
                        color: textColor,
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        userSelect: 'none'
                      }}
                      aria-hidden
                    >
                      <span style={{ fontWeight: 900 }}>{s}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 14, width: "100%", display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 500, marginRight: 4, minWidth: 40 }}>Rating:</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 34px)', gap: 1, width: 'auto', boxSizing: 'border-box', justifyContent: 'flex-start' }}>
              {[1,2,3,4,5].map((n) => {
                const checked = formData.rating === n;
                const circleStyle = {
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: checked ? '2px solid #0069d9' : '1px solid #ccc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  background: checked ? '#007bff' : '#fff',
                  color: checked ? '#fff' : '#111',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  userSelect: 'none'
                };

                return (
                  <label key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0' }}>
                    <input
                      type="radio"
                      name="rating"
                      value={n}
                      checked={checked}
                      onChange={() => setFormData({ ...formData, rating: n })}
                      style={{ display: 'none' }}
                    />
                    <span style={circleStyle} aria-hidden>{n}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSaveAnnotation}
              style={{
                background: "#007bff",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "10px 18px",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                marginTop: 6,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
              }}
            >
              Save
            </button>

            {editingAnnotationId ? (
              <button
                onClick={() => deleteAnnotation(editingAnnotationId)}
                style={{
                  background: "#e74c3c",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 18px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  marginTop: 6,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
                }}
              >
                Delete
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPopup(false);
                  setFormData({ tickers: [], subsectors: [], sentiment: "=", rating: 5 });
                  setSelection(null);
                  setEditingAnnotationId(null);
                }}
                style={{
                  background: "#6c757d",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 18px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  marginTop: 6,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
                }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
  {/* Create Note button below the transcript editor */}
  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-start' }}>
    <button
      onClick={createNote}
      style={{
        background: '#17a2b8',
        color: '#fff',
        border: 'none',
        padding: '10px 14px',
        borderRadius: 8,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(23,162,184,0.18)'
      }}
    >
      Create Note
    </button>
  </div>
    </div>
  );
}

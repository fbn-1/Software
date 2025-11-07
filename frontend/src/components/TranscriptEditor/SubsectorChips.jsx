// TranscriptEditor/SubsectorChips.jsx - Display and manage subsector chips

import React, { useState } from 'react';
import { normalizeToUppercase, mergeUnique, isUsedInAnnotations } from './utils';

const SubsectorChips = ({ subsectors, setSubsectors, masterSubsectors, annotations }) => {
  const [subsectorInput, setSubsectorInput] = useState("");
  const [subsectorSuggestions, setSubsectorSuggestions] = useState([]);

  const handleSubsectorInputChange = (e) => {
    const val = e.target.value;
    setSubsectorInput(val);
    
    if (!val.trim()) {
      setSubsectorSuggestions([]);
      return;
    }
    
    const filtered = masterSubsectors.filter((s) =>
      s.toUpperCase().startsWith(val.toUpperCase())
    );
    setSubsectorSuggestions(filtered);
  };

  const handleAddSubsector = (subsector) => {
    const upperSubsector = normalizeToUppercase(subsector);
    if (!upperSubsector || subsectors.includes(upperSubsector)) {
      setSubsectorInput("");
      setSubsectorSuggestions([]);
      return;
    }
    setSubsectors(mergeUnique(subsectors, [upperSubsector]));
    setSubsectorInput("");
    setSubsectorSuggestions([]);
  };

  const handleRemoveSubsector = (subsector) => {
    if (isUsedInAnnotations(subsector, annotations, 'subsector')) {
      alert(`Cannot remove subsector "${subsector}" as it's being used in annotations.`);
      return;
    }
    setSubsectors((prev) => prev.filter((s) => s !== subsector));
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>
        Subsectors
      </h3>
      <div style={{ marginBottom: '10px', position: 'relative' }}>
        <input
          type="text"
          placeholder="Add subsector..."
          value={subsectorInput}
          onChange={handleSubsectorInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddSubsector(subsectorInput);
            }
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />
        {subsectorSuggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderRadius: '6px',
              marginTop: '4px',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 1000,
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            {subsectorSuggestions.map((s) => (
              <div
                key={s}
                onClick={() => handleAddSubsector(s)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => (e.target.style.backgroundColor = '#f9fafb')}
                onMouseLeave={(e) => (e.target.style.backgroundColor = 'white')}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {subsectors.map((subsector) => (
          <div
            key={subsector}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#10b981',
              color: 'white',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <span>{subsector}</span>
            <button
              onClick={() => handleRemoveSubsector(subsector)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubsectorChips;

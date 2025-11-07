// TranscriptEditor/TickerChips.jsx - Display and manage ticker chips

import React, { useState } from 'react';
import { normalizeToUppercase, mergeUnique, isUsedInAnnotations } from './utils';

const TickerChips = ({ tickers, setTickers, masterTickers, annotations }) => {
  const [tickerInput, setTickerInput] = useState("");
  const [tickerSuggestions, setTickerSuggestions] = useState([]);

  const handleTickerInputChange = (e) => {
    const val = e.target.value;
    setTickerInput(val);
    
    if (!val.trim()) {
      setTickerSuggestions([]);
      return;
    }
    
    const filtered = masterTickers.filter((t) =>
      t.toUpperCase().startsWith(val.toUpperCase())
    );
    setTickerSuggestions(filtered);
  };

  const handleAddTicker = (ticker) => {
    const upperTicker = normalizeToUppercase(ticker);
    if (!upperTicker || tickers.includes(upperTicker)) {
      setTickerInput("");
      setTickerSuggestions([]);
      return;
    }
    setTickers(mergeUnique(tickers, [upperTicker]));
    setTickerInput("");
    setTickerSuggestions([]);
  };

  const handleRemoveTicker = (ticker) => {
    if (isUsedInAnnotations(ticker, annotations, 'ticker')) {
      alert(`Cannot remove ticker "${ticker}" as it's being used in annotations.`);
      return;
    }
    setTickers((prev) => prev.filter((t) => t !== ticker));
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>
        Tickers
      </h3>
      <div style={{ marginBottom: '10px', position: 'relative' }}>
        <input
          type="text"
          placeholder="Add ticker..."
          value={tickerInput}
          onChange={handleTickerInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTicker(tickerInput);
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
        {tickerSuggestions.length > 0 && (
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
            {tickerSuggestions.map((t) => (
              <div
                key={t}
                onClick={() => handleAddTicker(t)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onMouseEnter={(e) => (e.target.style.backgroundColor = '#f9fafb')}
                onMouseLeave={(e) => (e.target.style.backgroundColor = 'white')}
              >
                {t}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {tickers.map((ticker) => (
          <div
            key={ticker}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <span>{ticker}</span>
            <button
              onClick={() => handleRemoveTicker(ticker)}
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

export default TickerChips;

// TranscriptEditor/SentimentSelector.jsx - Sentiment radio button component

import React from 'react';

const SentimentSelector = ({ sentiment, onChange }) => {
  const sentiments = [
    { value: '++', label: '++', color: '#22c55e' },
    { value: '+', label: '+', color: '#86efac' },
    { value: '=', label: '=', color: '#fbbf24' },
    { value: '-', label: '-', color: '#fb923c' },
    { value: '--', label: '--', color: '#ef4444' },
  ];

  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
        Sentiment:
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {sentiments.map((s) => (
          <label
            key={s.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '6px 12px',
              border: `2px solid ${sentiment === s.value ? s.color : '#ddd'}`,
              borderRadius: '6px',
              backgroundColor: sentiment === s.value ? `${s.color}20` : 'white',
              transition: 'all 0.2s',
            }}
          >
            <input
              type="radio"
              name="sentiment"
              value={s.value}
              checked={sentiment === s.value}
              onChange={(e) => onChange(e.target.value)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 600, color: s.color }}>{s.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default SentimentSelector;

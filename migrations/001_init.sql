-- migrations/001_init.sql





CREATE TABLE IF NOT EXISTS transcripts (
  id SERIAL PRIMARY KEY,
  filename TEXT,
  content TEXT,
  created_at TIMESTAMP DEFAULT now(),
  consultant_name TEXT,
  consultant_rating NUMERIC
);

CREATE TABLE IF NOT EXISTS annotations (
  id SERIAL PRIMARY KEY,
  transcript_id INTEGER REFERENCES transcripts(id) ON DELETE CASCADE,
  text TEXT,
  ticker TEXT,
  sentiment VARCHAR(16),
  created_at TIMESTAMP DEFAULT now(),
  rating INTEGER,
  subsectors TEXT,
  datatitle TEXT
);

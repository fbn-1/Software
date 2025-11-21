-- migrations/002_add_users_table.sql

-- Create users table for consultants
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  rating NUMERIC,
  person_identity TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT now()
);

-- Create junction table for transcript-consultant relationships (many-to-many)
CREATE TABLE IF NOT EXISTS transcript_consultants (
  id SERIAL PRIMARY KEY,
  transcript_id INTEGER REFERENCES transcripts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(transcript_id, user_id)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transcript_consultants_transcript ON transcript_consultants(transcript_id);
CREATE INDEX IF NOT EXISTS idx_transcript_consultants_user ON transcript_consultants(user_id);
CREATE INDEX IF NOT EXISTS idx_users_person_identity ON users(person_identity);

-- migrations/003_update_transcripts_consultants.sql

-- Add consultant_ids column as an array of integers
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS consultant_ids INTEGER[];

-- Migrate existing data if needed (optional - for backward compatibility)
-- This is commented out as we're using the junction table instead
-- UPDATE transcripts SET consultant_ids = ARRAY[]::INTEGER[] WHERE consultant_ids IS NULL;

-- Drop old columns (be careful - this will delete existing data in these columns)
ALTER TABLE transcripts DROP COLUMN IF EXISTS consultant_name;
ALTER TABLE transcripts DROP COLUMN IF EXISTS consultant_rating;

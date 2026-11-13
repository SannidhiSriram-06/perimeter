-- ============================================================================
-- Migration 001: Incident Draft Review and Finalization
-- Adds draft review, reviewer identity, and finalization tracking columns.
-- ============================================================================

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reviewed_draft JSONB;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(6) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

-- Migration: Add 'approved' column to agents_agent table
-- Date: 2026-04-28
-- Description: Agent approval system — new agents start as pending (approved=false)

ALTER TABLE agents_agent ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;

-- Set existing agents to approved=true so they continue working as before
UPDATE agents_agent SET approved = true WHERE status IN ('online', 'offline', 'overdue');

-- Update any agents currently in 'error' or other states to approved=true as well
-- (they were already registered before the approval system existed)
UPDATE agents_agent SET approved = true WHERE approved = false AND status != 'pending';
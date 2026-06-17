-- Migration: Add employee_name to orders for kitchen and checkout display
-- Date: 2026-06-17

ALTER TABLE orders ADD COLUMN IF NOT EXISTS employee_name TEXT;

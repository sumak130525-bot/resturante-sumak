-- Migration: add channel column to orders
-- Run this in the Supabase SQL Editor

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web'
  CHECK (channel IN ('web', 'whatsapp'));

-- Backfill existing rows (they're all web orders)
UPDATE public.orders SET channel = 'web' WHERE channel IS NULL;

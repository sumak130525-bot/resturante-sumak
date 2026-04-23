-- Migration: add payment fields to orders table
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS payment_id     text,
  ADD COLUMN IF NOT EXISTS payment_method text;

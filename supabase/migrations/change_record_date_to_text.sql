-- Migration: Change record_date from DATE to TEXT to support partial dates
-- Run this on existing databases

ALTER TABLE records ALTER COLUMN record_date TYPE TEXT;

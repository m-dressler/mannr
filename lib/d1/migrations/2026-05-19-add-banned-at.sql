-- Apply against existing prod databases that already have a populated
-- `users` table (the seed files in lib/d1 DROP and recreate, so they are
-- safe for fresh local setups but would wipe production data).
--
-- ALTER TABLE in SQLite cannot add columns with non-constant defaults; we
-- want NULL = "not banned" so a column with no default is fine.
ALTER TABLE users ADD COLUMN banned_at INTEGER;

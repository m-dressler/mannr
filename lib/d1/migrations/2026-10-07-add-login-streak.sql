-- Login streaks: `streak_days` counts visits that each came 23–48h after the
-- previous counted one, `streak_at` is the epoch ms of the visit that last
-- advanced the streak (NULL = never visited since streaks shipped).
ALTER TABLE users ADD COLUMN streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_at INTEGER;

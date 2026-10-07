import META from "@src/bank/meta.json" with { type: "json" };

/** Payout milestones, ascending by `days`; see `streakRewards` in meta.json */
export const STREAK_REWARDS = META.streakRewards;

const HOUR_MS = 3600_000;
/** Shorter than a day, so a visit a bit earlier than yesterday's still counts */
const MIN_GAP_MS = 23 * HOUR_MS;
const MAX_GAP_MS = 48 * HOUR_MS;

/** A user's run of visits, each 23–48h after the previous counted one */
export type Streak = {
  days: number;
  /** Epoch ms of the visit that last advanced the streak, `null` if none yet */
  at: number | null;
};

/**
 * The streak after a visit at `now` (epoch ms): extended if more than 23h but
 * less than 48h passed since the last counted visit, restarted at 1 after
 * that. `null` within 23h of the last counted visit, which also doesn't move
 * `at`, so callers can skip the write.
 */
export const advanceStreak = (streak: Streak, now: number): Streak | null => {
  if (streak.at === null) return { days: 1, at: now };
  const elapsed = now - streak.at;
  if (elapsed <= MIN_GAP_MS) return null;
  return { days: elapsed < MAX_GAP_MS ? streak.days + 1 : 1, at: now };
};

/** MPs paid out on the day a streak reaches `days` (0 on most days) */
export const getStreakReward = (days: number): number => {
  const milestone = STREAK_REWARDS.find((r) => r.days === days);
  if (milestone) return milestone.mps;

  const last = STREAK_REWARDS[STREAK_REWARDS.length - 1];
  return days > last.days && days % last.days === 0 ? last.mps : 0;
};

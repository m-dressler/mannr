/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { advanceStreak, getStreakReward } from "./streak.ts";

const HOUR = 3_600_000;
const T = Date.UTC(2026, 9, 7, 20);

Deno.test("advanceStreak: first ever visit starts a 1-day streak", () => {
  assertEquals(advanceStreak({ days: 0, at: null }, T), { days: 1, at: T });
});

Deno.test("advanceStreak: visits within 23h of the last counted one change nothing", () => {
  for (const elapsed of [0, 1, 22 * HOUR, 23 * HOUR]) {
    assertEquals(
      advanceStreak({ days: 4, at: T }, T + elapsed),
      null,
      `${elapsed}ms`,
    );
  }
});

Deno.test("advanceStreak: a visit between 23h and 48h later extends the streak", () => {
  for (const elapsed of [23 * HOUR + 1, 24 * HOUR, 30 * HOUR, 48 * HOUR - 1]) {
    assertEquals(
      advanceStreak({ days: 4, at: T }, T + elapsed),
      { days: 5, at: T + elapsed },
      `${elapsed}ms`,
    );
  }
});

Deno.test("advanceStreak: 48h or more without a visit resets the streak to 1", () => {
  for (const elapsed of [48 * HOUR, 72 * HOUR]) {
    assertEquals(
      advanceStreak({ days: 29, at: T }, T + elapsed),
      { days: 1, at: T + elapsed },
      `${elapsed}ms`,
    );
  }
});

Deno.test("advanceStreak: a clock slightly behind the last visit changes nothing", () => {
  assertEquals(advanceStreak({ days: 4, at: T }, T - 5), null);
});

Deno.test("getStreakReward: milestones pay 5, 20, 50 and 250 MPs", () => {
  assertEquals(getStreakReward(3), 5);
  assertEquals(getStreakReward(7), 20);
  assertEquals(getStreakReward(14), 50);
  assertEquals(getStreakReward(30), 250);
});

Deno.test("getStreakReward: days between milestones pay nothing", () => {
  for (const days of [1, 2, 4, 6, 8, 13, 15, 29]) {
    assertEquals(getStreakReward(days), 0, `day ${days}`);
  }
});

Deno.test("getStreakReward: after day 30 only every 30th day pays 250", () => {
  assertEquals(getStreakReward(60), 250);
  assertEquals(getStreakReward(90), 250);
  // Earlier milestones don't repeat within later 30-day cycles
  for (const days of [31, 33, 37, 44, 59, 61]) {
    assertEquals(getStreakReward(days), 0, `day ${days}`);
  }
});

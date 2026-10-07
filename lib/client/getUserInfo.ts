import { advanceStreak } from "@lib/common/streak.ts";
import { UserInfo } from "@src/bank/me/+fn.ts";

/**
 * Whether the server has advanced the streak since `userInfo` was cached:
 * the middleware does that on the first visit a day after the last counted one.
 */
const isStreakOutdated = (userInfo: UserInfo): boolean =>
  advanceStreak(
    { days: userInfo.streak_days, at: userInfo.streak_at },
    Date.now(),
  ) !== null;

export const getUserInfo = async (): Promise<UserInfo> => {
  const cached = localStorage.getItem("MANNR:user-info");
  if (cached) {
    const { updatedAt, userInfo } = JSON.parse(cached) as {
      userInfo: UserInfo;
      updatedAt?: number;
    };
    if (
      updatedAt && updatedAt + 15 * 3600_000 >= Date.now() &&
      !isStreakOutdated(userInfo)
    ) return userInfo;
  }

  const response = await fetch("/bank/me", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Couldn't retrieve user info", { cause: response });
  }

  const userInfo = await response.json<UserInfo>();
  localStorage.setItem(
    "MANNR:user-info",
    JSON.stringify({ userInfo, updatedAt: Date.now() }),
  );
  return userInfo;
};

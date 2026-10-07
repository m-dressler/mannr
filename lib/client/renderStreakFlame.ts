import DOMReadyPromise from "@md/dom-ready-promise";
import { HTMLTemplater } from "@md/html-templater";
import { STREAK_REWARDS } from "../common/streak.ts";
import { getUserInfo } from "./getUserInfo.ts";

/**
 * Shows the user's streak on the header flame (`[data-type="streak-flame"]`)
 * and lists the payout milestones from meta.json in its info dialog.
 */
export const renderStreakFlame = async () => {
  const userInfo = await getUserInfo();

  await DOMReadyPromise;

  const flame = document.querySelector<HTMLElement>(
    '[data-type="streak-flame"]',
  );
  if (!flame) return;

  flame.querySelector('[data-type="streak-count"]')!.textContent = String(
    userInfo.streak_days,
  );
  flame.hidden = false;

  new HTMLTemplater("#streak-reward-list template").instantiate(
    STREAK_REWARDS.map(({ days, mps }) => ({
      span: { textContent: (v: string) => `${v} ${days}` },
      em: { textContent: (v: string) => `${mps} ${v}` },
    })),
  );

  const repeat = document.getElementById("streak-reward-repeat");
  const last = STREAK_REWARDS[STREAK_REWARDS.length - 1];
  if (repeat?.textContent) {
    repeat.textContent = repeat.textContent
      .replace("[DAYS]", String(last.days))
      .replace("[MPS]", String(last.mps));
  }
};

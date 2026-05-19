import { getUserInfo } from "@lib/client/getUserInfo.ts";
import { replaceProfilePicture } from "@lib/client/replaceProfilePicture.ts";
import { hasRole, ROLES } from "@lib/common/roles.ts";
import onDomReady from "@md/on-dom-ready";

replaceProfilePicture();

const formatMps = (n: number) => `${new Intl.NumberFormat().format(n)} MPs`;

const formatJoined = (epochMillisOrSeconds: number) => {
  if (!epochMillisOrSeconds) return "–";
  // Older seed rows use ms, the schema default uses seconds — disambiguate
  // by magnitude rather than guessing.
  const ms = epochMillisOrSeconds > 1e12
    ? epochMillisOrSeconds
    : epochMillisOrSeconds * 1000;
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

onDomReady(async () => {
  const userInfo = await getUserInfo();

  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  const toggleGroup = (attr: string, show: boolean) => {
    document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
      el.hidden = !show;
    });
  };

  const fullName = [userInfo.first_name, userInfo.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  setText("display-name", fullName || userInfo.email);
  setText("email-line", userInfo.email);

  const available = Math.max(userInfo.mps - userInfo.reserved_mps, 0);
  setText("stat-mps", formatMps(userInfo.mps));
  setText("stat-reserved", formatMps(userInfo.reserved_mps));
  setText("stat-available", formatMps(available));
  toggleGroup("data-show-if-reserved", userInfo.reserved_mps > 0);

  setText("stat-joined", formatJoined(userInfo.created_at));

  setText("stat-referrer", userInfo.referrer_name ?? "");
  toggleGroup("data-show-if-referrer", !!userInfo.referrer_name);

  setText("stat-invited", `${userInfo.invited_count}`);
  toggleGroup("data-show-if-invited", userInfo.invited_count > 0);

  for (const role of Object.values(ROLES)) {
    const row = document.getElementById(`role-row-${role}`);
    if (!row) continue;
    const has = hasRole(userInfo.roles, role);
    row.classList.toggle("opacity-40", !has);
    const indicator = row.querySelector<HTMLElement>("[data-role-indicator]");
    if (indicator) indicator.textContent = has ? "●" : "○";
  }

  const inviteLink = document.getElementById("invite-link");
  if (inviteLink && hasRole(userInfo.roles, "invite_user")) {
    inviteLink.hidden = false;
  }
});

import { getUserInfo } from "@lib/client/getUserInfo.ts";
import { hasRole, ROLES } from "@lib/common/roles.ts";
import onDomReady from "@md/on-dom-ready";

onDomReady(async () => {
  const userInfo = await getUserInfo();

  const form = document.getElementById("invite-form") as HTMLFormElement | null;
  const denied = document.getElementById("invite-denied");
  if (!form || !denied) return;

  if (!hasRole(userInfo.roles, "invite_user")) {
    denied.style.display = "block";
    return;
  }
  form.style.display = "";

  // Inviter can only grant roles they themselves hold; access_platform is
  // implicit on the server side, so it isn't shown as a checkbox.
  for (const name of Object.values(ROLES)) {
    if (name === "access_platform") continue;
    if (!hasRole(userInfo.roles, name)) continue;
    const row = document.getElementById(`invite-role-${name}`);
    if (row) row.style.display = "";
    // Default-grant a sensible starter kit: transfer + vouch
    if (name === "transfer_mt" || name === "vouch_mt") {
      const cb = row?.querySelector<HTMLInputElement>(
        `input[data-role-id="${name}"]`,
      );
      if (cb) cb.checked = true;
    }
  }

  const inviterField = document.getElementById(
    "inviter_display_name",
  ) as HTMLInputElement | null;
  if (inviterField) {
    const fullName = [userInfo.first_name, userInfo.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    inviterField.value = fullName || userInfo.email;
  }

  form.addEventListener("form-response", (e) => {
    if (!(e instanceof CustomEvent)) return;
    const { success } = e.detail as { success: boolean };
    if (success) {
      form.reset();
      setTimeout(() => location.assign("/bank/me"), 600);
    }
  });
});

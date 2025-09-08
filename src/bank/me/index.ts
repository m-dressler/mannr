import { getUserInfo } from "@lib/client/getUserInfo.ts";
import { replaceProfilePicture } from "@lib/client/replaceProfilePicture.ts";
import { hasRole, ROLES } from "@lib/common/roles.ts";
import onDomReady from "@md/on-dom-ready";

replaceProfilePicture();

onDomReady(async () => {
  const userInfo = await getUserInfo();
  for (const role of Object.values(ROLES)) {
    if (hasRole(userInfo.roles, role)) {
      document.getElementById(`role-${role}`)?.classList.remove("hidden");
    }
  }
});

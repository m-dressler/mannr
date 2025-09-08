import DOMReadyPromise from "@md/dom-ready-promise";
import { toGravatarUrl } from "../common/gravatar.ts";
import { getUserInfo } from "./getUserInfo.ts";

export const replaceProfilePicture = async () => {
  const userInfo = await getUserInfo();

  await DOMReadyPromise;

  const images = document.querySelectorAll<HTMLImageElement>(
    '[data-type="profile-picture"]',
  );
  if (!images.length) return;

  const gravatarUrl = toGravatarUrl(userInfo.gravatarId);
  images.forEach((img) => (img.src = gravatarUrl));
};

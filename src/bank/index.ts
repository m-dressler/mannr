import { replaceProfilePicture } from "@lib/client/replaceProfilePicture.ts";
import { toGravatarUrl } from "@lib/common/gravatar.ts";
import { HTMLTemplater, TemplateElementMapper } from "@md/html-templater";

const LEADER_BOARD_SIZE = 3;

const showMPs = (users: UiUser[]) => {
  const templateValues = users.map(
    ({ id, first_name, mps, gravatarId }): TemplateElementMapper => ({
      a: { href: (v) => v + id },
      img: { src: toGravatarUrl(gravatarId) },
      h4: { textContent: first_name },
      p: { textContent: (v) => Intl.NumberFormat().format(mps) + v },
      "[style*=view-transition-name]": {
        style: (v) => ({
          viewTransitionName: v.viewTransitionName + "-" + gravatarId,
        }),
      },
    }),
  );

  new HTMLTemplater("ol[data-type=leaderboard] template").instantiate(
    templateValues.slice(0, LEADER_BOARD_SIZE),
  );
  new HTMLTemplater("table[data-type=user-list] template").instantiate(
    templateValues.slice(LEADER_BOARD_SIZE),
  );
};

fetch("/bank/users", { headers: { Accept: "application/json" } })
  .then((res) => res.json() as Promise<UiUser[]>)
  .then(showMPs);

replaceProfilePicture();

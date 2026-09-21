import { replaceProfilePicture } from "@lib/client/replaceProfilePicture.ts";
import { toGravatarUrl } from "@lib/common/gravatar.ts";
import { HTMLTemplater, TemplateElementMapper } from "@md/html-templater";
import onDomReady from "@md/on-dom-ready";

const LEADER_BOARD_SIZE = 3;
const PAGE_SIZE = 20;

const toRowTemplate = (
  { id, first_name, mps, gravatarId }: UiUser,
): TemplateElementMapper => ({
  a: { href: (v) => v + id },
  img: { src: toGravatarUrl(gravatarId) },
  h4: { textContent: first_name },
  p: { textContent: (v) => Intl.NumberFormat().format(mps) + v },
  "[style*=view-transition-name]": {
    style: (v) => ({
      viewTransitionName: v.viewTransitionName + "-" + gravatarId,
    }),
  },
});

onDomReady(() => {
  const leaderboardTemplater = new HTMLTemplater(
    "ol[data-type=leaderboard] template",
  );
  const tableTemplater = new HTMLTemplater(
    "table[data-type=user-list] template",
  );
  const tableEl = document.querySelector<HTMLTableElement>(
    "table[data-type=user-list]",
  )!;
  const searchInput = document.querySelector<HTMLInputElement>(
    "#user-search",
  )!;
  const loadMoreBtn = document.querySelector<HTMLButtonElement>(
    "#user-list-load-more",
  )!;
  const emptyState = document.querySelector<HTMLElement>("#user-list-empty")!;
  const hideOnSearch = document.querySelectorAll<HTMLElement>(
    "[data-hide-on-search]",
  );

  let offset = 0;
  let currentQuery = "";
  let loading = false;
  let hasMore = true;

  const clearList = () => {
    leaderboardTemplater.clear();
    tableTemplater.clear();
  };

  const renderPage = (users: UiUser[], isFirstPage: boolean) => {
    if (currentQuery) {
      // Search mode: skip the podium, every match is a row
      tableTemplater.instantiate(users.map(toRowTemplate));
    } else if (isFirstPage) {
      leaderboardTemplater.instantiate(
        users.slice(0, LEADER_BOARD_SIZE).map(toRowTemplate),
      );
      tableTemplater.instantiate(
        users.slice(LEADER_BOARD_SIZE).map(toRowTemplate),
      );
    } else {
      tableTemplater.instantiate(users.map(toRowTemplate));
    }
  };

  const fetchPage = async () => {
    if (loading || !hasMore) return;
    loading = true;
    loadMoreBtn.disabled = true;

    try {
      const url = new URL("/bank/users", location.origin);
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      if (currentQuery) url.searchParams.set("q", currentQuery);

      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const users = await res.json() as UiUser[];

      renderPage(users, offset === 0);
      offset += users.length;
      hasMore = users.length === PAGE_SIZE;

      const showEmpty = offset === 0 && users.length === 0;
      emptyState.style.display = showEmpty ? "block" : "none";
      tableEl.style.display = showEmpty ? "none" : "";
      loadMoreBtn.style.display = hasMore ? "inline-block" : "none";
    } finally {
      loading = false;
      loadMoreBtn.disabled = false;
    }
  };

  let searchDebounce: number | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      const next = searchInput.value.trim();
      if (next === currentQuery) return;
      currentQuery = next;
      offset = 0;
      hasMore = true;
      clearList();
      hideOnSearch.forEach((el) => {
        el.style.display = currentQuery ? "none" : "";
      });
      fetchPage();
    }, 150);
  });
  // Add `/` ambient search focus listener
  addEventListener("keydown", (e) => {
    if (
      e.key === "/" && e.target instanceof HTMLElement &&
      !e.target.matches("input, textarea, [contenteditable='true']")
    ) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  loadMoreBtn.addEventListener("click", () => fetchPage());

  fetchPage();
});

replaceProfilePicture();

/**
 * @module lib/seo/mod.ts
 * @description Build-time derivation of the site's public URL surface.
 *
 * The build emits one HTML file per page per language (e.g. both
 * `/john-henry/index.html` and `/en/john-henry/index.html`). Search engines and
 * answer engines must be told which of those is the real address, and which
 * pages exist at all. Both answers are derived from the build output here so
 * that no page has to restate them by hand.
 */

/** Absolute origin the production site is served from. */
export const SITE_ORIGIN = "https://mannr.org";

/** Canonical paths under these prefixes are never indexed. */
const NON_INDEXABLE_PREFIXES = [
  "/bank/", // Auth-gated: everything but the login redirects to /bank/login
];

/** Canonical paths that are never indexed. */
const NON_INDEXABLE_PATHS = ["/404.html"];

/**
 * Reduces a build output path to the single address a page should be cited at.
 *
 * Strips the language prefix the build adds for translated copies, and turns
 * `index.html` files into directory URLs. Note that a top-level directory whose
 * name collides with a language code is indistinguishable from that language's
 * prefix — only the leading segment is ever stripped, so nested collisions are
 * preserved.
 */
export const toCanonicalPath = (outPath: string, language?: string): string => {
  const withoutLanguage = language && outPath.startsWith(`/${language}/`)
    ? outPath.slice(language.length + 1)
    : outPath;

  return withoutLanguage.replace(/\/index\.html$/, "/");
};

/** Resolves a canonical path against {@link SITE_ORIGIN}. */
export const canonicalUrl = (canonicalPath: string): string =>
  SITE_ORIGIN + canonicalPath;

/**
 * Whether a canonical path belongs in the sitemap and in search results.
 *
 * Pages that fail this are still built and served — they are only withheld from
 * crawlers, because they either require a session or exist to answer a request
 * that had no page of its own.
 */
export const isIndexable = (canonicalPath: string): boolean =>
  !NON_INDEXABLE_PATHS.includes(canonicalPath) &&
  !NON_INDEXABLE_PREFIXES.some((prefix) => canonicalPath.startsWith(prefix));

/**
 * Renders a sitemap for {@link canonicalPaths}.
 *
 * Carries locations only. `lastmod` is deliberately omitted: the build has no
 * trustworthy per-page modification date, and crawlers discount the hint once
 * it proves unreliable.
 */
export const buildSitemap = (canonicalPaths: readonly string[]): string => {
  const urls = [...new Set(canonicalPaths)]
    .sort()
    .map((path) => `<url><loc>${canonicalUrl(path)}</loc></url>`)
    .join("");

  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls +
    "</urlset>";
};

/**
 * The language file tree, keyed by the directory each file sits in, then by
 * language (or `global`). Structurally compatible with the build's
 * `vfs.buildUtils.langFiles`, restated here so this module stays independent of
 * the build tool.
 */
export type LangFiles = Record<
  string,
  Record<string, Record<string, unknown>>
>;

/** The directory whose `+lang.yml` governs the page at {@link canonicalPath}. */
export const langDirFor = (canonicalPath: string): string => {
  const trimmed = canonicalPath.replace(/\/[^/]*\.[^/]*$/, "/");

  return trimmed === "/" ? "/" : trimmed.replace(/\/$/, "");
};

/**
 * Reads a translation key the way the templates see it: the page's own language
 * file wins, then each ancestor in turn, and within a file the active language
 * wins over `global`.
 */
export const resolveLangValue = (
  langFiles: LangFiles,
  langDir: string,
  language: string,
  key: string,
): string | undefined => {
  const segments = langDir.split("/");

  for (let i = segments.length; i > 0; i--) {
    const dir = segments.slice(0, i).join("/") || "/";
    const langFile = langFiles[dir];
    if (!langFile) continue;

    for (const scope of [language, "global"]) {
      const value = langFile[scope]?.[key];
      if (typeof value === "string") return value;
    }
  }

  return undefined;
};

/** The facts about a page that structured data is built from. */
export type PageMetadata = {
  heading?: string;
  description?: string;
  ogType?: string;
  published?: string;
  modified?: string;
  siteName?: string;
};

/**
 * Renders the schema.org description of a page, or `null` when there is nothing
 * worth saying about it.
 *
 * Only two kinds of page earn structured data: articles, which are the reason a
 * search or answer engine would cite this site at all, and the home page, which
 * identifies the site itself. Dates are emitted only when the page states them,
 * since a guessed date is worse than none.
 */
export const buildJsonLd = (
  canonicalPath: string,
  page: PageMetadata,
): string | null => {
  const isArticle = page.ogType === "article";
  if (!page.heading) return null;
  if (!isArticle && canonicalPath !== "/") return null;

  const site = {
    "@type": "WebSite",
    name: page.siteName,
    url: canonicalUrl("/"),
  };

  if (!isArticle) {
    return JSON.stringify({
      "@context": "https://schema.org",
      ...site,
      description: page.description,
    });
  }

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.heading,
    description: page.description,
    url: canonicalUrl(canonicalPath),
    ...(page.published ? { datePublished: page.published } : {}),
    ...(page.modified ? { dateModified: page.modified } : {}),
    publisher: { "@type": "Organization", name: page.siteName },
    isPartOf: site,
  });
};

/**
 * Renders `robots.txt`.
 *
 * Crawlers are steered away from the same prefixes {@link isIndexable} rejects,
 * so that the two never disagree. Note that this only keeps well-behaved
 * crawlers out of the gated tree — it is a courtesy, not the access control;
 * that is the bank middleware's job.
 */
export const buildRobotsTxt = (): string =>
  [
    "User-agent: *",
    ...NON_INDEXABLE_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    "",
    `Sitemap: ${canonicalUrl("/sitemap.xml")}`,
    "",
  ].join("\n");

/**
 * Inserts {@link tags} into the head of an already built HTML document, or
 * returns `null` if it has no `<title>` to anchor to.
 *
 * The minifier drops the `<head>` element itself, so `<title>` is the only
 * stable landmark left in the output; a document without one is reported by the
 * caller rather than silently left untagged.
 */
export const withHeadTags = (html: string, tags: string): string | null => {
  const anchor = html.indexOf("<title");
  if (anchor === -1) return null;

  return html.slice(0, anchor) + tags + html.slice(anchor);
};

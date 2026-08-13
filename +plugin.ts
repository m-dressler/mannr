/// <reference lib="deno.ns" />
/**
 * @module +plugin.ts
 * @description Build plugin that gives the site its crawlable surface.
 *
 * Every built page is told which URL it really lives at and whether it may be
 * indexed, and the set of indexable pages is emitted as `sitemap.xml` and
 * `robots.txt`. All of it is derived from the build output, so adding a page is
 * enough to have it listed.
 */
import {
  buildJsonLd,
  buildRobotsTxt,
  buildSitemap,
  canonicalUrl,
  isIndexable,
  langDirFor,
  type LangFiles,
  resolveLangValue,
  toCanonicalPath,
  withHeadTags,
} from "@lib/seo/mod.ts";
import type { PluginFunction } from "@md/cf-page";

/**
 * The head tags that state where a page lives, whether crawlers may keep it,
 * and what it is about.
 *
 * These cannot be written in the templates themselves: the canonical URL is
 * only known once the language variants have been emitted, and the templater
 * does not substitute variables inside a `<script>` element, which is where
 * structured data has to live.
 */
const headTagsFor = (canonicalPath: string, jsonLd: string | null): string => {
  const url = canonicalUrl(canonicalPath);
  const tags = [
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:url" content="${url}">`,
  ];

  // `follow` rather than `nofollow`: these pages are withheld from the index,
  // but the links they carry to public pages are still worth crawling.
  if (!isIndexable(canonicalPath)) {
    tags.push(`<meta name="robots" content="noindex, follow">`);
  }

  if (jsonLd) {
    tags.push(`<script type="application/ld+json">${jsonLd}</script>`);
  }

  return tags.join("");
};

export const after: PluginFunction = ({ vfs, warnings }) => {
  const indexablePaths: string[] = [];
  const langFiles = vfs.buildUtils.langFiles as LangFiles;

  for (const vFile of vfs.build.values()) {
    if (vFile.outExtension !== "html" || vFile.status !== "built") continue;
    if (typeof vFile.buildContents !== "string") continue;

    const canonicalPath = toCanonicalPath(vFile.outPath, vFile.language);
    if (isIndexable(canonicalPath)) indexablePaths.push(canonicalPath);

    const language = vFile.language ?? "";
    const lang = (key: string) =>
      resolveLangValue(langFiles, langDirFor(canonicalPath), language, key);

    const jsonLd = isIndexable(canonicalPath)
      ? buildJsonLd(canonicalPath, {
        heading: lang("heading"),
        description: lang("description"),
        ogType: lang("og_type"),
        published: lang("published"),
        modified: lang("modified"),
        siteName: lang("pageName"),
      })
      : null;

    const tagged = withHeadTags(
      vFile.buildContents,
      headTagsFor(canonicalPath, jsonLd),
    );
    if (tagged === null) {
      warnings.push(
        `[seo] ${vFile.outPath} has no <title>; left without a canonical URL`,
      );
      continue;
    }

    vFile.buildContents = tagged;
  }

  vfs.addVFile({
    srcPath: "/sitemap.xml",
    outPath: "/sitemap.xml",
    srcExtension: "xml",
    srcHash: new ArrayBuffer(0),
    buildContents: buildSitemap(indexablePaths),
    status: "built",
  });

  vfs.addVFile({
    srcPath: "/robots.txt",
    outPath: "/robots.txt",
    srcExtension: "txt",
    srcHash: new ArrayBuffer(0),
    buildContents: buildRobotsTxt(),
    status: "built",
  });
};

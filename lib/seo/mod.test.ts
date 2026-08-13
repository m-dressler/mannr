/// <reference lib="deno.ns" />
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildJsonLd,
  buildRobotsTxt,
  buildSitemap,
  canonicalUrl,
  isIndexable,
  langDirFor,
  resolveLangValue,
  toCanonicalPath,
  withHeadTags,
} from "./mod.ts";

Deno.test("toCanonicalPath: root index becomes /", () => {
  assertEquals(toCanonicalPath("/index.html", "en"), "/");
});

Deno.test("toCanonicalPath: language-prefixed root index becomes /", () => {
  assertEquals(toCanonicalPath("/en/index.html", "en"), "/");
});

Deno.test("toCanonicalPath: nested index becomes a directory URL", () => {
  assertEquals(toCanonicalPath("/john-henry/index.html", "en"), "/john-henry/");
});

Deno.test("toCanonicalPath: language prefix is stripped from nested pages", () => {
  assertEquals(
    toCanonicalPath("/en/john-henry/index.html", "en"),
    "/john-henry/",
  );
});

Deno.test("toCanonicalPath: deeply nested index keeps its parents", () => {
  assertEquals(
    toCanonicalPath("/en/bank/about/index.html", "en"),
    "/bank/about/",
  );
});

Deno.test("toCanonicalPath: non-index pages keep their filename", () => {
  assertEquals(toCanonicalPath("/404.html", "en"), "/404.html");
});

Deno.test("toCanonicalPath: language-agnostic files have no prefix to strip", () => {
  assertEquals(toCanonicalPath("/john-henry/index.html"), "/john-henry/");
});

Deno.test("toCanonicalPath: only the leading language segment is stripped", () => {
  assertEquals(toCanonicalPath("/en/en/index.html", "en"), "/en/");
});

Deno.test("canonicalUrl: paths are resolved against the site origin", () => {
  assertEquals(canonicalUrl("/john-henry/"), "https://mannr.org/john-henry/");
});

Deno.test("isIndexable: public pages are indexable", () => {
  assertEquals(isIndexable("/"), true);
  assertEquals(isIndexable("/john-henry/"), true);
});

Deno.test("isIndexable: the auth-gated bank tree is not indexable", () => {
  assertEquals(isIndexable("/bank/"), false);
  assertEquals(isIndexable("/bank/about/"), false);
  assertEquals(isIndexable("/bank/login/"), false);
});

Deno.test("isIndexable: a path merely starting with 'bank' is still indexable", () => {
  assertEquals(isIndexable("/banking-for-men/"), true);
});

Deno.test("isIndexable: the 404 page is not indexable", () => {
  assertEquals(isIndexable("/404.html"), false);
});

Deno.test("buildSitemap: emits sorted absolute urls", () => {
  const xml = buildSitemap(["/john-henry/", "/"]);

  assertStringIncludes(xml, '<?xml version="1.0" encoding="UTF-8"?>');
  assertStringIncludes(
    xml,
    "<url><loc>https://mannr.org/</loc></url>" +
      "<url><loc>https://mannr.org/john-henry/</loc></url>",
  );
});

Deno.test("buildSitemap: deduplicates repeated paths", () => {
  const xml = buildSitemap(["/", "/"]);

  assertEquals(xml.match(/<url>/g)?.length, 1);
});

Deno.test("buildRobotsTxt: opens the site to every crawler", () => {
  const robots = buildRobotsTxt();

  assertStringIncludes(robots, "User-agent: *");
  assertEquals(robots.includes("Disallow: /\n"), false);
});

Deno.test("buildRobotsTxt: disallows exactly the non-indexable prefixes", () => {
  assertStringIncludes(buildRobotsTxt(), "Disallow: /bank/");
});

Deno.test("buildRobotsTxt: advertises the sitemap", () => {
  assertStringIncludes(
    buildRobotsTxt(),
    "Sitemap: https://mannr.org/sitemap.xml",
  );
});

Deno.test("langDirFor: a directory URL maps to its language file directory", () => {
  assertEquals(langDirFor("/john-henry/"), "/john-henry");
  assertEquals(langDirFor("/bank/about/"), "/bank/about");
});

Deno.test("langDirFor: the site root maps to the root language file", () => {
  assertEquals(langDirFor("/"), "/");
});

Deno.test("langDirFor: a file URL maps to the directory holding it", () => {
  assertEquals(langDirFor("/404.html"), "/");
});

const LANG_FILES = {
  "/": {
    en: { heading: "Mannr", description: "Site description" },
    global: { pageName: "Mannr", og_type: "website" },
  },
  "/john-henry": {
    en: { heading: "John Henry", og_type: "article" },
  },
};

Deno.test("resolveLangValue: reads a key from the page's own language file", () => {
  assertEquals(
    resolveLangValue(LANG_FILES, "/john-henry", "en", "heading"),
    "John Henry",
  );
});

Deno.test("resolveLangValue: falls back to an ancestor language file", () => {
  assertEquals(
    resolveLangValue(LANG_FILES, "/john-henry", "en", "description"),
    "Site description",
  );
});

Deno.test("resolveLangValue: a page key overrides the inherited default", () => {
  assertEquals(
    resolveLangValue(LANG_FILES, "/john-henry", "en", "og_type"),
    "article",
  );
  assertEquals(resolveLangValue(LANG_FILES, "/", "en", "og_type"), "website");
});

Deno.test("resolveLangValue: returns undefined for a key nobody defines", () => {
  assertEquals(
    resolveLangValue(LANG_FILES, "/john-henry", "en", "nope"),
    undefined,
  );
});

Deno.test("buildJsonLd: articles are described as Article with their dates", () => {
  const jsonLd = buildJsonLd("/john-henry/", {
    heading: "John Henry",
    description: "Why Mannr holds him up",
    ogType: "article",
    published: "2025-07-15",
    modified: "2025-07-16",
    siteName: "Mannr",
  });

  assertEquals(JSON.parse(jsonLd!), {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "John Henry",
    description: "Why Mannr holds him up",
    url: "https://mannr.org/john-henry/",
    datePublished: "2025-07-15",
    dateModified: "2025-07-16",
    publisher: { "@type": "Organization", name: "Mannr" },
    isPartOf: { "@type": "WebSite", name: "Mannr", url: "https://mannr.org/" },
  });
});

Deno.test("buildJsonLd: an article without dates simply omits them", () => {
  const jsonLd = JSON.parse(
    buildJsonLd("/john-henry/", {
      heading: "John Henry",
      description: "Why Mannr holds him up",
      ogType: "article",
      siteName: "Mannr",
    })!,
  );

  assertEquals("datePublished" in jsonLd, false);
  assertEquals("dateModified" in jsonLd, false);
});

Deno.test("buildJsonLd: the home page is described as the WebSite itself", () => {
  const jsonLd = JSON.parse(
    buildJsonLd("/", {
      heading: "Mannr",
      description: "Site description",
      ogType: "website",
      siteName: "Mannr",
    })!,
  );

  assertEquals(jsonLd["@type"], "WebSite");
  assertEquals(jsonLd.url, "https://mannr.org/");
});

Deno.test("buildJsonLd: ordinary non-article pages get no structured data", () => {
  assertEquals(
    buildJsonLd("/bank/about/", {
      heading: "About",
      description: "About the bank",
      ogType: "website",
      siteName: "Mannr",
    }),
    null,
  );
});

Deno.test("buildJsonLd: a page with no heading gets no structured data", () => {
  assertEquals(
    buildJsonLd("/john-henry/", { ogType: "article", siteName: "Mannr" }),
    null,
  );
});

Deno.test("withHeadTags: inserts tags directly before the title element", () => {
  const html = "<html lang=en><meta charset=utf8><title>A</title><body>b";

  assertEquals(
    withHeadTags(html, '<link rel="canonical" href="https://mannr.org/">'),
    '<html lang=en><meta charset=utf8><link rel="canonical" href="https://mannr.org/">' +
      "<title>A</title><body>b",
  );
});

Deno.test("withHeadTags: returns null when there is no title to anchor to", () => {
  assertEquals(withHeadTags("<html lang=en><body>b", "<link>"), null);
});

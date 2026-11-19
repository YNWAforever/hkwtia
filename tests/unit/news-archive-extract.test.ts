import {describe, expect, it} from "vitest";

import {archiveNotice, canonicalNewsUrl, slugFromCanonicalUrl} from "@/lib/news/archive-document";
import {extractNewsArticle, parseNewsListing, parseSitemapLocs, plainText} from "@/lib/news/extract-archive-article";

const PAGE = "https://hkwtia.org/2021/03/simcardregistration/";

describe("news archive extraction", () => {
  it("dedupes listing URLs and keeps sitemap locs", () => {
    const listing = parseNewsListing(`
      <a href="https://hkwtia.org/2021/03/simcardregistration/">One</a>
      <a href="https://www.hkwtia.org/2021/03/simcardregistration/">Dup</a>
      <a href="https://hkwtia.org/news/page/2/">Next</a>
      <script>ignore https://hkwtia.org/2001/01/2001-establishment-of-wtia/</script>
    `);
    expect(listing.articleUrls).toContain(canonicalNewsUrl(PAGE));
    expect(listing.articleUrls.filter((url) => url.endsWith("simcardregistration"))).toHaveLength(1);
    expect(listing.nextPageUrls).toEqual(["https://hkwtia.org/news/page/2/"]);
    expect(parseSitemapLocs("<urlset><loc>https://hkwtia.org/2001/01/2001-establishment-of-wtia/</loc></urlset>")).toEqual([
      "https://hkwtia.org/2001/01/2001-establishment-of-wtia/",
    ]);
  });

  it("keeps the source title, date, table, and link, and drops scripts", () => {
    const html = `<html><head>
      <meta property="og:url" content="${PAGE}" />
      <meta property="article:published_time" content="2021-03-18T07:30:34+00:00" />
      <meta name="author" content="WTIA" />
      </head><body class="postid-6675">
      <h1 class="entry-title">[即時發布] 意見書</h1>
      <div class="post-content">
        <script>alert("no")</script>
        <p>政府擬制定電話智能卡實名登記制度。</p>
        <h2>一、措施</h2>
        <ol><li>受規管的電話卡類型指引欠清晰</li></ol>
        <table><tr><th>項目</th><th>意見</th></tr><tr><td>諮詢期</td><td>不足兩月</td></tr></table>
        <p>詳見 <a href="https://hkwtia.org/wp-content/uploads/2021/03/paper.pdf">意見書 PDF</a></p>
        <p><img alt="" src="data:image/svg+xml,blank" data-orig-src="https://hkwtia.org/wp-content/uploads/2021/03/hall.jpg" srcset="data:image/svg+xml,blank" /></p>
        <iframe src="https://www.youtube.com/embed/abc"></iframe>
        <div class="fusion-meta-info">Categories: <a href="https://hkwtia.org/category/news/" rel="category tag">News</a></div>
        <div class="single-related-posts"><img alt="Other" src="https://hkwtia.org/wp-content/uploads/2020/01/other.jpg" /></div>
      </div></body></html>`;
    const article = extractNewsArticle(html, PAGE);
    expect(article.extractionStatus).toBe("extracted");
    expect(article.slug).toBe("simcardregistration");
    expect(article.sourceId).toBe("6675");
    expect(article.publishedAt).toBe("2021-03-18T07:30:34+00:00");
    expect(article.plainText).toContain("政府擬制定電話智能卡實名登記制度");
    expect(article.plainText).not.toContain("alert");
    expect(article.plainText).not.toContain("Other");
    expect(article.blocks.some((block) => block.type === "table")).toBe(true);
    expect(article.blocks.some((block) => block.type === "list" && block.ordered)).toBe(true);
    expect(article.blocks.some((block) => block.type === "file" && block.sourceUrl.endsWith("paper.pdf"))).toBe(true);
    const figure = article.blocks.find((block) => block.type === "figure");
    expect(figure && figure.type === "figure" ? figure.sourceUrl : "").toBe("https://hkwtia.org/wp-content/uploads/2021/03/hall.jpg");
    expect(article.blocks.some((block) => block.type === "embed")).toBe(true);
    expect(article.sourceLanguages).toContain("zh-Hant");
    expect(plainText(article.blocks)).not.toMatch(/<script/i);
  });

  it("keeps blank lines as separate paragraphs and the link inside its sentence", () => {
    const html = `<html><head>
      <meta property="og:url" content="https://hkwtia.org/2022/09/new-term-of-executive-committee-2022-2024/" />
      <meta property="article:published_time" content="2022-09-02T14:46:13+00:00" />
      <meta name="author" content="Keith" />
      </head><body class="postid-7551">
      <h1 class="entry-title">New Term of Executive Committee (2022 - 2024)</h1>
      <div class="post-content">Mr. Keith Li was elected as Chairman.

The 19th term was held on 1 September 2022. Mr. Li King Wah (<a href="https://www.linkedin.com/in/example">Keith Li</a>), Co-founder, was elected.

Mr. Li expressed appreciation.</div></body></html>`;
    const article = extractNewsArticle(html, "https://hkwtia.org/2022/09/new-term-of-executive-committee-2022-2024/");
    const paragraphs = article.blocks.filter((block) => block.type === "paragraph");
    expect(paragraphs).toHaveLength(3);
    expect(article.plainText).toContain("Keith Li");
    expect(article.plainText).not.toContain("Mr. Li expressed appreciation. Mr.");
  });

  it("keeps a PDF link that sits in an unclosed paragraph inside the article", () => {
    const html = `<html><head>
      <meta property="og:url" content="${PAGE}" />
      <meta property="article:published_time" content="2021-03-18T07:30:34+00:00" />
      <meta name="author" content="WTIA" />
      </head><body>
      <h1 class="entry-title">Paper</h1>
      <div class="post-content"><p><p><a href="https://hkwtia.org/wp-content/uploads/2020/06/paper.pdf">paper.pdf</a></p></div>
      </body></html>`;
    const article = extractNewsArticle(html, PAGE);
    expect(article.blocks.some((block) => block.type === "file" && block.sourceUrl.endsWith("/paper.pdf"))).toBe(true);
  });

  it("assigns stable ascii slugs and does not label a Chinese-only archive as English", () => {
    const chinese = canonicalNewsUrl("https://hkwtia.org/2020/04/%E6%96%B0%E8%81%9E%E7%A8%BF/");
    expect(slugFromCanonicalUrl(chinese)).toMatch(/^archive-2020-[a-f0-9]{10}$/);
    expect(slugFromCanonicalUrl(canonicalNewsUrl("https://www.hkwtia.org/2001/01/2001-establishment-of-wtia/"))).toBe("2001-establishment-of-wtia");
    expect(archiveNotice("en", ["zh-Hant"])).toBe("fallback-zh");
    expect(archiveNotice("zh-HK", ["zh-Hant"])).toBe("original");
    expect(archiveNotice("zh-HK", ["en"])).toBe("fallback-en");
  });
});

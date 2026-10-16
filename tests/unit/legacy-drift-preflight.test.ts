import {execFile} from "node:child_process";
import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {describe, expect, it} from "vitest";

type Result = {error: Error | null; stdout: string; stderr: string};

async function runAgainstServer(
  respond: (request: IncomingMessage, response: ServerResponse, host: string) => void,
): Promise<Result> {
  const server = createServer((request, response) => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    respond(request, response, `http://127.0.0.1:${address.port}`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    return await new Promise<Result>((resolve) => {
      execFile(process.execPath, ["scripts/check-legacy-drift.mjs", "--wordpress", `http://127.0.0.1:${address.port}`],
        {cwd: process.cwd()}, (error, stdout, stderr) => resolve({error, stdout, stderr}));
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("legacy WordPress sitemap drift preflight", () => {
  it("fails closed when the supplied host serves a flat replacement sitemap", async () => {
    const result = await runAgainstServer((_request, response) => {
      response.writeHead(200, {"content-type": "application/xml"});
      response.end('<urlset><url><loc>https://hkwtia.org/en</loc></url></urlset>');
    });
    expect(result.error).not.toBeNull();
    expect(result.stderr).toContain("no WordPress sub-sitemaps");
  });

  it("fails closed when sub-sitemaps contain no live URLs", async () => {
    const result = await runAgainstServer((request, response, host) => {
      response.writeHead(200, {"content-type": "application/xml"});
      response.end(request.url === "/sitemap.xml"
        ? `<sitemapindex><sitemap><loc>${host}/pages.xml</loc></sitemap></sitemapindex>`
        : "<urlset></urlset>");
    });
    expect(result.error).not.toBeNull();
    expect(result.stderr).toContain("no WordPress URLs parsed");
  });

  it("fails closed when a WordPress sub-sitemap cannot be read", async () => {
    const result = await runAgainstServer((request, response, host) => {
      if (request.url === "/sitemap.xml") {
        response.writeHead(200, {"content-type": "application/xml"});
        response.end(`<sitemapindex><sitemap><loc>${host}/pages.xml</loc></sitemap></sitemapindex>`);
      } else {
        response.writeHead(503);
        response.end("temporarily unavailable");
      }
    });
    expect(result.error).not.toBeNull();
    expect(result.stderr).toContain("failed to read WordPress sub-sitemap");
  });
});

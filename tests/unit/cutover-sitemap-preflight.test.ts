import {execFile} from "node:child_process";
import {createServer, type Server} from "node:http";
import {describe, expect, it} from "vitest";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function verify(host: string, canonical: string, expectRedirect = false) {
  return new Promise<{error: Error | null; stdout: string; stderr: string}>((resolve) => {
    const args = ["scripts/verify-cutover-sitemap.mjs", "--host", host, "--canonical", canonical];
    if (expectRedirect) args.push("--expect-redirect");
    execFile(process.execPath, args, {cwd: process.cwd()},
      (error, stdout, stderr) => resolve({error, stdout, stderr}));
  });
}

function xml(origin: string): string {
  return `<urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/zh</loc></url></urlset>`;
}

describe("live cutover sitemap preflight", () => {
  it("accepts a sitemap with both locales on the canonical host", async () => {
    const server = createServer((_request, response) => response.end(xml(host)));
    const host = await listen(server);
    try {
      const result = await verify(host, host);
      expect(result.error).toBeNull();
      expect(result.stdout).toContain("OK: 2 sitemap URLs");
    } finally { await close(server); }
  });

  it("rejects a nonempty sitemap whose entries still name the preview host", async () => {
    const server = createServer((_request, response) => response.end(xml("https://hkwtia.vercel.app")));
    const host = await listen(server);
    try {
      const result = await verify(host, host);
      expect(result.error).not.toBeNull();
      expect(result.stderr).toContain("wrong origin");
    } finally { await close(server); }
  });

  it("follows the expected 308 from the preview alias and checks the destination", async () => {
    const canonicalServer = createServer((_request, response) => response.end(xml(canonical)));
    const canonical = await listen(canonicalServer);
    const aliasServer = createServer((_request, response) => {
      response.writeHead(308, {location: `${canonical}/sitemap.xml`});
      response.end();
    });
    const alias = await listen(aliasServer);
    try {
      const result = await verify(alias, canonical, true);
      expect(result.error).toBeNull();
      expect(result.stdout).toContain("OK: 2 sitemap URLs");
    } finally {
      await close(aliasServer);
      await close(canonicalServer);
    }
  });
});

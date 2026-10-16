import {spawn, execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, isAbsolute, join, relative, resolve} from "node:path";
import {describe, expect, it} from "vitest";
async function boot(main: string): Promise<void> {
  const workspace = resolve(process.cwd()),
    directory = mkdtempSync(join(tmpdir(), "hkwtia-worker-entry-")),
    config = join(directory, "wrangler.toml");
  writeFileSync(
    config,
    `name = "hkwtia-entry-acceptance"\nmain = ${JSON.stringify(resolve(workspace, main).replaceAll("\\", "/"))}\ncompatibility_date = "2026-07-26"\n`,
  );
  const child = spawn(
    process.execPath,
    [
      resolve(workspace, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--config",
      config,
      "--port",
      "0",
      "--inspector-port",
      "0",
      "--ip",
      "127.0.0.1",
      "--local",
    ],
    {
      cwd: workspace,
      env: {...process.env, WRANGLER_SEND_METRICS: "false"},
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  try {
    for (let attempt = 0; attempt < 160; attempt++) {
      if (output.includes("Incorrect type for map entry"))
        throw Error("WORKER_ENTRY_EXPORT_INVALID");
      if (output.includes("Ready on")) return;
      if (child.exitCode !== null || child.signalCode !== null)
        throw Error("WORKER_ENTRY_BOOT_FAILED");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error("WORKER_ENTRY_DID_NOT_BOOT");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32" && child.pid) {
        try {
          execFileSync(
            "taskkill.exe",
            ["/PID", String(child.pid), "/T", "/F"],
            {stdio: "ignore", windowsHide: true},
          );
        } catch {
          /* It may already have exited. */
        }
      } else child.kill();
    }
    for (
      let attempt = 0;
      attempt < 40 && child.exitCode === null && child.signalCode === null;
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
    const target = resolve(directory),
      allowed = resolve(tmpdir()),
      scope = relative(allowed, target);
    if (
      !scope ||
      scope.startsWith("..") ||
      isAbsolute(scope) ||
      !basename(target).startsWith("hkwtia-worker-entry-")
    )
      throw Error("INVALID_ENTRY_FIXTURE_CLEANUP");
    rmSync(target, {recursive: true, force: true});
  }
}
describe("actual workerd entry boot", () => {
  it("boots the declared entry without invoking a scheduler, provider or database", async () => {
    const main = /^main\s*=\s*"([^"]+)"/m.exec(
      readFileSync("wrangler.toml", "utf8"),
    )?.[1];
    expect(main).toBeTruthy();
    await boot(main!);
  }, 30000);
  it("detects the named constant exports that broke the prior entry", async () => {
    await expect(boot("src/index.ts")).rejects.toThrow(
      "WORKER_ENTRY_EXPORT_INVALID",
    );
  }, 30000);
});

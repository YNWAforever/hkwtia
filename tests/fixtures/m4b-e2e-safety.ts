type Environment = Readonly<Record<string, string | undefined>>;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function validateM4BE2ETarget(environment: Environment): URL {
  const configured = environment.PLAYWRIGHT_BASE_URL?.trim();
  if (!configured) throw new Error("M4B_E2E_TARGET_REQUIRED");

  const target = new URL(configured);
  if (
    target.username
    || target.password
    || target.search
    || target.hash
    || !["http:", "https:"].includes(target.protocol)
  ) {
    throw new Error("M4B_E2E_TARGET_INVALID");
  }

  const allowedOrigin = environment.M4B_E2E_ALLOWED_ORIGIN?.trim();
  if (!allowedOrigin) throw new Error("M4B_E2E_ALLOWED_ORIGIN_REQUIRED");
  if (allowedOrigin !== target.origin) {
    throw new Error("M4B_E2E_TARGET_ORIGIN_MISMATCH");
  }

  if (LOOPBACK_HOSTS.has(target.hostname.toLowerCase())) return target;
  if (
    target.protocol !== "https:"
    || !target.hostname.toLowerCase().endsWith(".vercel.app")
  ) {
    throw new Error("M4B_E2E_PREVIEW_TARGET_REQUIRED");
  }
  const hostname = target.hostname.toLowerCase();
  const deploymentLabel = hostname.slice(0, -".vercel.app".length);
  if (
    hostname === "hkwtia.vercel.app"
    || /(^|-)(?:main|prod|production)(?:-|$)/.test(deploymentLabel)
  ) {
    throw new Error("M4B_E2E_PRODUCTION_FORBIDDEN");
  }
  if (environment.VERCEL_ENV?.trim().toLowerCase() === "production") {
    throw new Error("M4B_E2E_PRODUCTION_FORBIDDEN");
  }
  const previewEvidence =
    environment.VERCEL_ENV?.trim().toLowerCase() === "preview"
    || environment.M4B_E2E_PREVIEW_ONLY?.trim().toLowerCase() === "true";
  if (!previewEvidence) throw new Error("M4B_E2E_PREVIEW_EVIDENCE_REQUIRED");
  return target;
}

type AiOpsExternalEvidence = Readonly<{
  id: "source" | "commits" | "deployment" | "acceptance";
  href: string;
}>;

function validatedEvidence(
  evidence: readonly AiOpsExternalEvidence[],
): readonly AiOpsExternalEvidence[] {
  for (const item of evidence) {
    const url = new URL(item.href);
    if (
      url.protocol !== "https:"
      || url.username !== ""
      || url.password !== ""
      || url.hostname === ""
    ) {
      throw new Error("AI_OPS_EVIDENCE_INVALID");
    }
  }

  return Object.freeze(evidence.map((item) => Object.freeze({...item})));
}

export const AI_OPS_EXTERNAL_EVIDENCE = validatedEvidence([
  {id: "source", href: "https://github.com/YNWAforever/hkwtia"},
  {id: "commits", href: "https://github.com/YNWAforever/hkwtia/commits/main"},
  {id: "deployment", href: "https://hkwtia.vercel.app"},
  {id: "acceptance", href: "https://github.com/YNWAforever/hkwtia/blob/main/docs/acceptance/m4.md"},
]);

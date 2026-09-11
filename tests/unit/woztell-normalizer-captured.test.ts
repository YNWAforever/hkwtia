import {existsSync, readFileSync, readdirSync} from "node:fs";
import {join, resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {createWoztellAdapter} from "@/lib/channels/woztell";

/**
 * Programme C-9, Task 13 Step 1. The replay that has to happen before
 * `RUN_LIVE_WOZTELL=1`.
 *
 * C1's O-1 is the reason this file exists: the `MESSAGE_STATUS` and `OUTBOUND`
 * discriminators in `normalizedInbound` are a **best guess**. There are no
 * Woztell credentials, no captured provider payload and no provider
 * documentation anywhere in this tree, and the only inbound envelope that has
 * ever existed here is `{from, type:"TEXT", messageId, timestamp, data:{text}}`.
 * So "the ticks do not arrive" after go-live is a normaliser bug first and a
 * provider problem second, and nothing else in the tree would tell you which:
 * the webhook route answers 202 for every outcome and that layer logs nothing
 * on purpose.
 *
 * The file therefore reads whatever the owner drops into
 * `tests/fixtures/captured/` and replays it through the real normaliser. It is
 * green today by **skipping**, not by asserting something weaker: with no
 * captured payload there is nothing to prove, and a placeholder fixture would be
 * the guess again, wearing evidence's clothes. The moment one real payload lands
 * in that directory this becomes a hard gate, with no code change.
 */
const capturedDirectory = resolve("tests/fixtures/captured");

/**
 * The kinds a payload the provider really sent must land on. `unsupported` is
 * the normaliser saying "I did not recognise this", which is exactly the failure
 * this replay exists to catch; `rejected` is a hostile-field refusal and is just
 * as wrong for a genuine captured payload, because it would mean a real message
 * id, error code or body exceeded a bound we invented.
 */
const HANDLED_KINDS = ["message", "delivery_status", "outbound_echo"] as const;

/**
 * A file name says which arm it is evidence for, and it is REQUIRED to
 * (`recognisedKind` throws otherwise). Without this a captured delivery status
 * that normalised to `outbound_echo` would pass — both are "not unsupported" —
 * and the discriminator being wrong in exactly that way is the O-1 failure mode,
 * not a hypothetical one. An earlier version only applied the hint when the name
 * happened to match, so a file named outside these prefixes was asserted merely
 * to be "not unsupported": the one payload the owner is most likely to capture
 * first, a delivery tick, could have landed on `outbound_echo` and the row-3
 * gate would have gone green on it. The README's table prescribes the names;
 * this is what makes them binding.
 */
const NAME_HINTS: ReadonlyArray<readonly [RegExp, (typeof HANDLED_KINDS)[number]]> = [
  [/^woztell-(delivery-status|message-status)/u, "delivery_status"],
  [/^woztell-(outbound-echo|outbound)/u, "outbound_echo"],
  [/^woztell-(inbound|message|text)/u, "message"],
];

function recognisedKind(name: string): (typeof HANDLED_KINDS)[number] {
  const hint = NAME_HINTS.find(([pattern]) => pattern.test(name))?.[1];
  if (hint) return hint;
  throw new Error(
    `Captured payload ${name} does not name the arm it is evidence for. `
    + "Rename it to woztell-delivery-status-*.json, woztell-outbound-echo-*.json "
    + "or woztell-inbound-*.json (tests/fixtures/captured/README.md).",
  );
}

function capturedFileNames(): string[] {
  if (!existsSync(capturedDirectory)) return [];
  return readdirSync(capturedDirectory)
    .filter((name) => /^woztell-.*\.json$/u.test(name))
    .sort();
}

// No credentials: `normalizeInbound` is pure and reads none of the environment.
// Constructing the adapter with an empty environment is the point — this replay
// must stay runnable in CI, where nothing may reach the provider.
const normalize = createWoztellAdapter({}).normalizeInbound;

const captured = capturedFileNames();

describe("captured Woztell payload replay (C-9, O-1)", () => {
  if (captured.length === 0) {
    it.skip("replays captured provider payloads (none captured yet)", () => {
      // Intentionally empty: the skip IS the report. Owner action — capture one
      // real delivery-status payload and one real outbound echo, commit them as
      // tests/fixtures/captured/woztell-delivery-status-*.json and
      // woztell-outbound-echo-*.json, and run this file. See
      // docs/integration/phase-c-whatsapp-go-live.md, row 3 of its ordered table.
    });

    it("names the directory the owner must fill before the flag is flipped", () => {
      expect(capturedDirectory).toMatch(/tests[\\/]fixtures[\\/]captured$/u);
      expect(capturedFileNames()).toEqual([]);
    });
  } else {
    it.each(captured)("normalises %s to a handled variant", (name) => {
      const raw = readFileSync(join(capturedDirectory, name), "utf8");
      const normalized = normalize(JSON.parse(raw) as unknown);
      expect(HANDLED_KINDS, name).toContain(normalized.kind);
      expect(normalized.kind, name).toBe(recognisedKind(name));
    });
  }

  // AGENTS.md: a guard that has never been watched to fail is a claim, not
  // evidence. These two samples are the hostile and safe halves of what the
  // replay above asserts, so the assertion is proved even on the day the
  // directory is still empty.
  it("detects the shapes it is meant to catch", () => {
    // The shape a WRONG discriminator produces: a delivery tick whose envelope
    // does not match the guess falls through every arm to `unsupported`, which
    // the webhook answers 202 to and forgets. That is precisely "the ticks do
    // not arrive".
    expect(normalize({
      type: "message_status",
      id: "wamid.guessed.wrong",
      status: "delivered",
    }).kind).toBe("unsupported");
    expect(HANDLED_KINDS).not.toContain("unsupported");

    // …and the shape a correct one produces, through the same call the replay
    // makes, so a normaliser that answered `unsupported` for everything could
    // not make this file green.
    expect(normalize({
      type: "MESSAGE_STATUS",
      messageId: "wamid.outbound.1",
      timestamp: "2026-09-10T01:05:00.000Z",
      data: {status: "DELIVERED"},
    }).kind).toBe("delivery_status");
  });

  // The name gate, watched from both sides on the day the directory is still
  // empty — otherwise the refusal added above is a claim rather than evidence,
  // and the first captured file would be the first time anyone ran it.
  it("requires a captured file name to say which arm it is evidence for", () => {
    expect(recognisedKind("woztell-delivery-status-2026-09-12.json")).toBe("delivery_status");
    expect(recognisedKind("woztell-outbound-echo-2026-09-12.json")).toBe("outbound_echo");
    expect(recognisedKind("woztell-inbound-2026-09-12.json")).toBe("message");
    expect(() => recognisedKind("woztell-capture-2026-09-12.json")).toThrow(/does not name the arm/u);
  });
});

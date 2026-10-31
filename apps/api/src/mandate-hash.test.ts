import { describe, expect, it } from "vitest";
import { ConfirmedMandateSchema } from "@ostensia/domain";
import type { ConfirmedMandate } from "@ostensia/domain";
import { hashMandate, sha256Hex } from "./mandate-hash.ts";

// Expected hashes below were produced with sha256sum, not with this code.

function makeMandate(overrides: Partial<ConfirmedMandate> = {}): ConfirmedMandate {
  return ConfirmedMandateSchema.parse({
    id: "mandate-1",
    version: 1,
    terms: {
      currency: "USD",
      maxTotalMinor: 20000,
      expiresAt: "2026-11-02T00:00:00.000Z",
      items: [
        { productId: "jacket", allowedVariantIds: ["jacket-m", "jacket-l"], maxQuantity: 2, maxUnitPriceMinor: 8000 },
        { productId: "gloves", maxQuantity: 3, maxUnitPriceMinor: 2500 },
      ],
    },
    intentSummary: "Rain jacket and gloves, up to $200",
    confirmedAt: "2026-11-01T10:00:00.000Z",
    status: "confirmed",
    hash: "a".repeat(64),
    ...overrides,
  });
}

describe("sha256Hex", () => {
  it("matches the published SHA-256 test vectors", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hashes text as UTF-8", () => {
    expect(sha256Hex("日本語é😀")).toBe("7458f27c53f3addb04ac70cd28868433771f23dc24c8e0449c3912518f79a46b");
  });

  it("returns 64 lowercase hex characters", () => {
    expect(sha256Hex("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashMandate", () => {
  it("matches the pinned hash of the golden canonical string", () => {
    expect(hashMandate(makeMandate())).toBe("ed2596174d2f23424c52d5ebcb912747376e682b5f5ee41d1fa1e14690494412");
  });

  it("gives a hash that the mandate schema accepts", () => {
    const hash = hashMandate(makeMandate());
    expect(ConfirmedMandateSchema.safeParse(makeMandate({ hash })).success).toBe(true);
  });

  it("is the same for the same mandate, and unaffected by revoking it", () => {
    const original = hashMandate(makeMandate());
    expect(hashMandate(makeMandate())).toBe(original);
    expect(hashMandate(makeMandate({ status: "revoked" }))).toBe(original);
    expect(hashMandate(makeMandate({ intentSummary: "A different summary" }))).toBe(original);
  });

  it("changes when an enforced term changes", () => {
    const original = hashMandate(makeMandate());
    const changed = makeMandate();
    const other = ConfirmedMandateSchema.parse({ ...changed, terms: { ...changed.terms, maxTotalMinor: 20001 } });
    expect(hashMandate(other)).not.toBe(original);
  });
});

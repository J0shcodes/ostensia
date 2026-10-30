import { describe, expect, it } from "vitest";
import { DOMAIN_NAME } from "./index.ts";

describe("domain package", () => {
  it("exports its package name", () => {
    expect(DOMAIN_NAME).toBe("@ostensia/domain");
  });
});

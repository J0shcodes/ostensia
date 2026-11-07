import { describe, expect, it } from "vitest";
import { ApiOriginError, DEFAULT_API_ORIGIN, parseApiOrigin } from "./api-origin.ts";

describe("parseApiOrigin", () => {
  it("defaults to the API's own address when unset or empty", () => {
    expect(parseApiOrigin(undefined)).toBe("http://127.0.0.1:4000");
    expect(parseApiOrigin("")).toBe(DEFAULT_API_ORIGIN);
  });

  it.each(["http://127.0.0.1:4000", "http://127.0.0.1:1", "http://127.0.0.1:65535", "http://127.0.0.1:8080"])(
    "accepts %s",
    (value) => {
      expect(parseApiOrigin(value)).toBe(value);
    },
  );

  it.each([
    ["a hostname", "http://localhost:4000"],
    ["another host", "http://example.com:4000"],
    ["an all-interfaces address", "http://0.0.0.0:4000"],
    ["IPv6 loopback", "http://[::1]:4000"],
    ["a private address", "http://192.168.1.5:4000"],
    ["https", "https://127.0.0.1:4000"],
    ["an upper-case scheme", "HTTP://127.0.0.1:4000"],
    ["no port", "http://127.0.0.1"],
    ["port 0", "http://127.0.0.1:0"],
    ["a port above 65535", "http://127.0.0.1:65536"],
    ["a port with a leading zero", "http://127.0.0.1:04000"],
    ["a non-numeric port", "http://127.0.0.1:abc"],
    ["credentials", "http://user:secret@127.0.0.1:4000"],
    ["a trailing slash", "http://127.0.0.1:4000/"],
    ["a path", "http://127.0.0.1:4000/api"],
    ["a query string", "http://127.0.0.1:4000?x=1"],
    ["a fragment", "http://127.0.0.1:4000#x"],
    ["leading whitespace", " http://127.0.0.1:4000"],
    ["trailing whitespace", "http://127.0.0.1:4000 "],
    ["a trailing newline", "http://127.0.0.1:4000\n"],
    ["a host that merely starts with 127.0.0.1", "http://127.0.0.1.evil.example:4000"],
    ["a different loopback address", "http://127.0.0.2:4000"],
  ])("rejects %s", (_name, value) => {
    expect(() => parseApiOrigin(value)).toThrow(ApiOriginError);
  });

  it("never puts the rejected value in the message", () => {
    for (const value of ["s3cr3t-token-value", "http://user:hunter2@127.0.0.1:4000", "http://evil.example:4000"]) {
      try {
        parseApiOrigin(value);
        throw new Error("expected a throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiOriginError);
        expect((error as Error).message).not.toContain(value);
        expect((error as Error).message).not.toContain("hunter2");
        expect((error as Error).message).not.toContain("evil.example");
        expect((error as Error).message).toContain("API_ORIGIN");
      }
    }
  });
});

import { describe, expect, test } from "bun:test";

import { dedupKey } from "./dedupKey";

describe("dedupKey", () => {
  test("profile dedups on url", () => {
    expect(
      dedupKey({ kind: "profile", site: "Twitter", url: "https://twitter.com/foo", username: "foo" }),
    ).toBe("profile:https://twitter.com/foo");
  });

  test("link dedups on url", () => {
    expect(dedupKey({ kind: "link", url: "https://example.com/x" })).toBe(
      "link:https://example.com/x",
    );
  });

  test("email is case-insensitive", () => {
    expect(dedupKey({ kind: "email", email: "Foo@Example.COM" })).toBe("email:foo@example.com");
    expect(dedupKey({ kind: "email", email: "foo@example.com" })).toBe("email:foo@example.com");
  });

  test("hint composes source + field + value", () => {
    expect(
      dedupKey({ kind: "hint", source: "facebook-recover", field: "email", value: "m***@gmail.com" }),
    ).toBe("hint:facebook-recover:email:m***@gmail.com");
  });
});

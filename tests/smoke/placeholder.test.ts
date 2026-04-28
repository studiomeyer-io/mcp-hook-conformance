import { describe, expect, it } from "vitest";

const enabled = process.env.RUN_SMOKE_TESTS === "1";
const maybe = enabled ? describe : describe.skip;

maybe("smoke placeholder", () => {
  it("placeholder until factory tenants are wired", () => {
    expect(true).toBe(true);
  });
});

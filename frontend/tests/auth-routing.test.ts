import { describe, expect, it } from "vitest";
import {
  PROTECTED_PREFIXES,
  isSafeInternalRedirect,
  resolvePostLoginRedirect,
} from "@/lib/auth-routing";

describe("protected route coverage", () => {
  it("includes message routes in protected prefixes", () => {
    expect(PROTECTED_PREFIXES).toContain("/masseges");
    expect(PROTECTED_PREFIXES).toContain("/message");
  });
});

describe("redirect safety", () => {
  it("accepts safe internal paths", () => {
    expect(isSafeInternalRedirect("/dashboard")).toBe(true);
    expect(isSafeInternalRedirect("/users?page=2")).toBe(true);
  });

  it("rejects unsafe redirect targets", () => {
    expect(isSafeInternalRedirect(null)).toBe(false);
    expect(isSafeInternalRedirect("")).toBe(false);
    expect(isSafeInternalRedirect("http://evil.com")).toBe(false);
    expect(isSafeInternalRedirect("//evil.com")).toBe(false);
  });

  it("falls back to dashboard for unsafe targets", () => {
    expect(resolvePostLoginRedirect("http://evil.com")).toBe("/dashboard");
    expect(resolvePostLoginRedirect("//evil.com")).toBe("/dashboard");
    expect(resolvePostLoginRedirect(null)).toBe("/dashboard");
  });

  it("returns safe redirect target as-is", () => {
    expect(resolvePostLoginRedirect("/permissions")).toBe("/permissions");
    expect(resolvePostLoginRedirect("/message/t/123")).toBe("/message/t/123");
  });
});

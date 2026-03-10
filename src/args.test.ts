import { describe, it, expect, vi } from "vitest";
import { parseArgs, parseDuration } from "./args.js";

describe("parseArgs", () => {
  it("parses all required flags", () => {
    const result = parseArgs(["--org", "facebook", "--repo", "react", "--last", "30d"]);
    expect(result).toEqual({
      org: "facebook",
      repo: "react",
      last: "30d",
      noCache: false,
    });
  });

  it("parses --no-cache flag", () => {
    const result = parseArgs(["--org", "x", "--repo", "y", "--last", "2w", "--no-cache"]);
    expect(result.noCache).toBe(true);
  });

  it("exits when --org is missing", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});

    parseArgs(["--repo", "react", "--last", "30d"]);

    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
    mockError.mockRestore();
    mockLog.mockRestore();
  });

  it("exits on invalid --last format", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});

    parseArgs(["--org", "x", "--repo", "y", "--last", "abc"]);

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    mockError.mockRestore();
  });
});

describe("parseDuration", () => {
  it("parses days", () => {
    const now = new Date();
    const result = parseDuration("10d");
    const expected = new Date(now);
    expected.setDate(expected.getDate() - 10);
    // Allow 1 second tolerance
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it("parses weeks", () => {
    const now = new Date();
    const result = parseDuration("2w");
    const expected = new Date(now);
    expected.setDate(expected.getDate() - 14);
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it("parses months", () => {
    const now = new Date();
    const result = parseDuration("3m");
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() - 3);
    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it("throws on invalid duration", () => {
    expect(() => parseDuration("abc")).toThrow("Invalid duration: abc");
  });
});

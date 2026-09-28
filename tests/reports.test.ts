import { describe, expect, it } from "vitest";
import { DEFAULT_REPORTS, periodFor, reportSettingsSchema, reportTitle } from "../lib/reports";

describe("report periods (Damascus time)", () => {
  it("a weekly report covers the 7 days ending yesterday", () => {
    const p = periodFor("weekly", new Date("2026-10-04T06:00:00Z")); // Sunday 09:00 in Damascus
    expect([p.from, p.to]).toEqual(["2026-09-27", "2026-10-04"]);
    expect(p.label).toBe("27 Sep 2026 – 3 Oct 2026");
  });
  it("a monthly report covers last month, across a year end too", () => {
    expect(periodFor("monthly", new Date("2026-10-01T06:00:00Z"))).toMatchObject({ from: "2026-09-01", to: "2026-10-01", label: "Sep 2026" });
    expect(periodFor("monthly", new Date("2027-01-01T06:00:00Z"))).toMatchObject({ from: "2026-12-01", to: "2027-01-01" });
  });
  it("uses the local date, not UTC, just after midnight", () => {
    expect(periodFor("weekly", new Date("2026-10-03T22:30:00Z")).to).toBe("2026-10-04"); // 01:30 on the 4th in Damascus
  });
});
describe("report settings", () => {
  it("names the reports as asked", () => {
    expect(reportTitle("it", "weekly")).toBe("IT Infrastructure Report — Weekly");
    expect(reportTitle("dev", "weekly")).toBe("Dev Weekly Report");
    expect(reportTitle("dev", "monthly")).toBe("Dev Monthly Report");
  });
  it("starts off, and refuses bad recipients", () => {
    expect(reportSettingsSchema.parse(DEFAULT_REPORTS).it.weekly).toBe(false);
    expect(reportSettingsSchema.safeParse({ ...DEFAULT_REPORTS, it: { ...DEFAULT_REPORTS.it, recipients: ["not-an-email"] } }).success).toBe(false);
  });
});

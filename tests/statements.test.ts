import { describe, expect, it } from "vitest";
import { nextMonth, periodEndExclusive, periodLastDay, periodStart, prevMonth, statementMonthDue } from "../lib/statements";
import { buildXlsx } from "../lib/xlsx";

describe("statement schedule (Europe/Istanbul, UTC+3)", () => {
  it("waits until 06:00 on the 1st", () => {
    expect(statementMonthDue(new Date("2026-10-01T02:59:00Z"))).toBeNull();      // 05:59 Istanbul
    expect(statementMonthDue(new Date("2026-10-01T03:00:00Z"))).toBe("2026-09"); // 06:00 Istanbul
  });
  it("uses Istanbul's date, not UTC's", () => {
    expect(statementMonthDue(new Date("2026-09-30T22:30:00Z"))).toBeNull();      // already 01:30 on 1 Oct in Istanbul
    expect(statementMonthDue(new Date("2026-09-30T20:00:00Z"))).toBe("2026-08"); // still 30 Sep
  });
  it("catches up on a later day if the 1st was missed", () => { expect(statementMonthDue(new Date("2026-10-04T10:00:00Z"))).toBe("2026-09"); });
  it("crosses the year", () => { expect(statementMonthDue(new Date("2027-01-01T09:00:00Z"))).toBe("2026-12"); expect(prevMonth("2027-01")).toBe("2026-12"); expect(nextMonth("2026-12")).toBe("2027-01"); });
});

describe("statement cycle day", () => {
  it("day 1 keeps calendar months", () => {
    expect([periodStart("2026-09", 1), periodLastDay("2026-09", 1)]).toEqual(["2026-09-01", "2026-09-30"]);
  });
  it("day 16 runs 16th to 15th, named by the closing month", () => {
    expect([periodStart("2026-09", 16), periodLastDay("2026-09", 16)]).toEqual(["2026-08-16", "2026-09-15"]);
    expect([periodStart("2027-01", 16), periodLastDay("2027-01", 16)]).toEqual(["2026-12-16", "2027-01-15"]);
    expect(periodEndExclusive("2026-09", 16)).toBe(periodStart("2026-10", 16));   // no gap, no overlap
  });
  it("is prepared the morning after the cycle closes", () => {
    expect(statementMonthDue(new Date("2026-09-16T02:59:00Z"), 16)).toBeNull();      // 05:59 on the 16th: wait until 06:00
    expect(statementMonthDue(new Date("2026-09-16T03:00:00Z"), 16)).toBe("2026-09"); // 06:00 on the 16th
    expect(statementMonthDue(new Date("2026-09-10T10:00:00Z"), 16)).toBe("2026-08"); // mid-cycle: last closed one
    expect(statementMonthDue(new Date("2026-09-30T10:00:00Z"), 16)).toBe("2026-09");
  });
});

describe("xlsx writer", () => {
  it("writes a zip with the workbook parts", () => {
    const b = buildXlsx([{ name: "كشف", rtl: true, rows: [["a", "b"], ["x & <y>", 12.5]] }]);
    expect(b.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(b.includes(Buffer.from("xl/worksheets/sheet1.xml"))).toBe(true);
  });
});

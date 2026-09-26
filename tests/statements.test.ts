import { describe, expect, it } from "vitest";
import { nextMonth, prevMonth, statementMonthDue } from "../lib/statements";
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

describe("xlsx writer", () => {
  it("writes a zip with the workbook parts", () => {
    const b = buildXlsx([{ name: "كشف", rtl: true, rows: [["a", "b"], ["x & <y>", 12.5]] }]);
    expect(b.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(b.includes(Buffer.from("xl/worksheets/sheet1.xml"))).toBe(true);
  });
});

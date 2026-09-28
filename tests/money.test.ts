import { describe, expect, it } from "vitest";
import { isRate, toAedCents } from "../lib/money";

describe("any currency to AED at the entered rate", () => {
  it("passes AED through and converts others half-up to the fils", () => {
    expect(toAedCents(9000n, "AED", "")).toBe(9000n);
    expect(toAedCents(9000n, "CHF", "4.62")).toBe(41580n);          // CHF 90.00 x 4.62 = AED 415.80
    expect(toAedCents(29196n, "USD", "3.6725")).toBe(107222n);      // USD 291.96 x 3.6725 = 1072.2231 -> 1072.22
    expect(toAedCents(100n, "TRY", "0.0875")).toBe(9n);             // 8.75 fils -> 9
  });
  it("accepts only a positive plain rate", () => {
    expect(["3.6725", "4.62", "0.0875", "1"].every(isRate)).toBe(true);
    expect(["0", "", "-1", "3,67", "abc", "1.1234567"].some(isRate)).toBe(false);
  });
});

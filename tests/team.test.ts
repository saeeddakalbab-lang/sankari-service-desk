import { describe, expect, it } from "vitest";
import { needsManager, teamActionSchema } from "../lib/team";

describe("who is asked for a manager", () => {
  it("asks everyone without a manager except the CEO, the Owner and the Board", () => {
    expect(needsManager({ roles: ["employee"], manager_user_id: null })).toBe(true);
    expect(needsManager({ roles: ["employee", "manager"], manager_user_id: null })).toBe(true);
    expect(needsManager({ roles: ["employee"], manager_user_id: "x" })).toBe(false);
    for (const r of ["ceo", "owner", "board"]) expect(needsManager({ roles: ["employee", r], manager_user_id: null })).toBe(false);
  });
  it("needs a real email and a name to name a manager", () => {
    expect(teamActionSchema.safeParse({ action: "set_manager", email: "omar@sankari-holding.com", name: "Omar" }).success).toBe(true);
    expect(teamActionSchema.safeParse({ action: "set_manager", email: "omar", name: "Omar" }).success).toBe(false);
    expect(teamActionSchema.safeParse({ action: "set_manager", email: "omar@sankari-holding.com", name: "" }).success).toBe(false);
    expect(teamActionSchema.parse({ action: "add", email: " Rama@Sankari-Holding.com " })).toEqual({ action: "add", email: "rama@sankari-holding.com" });
  });
});

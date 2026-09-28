import { describe, expect, it } from "vitest";
import { invitationEmail } from "../lib/invite";
import { PERSON_TYPES, typeOf } from "../lib/people";

const base = { to: "new.person@sankari-holding.com", name: "New <Person>", invitedBy: "Saeed Dakalbab", loginUrl: "https://it-portal.sankari-holding.com/login" };
describe("invitation email", () => {
  it("is bilingual, links to sign-in only, and escapes names", () => {
    const m = invitationEmail({ ...base, type: "employee" });
    expect(m.html).toContain("Welcome to the IT portal");
    expect(m.html).toContain("مرحبًا بك في بوابة تقنية المعلومات");
    expect(m.html).toContain('href="https://it-portal.sankari-holding.com/login"');
    expect([...m.html.matchAll(/href="([^"]+)"/g)].every(x => x[1] === base.loginUrl)).toBe(true);
    expect(m.html).toContain("New &lt;Person&gt;".split(" ")[0]);
    expect(m.html).not.toContain("<Person>");
    expect(m.html).toContain("cid:sankari-logo");
  });
  it("names the role and lists what that role can do, for every person type", () => {
    for (const type of PERSON_TYPES) {
      const m = invitationEmail({ ...base, type });
      expect(m.text).toContain("Sign in: https://it-portal.sankari-holding.com/login");
      expect(m.html.match(/&#10003;/g)!.length).toBeGreaterThanOrEqual(6);
    }
    expect(invitationEmail({ ...base, type: "manager", managerName: "Omar" }).html).toContain("reporting to Omar");
    expect(invitationEmail({ ...base, type: "contracts" }).html).toContain("send quotations and contracts to sign");
  });
  it("picks the most senior role for a resend", () => {
    expect(typeOf(["employee", "manager", "admin"])).toBe("admin");
    expect(typeOf(["employee"])).toBe("employee");
    expect(typeOf(["employee", "contracts"])).toBe("contracts");
  });
});

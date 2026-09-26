import { describe, expect, it } from "vitest";
import { buildRequestMail, buildTicketAlert } from "../lib/mail";
import type { RequestRecord } from "../lib/types";

const req = {
  id: "b857bdba-7c5a-4ce1-ae4d-b2b5588913fa", type: "helpdesk_ticket", status: "inprogress", priority: "high",
  subject: "Laptop <will> not start", description: "Black screen after the logo.\nTried a restart twice.",
  requester_name: "Lina Haddad", requester_email: "lina.haddad@sankari-holding.com", company: "Sankari Holding",
  assignee_id: "a1", created_at: "2026-09-26T09:38:00Z", sla_due_at: "2026-09-27T09:38:00Z", resolved_at: null,
  details: { category: "Hardware", assetTag: "SH-LT-0420" },
} as unknown as RequestRecord;

describe("request emails", () => {
  it("carries the full facts in English", () => {
    const m = buildRequestMail(req, "en", { k: "assigned" }, { assignee: "Saeed Dakalbab" });
    expect(m.subject).toBe("[Sankari] Request assigned to you: Laptop <will> not start");
    for (const s of ["Requested by", "Lina Haddad", "In progress", "High", "Saeed Dakalbab", "Due", "Black screen after the logo.", "Open request"]) expect(m.html).toContain(s);
    expect(m.html).toContain("Laptop &lt;will&gt; not start");
    expect(m.html).not.toContain("<will>");
    expect(m.text).toContain("Assigned to: Saeed Dakalbab");
  });
  it("writes Arabic, right to left, for an Arabic reader", () => {
    const m = buildRequestMail(req, "ar", { k: "comment", p: { author: "سامي" } }, { comment: "هل يمكنك إرسال صورة؟" });
    expect(m.html).toContain('dir="rtl"');
    for (const s of ["تعليق جديد من سامي", "مقدّم الطلب", "قيد التنفيذ", "عالية", "لم يُسند بعد", "هل يمكنك إرسال صورة؟", "فتح الطلب", "سنكري القابضة"]) expect(m.html).toContain(s);
  });
  it("translates the status it reports", () => {
    expect(buildRequestMail({ ...req, status: "resolved", resolved_at: "2026-09-26T10:00:00Z" } as RequestRecord, "en", { k: "resolved", p: { status: "resolved" } }).subject).toBe("[Sankari] Your request is Resolved: Laptop <will> not start");
    expect(buildRequestMail(req, "ar", { k: "resolved", p: { status: "resolved" } }).html).toContain("طلبك: تم الحل");
  });
  it("leaves out the due time once the request is resolved", () => {
    expect(buildRequestMail({ ...req, resolved_at: "2026-09-26T10:00:00Z" } as RequestRecord, "en", { k: "assigned" }).text).not.toContain("Due:");
  });
  it("builds the new-ticket alert with Start and Reject in both languages", () => {
    const links = { start: "https://x.test/s", reject: "https://x.test/r" };
    const en = buildTicketAlert(req, "en", "HLP-2026-B857", links), ar = buildTicketAlert(req, "ar", "HLP-2026-B857", links);
    expect(en.subject).toBe("[Sankari] New helpdesk ticket HLP-2026-B857 · High: Laptop <will> not start");
    for (const s of ["SH-LT-0420", "Hardware", ">Start<", ">Reject<"]) expect(en.html).toContain(s);
    for (const s of ["تذكرة دعم فني جديدة", ">بدء العمل<", ">رفض<"]) expect(ar.html).toContain(s);
  });
});

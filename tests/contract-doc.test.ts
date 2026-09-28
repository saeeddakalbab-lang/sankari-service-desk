import { describe, expect, it } from "vitest";
import { arabicNumber, usdInArabicWords } from "../lib/arabic-words";
import { buildContract, EMPTY_PARTY, type ContractInput } from "../lib/contract-template";
import { clientDetailsSchema } from "../lib/contracts";

describe("amounts in Arabic words", () => {
  it("writes the template amounts the way the approved contracts do", () => {
    expect(usdInArabicWords(1221168n)).toBe("اثنا عشر ألفاً ومئتان وأحد عشر دولاراً أميركياً وثمانية وستون سنتاً لا غير");
    expect(usdInArabicWords(1831440n)).toBe("ثمانية عشر ألفاً وثلاثمئة وأربعة عشر دولاراً أميركياً وأربعون سنتاً لا غير");
    expect(usdInArabicWords(3602144n)).toBe("ستة وثلاثون ألفاً وواحد وعشرون دولاراً أميركياً وأربعة وأربعون سنتاً لا غير");
  });
  it("uses the right counted form for 1, 2, 3-10, 11-99 and round numbers", () => {
    expect(usdInArabicWords(100n)).toBe("دولار أميركي واحد لا غير");
    expect(usdInArabicWords(200n)).toBe("دولاران أميركيان لا غير");
    expect(usdInArabicWords(500n)).toBe("خمسة دولارات أميركية لا غير");
    expect(usdInArabicWords(1500n)).toBe("خمسة عشر دولاراً أميركياً لا غير");
    expect(usdInArabicWords(300000n)).toBe("ثلاثة آلاف دولار أميركي لا غير");
    expect(usdInArabicWords(100000000n)).toBe("مليون دولار أميركي لا غير");
    expect(usdInArabicWords(5n)).toBe("صفر دولار أميركي وخمسة سنتات لا غير");
    expect(arabicNumber(2000)).toBe("ألفان");
    expect(arabicNumber(11000)).toBe("أحد عشر ألفاً");
  });
});

const input = (lines: ContractInput["lines"], extra: Partial<ContractInput> = {}): ContractInput => {
  const sub = lines.reduce((s, l) => s + l.lineTotalCents, 0n);
  return { reference: "CT-2026-0009", controlDate: "2026-10-01", months: 6, startDate: "2026-10-01", endDate: "2027-04-01", supportType: "onsite", lines,
    subtotalCents: sub, premiumCents: 0n, discountCents: 0n, discountBps: 0, totalCents: sub,
    installments: [{ key: "signing", bps: 5000, cents: sub / 2n }, { key: "midpoint", bps: 2500, cents: sub / 4n }, { key: "final", bps: 2500, cents: sub - sub / 2n - sub / 4n }],
    midpointMonths: 3, paymentTermsDays: 14, party: EMPTY_PARTY,
    client: { companyName: "Mall of Aleppo", contactName: "Omar Fathi", contactEmail: "omar@example.com", contactPhone: "+963 982 404 856", title: "مدير المول", address: "جمعية المهندسين", city: "حلب" }, ...extra };
};
const consultant = { serviceKey: "consultant", label: "Consultant", hoursPerMonth: 96, weeksPerMonth: 2, daysPerWeek: 6, monthlyPriceCents: 175000n, lineTotalCents: 1050000n };
const support = { serviceKey: "it_support", label: "IT Support Specialist", hoursPerMonth: 192, weeksPerMonth: 4, daysPerWeek: 6, monthlyPriceCents: 150000n, lineTotalCents: 900000n };
const text = (d: ReturnType<typeof buildContract>) => JSON.stringify(d);

describe("contract document", () => {
  it("builds the 19 articles for one service with its own scope and response times", () => {
    const d = buildContract(input([consultant]));
    expect(d.sections).toHaveLength(19);
    expect(d.controlNo).toBe("SH-IT-CN");
    expect(d.title).toContain("خدمات استشارية في تقنية المعلومات");
    expect(text(d)).toContain("الحوكمة والاستراتيجية");
    expect(text(d)).toContain("طلب استشاري عاجل");
    expect(text(d)).not.toContain("استقبال الطلبات");
    expect(text(d)).toContain("/10,500.00/ دولار أميركي (عشرة آلاف وخمسمئة دولار أميركي لا غير)");
    expect(text(d)).toContain("576 ساعة");
  });
  it("stacks each selected service under its own heading, like the bundled templates", () => {
    const d = buildContract(input([consultant, support]));
    expect(d.controlNo).toBe("SH-IT-MS");
    expect(d.title).toContain("خدمات استشارية في تقنية المعلومات وخدمات الدعم الفني");
    const scope = d.sections[1].blocks.filter(b => b.kind === "h").map(b => b.kind === "h" && b.text);
    expect(scope).toEqual(["استشارات البنية التحتية لتقنية المعلومات", "الدعم الفني (أخصائي دعم تقني)"]);
    expect(text(d)).toContain("1,728 ساعة");
  });
  it("prints the payment plan from the installments and a discount as its own table", () => {
    const d = buildContract(input([support], { discountCents: 90000n, discountBps: 1000, totalCents: 810000n, subtotalCents: 900000n }));
    const pay = d.sections[6].blocks.find(b => b.kind === "table");
    expect(pay && pay.kind === "table" && pay.rows.map(r => r[1])).toEqual(["50%", "25%", "25%"]);
    expect(text(d)).toContain("خصم تجاري معتمد لهذا العميل");
    expect(text(d)).toContain("/8,100.00/");
  });
  it("leaves missing party details as [●] and flags a block with no approved template", () => {
    const d = buildContract(input([{ ...support, serviceKey: "cybersecurity" }]));
    expect(d.parties[0][1]).toContain("[●]");
    expect(d.draftBlock).toBe(true);
    expect(buildContract(input([support])).draftBlock).toBe(false);
  });
});

describe("client details on the request form", () => {
  it("requires the signatory's title, the address and the city", () => {
    expect(clientDetailsSchema.safeParse({ title: "CEO", address: "Shaalan", city: "Damascus" }).success).toBe(true);
    expect(clientDetailsSchema.safeParse({ title: "", address: "Shaalan", city: "Damascus" }).success).toBe(false);
    expect(clientDetailsSchema.safeParse({ title: "CEO", address: "Shaalan", city: "Damascus", hoursFrom: "25:00" }).success).toBe(false);
  });
});

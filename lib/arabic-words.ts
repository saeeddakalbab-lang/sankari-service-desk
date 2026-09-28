// Amounts in Arabic words, as a contract writes them:
//   1221168 cents -> "اثنا عشر ألفاً ومئتان وأحد عشر دولاراً أميركياً وثمانية وستون سنتاً لا غير"
// Masculine counting (the dollar and the cent are masculine), up to 999,999,999.

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

// 1..999 on its own.
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r <= 10) parts.push(ONES[r]);
    else if (r < 20) parts.push(TEENS[r - 10]);
    else { const o = r % 10, t = Math.floor(r / 10); parts.push(o ? `${ONES[o]} و${TENS[t]}` : TENS[t]); }
  }
  return parts.join(" و");
}

// A count of a scale word (ألف / مليون), with the forms Arabic uses for 1, 2, 3-10 and 11+.
function scaled(n: number, one: string, two: string, few: string, many: string) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${below1000(n)} ${few}`;
  const r = n % 100;
  return `${below1000(n)} ${r >= 11 ? many : one}`;
}

export function arabicNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) throw new Error("Out of range");
  if (n === 0) return "صفر";
  const m = Math.floor(n / 1_000_000), k = Math.floor((n % 1_000_000) / 1000), u = n % 1000, parts: string[] = [];
  if (m) parts.push(scaled(m, "مليون", "مليونان", "ملايين", "مليوناً"));
  if (k) parts.push(scaled(k, "ألف", "ألفان", "آلاف", "ألفاً"));
  if (u) parts.push(below1000(u));
  return parts.join(" و");
}

// The counted noun after a number: 1, 2, 3-10, 11-99 (accusative), and the rest (genitive).
function counted(n: number, forms: { one: string; two: string; few: string; acc: string; gen: string }) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${arabicNumber(n)} ${forms.few}`;
  if (r >= 11) return `${arabicNumber(n)} ${forms.acc}`;
  return `${arabicNumber(n)} ${forms.gen}`;
}
const DOLLAR = { one: "دولار أميركي واحد", two: "دولاران أميركيان", few: "دولارات أميركية", acc: "دولاراً أميركياً", gen: "دولار أميركي" };
const CENT = { one: "سنت واحد", two: "سنتان", few: "سنتات", acc: "سنتاً", gen: "سنت" };

export function usdInArabicWords(cents: bigint | number | string): string {
  const v = BigInt(cents);
  if (v < 0n) throw new Error("Negative amount");
  const d = Number(v / 100n), c = Number(v % 100n);
  const parts = [d ? counted(d, DOLLAR) : "صفر دولار أميركي"];
  if (c) parts.push(counted(c, CENT));
  return `${parts.join(" و")} لا غير`;
}

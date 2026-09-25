// One layout for every email the portal sends: the official white logo on the charcoal band, the
// title, then the body. Inline styles only (email clients drop <style>). Arabic paragraphs are marked
// right-to-left so their punctuation lands on the correct side inside an English email.

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const base = () => process.env.NEXTAUTH_URL || "http://localhost:3000";
const isArabic = (s: string) => /[؀-ۿ]/.test(s) && !/[A-Za-z]{4}/.test(s.replace(/@\S+|https?:\/\/\S+/g, ""));

export const PRIORITY_LABEL: Record<string, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };

export function para(text: string) {
  return isArabic(text) ? `<p dir="rtl" lang="ar" style="line-height:1.7;margin:0 0 12px;text-align:right;font-family:Tahoma,Arial,sans-serif">${esc(text)}</p>`
    : `<p style="line-height:1.55;margin:0 0 12px">${esc(text)}</p>`;
}
export function rowsTable(rows: [string, string][]) {
  return rows.length ? `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 4px">${rows.map(([k, v]) => `<tr><th scope="row" style="text-align:left;padding:7px 12px 7px 0;color:#5E564D;font-weight:normal;vertical-align:top;width:38%">${esc(k)}</th><td style="padding:7px 0;vertical-align:top">${esc(v)}</td></tr>`).join("")}</table>` : "";
}
export function button(href: string, label: string, tone: "primary" | "outline-bad" = "primary") {
  return tone === "primary" ? `<a href="${esc(href)}" style="display:inline-block;background:#B84F27;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:bold">${esc(label)}</a>`
    : `<a href="${esc(href)}" style="display:inline-block;border:2px solid #AE352A;color:#AE352A;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:bold">${esc(label)}</a>`;
}

// inner is already-escaped HTML built with the helpers above.
export function emailShell(title: string, inner: string, opts: { lang?: "en" | "ar" } = {}) {
  const rtl = opts.lang === "ar", logo = new URL("/logo-white.png", base()).href;
  return `<!doctype html><html lang="${rtl ? "ar" : "en"}" dir="${rtl ? "rtl" : "ltr"}"><body style="margin:0;background:#F2F0EC;font-family:Arial,Tahoma,sans-serif;color:#2B2622">`
    + `<main style="max-width:620px;margin:24px auto;background:#ffffff;border:1px solid #E3DED6">`
    + `<header style="padding:20px 28px;background:#4A443C;color:#ffffff"><img src="${esc(logo)}" width="84" height="64" alt="Sankari Holding" style="display:block;border:0;margin-bottom:10px;color:#ffffff;font-weight:bold;letter-spacing:.08em"><h1 style="margin:0;font-size:20px;line-height:1.3">${esc(title)}</h1></header>`
    + `<section style="padding:26px 28px">${inner}<p style="margin:26px 0 0;font-size:12px;color:#5E564D">Sankari Holding · IT</p></section></main></body></html>`;
}

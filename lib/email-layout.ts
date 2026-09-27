// One layout for every email the portal sends: the official white logo on the charcoal band, the
// title, then the body. Built from tables with inline styles and bgcolor attributes, because Outlook
// on Windows draws email with Word and ignores styling on <header>, <main>, <section> and <div>
// backgrounds. The logo is embedded in the message (cid:), so it shows without "download pictures".
// Arabic paragraphs are marked right-to-left so their punctuation lands on the correct side.

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const isArabic = (s: string) => /[؀-ۿ]/.test(s) && !/[A-Za-z]{4}/.test(s.replace(/@\S+|https?:\/\/\S+/g, ""));
// The worker attaches public/logo-white.png under this Content-ID to any message that references it.
export const LOGO_CID = "sankari-logo";
const FONT = "Arial,Tahoma,Helvetica,sans-serif";

export const PRIORITY_LABEL: Record<string, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };

export function para(text: string) {
  return isArabic(text) ? `<p dir="rtl" lang="ar" style="line-height:1.7;margin:0 0 12px;text-align:right;font-family:Tahoma,Arial,sans-serif;font-size:15px;color:#2B2622">${esc(text)}</p>`
    : `<p style="line-height:1.55;margin:0 0 12px;font-family:${FONT};font-size:15px;color:#2B2622">${esc(text)}</p>`;
}
export function rowsTable(rows: [string, string][], rtl = false) {
  const side = rtl ? "right" : "left", pad = rtl ? "7px 0 7px 12px" : "7px 12px 7px 0";
  return rows.length ? `<table role="presentation" dir="${rtl ? "rtl" : "ltr"}" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:14px;margin:8px 0 4px">${rows.map(([k, v]) => `<tr><th scope="row" align="${side}" valign="top" width="38%" style="text-align:${side};padding:${pad};color:#5E564D;font-weight:normal;border-bottom:1px solid #EFEBE5">${esc(k)}</th><td align="${side}" valign="top" style="padding:7px 0;text-align:${side};color:#2B2622;border-bottom:1px solid #EFEBE5" dir="auto">${esc(v)}</td></tr>`).join("")}</table>` : "";
}
// A button Outlook draws correctly: the colour sits on a table cell, not only on the link.
export function button(href: string, label: string, tone: "primary" | "outline-bad" = "primary") {
  const primary = tone === "primary";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;border-collapse:separate;margin:0 6px 6px 0"><tr><td align="center" bgcolor="${primary ? "#B84F27" : "#FFFFFF"}" style="border-radius:6px;background:${primary ? "#B84F27" : "#FFFFFF"};${primary ? "" : "border:2px solid #AE352A;"}"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:${primary ? "12px 22px" : "10px 20px"};font-family:${FONT};font-size:15px;font-weight:bold;color:${primary ? "#FFFFFF" : "#AE352A"};text-decoration:none;border-radius:6px">${esc(label)}</a></td></tr></table>`;
}

// A shaded box: a one-cell table, so the background survives Outlook.
export function box(inner: string, opts: { bg?: string; accentSide?: "left" | "right" } = {}) {
  const bg = opts.bg ?? "#F7F5F1", accent = opts.accentSide ? `border-${opts.accentSide}:3px solid #B84F27;` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:14px 0"><tr><td bgcolor="${bg}" style="background:${bg};padding:14px 18px;border-radius:8px;${accent}font-family:${FONT};font-size:14px;color:#2B2622">${inner}</td></tr></table>`;
}

// inner is already-escaped HTML built with the helpers above.
export function emailShell(title: string, inner: string, opts: { lang?: "en" | "ar"; footer?: string } = {}) {
  const rtl = opts.lang === "ar", align = rtl ? "right" : "left";
  return `<!doctype html><html lang="${rtl ? "ar" : "en"}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>`
    + `<body style="margin:0;padding:0;background:#F2F0EC" bgcolor="#F2F0EC">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2F0EC" style="width:100%;background:#F2F0EC"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" dir="${rtl ? "rtl" : "ltr"}" style="width:100%;max-width:620px;border-collapse:collapse;background:#FFFFFF;border:1px solid #E3DED6" bgcolor="#FFFFFF">`
    + `<tr><td bgcolor="#4A443C" align="${align}" style="background:#4A443C;padding:20px 28px;text-align:${align}">`
    + `<img src="cid:${LOGO_CID}" width="84" height="64" alt="Sankari Holding" style="display:block;border:0;outline:none;margin:0 0 10px;${rtl ? "margin-left:auto;" : ""}color:#FFFFFF;font-family:${FONT};font-size:16px;font-weight:bold">`
    + `<h1 style="margin:0;font-family:${FONT};font-size:20px;line-height:1.3;color:#FFFFFF;font-weight:bold;text-align:${align}">${esc(title)}</h1></td></tr>`
    + `<tr><td align="${align}" style="padding:26px 28px;text-align:${align};font-family:${FONT};font-size:15px;color:#2B2622">${inner}`
    + `<p style="margin:26px 0 0;font-family:${FONT};font-size:12px;color:#5E564D">${esc(opts.footer ?? "Sankari Holding · IT")}</p></td></tr>`
    + `</table></td></tr></table></body></html>`;
}

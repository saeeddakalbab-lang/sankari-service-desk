import { esc, LOGO_CID } from "./email-layout";
import type { PersonType } from "./people";

// The invitation a person receives when an admin adds them. They have never signed in, so there is
// no language preference yet: the email carries English and Arabic together, each in its own
// direction. Built from tables with inline styles and bgcolor (Outlook draws email with Word), the
// logo is embedded (cid:), and the only link is the sign-in page on this site.

const FONT = "Arial,Tahoma,Helvetica,sans-serif", AR_FONT = "Tahoma,Arial,sans-serif";
const CLAY = "#B84F27", CHARCOAL = "#4A443C", IVORY = "#F2F0EC", INK = "#2B2622", SOFT = "#5E564D", LINE = "#E3DED6";

type Copy = { en: string; ar: string };
export const ROLE_NAME: Record<PersonType, Copy> = {
  employee: { en: "Employee", ar: "موظف" }, manager: { en: "Manager", ar: "مدير" }, ceo: { en: "CEO", ar: "الرئيس التنفيذي" }, owner: { en: "Owner", ar: "المالك" },
  board: { en: "Board member", ar: "عضو مجلس الإدارة" }, admin: { en: "Administrator", ar: "مسؤول النظام" }, agent: { en: "IT agent", ar: "فني تقنية المعلومات" },
  accountant: { en: "Accountant", ar: "محاسب" }, contracts: { en: "Contracts", ar: "العقود" },
};
const EVERYONE: Copy[] = [
  { en: "Ask IT for help, a new email account or a subscription, in a few clicks", ar: "اطلب الدعم الفني أو حساب بريد جديد أو اشتراكًا ببضع نقرات" },
  { en: "Follow each request from submitted to done, and reply in its thread", ar: "تابع كل طلب من الإرسال حتى الإنجاز، وردّ في محادثته" },
];
const BY_ROLE: Record<PersonType, Copy[]> = {
  employee: [{ en: "Choose English or Arabic, and light or dark mode, in Settings", ar: "اختر العربية أو الإنجليزية، والوضع الفاتح أو الداكن من الإعدادات" }],
  manager: [{ en: "Approve or decline your team's subscription requests", ar: "وافق على طلبات اشتراك فريقك أو ارفضها" }],
  ceo: [{ en: "Give the final approval on subscription requests", ar: "امنح الموافقة النهائية على طلبات الاشتراك" }, { en: "See where requests are waiting, and the IT department's live KPIs", ar: "اطّلع على مكان توقف الطلبات، ومؤشرات أداء قسم تقنية المعلومات مباشرة" }],
  owner: [{ en: "See where requests are waiting, and the IT department's live KPIs", ar: "اطّلع على مكان توقف الطلبات، ومؤشرات أداء قسم تقنية المعلومات مباشرة" }],
  board: [{ en: "See where requests are waiting, and the IT department's live KPIs", ar: "اطّلع على مكان توقف الطلبات، ومؤشرات أداء قسم تقنية المعلومات مباشرة" }],
  admin: [{ en: "Run the whole portal: people, rules, subscriptions, contracts and finance", ar: "أدِر البوابة كاملة: الأشخاص والقواعد والاشتراكات والعقود والمالية" }],
  agent: [{ en: "Work the team queue: start tickets, reply and close them on time", ar: "اعمل على قائمة الفريق: ابدأ التذاكر وردّ عليها وأغلقها في موعدها" }],
  accountant: [{ en: "Bill history, the monthly card statement, the ledger and receivables", ar: "سجل الفواتير، والكشف الشهري للبطاقة، والسجل المالي والذمم المدينة" }],
  contracts: [{ en: "Client contracts: review requests, send quotations and contracts to sign", ar: "عقود العملاء: راجع الطلبات وأرسل عروض الأسعار والعقود للتوقيع" }],
};

export type Invite = { to: string; name: string; type: PersonType; invitedBy: string; managerName?: string | null; loginUrl: string };

const cell = (inner: string, dir: "ltr" | "rtl", pad = "0 32px") => `<tr><td dir="${dir}" align="${dir === "rtl" ? "right" : "left"}" style="padding:${pad};text-align:${dir === "rtl" ? "right" : "left"};font-family:${dir === "rtl" ? AR_FONT : FONT};color:${INK}">${inner}</td></tr>`;
const bullets = (items: Copy[], lang: "en" | "ar") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="${lang === "ar" ? "rtl" : "ltr"}" style="border-collapse:collapse;width:100%">`
  + items.map(i => `<tr><td width="26" valign="top" style="padding:6px 0;width:26px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="18" height="18" bgcolor="${CLAY}" align="center" valign="middle" style="width:18px;height:18px;background:${CLAY};border-radius:9px;font-family:${FONT};font-size:12px;line-height:18px;color:#FFFFFF;font-weight:bold">&#10003;</td></tr></table></td>`
    + `<td valign="top" align="${lang === "ar" ? "right" : "left"}" style="padding:5px 0;font-family:${lang === "ar" ? AR_FONT : FONT};font-size:15px;line-height:1.55;color:${INK};text-align:${lang === "ar" ? "right" : "left"}">${esc(i[lang])}</td></tr>`).join("") + `</table>`;
const bigButton = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;margin:0 auto"><tr>`
  + `<td align="center" valign="middle" bgcolor="${CLAY}" height="52" style="background:${CLAY};border-radius:10px;padding:15px 34px;mso-padding-alt:15px 34px;height:52px">`
  + `<a href="${esc(href)}" target="_blank" style="display:inline-block;font-family:${FONT};font-size:16px;line-height:22px;font-weight:bold;color:#FFFFFF;text-decoration:none;white-space:nowrap">${esc(label)}</a></td></tr></table>`;
const step = (n: number, en: string, ar: string) => `<td width="33%" valign="top" align="center" style="width:33%;padding:0 6px">`
  + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="32" height="32" bgcolor="${CHARCOAL}" align="center" valign="middle" style="width:32px;height:32px;background:${CHARCOAL};border-radius:16px;font-family:${FONT};font-size:15px;font-weight:bold;color:#FFFFFF">${n}</td></tr></table>`
  + `<p style="margin:8px 0 2px;font-family:${FONT};font-size:13px;line-height:1.4;color:${INK};font-weight:bold">${esc(en)}</p><p dir="rtl" lang="ar" style="margin:0;font-family:${AR_FONT};font-size:13px;line-height:1.5;color:${SOFT}">${esc(ar)}</p></td>`;

export function invitationEmail(i: Invite) {
  const role = ROLE_NAME[i.type], list = [...EVERYONE, ...BY_ROLE[i.type]], first = i.name.split(/\s+/)[0] || i.name;
  const subject = `[Sankari] You're invited to the IT portal · دعوة إلى بوابة تقنية المعلومات`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:${IVORY}" bgcolor="${IVORY}">`
    // Preheader: the line most inboxes show next to the subject.
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${IVORY}">${esc(`${i.invitedBy} added you as ${role.en}. Sign in with your work Google account.`)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${IVORY}" style="width:100%;background:${IVORY}"><tr><td align="center" style="padding:28px 12px">`
    + `<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;border-collapse:collapse;background:#FFFFFF;border:1px solid ${LINE}" bgcolor="#FFFFFF">`
    // Hero: logo, bilingual welcome, clay rule.
    + `<tr><td bgcolor="${CHARCOAL}" align="center" style="background:${CHARCOAL};padding:34px 32px 30px;text-align:center">`
    + `<img src="cid:${LOGO_CID}" width="96" height="73" alt="Sankari Holding" style="display:block;margin:0 auto 18px;border:0;outline:none;color:#FFFFFF;font-family:${FONT};font-size:18px;font-weight:bold">`
    + `<h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.3;color:#FFFFFF;font-weight:bold">Welcome to the IT portal</h1>`
    + `<p dir="rtl" lang="ar" style="margin:6px 0 0;font-family:${AR_FONT};font-size:20px;line-height:1.5;color:#FFFFFF;font-weight:bold">مرحبًا بك في بوابة تقنية المعلومات</p>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 0"><tr><td width="56" height="3" bgcolor="${CLAY}" style="width:56px;height:3px;background:${CLAY};font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>`
    // English.
    + cell(`<p style="margin:0 0 10px;font-size:17px;line-height:1.5;font-weight:bold">Hello ${esc(first)},</p>`
      + `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${esc(i.invitedBy)} has added you to the Sankari Holding IT portal as <strong style="color:${CLAY}">${esc(role.en)}</strong>${i.managerName ? `, reporting to ${esc(i.managerName)}` : ""}. Your account is ready: sign in with your work Google account, <strong>${esc(i.to)}</strong>. There is no password to set.</p>`
      + `<p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${SOFT};font-weight:bold">What you can do</p>${bullets(list, "en")}`, "ltr", "30px 32px 6px")
    // Button.
    + `<tr><td align="center" style="padding:24px 32px 8px">${bigButton(i.loginUrl, "Sign in to the portal · تسجيل الدخول")}</td></tr>`
    + `<tr><td align="center" style="padding:0 32px 22px;font-family:${FONT};font-size:12px;color:${SOFT}"><a href="${esc(i.loginUrl)}" style="color:${SOFT};text-decoration:underline">${esc(i.loginUrl.replace(/^https?:\/\//, ""))}</a></td></tr>`
    // Three steps.
    + `<tr><td style="padding:0 26px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F5F1" style="width:100%;background:#F7F5F1;border-radius:10px"><tr><td style="padding:18px 6px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + step(1, "Open the portal", "افتح البوابة") + step(2, "Continue with Google", "المتابعة بحساب Google") + step(3, "You're in", "تم الدخول")
    + `</tr></table></td></tr></table></td></tr>`
    // Divider, then Arabic.
    + `<tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="${LINE}" style="height:1px;background:${LINE};font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>`
    + cell(`<p style="margin:0 0 10px;font-size:17px;line-height:1.6;font-weight:bold">مرحبًا ${esc(first)}،</p>`
      + `<p style="margin:0 0 14px;font-size:15px;line-height:1.8">أضافك ${esc(i.invitedBy)} إلى بوابة تقنية المعلومات في سنكري القابضة بصفة <strong style="color:${CLAY}">${esc(role.ar)}</strong>${i.managerName ? `، وتتبع إلى ${esc(i.managerName)}` : ""}. حسابك جاهز: سجّل الدخول بحساب Google الخاص بالعمل <strong dir="ltr">${esc(i.to)}</strong>. لا حاجة إلى كلمة مرور.</p>`
      + `<p style="margin:0 0 6px;font-size:14px;color:${SOFT};font-weight:bold">ما يمكنك فعله</p>${bullets(list, "ar")}`, "rtl", "24px 32px 28px")
    // Footer.
    + `<tr><td bgcolor="#F7F5F1" align="center" style="background:#F7F5F1;padding:18px 32px;border-top:1px solid ${LINE};font-family:${FONT};font-size:12px;line-height:1.6;color:${SOFT};text-align:center">`
    + `Didn't expect this? You can ignore it; nothing happens until you sign in.<br><span dir="rtl" lang="ar" style="font-family:${AR_FONT}">لم تكن تتوقع هذه الرسالة؟ تجاهلها؛ لا يحدث شيء قبل تسجيل الدخول.</span><br><strong style="color:${INK}">Sankari Holding · IT</strong></td></tr>`
    + `</table></td></tr></table></body></html>`;
  const text = `Welcome to the Sankari IT portal\n\nHello ${first},\n${i.invitedBy} has added you as ${role.en}${i.managerName ? `, reporting to ${i.managerName}` : ""}. Sign in with your work Google account (${i.to}); there is no password to set.\n\nWhat you can do:\n${list.map(x => `- ${x.en}`).join("\n")}\n\nSign in: ${i.loginUrl}\n\nمرحبًا ${first}،\nأضافك ${i.invitedBy} إلى بوابة تقنية المعلومات بصفة ${role.ar}. سجّل الدخول بحساب Google الخاص بالعمل (${i.to}).\n${list.map(x => `- ${x.ar}`).join("\n")}\n\nSankari Holding · IT`;
  return { subject, html, text };
}

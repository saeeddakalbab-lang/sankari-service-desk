// Records the recurring subscriptions found on the closed Mashreq card statement (*9425, 13/08-15/09/2026),
// plus the Hostinger plans from its billing page, as portal subscriptions, owned by the Owner, renewing on the new card (last 4: 4164).
//   npx tsx scripts/import-statement-subscriptions.ts            -> dry run: prints what would be added
//   npx tsx scripts/import-statement-subscriptions.ts commit     -> writes, in one transaction
// Idempotent: each row carries import_source/import_id, so a second run adds nothing. It writes no bills
// (the statement charges were paid before the portal tracked them) and changes no existing row.
import { pool } from "../lib/db";

const SOURCE = "mashreq-statement-2026-09", CARD = "4164";
type Row = { id: string; name: string; provider: string; company: string; beneficiary: string; department: string; cur: string; cents: number; aedCents: number; last: string; next: string; cycle?: "monthly" | "annual"; rate?: string; note?: string };
// Amounts are minor units, copied from the statement's final sheet (original amount, and the AED the bank charged).
const ROWS: Row[] = [
  { id: "starlink-aleppo-office", name: "Starlink - Digital Transformation office, Aleppo", provider: "Starlink", company: "Sankari Holding", beneficiary: "مكتب التحول الرقمي - حلب", department: "فريق التحول الرقمي", cur: "EUR", cents: 9500, aedCents: 41990, last: "2026-09-13", next: "2026-10-13" },
  { id: "starlink-domainz-x2", name: "Starlink x2 - Domainz", provider: "Starlink", company: "Domainz", beneficiary: "شركة دومينز - اشتراكا Starlink", department: "تقني", cur: "CHF", cents: 18000, aedCents: 84925, last: "2026-08-16", next: "2026-10-16", note: "One charge covers two Starlink subscriptions." },
  { id: "starlink-guesthouse-damascus", name: "Starlink - Guest house, Damascus", provider: "Starlink", company: "Sankari Holding", beneficiary: "بيت الضيافة - دمشق", department: "تقني", cur: "EUR", cents: 9500, aedCents: 42177, last: "2026-08-18", next: "2026-10-18" },
  { id: "starlink-ustaz-youssef", name: "Starlink - Ustaz Youssef", provider: "Starlink", company: "Other", beneficiary: "استاذ يوسف", department: "أخرى", cur: "USD", cents: 10000, aedCents: 38221, last: "2026-09-03", next: "2026-10-03" },
  { id: "starlink-hosting-house-eur", name: "Starlink - Hosting house (EUR)", provider: "Starlink", company: "Sankari Holding", beneficiary: "بيت الاستضافة", department: "تقني", cur: "EUR", cents: 9500, aedCents: 42156, last: "2026-09-03", next: "2026-10-03" },
  { id: "starlink-iyad-halloubi", name: "Starlink - Iyad Halloubi", provider: "Starlink", company: "Sankari Holding", beneficiary: "إياد حلوبي", department: "قسم إدارة الشركات", cur: "CHF", cents: 9800, aedCents: 46197, last: "2026-09-03", next: "2026-10-03" },
  { id: "starlink-hosting-house-chf", name: "Starlink - Hosting house (CHF)", provider: "Starlink", company: "Sankari Holding", beneficiary: "بيت الاستضافة", department: "تقني", cur: "CHF", cents: 9000, aedCents: 42620, last: "2026-09-08", next: "2026-10-08" },
  { id: "starlink-jad-halloubi", name: "Starlink - Jad Halloubi", provider: "Starlink", company: "Sankari Holding", beneficiary: "جاد حلوبي", department: "الموارد البشرية", cur: "CHF", cents: 9000, aedCents: 42590, last: "2026-09-11", next: "2026-10-11" },
  { id: "starlink-corporate", name: "Starlink - Corporate account", provider: "Starlink", company: "Sankari Holding", beneficiary: "حساب Starlink المؤسسي", department: "تقني", cur: "CHF", cents: 3604, aedCents: 17067, last: "2026-09-14", next: "2026-10-14", note: "Seen once, on 14/09; may be a pro-rated charge rather than a monthly one." },
  { id: "claude-zaher-shuraiqi", name: "Claude - Zaher Shuraiqi", provider: "Anthropic", company: "Sankari Holding", beneficiary: "زاهر شريقي", department: "قسم إدارة الشركات", cur: "USD", cents: 2100, aedCents: 8027, last: "2026-09-05", next: "2026-10-05" },
  { id: "chatgpt-rahaf-jaha", name: "ChatGPT - Rahaf Jaha", provider: "OpenAI", company: "Sankari Holding", beneficiary: "رهف جحا", department: "قسم إدارة الشركات", cur: "GBP", cents: 1750, aedCents: 9149, last: "2026-08-23", next: "2026-10-23" },
  { id: "google-cloud-xz32gqcc", name: "Google Cloud - xz32gqcc", provider: "Google", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "TRY", cents: 2000000, aedCents: 158684, last: "2026-09-03", next: "2026-10-03", note: "Usage-based: the amount changes each month." },
  { id: "google-cloud-9mhzrmcc", name: "Google Cloud - 9mhzrmcc", provider: "Google", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "TRY", cents: 84704, aedCents: 6721, last: "2026-09-03", next: "2026-10-03", note: "Usage-based: the amount changes each month." },
  { id: "jira-atlassian", name: "Jira (Atlassian)", provider: "Atlassian", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 29196, aedCents: 111586, last: "2026-08-18", next: "2026-10-18", note: "One subscription. On 18/08 it charged USD 96.48 + USD 195.48; on 09/09 USD 67.84 more (likely added seats). Atlassian bills per user, so the amount varies." },
  { id: "hetzner-digital-team", name: "Hetzner - Digital Transformation team", provider: "Hetzner", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 2500, aedCents: 9555, last: "2026-08-13", next: "2026-10-13", note: "Charged 13/08; no charge on 13/09 in this statement." },
  { id: "hostinger-domain-sankari-holding-cloud", name: "Hostinger - .CLOUD domain sankari-holding.cloud", provider: "Hostinger", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 2599, aedCents: 9933, last: "", next: "2026-12-21", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-kvm2-dev-server", name: "Hostinger - KVM 2 Dev.Server", provider: "Hostinger", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 20388, aedCents: 77923, last: "", next: "2026-12-21", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-domain-qlink-cloud", name: "Hostinger - .CLOUD domain qlink.cloud", provider: "Hostinger", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 2599, aedCents: 9933, last: "", next: "2026-12-30", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-kvm2-mail-server", name: "Hostinger - KVM 2 Mail.Server", provider: "Hostinger", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 20388, aedCents: 77923, last: "", next: "2027-01-07", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-kvm4-websites-server", name: "Hostinger - KVM 4 Websites.Server", provider: "Hostinger", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 37188, aedCents: 142133, last: "", next: "2027-01-08", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-web-marayaplus", name: "Hostinger - web hosting marayaplus-com-855401.hostingersite.com", provider: "Hostinger", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 4788, aedCents: 18300, last: "", next: "2027-01-17", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-kvm8-electro-taxi", name: "Hostinger - KVM 8 Electro.Taxi", provider: "Hostinger", company: "Electro Taxi", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 64788, aedCents: 247620, last: "", next: "2027-01-18", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-sankari-holding-cloud-addon", name: "Hostinger - sankari-holding.cloud add-on", provider: "Hostinger", company: "Sankari Holding", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 708, aedCents: 2706, last: "", next: "2027-01-27", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-kvm2-almajd-server", name: "Hostinger - KVM 2 Almajd.Server", provider: "Hostinger", company: "Al-Majd Foundation", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 20388, aedCents: 77923, last: "", next: "2027-04-07", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
  { id: "hostinger-kvm2-77-server", name: "Hostinger - KVM 2 77.Server", provider: "Hostinger", company: "77Auto", beneficiary: "فريق التحول الرقمي", department: "فريق التحول الرقمي", cur: "USD", cents: 20388, aedCents: 77923, last: "", next: "2027-04-07", cycle: "annual", rate: "3.822000", note: "From the Hostinger billing page, not the card statement. Hostinger shows auto-renew on; turn it off there so only the Owner's Renew pays." },
];
// Rate to AED as the bank applied it, exact to 6 places, computed with integers (no floats).
const rateOf = (r: Row) => { if (r.rate) return r.rate; const q = BigInt(r.aedCents) * 1000000n * 2n / BigInt(r.cents), v = (q + 1n) / 2n; return `${v / 1000000n}.${(v % 1000000n).toString().padStart(6, "0")}`; };

const commit = process.argv[2] === "commit";
const c = await pool.connect();
try {
  const owner = (await c.query<{ id: string; name: string; email: string }>(`SELECT id,name,email FROM users WHERE 'owner'=ANY(roles) AND disabled_at IS NULL`)).rows;
  if (owner.length !== 1) throw new Error(`Expected exactly one active Owner to own these renewals, found ${owner.length}. Set the Owner in Admin settings first.`);
  const existing = new Set((await c.query<{ import_id: string }>(`SELECT import_id FROM subscriptions WHERE import_source=$1`, [SOURCE])).rows.map(r => r.import_id));
  console.log(`Owner (decides every renewal): ${owner[0].name} <${owner[0].email}> · card •••• ${CARD} · ${commit ? "COMMIT" : "DRY RUN"}\n`);
  let add = 0;
  for (const r of ROWS) {
    const state = existing.has(r.id) ? "already imported" : "add";
    if (state === "add") add++;
    console.log(`${state.padEnd(16)} ${r.name.padEnd(48)} ${r.cur} ${(r.cents / 100).toFixed(2).padStart(9)}  rate ${rateOf(r)}  next ${r.next}  ${r.company}`);
  }
  console.log(`\n${add} to add, ${ROWS.length - add} already present. Bills: none written. Existing rows: untouched.`);
  if (commit && add) {
    await c.query("BEGIN");
    for (const r of ROWS) {
      if (existing.has(r.id)) continue;
      const notes = r.last ? `Imported from the Mashreq statement (card *9425, closed 15/09/2026). Last charge ${r.last}: ${r.cur} ${(r.cents / 100).toFixed(2)} = AED ${(r.aedCents / 100).toFixed(2)}.${r.note ? " " + r.note : ""}` : r.note ?? "";
      const s = await c.query<{ id: string }>(`INSERT INTO subscriptions(name,provider,company_name,department,beneficiary,billing_frequency,amount_cents,currency,aed_rate,renewal_date,card_last4,method,owner_user_id,status,notes,import_source,import_id)
        VALUES($1,$2,$3,$4,$5,$15,$6,$7,$8,$9,$10,'corporate_card',$11,'active',$12,$13,$14) ON CONFLICT DO NOTHING RETURNING id`,
        [r.name, r.provider, r.company, r.department, r.beneficiary, r.cents, r.cur, rateOf(r), r.next, CARD, owner[0].id, notes, SOURCE, r.id, r.cycle ?? "monthly"]);
      if (s.rowCount) await c.query(`INSERT INTO audit_log(action,after_data) VALUES('subscription.imported',$1)`, [JSON.stringify({ subscriptionId: s.rows[0].id, source: SOURCE, importId: r.id, ownerUserId: owner[0].id })]);
    }
    await c.query("COMMIT");
    console.log("Committed.");
  }
} catch (e) { await c.query("ROLLBACK").catch(() => {}); console.error((e as Error).message); process.exitCode = 1; }
finally { c.release(); await pool.end(); }

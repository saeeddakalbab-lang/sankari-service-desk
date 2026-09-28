import { Logo } from "./Logo";
import { arMonths, money, type Block, type ContractDoc } from "@/lib/contract-template";
import type { InvoiceDoc, QuoteDoc } from "@/lib/contract-docs";

// The printed contract (Arabic, as signed) and the bilingual invoice. Both are A4 pages the browser's
// "Save as PDF" turns into the file that is sent; the same components serve the admin and the client link.

function Blocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b, k) => b.kind === "p" ? <p key={k}>{b.text}</p>
    : b.kind === "h" ? <h4 key={k}>{b.text}</h4>
    : b.kind === "list" ? <ul key={k}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>
    : <table key={k} className="cdoc-table"><thead><tr>{b.head.map((h, j) => <th key={j} scope="col">{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((x, n) => <td key={n}>{x}</td>)}</tr>)}{b.total && <tr className="cdoc-total">{b.total.map((x, n) => <td key={n}>{x}</td>)}</tr>}</tbody></table>)}</>;
}

function Signatures({ doc, withDate }: { doc: ContractDoc; withDate: boolean }) {
  return <table className="cdoc-sign"><tbody><tr>{doc.signers.map(([who, name, title]) => <td key={who}>
    <strong>{who}</strong><p>الاسم: {name}</p><p>الصفة: {title}</p>{withDate && <p>التاريخ: ____________________</p>}<p>التوقيع والختم: ____________________</p></td>)}</tr></tbody></table>;
}

export function ContractDocument({ doc }: { doc: ContractDoc }) {
  return <article className="cdoc" lang="ar" dir="rtl">
    <table className="cdoc-control"><thead><tr><th>رقم الضبط</th><th>تاريخ الإصدار</th><th>رقم المراجعة</th></tr></thead><tbody><tr><td dir="ltr">{doc.controlNo}</td><td dir="ltr">{doc.date}</td><td>05</td></tr></tbody></table>
    <header className="cdoc-head"><Logo tone="dark" width={110} /><h1>{doc.title}</h1><p>محرر في الجمهورية العربية السورية ووفق أحكام قوانينها النافذة</p></header>
    {doc.draftBlock && <p className="cdoc-warn">تنبيه: نطاق إحدى الخدمات في هذا العقد مُعدّ على غرار القوالب المعتمدة ولم يُعتمد قانونياً بعد، ويجب مراجعته قبل التوقيع.</p>}
    <h2>بيانات العقد</h2>
    <table className="cdoc-table cdoc-facts"><tbody>{doc.facts.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>
    <h2>الفريقان</h2>
    <p>{doc.opening}</p>
    <table className="cdoc-table cdoc-facts"><tbody>{doc.parties.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>
    <p>ويشار إليهما مجتمعين بـ «الفريقين»، وإلى كل منهما منفرداً بـ «الفريق».</p>
    <h2>مقدمة العقد</h2>
    {doc.preamble.map((p, k) => <p key={k}>{p}</p>)}
    {doc.sections.map(s => <section key={s.title}><h3>{s.title}</h3><Blocks blocks={s.blocks} /></section>)}
    <p className="cdoc-place">حُرِّر في مدينة {doc.city} بتاريخ {doc.date}</p>
    <Signatures doc={doc} withDate />
    <section className="cdoc-annex">
      <h2>الملحق رقم /1/</h2><p className="cdoc-sub">النطاق الفني والمالي للخدمات</p>
      <p>يُعد هذا الملحق جزءاً لا يتجزأ من العقد ويأخذ حكمه.</p>
      {doc.annex.map(s => <section key={s.title}><h3>{s.title}</h3><Blocks blocks={s.blocks} /></section>)}
      <Signatures doc={doc} withDate={false} />
      <p className="cdoc-note">{doc.note}</p>
    </section>
  </article>;
}

export function QuoteDocument({ q }: { q: QuoteDoc }) {
  const p = q.party;
  return <article className="cdoc cinv" lang="ar" dir="rtl">
    <header className="cinv-head">
      <div><Logo tone="dark" width={110} /><p className="cinv-from"><strong>{p.legalName}</strong>{p.address && <><br />{p.address}</>}{p.email && <><br /><bdi dir="ltr">{p.email}</bdi></>}</p></div>
      <div className="cinv-title"><h1>عرض سعر <span lang="en" dir="ltr">QUOTATION</span></h1>
        <table className="cinv-meta"><tbody>
          <tr><th>المرجع · Reference</th><td dir="ltr">{q.reference}</td></tr>
          <tr><th>التاريخ · Date</th><td dir="ltr">{q.date}</td></tr>
          <tr><th>المدة · Duration</th><td>{arMonths(q.months)} · <span dir="ltr">{q.start}</span></td></tr>
        </tbody></table></div>
    </header>
    <section className="cinv-to"><h2>إلى · To</h2><p><strong>{q.company}</strong><br />{q.contact} · <bdi dir="ltr">{q.email}</bdi></p></section>
    <table className="cdoc-table cinv-lines"><thead><tr><th scope="col">الخدمة · Service</th><th scope="col">التغطية · Load</th><th scope="col">شهرياً · Monthly (USD)</th><th scope="col">الإجمالي · Total (USD)</th></tr></thead>
      <tbody>{q.lines.map(l => <tr key={l.en}><td>{l.ar}<br /><span lang="en" dir="ltr" className="cinv-en">{l.en}</span></td>
        <td>{l.weeks && l.days ? `${l.weeks} أسبوع × ${l.days} أيام × 8 ساعات = ${l.hours} ساعة شهرياً` : `${l.hours} ساعة شهرياً`}</td><td dir="ltr">{money(l.monthlyCents)}</td><td dir="ltr">{money(l.totalCents)}</td></tr>)}
        {q.premiumCents > 0n && <tr><td>علاوة التنفيذ في الموقع · Onsite premium</td><td /><td /><td dir="ltr">{money(q.premiumCents)}</td></tr>}
        {q.discountCents > 0n && <><tr><td>المجموع · Subtotal</td><td /><td /><td dir="ltr">{money(q.subtotalCents)}</td></tr><tr><td>خصم {q.discountBps / 100}% · Discount</td><td /><td /><td dir="ltr">− {money(q.discountCents)}</td></tr></>}
        <tr className="cdoc-total"><td>الإجمالي لمدة العقد · Total</td><td /><td /><td dir="ltr">USD {money(q.totalCents)}</td></tr></tbody></table>
    <p className="cinv-words">المبلغ كتابةً: {q.words}</p>
    <section className="cinv-pay"><h2>الدفعات · Payment plan</h2>
      <p>{q.plan[0] / 100}% عند توقيع العقد وقبل بدء العمل · {q.plan[1] / 100}% في منتصف المدة · {q.plan[2] / 100}% عند نهاية المدة.</p>
      <p lang="en" dir="ltr" className="cinv-en">{q.plan[0] / 100}% on signing, before work starts · {q.plan[1] / 100}% at the midpoint · {q.plan[2] / 100}% at the end.</p>
      <p className="cinv-small">الأسعار بالدولار الأميركي ولا تشمل الضرائب والرسوم النظامية. بعد الموافقة على العرض نرسل العقد لتوقيعه من قبل شركتكم. · Prices in US dollars, excluding taxes. After you accept, we send the contract for your company to sign.</p></section>
  </article>;
}

const date = (s: string | null) => s ?? "—";
export function InvoiceDocument({ inv }: { inv: InvoiceDoc }) {
  const p = inv.party, dash = (s: string) => s.trim() || "—";
  return <article className="cdoc cinv" lang="ar" dir="rtl">
    <header className="cinv-head">
      <div><Logo tone="dark" width={110} /><p className="cinv-from"><strong>{p.legalName}</strong><br />{p.address && <>{p.address}<br /></>}{p.phone && <bdi dir="ltr">{p.phone}</bdi>}{p.phone && p.email && " · "}{p.email && <bdi dir="ltr">{p.email}</bdi>}{p.taxNumber && <><br />الرقم الضريبي: <bdi dir="ltr">{p.taxNumber}</bdi></>}</p></div>
      <div className="cinv-title"><h1>فاتورة <span lang="en" dir="ltr">INVOICE</span></h1>
        <table className="cinv-meta"><tbody>
          <tr><th>رقم الفاتورة · Invoice no.</th><td dir="ltr">{inv.reference}</td></tr>
          <tr><th>العقد · Contract</th><td dir="ltr">{inv.contractRef}</td></tr>
          <tr><th>تاريخ الإصدار · Issued</th><td dir="ltr">{inv.issued}</td></tr>
          <tr><th>تاريخ الاستحقاق · Due</th><td dir="ltr">{inv.due}</td></tr>
        </tbody></table></div>
    </header>
    {inv.status === "paid" && <p className="cinv-paid">مدفوعة · PAID <bdi dir="ltr">{date(inv.paidAt)}</bdi></p>}
    {inv.status === "void" && <p className="cinv-paid cinv-void">ملغاة · VOID</p>}
    <section className="cinv-to"><h2>فاتورة إلى · Bill to</h2>
      <p><strong>{inv.billTo.name}</strong><br />{inv.billTo.contact} · <bdi dir="ltr">{inv.billTo.email}</bdi>{inv.billTo.phone && <> · <bdi dir="ltr">{inv.billTo.phone}</bdi></>}<br />{dash(inv.billTo.address)}
        {inv.billTo.registry && <><br />السجل التجاري: <bdi dir="ltr">{inv.billTo.registry}</bdi></>}{inv.billTo.taxNumber && <><br />الرقم الضريبي: <bdi dir="ltr">{inv.billTo.taxNumber}</bdi></>}</p></section>
    <table className="cdoc-table cinv-lines"><thead><tr><th scope="col">#</th><th scope="col">البيان · Description</th><th scope="col">المبلغ (دولار) · Amount (USD)</th></tr></thead>
      <tbody><tr><td>1</td><td>{inv.line.ar}<br /><span lang="en" dir="ltr" className="cinv-en">{inv.line.en}</span></td><td dir="ltr">{money(inv.amountCents)}</td></tr>
        <tr className="cdoc-total"><td /><td>الإجمالي المستحق · Total due</td><td dir="ltr">USD {money(inv.amountCents)}</td></tr></tbody></table>
    <p className="cinv-words">المبلغ كتابةً: {inv.words}</p>
    <p className="cinv-small">قيمة العقد الإجمالية: <bdi dir="ltr">USD {money(inv.contractTotalCents)}</bdi>. البدل لا يشمل الضرائب والرسوم النظامية، وتُعالَج وفق القوانين النافذة (المادة الثامنة من العقد).</p>
    <section className="cinv-pay"><h2>طريقة السداد · Payment</h2>
      <p>يُسدَّد المبلغ بالدولار الأميركي خلال {inv.paymentTermsDays} يوماً من تاريخ الإصدار عبر القنوات المصرفية النظامية، مع ذكر رقم الفاتورة في بيان التحويل.</p>
      <p lang="en" dir="ltr" className="cinv-en">Payable in US dollars within {inv.paymentTermsDays} days of issue by bank transfer, quoting the invoice number.</p>
      {p.bank.trim() && <p className="cinv-bank">{p.bank}</p>}</section>
  </article>;
}

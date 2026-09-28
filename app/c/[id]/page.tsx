import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument, InvoiceDocument, QuoteDocument } from "@/components/ContractDocuments";
import { PrintButton } from "@/components/PrintButton";
import { QuoteDecision } from "@/components/QuoteDecision";
import { contractDocument, invoiceDocument, quoteDocument } from "@/lib/contract-docs";
import { validContractKey } from "@/lib/contract-link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "عرض السعر والعقد · Quotation and contract", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Public, read-only except for the quotation answer: the client opens it from the link in their email.
// The link carries an HMAC of the contract id (lib/contract-link.ts); anything else is a plain 404.
//   quote_sent      -> the quotation, with Accept / Decline
//   quote_accepted  -> the quotation, accepted; the contract follows
//   contract_sent.. -> the contract to sign, the quotation, and the issued invoices
const QUOTE = ["quote_sent", "quote_accepted"], CONTRACT = ["contract_sent", "signed", "active", "completed"];
export default async function ClientContract({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string; invoice?: string; view?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  if (!validContractKey(id, q.k)) notFound();
  const x = await contractDocument(id);
  if (!x) notFound();
  const status = x.detail.contract.status as string;
  if (!QUOTE.includes(status) && !CONTRACT.includes(status)) notFound();
  const issued = CONTRACT.includes(status) ? x.detail.invoices.filter(i => ["sent", "overdue", "paid"].includes(i.status)) : [];
  if (q.invoice && !issued.some(i => i.id === q.invoice)) notFound();
  const showQuote = QUOTE.includes(status) || q.view === "quote";
  const [inv, quote] = await Promise.all([q.invoice ? invoiceDocument(id, q.invoice) : null, showQuote && !q.invoice ? quoteDocument(id) : null]);
  const href = (extra = "") => `/c/${id}?k=${encodeURIComponent(q.k!)}${extra}`;
  return <div className="print-doc" lang="ar" dir="rtl">
    <nav className="no-print row" aria-label="المستندات · Documents" style={{ margin: "0 0 16px", justifyContent: "space-between" }}>
      <div className="row">
        <a className="btn btn-small" aria-current={quote ? "page" : undefined} href={href("&view=quote")}>عرض السعر · Quotation</a>
        {CONTRACT.includes(status) && <a className="btn btn-small" aria-current={!quote && !inv ? "page" : undefined} href={href()}>العقد · Contract</a>}
        {issued.map(i => <a key={i.id} className="btn btn-small" aria-current={inv?.reference === i.reference ? "page" : undefined} href={href(`&invoice=${i.id}`)}><bdi dir="ltr">{i.reference}</bdi></a>)}
      </div>
      <PrintButton label="طباعة / حفظ PDF · Print" />
    </nav>
    {status === "quote_accepted" && <p className="success no-print" role="status" style={{ maxWidth: 820, margin: "0 auto 12px" }}>تمت الموافقة على العرض، وسنرسل إليكم العقد للتوقيع قريبًا. · You accepted this quotation; the contract to sign follows shortly.</p>}
    {inv ? <InvoiceDocument inv={inv} /> : quote ? <QuoteDocument q={quote} /> : <ContractDocument doc={x.doc} />}
    {status === "quote_sent" && quote && <QuoteDecision id={id} k={q.k!} />}
  </div>;
}

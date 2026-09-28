import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument, InvoiceDocument } from "@/components/ContractDocuments";
import { PrintButton } from "@/components/PrintButton";
import { contractDocument, invoiceDocument } from "@/lib/contract-docs";
import { validContractKey } from "@/lib/contract-link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "العقد والفواتير · Contract", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Public, read-only: the client opens the contract and its issued invoices from the link in their email.
// The link carries an HMAC of the contract id (lib/contract-link.ts); anything else is a plain 404.
// Only contracts that were sent to the client are shown, and only invoices that were issued.
const SHOWN = ["contract_sent", "signed", "active", "completed"];
export default async function ClientContract({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string; invoice?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  if (!validContractKey(id, q.k)) notFound();
  const x = await contractDocument(id);
  if (!x || !SHOWN.includes(x.detail.contract.status)) notFound();
  const issued = x.detail.invoices.filter(i => ["sent", "overdue", "paid"].includes(i.status));
  if (q.invoice && !issued.some(i => i.id === q.invoice)) notFound();
  const inv = q.invoice ? await invoiceDocument(id, q.invoice) : null;
  const href = (invoice?: string) => `/c/${id}?k=${encodeURIComponent(q.k!)}${invoice ? `&invoice=${invoice}` : ""}`;
  return <div className="print-doc" lang="ar" dir="rtl">
    <nav className="no-print row" aria-label="المستندات · Documents" style={{ margin: "0 0 16px", justifyContent: "space-between" }}>
      <div className="row">
        <a className="btn btn-small" aria-current={!inv ? "page" : undefined} href={href()}>العقد · Contract</a>
        {issued.map(i => <a key={i.id} className="btn btn-small" aria-current={inv?.reference === i.reference ? "page" : undefined} href={href(i.id)}><bdi dir="ltr">{i.reference}</bdi></a>)}
      </div>
      <PrintButton label="طباعة / حفظ PDF · Print" />
    </nav>
    {inv ? <InvoiceDocument inv={inv} /> : <ContractDocument doc={x.doc} />}
  </div>;
}

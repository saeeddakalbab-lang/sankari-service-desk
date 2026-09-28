import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ContractDocument, InvoiceDocument, QuoteDocument } from "@/components/ContractDocuments";
import { PrintButton } from "@/components/PrintButton";
import { contractDocument, invoiceDocument, quoteDocument } from "@/lib/contract-docs";
import { contractLink } from "@/lib/contract-link";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract", robots: { index: false, follow: false } };

// The contract document built from the selected services, the quotation with ?quote=1, or one invoice
// with ?invoice=<id> (finance only). "Save as PDF" in the print dialog makes the file to send.
export default async function ContractPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invoice?: string; quote?: string }> }) {
  const [{ id }, q, { user, t }] = await Promise.all([params, searchParams, getViewer()]);
  if (!user) redirect("/login");
  const has = (...r: string[]) => r.some(x => user.roles.includes(x as never));
  if (!has("admin", "contracts", "accountant")) redirect("/");
  if (!/^[0-9a-f-]{36}$/.test(id) || (q.invoice && !/^[0-9a-f-]{36}$/.test(q.invoice))) notFound();
  if (q.invoice && !has("admin", "accountant")) redirect(`/admin/contracts/${id}`);
  const inv = q.invoice ? await invoiceDocument(id, q.invoice) : null;
  const quote = !q.invoice && q.quote ? await quoteDocument(id) : null;
  const doc = q.invoice || q.quote ? null : await contractDocument(id);
  if (!inv && !quote && !doc) notFound();
  return <div className="print-doc">
    <div className="no-print row" style={{ margin: "0 0 16px", justifyContent: "space-between" }}>
      <PrintButton label={inv ? t("ct.printInvoice") : t("ct.print")} />
      <span className="soft" style={{ fontSize: 13 }}>{t("doc.clientLink")} <a href={contractLink(id, q.invoice)} target="_blank" rel="noreferrer">{t("doc.open")}</a></span>
    </div>
    {inv ? <InvoiceDocument inv={inv} /> : quote ? <QuoteDocument q={quote} /> : <ContractDocument doc={doc!.doc} />}
  </div>;
}

import type { Metadata } from "next";
import { ContractPartyForm } from "@/components/ContractPartyForm";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getContractParty } from "@/lib/contracts";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract details" };
// Sankari's details and bank as they print on every contract, quotation and invoice.
export default async function ContractSettingsPage() {
  const { user, t } = await getViewer();
  if (!user || !(user.roles.includes("admin") || user.roles.includes("contracts"))) return <ProtectedPage roles={["admin", "contracts"]}><></></ProtectedPage>;
  const party = await getContractParty();
  return <ProtectedPage roles={["admin", "contracts"]}>
    <div className="stack"><div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}><div className="stack-s"><h1>{t("nav.contractDetails")}</h1><p className="soft">{t("cp.lead")}</p></div>
      <a className="btn btn-outline" href="/contract-request" target="_blank" rel="noreferrer">{t("ct.publicLink")}</a></div>
      <ContractPartyForm party={party} /></div>
  </ProtectedPage>;
}

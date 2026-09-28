import type { Metadata } from "next";
import { PriceList } from "@/components/PriceList";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getPricing } from "@/lib/contracts";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract price list" };
// The contract price list (base salary per service, flat cost, multiplier). Admins and the Contracts
// role edit it; each change is audited and applies to new requests only.
export default async function ContractPricesPage() {
  const { user, t } = await getViewer();
  if (!user || !(user.roles.includes("admin") || user.roles.includes("contracts"))) return <ProtectedPage roles={["admin", "contracts"]}><></></ProtectedPage>;
  const pricing = await getPricing();
  return <ProtectedPage roles={["admin", "contracts"]}>
    <div className="stack"><div className="stack-s"><h1>{t("nav.prices")}</h1><p className="soft">{t("pr.lead")}</p></div>
      <PriceList pricing={JSON.parse(JSON.stringify(pricing))} canEdit /></div>
  </ProtectedPage>;
}

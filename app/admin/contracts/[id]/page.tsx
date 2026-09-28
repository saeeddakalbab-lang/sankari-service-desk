import { notFound } from "next/navigation";
import { ContractAdmin } from "@/components/ContractAdmin";
import { ProtectedPage } from "@/components/ProtectedPage";
import { canHandleFinance, canManageContracts, getContract } from "@/lib/contracts";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { user }] = await Promise.all([params, getViewer()]);
  if (!user || !["admin", "contracts", "accountant"].some(r => user.roles.includes(r as never))) return <ProtectedPage roles={["admin", "contracts", "accountant"]}><></></ProtectedPage>;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await getContract(id);
  if (!d) notFound();
  // Contract steps: admin and the Contracts role. Invoices and payments: admin and accountants.
  return <ProtectedPage roles={["admin", "contracts", "accountant"]}><ContractAdmin d={JSON.parse(JSON.stringify(d))} admin={user.roles.includes("admin")} manage={canManageContracts(user)} finance={canHandleFinance(user)} today={new Date().toISOString().slice(0, 10)} /></ProtectedPage>;
}

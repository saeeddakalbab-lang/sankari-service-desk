import { notFound } from "next/navigation";
import { ContractAdmin } from "@/components/ContractAdmin";
import { ProtectedPage } from "@/components/ProtectedPage";
import { getContract } from "@/lib/contracts";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { user }] = await Promise.all([params, getViewer()]);
  if (!user || !(user.roles.includes("admin") || user.roles.includes("accountant"))) return <ProtectedPage roles={["admin", "accountant"]}><></></ProtectedPage>;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await getContract(id);
  if (!d) notFound();
  return <ProtectedPage roles={["admin", "accountant"]}><ContractAdmin d={JSON.parse(JSON.stringify(d))} admin={user.roles.includes("admin")} today={new Date().toISOString().slice(0, 10)} /></ProtectedPage>;
}

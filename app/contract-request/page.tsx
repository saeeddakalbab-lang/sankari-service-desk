import type { Metadata } from "next";
import { ContractRequestForm } from "@/components/ContractRequestForm";
import { getPricing } from "@/lib/contracts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request a contract · Sankari Holding" };
// Public: no sign-in. Clients are not Workspace users.
export default async function ContractRequestPage() {
  return <ContractRequestForm pricing={await getPricing()} minDate={new Date().toISOString().slice(0, 10)} />;
}

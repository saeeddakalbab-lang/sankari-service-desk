import type { Metadata } from "next";
import { ContractRequestForm } from "@/components/ContractRequestForm";
import { getPricing } from "@/lib/contracts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request a contract" };
// Public: no sign-in. Clients are not Workspace users.
export default async function ContractRequestPage() {
  // Only the service names and the working pattern reach the browser: never salaries or prices.
  const p = await getPricing();
  const publicPricing = { ...p, flatCostCents: 0, multiplier: 1, onsitePremiumBps: 0, services: Object.fromEntries(Object.entries(p.services).map(([k, v]) => [k, { label: v.label, baseSalaryCents: 0 }])) };
  return <ContractRequestForm pricing={publicPricing} minDate={new Date().toISOString().slice(0, 10)} />;
}

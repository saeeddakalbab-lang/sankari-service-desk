import type { Metadata } from "next";
import { ProtectedPage } from "@/components/ProtectedPage";
import { ReportsAdmin } from "@/components/ReportsAdmin";
import { query } from "@/lib/db";
import { getReportSettings,periodFor } from "@/lib/reports";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };
// Weekly and monthly reports: IT Infrastructure (helpdesk, email accounts, subscriptions) and Dev (Jira).
export default async function ReportsPage() {
  const { user, t } = await getViewer();
  if (!user?.roles.includes("admin")) return <ProtectedPage roles={["admin"]}><></></ProtectedPage>;
  const [settings, people] = await Promise.all([getReportSettings(), query<{ id: string; name: string; email: string }>(`SELECT id,name,email FROM users WHERE disabled_at IS NULL ORDER BY name`)]);
  return <ProtectedPage roles={["admin"]}>
    <div className="stack"><div className="stack-s"><h1>{t("rp.title")}</h1><p className="soft">{t("rp.lead")}</p></div>
      <ReportsAdmin settings={settings} people={people.rows} periods={{ weekly: periodFor("weekly").label, monthly: periodFor("monthly").label }} /></div>
  </ProtectedPage>;
}

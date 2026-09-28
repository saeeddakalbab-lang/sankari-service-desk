import { ProtectedPage } from "@/components/ProtectedPage";
import { SubscriptionsView } from "@/components/SubscriptionsView";
import { query } from "@/lib/db";
import { billableRequests, listSubscriptions } from "@/lib/subscriptions";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export default async function SubscriptionsPage() {
  const { user, t } = await getViewer();
  if (!user) return <ProtectedPage><></></ProtectedPage>;
  const admin = user.roles.includes("admin");
  const [rows, requests, people] = await Promise.all([listSubscriptions(user), admin ? billableRequests() : [], admin ? query<{ id: string; name: string }>(`SELECT id,name FROM users WHERE disabled_at IS NULL ORDER BY name`).then(r => r.rows) : []]);
  return <ProtectedPage>
    <div className="stack">
      <div className="stack-s"><h1>{t("subs.title")}</h1><p className="soft">{t(admin ? "subs.leadAdmin" : "subs.leadOwner")}</p></div>
      <SubscriptionsView rows={JSON.parse(JSON.stringify(rows))} admin={admin} selfId={user.id} requests={requests} people={people} />
    </div>
  </ProtectedPage>;
}

import { AdminSettings } from "@/components/AdminSettings";
import { ProtectedPage } from "@/components/ProtectedPage";
import { approvalsEnabled } from "@/lib/approvals";
import { query } from "@/lib/db";
import { getRules } from "@/lib/rules";
import { getAppearance,getEmailDomains } from "@/lib/settings";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
export default async function AdminSettingsPage(){
  const {user}=await getViewer();
  if(!user?.roles.includes("admin"))return <ProtectedPage roles={["admin"]}><></></ProtectedPage>;
  const [appearance,domains,rules,users,approvals]=await Promise.all([getAppearance(),getEmailDomains(),getRules(),query(`SELECT id,name,email,roles,manager_user_id,disabled_at,invited_at,email_verified FROM users ORDER BY name`),approvalsEnabled()]);
  const mailConfigured=!!(process.env.SMTP_HOST&&process.env.SMTP_USER);
  return <ProtectedPage roles={["admin"]}><AdminSettings accent={appearance.accentHex} defaultTheme={appearance.defaultTheme} domains={domains.domains} defaultDomain={domains.default} users={JSON.parse(JSON.stringify(users.rows))} approvalsOn={approvals} mailConfigured={mailConfigured} selfId={user.id} rules={rules}/></ProtectedPage>;
}

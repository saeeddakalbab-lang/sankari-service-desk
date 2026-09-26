import { notFound } from "next/navigation";
import { ProtectedPage } from "@/components/ProtectedPage";
import { RequestForm,type FormKind } from "@/components/RequestForm";
import { getRules,needsApprovalUnder } from "@/lib/rules";
import { getEmailDomains,getUsdToAedRate } from "@/lib/settings";
import { getViewer } from "@/lib/view";

export const dynamic="force-dynamic";
const KINDS:FormKind[]=["helpdesk","email","subscription"];

export default async function NewRequestForm({params}:{params:Promise<{kind:string}>}){
  const {kind}=await params;
  if(!KINDS.includes(kind as FormKind))notFound();
  const [{user},domains,rate,rules]=await Promise.all([getViewer(),getEmailDomains(),getUsdToAedRate(),getRules()]);
  const type={helpdesk:"helpdesk_ticket",email:"email_account_request",subscription:"subscription_approval"}[kind as FormKind];
  return <ProtectedPage><RequestForm kind={kind as FormKind} userName={user?.name||""} domains={domains.domains} defaultDomain={domains.default} rate={rate} slaHours={rules.slaHours} needsApproval={needsApprovalUnder(rules,type as never)}/></ProtectedPage>;
}

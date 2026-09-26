import Link from "next/link";
import { IconMail,IconRenew,IconWrench } from "./Icons";
import type { T } from "@/lib/i18n";

// Each card names its approval path, so the cost of a request is visible before starting it.
export function StartCards({t,approvalTypes}:{t:T;approvalTypes:readonly string[]}){
  const direct=(type:string)=>!approvalTypes.includes(type);
  const cards=[
    {href:"/requests/new/helpdesk",title:t("type.helpdesk_ticket"),desc:t("card.helpdesk"),path:t("path.direct"),direct:true,icon:<IconWrench size={20}/>},
    {href:"/requests/new/email",title:t("type.email_account_request"),desc:t("card.email"),path:direct("email_account_request")?t("path.direct"):t("path.chain"),direct:direct("email_account_request"),icon:<IconMail size={20}/>},
    {href:"/requests/new/subscription",title:t("type.subscription_approval"),desc:t("card.subscription"),path:direct("subscription_approval")?t("path.direct"):t("path.chain"),direct:direct("subscription_approval"),icon:<IconRenew size={20}/>},
  ];
  return <div className="grid-3">{cards.map(c=><Link key={c.href} href={c.href} className="start-card">
    <span className={`start-icon${c.direct?" info":""}`} aria-hidden="true">{c.icon}</span>
    <span style={{fontWeight:600,fontSize:16}}>{c.title}</span>
    <span className="desc">{c.desc}</span>
    <span className={`path${c.direct?" direct":""}`}>{c.path}</span>
  </Link>)}</div>;
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useT } from "./I18n";
import { Logo } from "./Logo";
import { TicketToasts } from "./TicketToasts";
import { IconChart,IconCheckSquare,IconClock,IconCode,IconGear,IconGrid,IconList,IconOut,IconPlus,IconQueue,IconReceipt,IconRepeat,IconShield } from "./Icons";
import type { I18nKey } from "@/lib/i18n";
import { OVERSIGHT_ROLES,type Role,type User } from "@/lib/types";

export const initials=(n:string)=>n.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join("").toUpperCase();
const rolePriority:Role[]=["ceo","owner","admin","board","agent","dev","accountant","employee"];

// The menu shows only what this person can use; every page and API still checks the role on the server.
type Group="requests"|"work"|"finance"|"oversight"|"settings";
const GROUPS:Group[]=["requests","work","finance","oversight","settings"];

export function AppShell({user,approvals,ownsSubs=false,children}:{user:User;approvals:{show:boolean;count:number};ownsSubs?:boolean;children:React.ReactNode}){
  const t=useT(),path=usePathname()||"",has=(r:readonly Role[])=>r.some(x=>user.roles.includes(x));
  const items:{href:string;label:string;icon:React.ReactNode;show:boolean;group:Group;badge?:number;match?:(p:string)=>boolean}[]=[
    {href:"/portal",label:t("nav.dashboard"),icon:<IconGrid/>,group:"requests",show:true},
    {href:"/requests/new",label:t("nav.new"),icon:<IconPlus/>,group:"requests",show:true,match:p=>p.startsWith("/requests/new")},
    {href:"/requests",label:t("nav.mine"),icon:<IconList/>,group:"requests",show:true,match:p=>p==="/requests"||(/^\/requests\/[^/]+$/.test(p)&&!p.startsWith("/requests/new"))},
    {href:"/approvals",label:t("nav.approvals"),icon:<IconCheckSquare/>,group:"requests",show:approvals.show,badge:approvals.count},
    {href:"/admin",label:t("nav.queue"),icon:<IconQueue/>,group:"work",show:has(["agent","admin"]),match:p=>p==="/admin"},
    {href:"/subscriptions",label:t("nav.subs"),icon:<IconRepeat/>,group:"work",show:ownsSubs||has(["admin"])},
    {href:"/admin/bills",label:t("nav.bills"),icon:<IconReceipt/>,group:"finance",show:has(["admin","accountant"])},
    {href:"/admin/statements",label:t("nav.statements"),icon:<IconList/>,group:"finance",show:has(["admin","accountant"])},
    {href:"/admin/contracts",label:t("nav.contracts"),icon:<IconCheckSquare/>,group:"finance",show:has(["admin","accountant"]),match:p=>p.startsWith("/admin/contracts")},
    {href:"/admin/ledger",label:t("nav.ledger"),icon:<IconChart/>,group:"finance",show:has(["admin","accountant"])},
    {href:"/oversight",label:t("nav.stuck"),icon:<IconClock/>,group:"oversight",show:has(OVERSIGHT_ROLES)},
    {href:"/dashboard/kpi",label:t("nav.kpi"),icon:<IconChart/>,group:"oversight",show:has(OVERSIGHT_ROLES)},
    {href:"/dashboard/jira",label:t("nav.jira"),icon:<IconCode/>,group:"oversight",show:has(["dev","admin"])},
    {href:"/settings",label:t("nav.settings"),icon:<IconGear/>,group:"settings",show:true},
    {href:"/admin/settings",label:t("nav.admin"),icon:<IconShield/>,group:"settings",show:has(["admin"])},
  ];
  // Groups get a heading only when the person sees more than one of them.
  const shown=GROUPS.filter(g=>g!=="settings"&&items.some(i=>i.show&&i.group===g));
  const mainRole=rolePriority.find(r=>user.roles.includes(r))||"employee";
  return <div className="shell">
    <aside className="side">
      <Link href="/" className="brand" aria-label={`Sankari Holding · ${t("brand.portal")}`}><Logo width={112}/><span className="brand-sub">{t("brand.portal")}</span></Link>
      <nav aria-label={t("nav.main")} className="nav">
        {GROUPS.map(g=>{const list=items.filter(i=>i.show&&i.group===g);if(!list.length)return null;return <div key={g} className="nav-group" role="group" aria-labelledby={shown.length>1?`navg-${g}`:undefined}>
          {shown.length>1&&<span className="nav-head" id={`navg-${g}`}>{t(`navg.${g}` as I18nKey)}</span>}
          {list.map(i=>{const active=i.match?i.match(path):path===i.href;return <Link key={i.href} href={i.href} aria-current={active?"page":undefined}>
            {i.icon}<span className="grow">{i.label}</span>
            {!!i.badge&&<span className="count" aria-label={t("nav.waiting",{n:i.badge})}>{i.badge}</span>}
          </Link>;})}
        </div>;})}
      </nav>
      <div className="side-foot">
        <div className="who"><span className="avatar" aria-hidden="true">{initials(user.name)}</span><div><strong style={{fontSize:14}}>{user.name}</strong><small>{t(`role.${mainRole}` as I18nKey)}</small></div></div>
        <button type="button" className="btn btn-small" style={{justifyContent:"flex-start",color:"var(--ink-soft)"}} onClick={()=>signOut({callbackUrl:"/login"})}><IconOut/>{t("nav.signout")}</button>
      </div>
    </aside>
    <main className="main">{children}</main>
    {has(["agent","admin"])&&<TicketToasts/>}
  </div>;
}

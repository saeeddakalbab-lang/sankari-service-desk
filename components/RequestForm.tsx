"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect,useMemo,useState } from "react";
import { useT } from "./I18n";
import { IconBack,IconBag,IconChat,IconMail,IconWrench } from "./Icons";
import { formatMoney,parseAmountToCents,usdToAedCents } from "@/lib/money";
import type { Priority } from "@/lib/types";

export type FormKind="helpdesk"|"email"|"subscription";
const COMPANIES=["Sankari Holding","Electro Taxi","Five Oceans","Arcaden","Al-Majd Foundation","Domainz","77Auto","Mall of Aleppo","East West","Electro Cafe"];
const TYPE={helpdesk:"helpdesk_ticket",email:"email_account_request",subscription:"subscription_approval"} as const;
type Chain={approvalRequired:boolean;steps:{approverName:string;approverRole:"manager"|"ceo"}[]}|{error:string}|null;
const slug=(name:string)=>name.normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,".").replace(/^\.+|\.+$/g,"").slice(0,64);
const initials=(n:string)=>n.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join("").toUpperCase();

export function RequestForm({kind,userName,domains,defaultDomain,rate,slaHours,needsApproval}:{kind:FormKind;userName:string;domains:string[];defaultDomain:string;rate:string;slaHours:Record<Priority,number>;needsApproval:boolean}){
  const t=useT(),router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [priority,setPriority]=useState<Priority>("medium");
  const [fullName,setFullName]=useState(""),[local,setLocal]=useState(""),[localTouched,setLocalTouched]=useState(false),[accountType,setAccountType]=useState("employee");
  const [currency,setCurrency]=useState("USD"),[amount,setAmount]=useState(""),[pay,setPay]=useState("corporate_card");
  const [chain,setChain]=useState<Chain>(null);
  useEffect(()=>{if(!needsApproval)return;let live=true;fetch(`/api/approvals/chain?type=${TYPE[kind]}`).then(async r=>{const d=await r.json();if(live)setChain(r.ok?d:{error:d.error});}).catch(()=>live&&setChain({error:t("err.generic")}));return()=>{live=false};},[kind,t,needsApproval]);
  const cents=useMemo(()=>parseAmountToCents(amount),[amount]);
  const aed=cents===null?null:currency==="USD"?usdToAedCents(cents,rate):cents;
  const emailLocal=localTouched?local:slug(fullName);

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");
    const f=new FormData(e.currentTarget),s=(k:string)=>String(f.get(k)??"").trim();
    let body:Record<string,unknown>;
    if(kind==="helpdesk"){
      body={subject:s("subject"),description:s("description"),priority,details:{category:s("category"),location:s("location"),assetTag:s("assetTag")}};
    }else if(kind==="email"){
      body={subject:`${fullName.trim()} — ${emailLocal}@${s("domain")}`,description:s("notes")||`${s("jobTitle")} · ${accountType}`,priority:"medium",
        details:{employeeName:fullName.trim(),jobTitle:s("jobTitle"),accountType,startDate:s("startDate"),endDate:accountType==="contractor"?s("endDate"):"",emailLocal,domain:s("domain"),groups:s("groups"),mobile:s("mobile"),notes:s("notes")}};
    }else{
      if(cents===null){setError(t("err.amount"));return;}
      body={subject:`${s("service")} — ${s("kind")==="seats"?`+${s("seats")}`:s("seats")} × ${t(`cycle.${s("cycle")}` as never)}`.slice(0,200),description:s("justification"),priority:"medium",
        details:{service:s("service"),kind:s("kind"),seats:s("seats"),billingCycle:s("cycle"),currency,amountCents:Number(cents),paymentMethod:pay,cardLast4:pay==="corporate_card"?s("cardLast4").replace(/\D/g,""):"",businessJustification:s("justification")}};
    }
    setBusy(true);
    try{
      const r=await fetch("/api/requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:TYPE[kind],department:s("department"),company:s("company"),...body})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||t("err.generic"));
      router.push(`/requests/${d.id}`);router.refresh();
    }catch(err){setError(err instanceof Error?err.message:t("err.generic"));setBusy(false);}
  }

  const org=<div className="grid-2">
    <div className="field"><label className="label" htmlFor="department">{t("form.department")}</label><input className="input" id="department" name="department" required maxLength={120} autoComplete="organization-title"/></div>
    <div className="field"><label className="label" htmlFor="company">{t("form.company")}</label><select className="select" id="company" name="company" defaultValue={COMPANIES[0]}>{COMPANIES.map(c=><option key={c}>{c}</option>)}</select></div>
  </div>;

  const title=kind==="helpdesk"?t("hd.title"):kind==="email"?t("em.title"):t("sub.title");
  const lead=kind==="helpdesk"?t("hd.lead"):kind==="email"?t("em.lead"):t("sub.lead");

  return <>
    <header className="stack-s">
      <Link href="/portal" className="back"><span className="flip-rtl" style={{display:"inline-flex"}}><IconBack size={16}/></span>{t("form.back")}</Link>
      <h1>{title}</h1><p className="lead soft">{lead}</p>
    </header>
    <div className="split">
      <form className="card form-card" onSubmit={submit} noValidate={false}>
        {error&&<div className="notice" role="alert">{error}</div>}
        {kind==="helpdesk"&&<>
          {org}
          <div className="grid-2">
            <div className="field"><label className="label" htmlFor="category">{t("hd.category")}</label><select className="select" id="category" name="category" defaultValue="Network & VPN">
              {(["hardware","software","network","access","printing","other"] as const).map(k=><option key={k} value={{hardware:"Hardware",software:"Software",network:"Network & VPN",access:"Access & accounts",printing:"Printing",other:"Other"}[k]}>{t(`hd.cat.${k}`)}</option>)}
            </select></div>
            <div className="field"><label className="label" htmlFor="location">{t("hd.where")}</label><select className="select" id="location" name="location">{(["office","remote","site"] as const).map(k=><option key={k} value={k}>{t(`hd.where.${k}`)}</option>)}</select></div>
          </div>
          <div className="field"><label className="label" htmlFor="subject">{t("hd.subject")}</label><input className="input" id="subject" name="subject" required maxLength={200}/></div>
          <fieldset><legend className="label" style={{marginBottom:8}}>{t("hd.urgency")}</legend>
            <div className="choices grid-4">{(["low","medium","high","urgent"] as const).map(p=><label key={p} className="choice"><input type="radio" name="priority" value={p} checked={priority===p} onChange={()=>setPriority(p)}/><span><span style={{fontWeight:600,fontSize:14}}>{t(`prio.${p}`)}</span><span className="sub">{t(`prio.${p}Hint`)}</span></span></label>)}</div>
          </fieldset>
          <div className="field"><label className="label" htmlFor="description">{t("hd.what")}</label><textarea className="textarea" id="description" name="description" rows={5} required maxLength={12000} aria-describedby="description-hint"/><span id="description-hint" className="hint">{t("hd.whatHint")}</span></div>
          <div className="field" style={{maxWidth:360}}><label className="label" htmlFor="assetTag">{t("hd.asset")} <span className="opt">· {t("form.optional")}</span></label><input className="input mono" id="assetTag" name="assetTag" maxLength={40} aria-describedby="asset-hint"/><span id="asset-hint" className="hint">{t("hd.assetHint")}</span></div>
        </>}

        {kind==="email"&&<>
          <div className="eyebrow">{t("em.person")}</div>
          <div className="grid-2">
            <div className="field"><label className="label" htmlFor="fullName">{t("em.fullName")}</label><input className="input" id="fullName" required maxLength={120} autoComplete="off" value={fullName} onChange={e=>setFullName(e.target.value)}/></div>
            <div className="field"><label className="label" htmlFor="jobTitle">{t("em.jobTitle")}</label><input className="input" id="jobTitle" name="jobTitle" maxLength={120}/></div>
          </div>
          {org}
          <div className="grid-2" style={{alignItems:"end"}}>
            <fieldset><legend className="label" style={{marginBottom:8}}>{t("em.accountType")}</legend>
              <div className="choices grid-2">{(["employee","contractor"] as const).map(a=><label key={a} className="choice compact"><input type="radio" name="accountType" value={a} checked={accountType===a} onChange={()=>setAccountType(a)}/><span style={{fontWeight:600,fontSize:14}}>{t(`em.${a}`)}</span></label>)}</div>
            </fieldset>
            <div className="field"><label className="label" htmlFor="startDate">{t("em.start")}</label><input className="input mono" type="date" id="startDate" name="startDate" required/></div>
          </div>
          {accountType==="contractor"&&<div className="field" style={{maxWidth:280}}><label className="label" htmlFor="endDate">{t("em.end")}</label><input className="input mono" type="date" id="endDate" name="endDate" required aria-describedby="end-hint"/><span id="end-hint" className="hint">{t("em.endHint")}</span></div>}
          <div className="field"><label className="label" htmlFor="emailLocal">{t("em.address")}</label>
            <div className="joined" dir="ltr">
              <input className="input mono" id="emailLocal" value={emailLocal} onChange={e=>{setLocalTouched(true);setLocal(e.target.value.toLowerCase());}} required pattern="[a-z0-9]([a-z0-9._\-]{0,62}[a-z0-9])?" aria-describedby="addr-hint"/>
              <label className="sr-only" htmlFor="domain">{t("em.domain")}</label>
              <select className="select mono" id="domain" name="domain" defaultValue={defaultDomain}>{domains.map(d=><option key={d} value={d}>@{d}</option>)}</select>
            </div>
            <span id="addr-hint" className="hint">{t("em.addressHint")}</span>
          </div>
          <div className="field"><label className="label" htmlFor="groups">{t("em.groups")} <span className="opt">· {t("form.optional")}</span></label><input className="input mono" dir="ltr" id="groups" name="groups" maxLength={2000} aria-describedby="groups-hint"/><span id="groups-hint" className="hint">{t("em.groupsHint")}</span></div>
          <div className="grid-2">
            <div className="field"><label className="label" htmlFor="mobile">{t("em.mobile")}</label><input className="input mono" dir="ltr" type="tel" id="mobile" name="mobile" required maxLength={30} aria-describedby="mobile-hint"/><span id="mobile-hint" className="hint">{t("em.mobileHint")}</span></div>
            <div className="field"><label className="label" htmlFor="notes">{t("em.notes")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id="notes" name="notes" maxLength={2000}/></div>
          </div>
        </>}

        {kind==="subscription"&&<>
          {org}
          <div className="grid-2">
            <div className="field"><label className="label" htmlFor="service">{t("sub.tool")}</label><input className="input" id="service" name="service" required maxLength={120}/></div>
            <div className="field"><label className="label" htmlFor="kind">{t("sub.kind")}</label><select className="select" id="kind" name="kind">{(["new","renewal","seats"] as const).map(k=><option key={k} value={k}>{t(`sub.kind.${k}`)}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="seats">{t("sub.seats")}</label><input className="input mono" type="number" min={1} max={100000} id="seats" name="seats" required defaultValue={1}/></div>
            <div className="field"><label className="label" htmlFor="cycle">{t("sub.cycle")}</label><select className="select" id="cycle" name="cycle">{(["annual","monthly","quarterly"] as const).map(c=><option key={c} value={c}>{t(`cycle.${c}`)}</option>)}</select></div>
          </div>
          <fieldset className="stack-s"><legend className="label" style={{marginBottom:6}}>{t("sub.cost")}</legend>
            <div className="row" style={{alignItems:"stretch"}} dir="ltr">
              <label className="sr-only" htmlFor="currency">{t("sub.currency")}</label>
              <select className="select mono" id="currency" style={{width:96}} value={currency} onChange={e=>setCurrency(e.target.value)}><option>USD</option><option>AED</option></select>
              <label className="sr-only" htmlFor="amount">{t("sub.amount")}</label>
              <input className="input mono" id="amount" inputMode="decimal" required style={{width:200,textAlign:"right"}} value={amount} onChange={e=>setAmount(e.target.value)} aria-invalid={amount!==""&&cents===null} aria-describedby="aed-live rate-hint"/>
              <div id="aed-live" className="live-aed" aria-live="polite"><span style={{fontSize:13}}>≈</span><span>{aed===null?"AED —":formatMoney(aed,"AED")}</span></div>
            </div>
            <span id="rate-hint" className="hint">{t("sub.rate",{rate})}</span>
          </fieldset>
          <div className="grid-2">
            <div className="field"><label className="label" htmlFor="pay">{t("sub.pay")}</label><select className="select" id="pay" value={pay} onChange={e=>setPay(e.target.value)}><option value="corporate_card">{t("pay.card")}</option><option value="bank_transfer">{t("pay.transfer")}</option><option value="online_payment">{t("pay.online")}</option></select></div>
            {pay==="corporate_card"&&<div className="field"><label className="label" htmlFor="cardLast4">{t("sub.card")}</label>
              <div className="row" dir="ltr"><span className="mono muted" aria-hidden="true">••••</span><input className="input mono" id="cardLast4" name="cardLast4" inputMode="numeric" maxLength={4} pattern="\d{4}" required autoComplete="off" style={{width:96}} aria-describedby="card-hint"/></div>
              <span id="card-hint" className="hint">{t("sub.cardHint")}</span></div>}
          </div>
          <div className="field"><label className="label" htmlFor="justification">{t("sub.why")}</label><textarea className="textarea" id="justification" name="justification" rows={4} required maxLength={12000} aria-describedby="why-hint"/><span id="why-hint" className="hint">{t("sub.whyHint")}</span></div>
        </>}

        <div className="form-foot">
          <Link href="/portal" className="btn">{t("form.cancel")}</Link>
          <button type="submit" className="btn btn-primary" disabled={busy||(needsApproval&&!!chain&&"error" in chain)}>{busy?t("form.sending"):needsApproval?t("sub.submit"):t("hd.send")}</button>
        </div>
      </form>

      <aside className="card card-pad stack" aria-labelledby="side-h">
        {needsApproval?<>
          <div className="stack-s"><h2 id="side-h">{t("who.title")}</h2><p className="soft" style={{fontSize:14}}>{t("who.lead")}</p></div>
          {chain===null?<p className="soft">{t("who.loading")}</p>:"error" in chain?<div className="notice" role="alert">{chain.error}</div>:
          <ol className="al-list">
            <li><div className="rail"><span className="al-node origin" aria-hidden="true">{initials(userName)}</span><span className="connector"/></div><div className="body"><span className="al-kicker">{t("who.you")}</span><span className="al-name">{userName}</span><span className="hint">{t("who.requester")}</span></div></li>
            {chain.steps.map((s,i)=><li key={i}><div className="rail"><span className="al-node waiting" aria-hidden="true">{i+1}</span><span className="connector"/></div><div className="body"><span className="al-kicker">{t("who.step",{n:i+1,role:t(s.approverRole==="ceo"?"role.ceo":"role.manager")})}</span><span className="al-name">{s.approverName}</span></div></li>)}
            <li><div className="rail"><span className="al-node waiting square" aria-hidden="true"><IconBag size={14}/></span></div><div className="body"><span className="al-kicker">{t("who.then")}</span><span className="al-name">{t("who.itProc")}</span><span className="hint">{t("who.itProcBody")}</span></div></li>
          </ol>}
          {chain&&!("error" in chain)&&!chain.approvalRequired&&<p className="note">{t("who.off")}</p>}
          <p className="note">{t("who.note")}</p>
        </>:<>
          <div className="stack-s"><h2 id="side-h">{t("next.title")}</h2><p className="soft" style={{fontSize:14}}>{t("next.direct")}</p></div>
          <ol className="al-list">
            <li><div className="rail"><span className="al-node origin" aria-hidden="true">{initials(userName)}</span><span className="connector"/></div><div className="body"><span className="al-kicker">{t("next.youSend")}</span><span className="al-name">{userName}</span></div></li>
            <li><div className="rail"><span className="al-node waiting square" aria-hidden="true">{kind==="email"?<IconMail size={14}/>:<IconWrench size={14}/>}</span>{kind==="email"&&<span className="connector"/>}</div><div className="body"><span className="al-kicker">{t("next.straightTo")}</span><span className="al-name">{t("next.itDesk")}</span><span className="hint">{kind==="email"?t("em.nextBody"):t("next.hdBody")}</span></div></li>
            {kind==="email"&&<li><div className="rail"><span className="al-node waiting square" aria-hidden="true"><IconChat size={14}/></span></div><div className="body"><span className="al-kicker">{t("em.handover")}</span><span className="al-name">{t("em.handoverTitle")}</span><span className="hint">{t("em.handoverBody")}</span></div></li>}
          </ol>
          {kind==="helpdesk"?<div className="stack-s" style={{paddingTop:16,borderTop:"1px solid var(--line)"}}>
            <div style={{fontWeight:600,fontSize:14}}>{t("next.sla")}</div>
            <table className="table" style={{fontSize:14}}><tbody>{(["urgent","high","medium","low"] as const).map(p=><tr key={p} style={p===priority?{background:"var(--accent-soft)",color:"var(--accent-ink)"}:undefined}><th scope="row" style={{border:0,padding:"6px 8px",color:"inherit",fontWeight:p===priority?600:500}}>{t(`prio.${p}`)}{p===priority?` · ${t("next.selected")}`:""}</th><td className="num" style={{border:0,padding:"6px 8px"}}>{slaHours[p]} h</td></tr>)}</tbody></table>
          </div>:<div className="row" style={{justifyContent:"space-between",padding:"12px 0",borderTop:"1px solid var(--line)",borderBottom:"1px solid var(--line)",fontSize:14}}><span className="soft">{t("em.cost")}</span><strong>{t("em.none")}</strong></div>}
          <p className="note">{kind==="email"?t("em.note"):t("next.hdNote")}</p>
        </>}
      </aside>
    </div>
  </>;
}

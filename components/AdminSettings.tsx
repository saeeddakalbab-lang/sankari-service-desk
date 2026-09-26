"use client";
import { useRouter } from "next/navigation";
import { useMemo,useState } from "react";
import { useT } from "./I18n";
import { IconX } from "./Icons";
import { checkAccent,ratioLabel } from "@/lib/color";
import type { I18nKey } from "@/lib/i18n";
import type { Rules } from "@/lib/rules";
import type { Role,Theme } from "@/lib/types";

type U={id:string;name:string;email:string;roles:Role[];manager_user_id:string|null;disabled_at:string|null;invited_at?:string|null;email_verified?:string|null};
const TYPES=["employee","manager","ceo","owner","board","admin","agent"] as const;
const PRESETS=[["Terracotta","#B84F27"],["Teal","#1D5F70"],["Green","#20744F"],["Blue","#2C5C8F"]] as const;
const BASIC:Role[]=["employee","manager","agent","admin","dev","accountant"];

async function send(url:string,method:string,body:unknown){const r=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Request failed");return d;}

export function AdminSettings({accent:initialAccent,defaultTheme:initialTheme,domains:initialDomains,defaultDomain:initialDefault,users:initialUsers,approvalsOn:initialApprovals,mailConfigured,selfId,rules:initialRules}:{accent:string;defaultTheme:Theme;domains:string[];defaultDomain:string;users:U[];approvalsOn:boolean;mailConfigured:boolean;selfId:string;rules:Rules}){
  const [rules,setRules]=useState(initialRules);
  const setSla=(p:keyof Rules["slaHours"],v:string)=>setRules({...rules,slaHours:{...rules.slaHours,[p]:Math.max(0,Math.round(Number(v)||0))}});
  const toggleType=(type:Rules["approvalTypes"][number],on:boolean)=>setRules({...rules,approvalTypes:on?[...new Set([...rules.approvalTypes,type])]:rules.approvalTypes.filter(x=>x!==type)});
  const t=useT(),router=useRouter();
  const [msg,setMsg]=useState<{area:string;ok:boolean;text:string}|null>(null);
  const flash=(area:string,ok:boolean,text:string)=>setMsg({area,ok,text});
  const run=async(area:string,fn:()=>Promise<void>)=>{try{await fn();flash(area,true,t("adm.saved"));router.refresh();}catch(e){flash(area,false,e instanceof Error?e.message:String(e));}};
  const Msg=({area}:{area:string})=>msg?.area===area?<div className={msg.ok?"success":"notice"} role={msg.ok?"status":"alert"}>{msg.ok?"":`${t("adm.notSaved")} `}{msg.text}</div>:null;

  // Brand colour: checked live here, and again on the server before it is saved.
  const [accent,setAccent]=useState(initialAccent),[custom,setCustom]=useState(PRESETS.some(p=>p[1]===initialAccent)?"":initialAccent);
  const candidate=custom||accent,check=useMemo(()=>checkAccent(candidate.trim()),[candidate]);
  const [defaultTheme,setDefaultTheme]=useState(initialTheme);
  const [domains,setDomains]=useState(initialDomains),[defaultDomain,setDefaultDomain]=useState(initialDefault),[newDomain,setNewDomain]=useState("");
  const [users,setUsers]=useState(initialUsers),[approvalsOn,setApprovalsOn]=useState(initialApprovals);
  const active=users.filter(u=>!u.disabled_at);
  const holder=(r:Role)=>active.find(u=>u.roles.includes(r));
  const patch=async(u:U,roles:Role[],managerUserId?:string|null)=>{const d=await send("/api/users","PATCH",{id:u.id,roles,...(managerUserId!==undefined?{managerUserId}:{})});setUsers(prev=>prev.map(x=>x.id===u.id?{...x,roles:d.roles,manager_user_id:d.manager_user_id}:x));};
  // Moving a single-holder role: take it off the current holder first, so the one-CEO / one-Owner rule never trips.
  const [pEmail,setPEmail]=useState(""),[pName,setPName]=useState(""),[pType,setPType]=useState<(typeof TYPES)[number]>("employee"),[pManager,setPManager]=useState("");
  const addPerson=()=>run("add",async()=>{const body={email:pEmail,name:pName||undefined,type:pType,managerUserId:pManager||null};
    const post=(b:object)=>fetch("/api/admin/people",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
    let r=await post(body),d=await r.json();
    if(r.status===409&&d.needsConfirm){if(!window.confirm(t("people.confirmMove",{who:d.current})))throw new Error(d.error);r=await post({...body,confirmMove:true});d=await r.json();}
    if(!r.ok)throw new Error(d.error||"Request failed");
    setUsers(prev=>[...prev.map(u=>d.movedFrom&&u.email===d.movedFrom?{...u,roles:u.roles.filter(x=>x!==pType)}:u),{...d.user,disabled_at:null,email_verified:null}]);
    setPEmail("");setPName("");setPType("employee");setPManager("");});
  const gaps=active.filter(u=>!u.manager_user_id&&!u.roles.includes("ceo")&&!u.roles.includes("manager")&&!active.some(x=>x.manager_user_id===u.id));
  const moveSingle=(role:"ceo"|"owner",toId:string)=>run("people",async()=>{const from=holder(role);const target=users.find(u=>u.id===toId);if(from&&from.id!==toId&&!window.confirm(t("people.confirmMoveExisting",{role:t(`role.${role}` as I18nKey),from:from.name,to:target?.name||""})))throw new Error(t("skip.cancel"));if(from&&from.id!==toId)await patch(from,from.roles.filter(r=>r!==role));const to=users.find(u=>u.id===toId);if(to&&!to.roles.includes(role))await patch(to,[...to.roles,role]);});

  return <div className="stack" style={{gap:24}}>
    <header className="stack-s"><h1>{t("adm.title")}</h1><p className="lead soft">{t("adm.lead")}</p></header>
    <div className="grid-2" style={{alignItems:"start",gap:24}}>
      <section className="card card-pad stack" aria-labelledby="brand-h">
        <h2 id="brand-h">{t("adm.brand")}</h2><p className="soft" style={{fontSize:14}}>{t("adm.brandLead")}</p>
        <fieldset><legend className="sr-only">{t("adm.brand")}</legend><div className="choices swatches">
          {PRESETS.map(([name,hex])=><label key={hex} className="choice"><input type="radio" name="accent" checked={!custom&&accent===hex} onChange={()=>{setAccent(hex);setCustom("");}}/><span className="swatch" style={{background:hex}} aria-hidden="true"/><span><span style={{fontWeight:600,fontSize:14}}>{name}</span><span className="sub mono">{ratioLabel(checkAccent(hex).ratio)}:1</span></span></label>)}
        </div></fieldset>
        <div className="field"><label className="label" htmlFor="custom">{t("adm.custom")}</label>
          <div className="row" dir="ltr"><span className="swatch big" style={{background:check.ok||/^#[0-9A-Fa-f]{6}$/.test(candidate)?candidate:"transparent"}} aria-hidden="true"/>
            <input className="input mono" id="custom" style={{width:160}} placeholder="#B84F27" value={custom} onChange={e=>setCustom(e.target.value)} aria-invalid={!!custom&&!check.ok} aria-describedby="custom-check"/>
            <span className="btn" style={{background:/^#[0-9A-Fa-f]{6}$/.test(candidate)?candidate:"var(--line)",color:"#fff",cursor:"default"}} aria-hidden="true">{t("adm.preview")}</span></div>
          <div id="custom-check" aria-live="polite">{custom&&!check.ok&&<div className="notice">{t("adm.notSaved")} {check.reason}</div>}{check.ok&&<span className="hint mono">{ratioLabel(check.ratio)}:1</span>}</div>
        </div>
        <Msg area="brand"/>
        <div><button type="button" className="btn btn-primary" disabled={!check.ok} onClick={()=>run("brand",async()=>{await send("/api/admin/branding","PUT",{accentHex:candidate.trim()});setAccent(candidate.trim().toUpperCase());})}>{t("adm.brandSave")}</button></div>
      </section>

      <div className="stack" style={{gap:24}}>
        <section className="card card-pad stack" aria-labelledby="theme-h">
          <h2 id="theme-h">{t("adm.theme")}</h2><p className="soft" style={{fontSize:14}}>{t("adm.themeLead")}</p>
          <fieldset className="choices"><legend className="sr-only">{t("adm.theme")}</legend>{(["light","dark","system"] as Theme[]).map(v=><label key={v} className="choice compact"><input type="radio" name="defaultTheme" checked={defaultTheme===v} onChange={()=>setDefaultTheme(v)}/><span style={{fontWeight:500}}>{v==="system"?t("adm.themeSystem"):t(v==="light"?"set.light":"set.dark")}</span></label>)}</fieldset>
          <Msg area="theme"/>
          <div><button type="button" className="btn btn-outline" onClick={()=>run("theme",()=>send("/api/admin/branding","PUT",{defaultTheme}))}>{t("adm.themeSave")}</button></div>
        </section>
        <section className="card card-pad stack" aria-labelledby="ap-h">
          <h2 id="ap-h">{t("adm.approvals")}</h2>
          <p className="soft" style={{fontSize:14}}>{approvalsOn?t("adm.approvalsOn"):t("adm.approvalsOff")}</p>
          <Msg area="approvals"/>
          <div className="row"><button type="button" className="btn btn-outline" onClick={()=>run("approvals",async()=>{await send("/api/admin/approvals","PUT",{enabled:!approvalsOn});setApprovalsOn(!approvalsOn);})}>{approvalsOn?t("adm.approvalsTurnOff"):t("adm.approvalsTurnOn")}</button><span className="soft" style={{fontSize:13}}>{t("adm.mail")}: {mailConfigured?t("adm.mailOk"):t("adm.mailOff")}</span></div>
        </section>
      </div>
    </div>

    <section className="card card-pad stack" aria-labelledby="rules-h">
      <div className="stack-s"><h2 id="rules-h">{t("rules.title")}</h2><p className="soft" style={{fontSize:14}}>{t("rules.lead")}</p></div>
      <fieldset className="stack-s"><legend className="label" style={{marginBottom:8}}>{t("rules.sla")}</legend>
        <div className="grid-4">{(["urgent","high","medium","low"] as const).map(p=><div key={p} className="field"><label className="label" htmlFor={`sla-${p}`} style={{fontWeight:500}}>{t(`prio.${p}` as I18nKey)}</label><input className="input mono" id={`sla-${p}`} type="number" min={1} max={2160} value={rules.slaHours[p]} onChange={e=>setSla(p,e.target.value)}/></div>)}</div>
      </fieldset>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="skip-h">{t("rules.skip")}</label><input className="input mono" id="skip-h" type="number" min={1} max={720} value={rules.skipAfterHours} onChange={e=>setRules({...rules,skipAfterHours:Math.round(Number(e.target.value)||0)})}/></div>
        <div className="field"><label className="label" htmlFor="lead-d">{t("rules.renewal")}</label><input className="input mono" id="lead-d" type="number" min={1} max={180} value={rules.renewalLeadDays} onChange={e=>setRules({...rules,renewalLeadDays:Math.round(Number(e.target.value)||0)})}/></div>
      </div>
      <fieldset className="stack-s"><legend className="label" style={{marginBottom:4}}>{t("rules.approvalTypes")}</legend>
        <div className="role-grid">{(["subscription_approval","email_account_request"] as const).map(type=><label key={type}><input type="checkbox" checked={rules.approvalTypes.includes(type)} onChange={e=>toggleType(type,e.target.checked)}/>{t(`type.${type}` as I18nKey)}</label>)}</div>
        <span className="hint">{t("rules.helpdeskNever")}</span>
      </fieldset>
      <fieldset className="stack-s"><legend className="label" style={{marginBottom:4}}>{t("rules.notify")}</legend>
        <div className="stack-s" style={{gap:0}}>{([["toast","rules.toast"],["emailAdminOnTicket","rules.emailTicket"],["emailApprover","rules.emailApprover"]] as const).map(([k,label])=><label key={k} className="row" style={{minHeight:44,fontSize:14}}><input type="checkbox" style={{width:18,height:18,accentColor:"var(--accent)"}} checked={rules.notifications[k]} onChange={e=>setRules({...rules,notifications:{...rules.notifications,[k]:e.target.checked}})}/>{t(label)}</label>)}</div>
      </fieldset>
      <Msg area="rules"/>
      <div><button type="button" className="btn btn-primary" onClick={()=>run("rules",async()=>{setRules(await send("/api/admin/rules","PUT",rules));})}>{t("rules.save")}</button></div>
      <h3 id="dom-h" style={{paddingTop:12,borderTop:"1px solid var(--line)"}}>{t("adm.domains")}</h3><p className="soft" style={{fontSize:14}}>{t("adm.domainsLead")}</p>
      <fieldset className="stack-s"><legend className="sr-only">{t("adm.domainDefault")}</legend>
        {domains.map(d=><div key={d} className="domain-row" dir="ltr"><label className="choice compact" style={{flexGrow:1}}><input type="radio" name="defaultDomain" checked={defaultDomain===d} onChange={()=>setDefaultDomain(d)}/><span className="mono">@{d}</span>{defaultDomain===d&&<span className="pill info">{t("adm.domainDefault")}</span>}</label>
          <button type="button" className="icon-btn" aria-label={t("adm.domainRemove",{d})} disabled={domains.length===1} onClick={()=>{const next=domains.filter(x=>x!==d);setDomains(next);if(defaultDomain===d)setDefaultDomain(next[0]);}}><IconX size={16}/></button></div>)}
      </fieldset>
      <div className="row" dir="ltr"><label className="sr-only" htmlFor="newDomain">{t("adm.domainNew")}</label><input className="input mono" id="newDomain" style={{maxWidth:320}} placeholder="example.com" value={newDomain} onChange={e=>setNewDomain(e.target.value.trim().toLowerCase().replace(/^@/,""))}/><button type="button" className="btn btn-outline" disabled={!newDomain||domains.includes(newDomain)} onClick={()=>{setDomains([...domains,newDomain]);setNewDomain("");}}>{t("adm.domainAdd")}</button></div>
      <Msg area="domains"/>
      <div><button type="button" className="btn btn-primary" onClick={()=>run("domains",async()=>{const d=await send("/api/admin/email-domains","PUT",{domains,default:defaultDomain});setDomains(d.domains);setDefaultDomain(d.default);})}>{t("adm.domainsSave")}</button></div>
    </section>

    <section className="card card-pad stack" aria-labelledby="add-h">
      <div className="stack-s"><h2 id="add-h">{t("people.add")}</h2><p className="soft" style={{fontSize:14}}>{t("people.addLead")}</p></div>
      <div className="grid-4" style={{alignItems:"end"}}>
        <div className="field"><label className="label" htmlFor="p-email">{t("people.email")}</label><input className="input mono" dir="ltr" id="p-email" type="email" autoComplete="off" value={pEmail} onChange={e=>setPEmail(e.target.value.trim().toLowerCase())}/></div>
        <div className="field"><label className="label" htmlFor="p-name">{t("people.name")} <span className="opt">· {t("form.optional")}</span></label><input className="input" id="p-name" value={pName} onChange={e=>setPName(e.target.value)}/></div>
        <div className="field"><label className="label" htmlFor="p-type">{t("people.type")}</label><select className="select" id="p-type" value={pType} onChange={e=>setPType(e.target.value as (typeof TYPES)[number])}>{TYPES.map(x=><option key={x} value={x}>{t(`ptype.${x}` as I18nKey)}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="p-mgr">{t("adm.reportsTo")}</label><select className="select" id="p-mgr" value={pManager} onChange={e=>setPManager(e.target.value)}><option value="">{t("adm.noManager")}</option>{active.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      </div>
      <Msg area="add"/>
      <div><button type="button" className="btn btn-primary" disabled={!pEmail.includes("@")} onClick={addPerson}>{t("people.addBtn")}</button></div>
      <div className="stack-s" style={{paddingTop:12,borderTop:"1px solid var(--line)"}}><h3>{t("people.gaps")}</h3><p className="soft" style={{fontSize:13}}>{t("people.gapsLead")}</p>
        {gaps.length?<ul className="row" style={{listStyle:"none",margin:0,padding:0}}>{gaps.map(g=><li key={g.id} className="pill gold">{g.name} <bdi className="mono" style={{fontWeight:400}}>{g.email}</bdi></li>)}</ul>:<p className="success">{t("people.gapsNone")}</p>}
      </div>
    </section>

    <section className="card card-pad stack" aria-labelledby="people-h">
      <div className="row" style={{justifyContent:"space-between",alignItems:"baseline"}}><h2 id="people-h">{t("adm.people")}</h2><span className="soft" style={{fontSize:13}}>{t("adm.peopleLead")}</span></div>
      <Msg area="people"/>
      <div className="grid-2">
        {(["ceo","owner"] as const).map(role=><div key={role} className="field"><label className="label" htmlFor={`sel-${role}`}>{t(role==="ceo"?"adm.ceo":"adm.owner")} <span className="opt">· {t("adm.exactlyOne")}</span></label>
          <select className="select" id={`sel-${role}`} value={holder(role)?.id||""} onChange={e=>e.target.value?moveSingle(role,e.target.value):run("people",async()=>{const h=holder(role);if(h)await patch(h,h.roles.filter(r=>r!==role));})}><option value="">{t("adm.nobody")}</option>{active.map(u=><option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select>
          <span className="hint">{t(role==="ceo"?"adm.ceoHint":"adm.ownerHint")}</span></div>)}
      </div>
      <fieldset className="stack-s"><legend className="label">{t("adm.board")} <span className="opt">· {t("adm.boardHint")}</span></legend>
        <ul className="row" style={{listStyle:"none",margin:0,padding:0}}>{active.filter(u=>u.roles.includes("board")).map(u=><li key={u.id} className="tag">{u.name}<button type="button" aria-label={t("adm.boardRemove",{who:u.name})} onClick={()=>run("people",()=>patch(u,u.roles.filter(r=>r!=="board")))}><IconX size={14}/></button></li>)}</ul>
        <div className="row"><label className="sr-only" htmlFor="addBoard">{t("adm.boardAdd")}</label><select className="select" id="addBoard" style={{maxWidth:360}} defaultValue="" onChange={e=>{const u=users.find(x=>x.id===e.target.value);e.target.value="";if(u)run("people",()=>patch(u,[...u.roles,"board"]));}}><option value="">{t("adm.boardChoose")}</option>{active.filter(u=>!u.roles.includes("board")).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      </fieldset>
      <h3>{t("adm.roles")}</h3>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t("adm.person")}</th><th scope="col">{t("adm.rolesCol")}</th><th scope="col">{t("adm.reportsTo")}</th><th scope="col"><span className="sr-only">{t("adm.saveRow")}</span></th></tr></thead>
        <tbody>{active.map(u=><PersonRow key={u.id} u={u} users={active} selfId={selfId} t={t} onSave={(roles,m)=>run("people",()=>patch(u,roles,m))}/>)}</tbody>
      </table></div>
    </section>
  </div>;
}

function PersonRow({u,users,selfId,t,onSave}:{u:U;users:U[];selfId:string;t:ReturnType<typeof useT>;onSave:(roles:Role[],manager:string|null)=>void}){
  const [roles,setRoles]=useState<Role[]>(u.roles),[manager,setManager]=useState(u.manager_user_id||"");
  const special=u.roles.filter(r=>!BASIC.includes(r));
  const isManager=users.some(x=>x.manager_user_id===u.id);
  const noApprover=!manager&&!u.roles.includes("ceo")&&!isManager;
  return <tr>
    <td><strong style={{fontWeight:600}}>{u.name}</strong><br/><span className="soft mono" style={{fontSize:12}} dir="ltr">{u.email}</span>{(special.length>0||(u.invited_at&&!u.email_verified))&&<div className="row" style={{marginTop:4}}>{special.map(r=><span key={r} className="pill neutral">{t(`role.${r}` as I18nKey)}</span>)}{u.invited_at&&!u.email_verified&&<span className="pill info">{t("people.invited")}</span>}</div>}</td>
    <td><div className="role-grid">{BASIC.map(r=><label key={r}><input type="checkbox" checked={roles.includes(r)} disabled={r==="employee"||(r==="admin"&&u.id===selfId)} onChange={e=>setRoles(e.target.checked?[...roles,r]:roles.filter(x=>x!==r))}/>{t(`role.${r}` as I18nKey)}</label>)}</div></td>
    <td><label className="sr-only" htmlFor={`m-${u.id}`}>{t("adm.reportsTo")} · {u.name}</label><select className="select" id={`m-${u.id}`} style={{minWidth:220}} value={manager} onChange={e=>setManager(e.target.value)}><option value="">{t("adm.noManager")}</option>{users.filter(x=>x.id!==u.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>{noApprover&&<div className="hint" style={{color:"var(--gold-ink)",marginTop:4}}>{t("adm.noManagerWarn")}</div>}</td>
    <td><button type="button" className="btn btn-outline btn-small" onClick={()=>onSave([...new Set([...roles.filter(r=>BASIC.includes(r)),...u.roles.filter(r=>!BASIC.includes(r))])],manager||null)}>{t("adm.saveRow")}</button></td>
  </tr>;
}

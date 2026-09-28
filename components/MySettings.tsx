"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "./I18n";
import { IconMonitor,IconMoon,IconSun } from "./Icons";
import type { Locale,Theme } from "@/lib/types";

// Saved on the user (not just this browser), so it survives signing out and follows them to other devices.
export function MySettings({theme:initialTheme,locale:initialLocale}:{theme:Theme;locale:Locale}){
  const t=useT(),router=useRouter();
  const [theme,setTheme]=useState(initialTheme),[locale,setLocale]=useState(initialLocale),[msg,setMsg]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setMsg("");setErr("");
    const r=await fetch("/api/me/preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({theme,locale})}),d=await r.json();setBusy(false);
    if(!r.ok)return setErr(d.error);setMsg(t("set.saved"));router.refresh();}
  const themes:[Theme,React.ReactNode,string,string|null][]=[["light",<IconSun key="l"/>,t("set.light"),null],["dark",<IconMoon key="d"/>,t("set.dark"),null],["system",<IconMonitor key="s"/>,t("set.system"),t("set.systemHint")]];
  return <form onSubmit={save} className="stack" style={{gap:28}}>
    <header className="stack-s"><h1>{t("set.title")}</h1><p className="lead soft">{t("set.lead")}</p></header>
    {err&&<div className="notice" role="alert">{err}</div>}
    <div className="grid-2" style={{alignItems:"start",gap:24}}>
      <fieldset className="card card-pad choices"><legend className="sr-only">{t("set.appearance")}</legend><h2 aria-hidden="true">{t("set.appearance")}</h2>
        {themes.map(([v,icon,label,hint])=><label key={v} className="choice"><input type="radio" name="theme" value={v} checked={theme===v} onChange={()=>setTheme(v)}/>{icon}<span><span style={{fontWeight:600}}>{label}</span>{hint&&<span className="sub">{hint}</span>}</span></label>)}
      </fieldset>
      <fieldset className="card card-pad choices"><legend className="sr-only">{t("set.language")}</legend><h2 aria-hidden="true">{t("set.language")}</h2>
        <label className="choice"><input type="radio" name="locale" value="en" checked={locale==="en"} onChange={()=>setLocale("en")}/><span lang="en" style={{fontWeight:600}}>English</span></label>
        <label className="choice" lang="ar" dir="rtl"><input type="radio" name="locale" value="ar" checked={locale==="ar"} onChange={()=>setLocale("ar")}/><span style={{fontWeight:600,fontFamily:"var(--font-arabic)",fontSize:16}}>العربية</span></label>
        <p className="note">{t("set.rtl")}</p>
      </fieldset>
    </div>
    <div className="row" style={{justifyContent:"flex-end"}}>{msg&&<span className="success" role="status">{msg}</span>}<button className="btn btn-primary" disabled={busy}>{t("set.save")}</button></div>
  </form>;
}

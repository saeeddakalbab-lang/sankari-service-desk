"use client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLocale,useT } from "./I18n";
import { Logo } from "./Logo";
import { IconInfo,IconLock,IconMoon,IconSun } from "./Icons";
import type { Theme } from "@/lib/types";

// Before sign-in there is no user to save preferences on, so the choice rides in a cookie until then.
const setCookie=(k:string,v:string)=>{document.cookie=`${k}=${v}; path=/; max-age=31536000; samesite=lax${location.protocol==="https:"?"; secure":""}`;};

export function LoginScreen({domain,denied,theme,next}:{domain:string;denied:boolean;theme:Theme;next?:string|null}){
  const t=useT(),locale=useLocale(),router=useRouter();
  const dark=theme==="dark";
  return <div className="login">
    <section className="login-story" aria-label={t("login.story")}>
      <Logo tone="white" width={150}/>
      <h1>{t("login.story")}</h1>
      <p>{t("login.storyBody")}</p>
      <p className="foot">{t("login.footer")}</p>
    </section>
    <main className="login-main">
      <div className="row" style={{justifyContent:"flex-end",gap:8}}>
        <div role="group" aria-label={t("lang.label")} className="seg">
          <button type="button" aria-pressed={locale==="en"} lang="en" onClick={()=>{setCookie("sk_locale","en");router.refresh();}}>EN</button>
          <button type="button" aria-pressed={locale==="ar"} lang="ar" style={{fontFamily:"var(--font-arabic)"}} onClick={()=>{setCookie("sk_locale","ar");router.refresh();}}>عربي</button>
        </div>
        <button type="button" className="icon-btn" aria-label={dark?t("theme.toLight"):t("theme.toDark")} onClick={()=>{setCookie("sk_theme",dark?"light":"dark");router.refresh();}}>{dark?<IconSun/>:<IconMoon/>}</button>
      </div>
      <section className="card login-box" aria-labelledby="signin-h">
        <h2 id="signin-h">{t("login.title")}</h2>
        <p className="soft">{t("login.body",{domain:`@${domain}`})}</p>
        {denied&&<div className="notice" role="alert">{t("login.denied")}</div>}
        <button type="button" className="btn btn-primary btn-google" onClick={()=>signIn("google",{callbackUrl:next||"/"})}><IconLock size={20}/>{t("login.button")}</button>
        <div className="note row" style={{alignItems:"flex-start",flexWrap:"nowrap"}}><IconInfo size={18}/><span>{t("login.note")}</span></div>
      </section>
    </main>
  </div>;
}

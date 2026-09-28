import { checkAccent } from "./color";
import { query } from "./db";
import type { Theme } from "./types";

export const THEMES:readonly Theme[]=["light","dark","system"];
export const DEFAULT_ACCENT="#B84F27";

export async function getSetting<T>(key:string,fallback:T):Promise<T>{
  try{const r=await query<{value:T}>(`SELECT value FROM settings WHERE key=$1`,[key]);return r.rows[0]?.value??fallback;}catch{return fallback;}
}
export async function getAppearance(){
  const [branding,appearance]=await Promise.all([getSetting<{accentHex?:string}>("branding",{}),getSetting<{defaultTheme?:Theme}>("appearance",{})]);
  const accentHex=branding.accentHex&&checkAccent(branding.accentHex).ok?branding.accentHex:DEFAULT_ACCENT;
  const defaultTheme=THEMES.includes(appearance.defaultTheme as Theme)?appearance.defaultTheme as Theme:"system";
  return {accentHex,defaultTheme};
}
export async function getEmailDomains(){
  const v=await getSetting<{domains?:string[];default?:string}>("email_domains",{});
  const domains=(v.domains||[]).filter(Boolean);
  return {domains:domains.length?domains:["sankari-holding.com"],default:v.default&&domains.includes(v.default)?v.default:domains[0]||"sankari-holding.com"};
}
export async function getUsdToAedRate(){const v=await getSetting<{usdToAedRate?:string}>("currency",{});return /^\d+(\.\d{1,6})?$/.test(v.usdToAedRate||"")?v.usdToAedRate!:"3.6725";}


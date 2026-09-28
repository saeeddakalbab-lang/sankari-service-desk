import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { query } from "@/lib/db";
import { LOCALE_COOKIE,THEME_COOKIE } from "@/lib/prefs";
import { preferencesSchema } from "@/lib/validation";
export const dynamic="force-dynamic";
// Not httpOnly: the sign-in page toggles these before anyone is signed in. They hold only "en"/"ar" and a theme name.
const cookieOpts={path:"/",maxAge:60*60*24*365,sameSite:"lax" as const,httpOnly:false,secure:process.env.NODE_ENV==="production"};
export async function GET(){const auth=await authorize();if(auth.error)return auth.error;const r=await query(`SELECT preferred_theme theme,preferred_locale locale FROM users WHERE id=$1`,[auth.user.id]);return NextResponse.json(r.rows[0]??{theme:null,locale:null});}
// Saved on the user, so it follows them to any device and survives signing out.
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"prefs");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;try{const {theme,locale}=preferencesSchema.parse(await req.json());
  const before=(await query(`SELECT preferred_theme,preferred_locale FROM users WHERE id=$1`,[auth.user.id])).rows[0];
  const r=await query(`UPDATE users SET preferred_theme=coalesce($2,preferred_theme),preferred_locale=coalesce($3,preferred_locale) WHERE id=$1 RETURNING preferred_theme theme,preferred_locale locale`,[auth.user.id,theme??null,locale??null]);
  if(!r.rowCount)return NextResponse.json({error:"User not found"},{status:404});
  await query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'user.preferences',$2,$3,$4)`,[auth.user.id,JSON.stringify(before),JSON.stringify(r.rows[0]),ipHash(req)]);
  const res=NextResponse.json(r.rows[0]);if(theme)res.cookies.set(THEME_COOKIE,theme,cookieOpts);if(locale)res.cookies.set(LOCALE_COOKIE,locale,cookieOpts);return res;}catch(e){return jsonError(e);}}

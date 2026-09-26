import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { transaction } from "@/lib/db";
import { accentPalette,checkAccent,ratioLabel } from "@/lib/color";
import { AppError } from "@/lib/errors";
import { getAppearance } from "@/lib/settings";
import { brandingSchema } from "@/lib/validation";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;const a=await getAppearance();return NextResponse.json({...a,ratio:ratioLabel(checkAccent(a.accentHex).ratio),palette:accentPalette(a.accentHex)});}
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"branding");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{const {accentHex,defaultTheme}=brandingSchema.parse(await req.json());
  // The contrast rule is enforced here, not only in the colour picker.
  if(accentHex){const check=checkAccent(accentHex);if(!check.ok)throw new AppError(check.reason,422);}
  await transaction(async c=>{for(const [key,value] of [["branding",accentHex?{accentHex:accentHex.toUpperCase()}:null],["appearance",defaultTheme?{defaultTheme}:null]] as const){if(!value)continue;
    const before=(await c.query(`SELECT value FROM settings WHERE key=$1 FOR UPDATE`,[key])).rows[0]?.value??null;
    await c.query(`INSERT INTO settings(key,value,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by`,[key,JSON.stringify(value),auth.user.id]);
    await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,$2,$3,$4,$5)`,[auth.user.id,`settings.${key}`,JSON.stringify(before),JSON.stringify(value),ipHash(req)]);}});
  return GET();}catch(e){return jsonError(e);}}

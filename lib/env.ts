import { z } from "zod";

const optionalUrl=z.preprocess(v=>v===""?undefined:v,z.string().url().optional());
const optionalEmail=z.preprocess(v=>v===""?undefined:v,z.string().email().optional());
const envSchema=z.object({
  NODE_ENV:z.enum(["development","test","production"]).default("development"),
  DATABASE_URL:z.string().min(1),NEXTAUTH_URL:optionalUrl,NEXTAUTH_SECRET:z.string().min(24),
  GOOGLE_CLIENT_ID:z.string().min(1),GOOGLE_CLIENT_SECRET:z.string().min(1),GOOGLE_WORKSPACE_DOMAIN:z.string().default("sankari-holding.com"),
  ADMIN_EMAILS:z.string().default(""),BOARD_EMAILS:z.string().default(""),AGENT_EMAILS:z.string().default(""),DEV_EMAILS:z.string().default(""),
  SMTP_HOST:z.string().optional(),SMTP_PORT:z.coerce.number().default(587),SMTP_SECURE:z.string().default("false"),SMTP_USER:z.string().optional(),SMTP_PASS:z.string().optional(),SMTP_FROM:z.string().default("Sankari Platform <it@sankari-holding.com>"),ALERT_EMAIL:optionalEmail,
  JIRA_BASE_URL:optionalUrl,JIRA_SERVICE_EMAIL:optionalEmail,JIRA_API_TOKEN:z.string().optional(),JIRA_PROJECT_KEYS:z.string().default(""),JIRA_ALLOWED_EMAILS:z.string().default(""),JIRA_POLL_MINUTES:z.coerce.number().min(5).default(10),
  RATE_LIMIT_POINTS:z.coerce.number().default(60),RATE_LIMIT_DURATION:z.coerce.number().default(60),AUTH_DEV_BYPASS:z.string().default("false")
});

let cached:z.infer<typeof envSchema>|undefined;
export function env(){
  if(cached)return cached;
  const parsed=envSchema.safeParse(process.env);
  if(!parsed.success)throw new Error("Invalid environment configuration: "+parsed.error.issues.map(i=>i.path.join(".")+" "+i.message).join("; "));
  if(parsed.data.NODE_ENV==="production"&&parsed.data.AUTH_DEV_BYPASS==="true")throw new Error("AUTH_DEV_BYPASS is forbidden in production");
  cached=parsed.data;return cached;
}
export const csv=(value?:string)=>new Set((value||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean));

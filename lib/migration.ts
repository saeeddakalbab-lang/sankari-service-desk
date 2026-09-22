import { z } from "zod";
import type { RequestType } from "./types";

const prioritySchema=z.union([z.string(),z.object({priority:z.string()})]).nullable().optional();
const customFieldSchema=z.object({
  name:z.string(),type:z.string().optional(),value:z.unknown().optional(),
  type_config:z.object({options:z.array(z.object({id:z.string().optional(),name:z.string().optional(),label:z.string().optional(),orderindex:z.number().optional()}).passthrough()).optional()}).passthrough().optional()
}).passthrough();
const taskSchema=z.object({
  id:z.string(),name:z.string().min(1),status:z.union([z.string(),z.object({status:z.string()})]),url:z.string().url().optional(),priority:prioritySchema,
  due_date:z.string().nullable().optional(),date_created:z.string().nullable().optional(),date_closed:z.string().nullable().optional(),description:z.string().nullable().optional(),markdown_description:z.string().nullable().optional(),
  list:z.object({id:z.string(),name:z.string()}).optional(),
  assignees:z.array(z.object({id:z.union([z.string(),z.number()]),username:z.string().nullable().optional(),email:z.string().email().nullable().optional()})).optional(),
  custom_fields:z.array(customFieldSchema).optional()
});

const listTypes:Record<string,RequestType>={"901522165191":"helpdesk_ticket","901522764966":"email_account_request"};
const statusMap:Record<RequestType,Record<string,string>>={
  helpdesk_ticket:{"الطلبات الواردة":"new","قيد التخطيط":"assigned","يوجد عائق":"waiting","جاهز":"resolved","منجز":"closed"},
  email_account_request:{"الطلبات الواردة":"new","قيد التخطيط":"assigned","يوجد عائق":"waiting","جاهز":"provisioned","تم التواصل":"whatsapp_sent","منجز":"closed"},
  subscription_approval:{new:"new","pending manager":"pending_manager","pending finance":"pending_finance",approved:"approved",rejected:"rejected",closed:"closed"}
};

function fieldValue(field:z.infer<typeof customFieldSchema>){
  if(field.value==null)return null;
  if(field.type==="drop_down"){
    const option=(field.type_config?.options||[]).find(o=>o.id===String(field.value)||o.orderindex===Number(field.value));
    return option?.name??option?.label??field.value;
  }
  return field.value;
}
function fields(task:z.infer<typeof taskSchema>){
  const out:Record<string,unknown>={};
  for(const field of task.custom_fields||[]){const key=field.name.trim().toLowerCase();if(key)out[key]=fieldValue(field);}
  return out;
}
const pick=(f:Record<string,unknown>,names:string[])=>{for(const n of names){const value=f[n];if(value!=null&&String(value).trim())return String(value).trim();}return "";};
const iso=(value?:string|null)=>{if(!value)return null;const date=new Date(Number(value));return Number.isNaN(date.valueOf())?null:date.toISOString();};

export function mapClickupTask(raw:unknown,forcedType?:RequestType){
  const parsed=taskSchema.safeParse(raw);
  if(!parsed.success){const sourceId=typeof raw==="object"&&raw!==null&&"id" in raw?String((raw as {id:unknown}).id):null;return {valid:false,warnings:["Invalid ClickUp task shape: "+parsed.error.message],sourceId,target:null};}
  const task=parsed.data,f=fields(task),type=forcedType||listTypes[task.list?.id||""],warnings:string[]=[];
  if(!type){warnings.push("Request type cannot be determined from the ClickUp list");return {valid:false,warnings,sourceId:task.id,target:null};}

  const requesterName=pick(f,["الاسم الكامل","requester name","اسم مقدم الطلب","employee name","اسم الموظف"]);
  const requesterEmail=pick(f,["الايميل الشخصي","requester email","البريد الإلكتروني","email"]);
  const department=pick(f,["القسم","department"]);
  const company=pick(f,["الشركة / المؤسسة","الشركة او الفريق","company","الشركة"]);
  for(const [name,value] of Object.entries({requesterName,requesterEmail,department,company}))if(!value)warnings.push(`${name} is missing; no value was fabricated`);

  const sourceStatus=typeof task.status==="string"?task.status:task.status.status;
  const status=statusMap[type][sourceStatus.trim().toLowerCase()]||statusMap[type][sourceStatus.trim()];
  if(!status)warnings.push(`Unmapped source status: ${sourceStatus}`);
  const created=iso(task.date_created);if(!created)warnings.push("createdAt is missing");
  const sourcePriority=typeof task.priority==="string"?task.priority:task.priority?.priority;
  const customPriority=pick(f,["اولوية","priority"]);
  const priorityAliases:Record<string,string>={normal:"medium","متوسط":"medium","مرن":"low","عالية":"high","عاجل":"urgent"};
  const normalized=(sourcePriority||priorityAliases[customPriority]||customPriority||"medium").toLowerCase();
  const safePriority=(["low","medium","high","urgent"].includes(normalized)?normalized:"medium") as "low"|"medium"|"high"|"urgent";
  if((sourcePriority||customPriority)&&safePriority==="medium"&&!["medium","normal","متوسط"].includes(normalized))warnings.push(`Priority '${sourcePriority||customPriority}' mapped to medium`);

  const target={type,requester_name:requesterName,requester_email:requesterEmail,department,company,subject:task.name,description:task.description||task.markdown_description||task.name,priority:safePriority,status:status||"new",created_at:created,sla_due_at:iso(task.due_date),resolved_at:iso(task.date_closed),closed_at:status==="closed"?iso(task.date_closed):null,details:{clickupCustomFields:f,sourceStatus,sourceAssignees:task.assignees||[]},import_source:"clickup",import_id:task.id,import_url:task.url||null};
  return {valid:warnings.every(w=>!/(missing|cannot|unmapped)/i.test(w)),warnings,sourceId:task.id,target};
}

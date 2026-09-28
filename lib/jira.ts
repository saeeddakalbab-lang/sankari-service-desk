import { query } from "./db";
import { csv } from "./env";
const configured=()=>!!(process.env.JIRA_BASE_URL&&process.env.JIRA_SERVICE_EMAIL&&process.env.JIRA_API_TOKEN);
export const jiraProjects=()=>[...csv(process.env.JIRA_PROJECT_KEYS)].map(k=>k.toUpperCase());
const authHeader=()=>`Basic ${Buffer.from(`${process.env.JIRA_SERVICE_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64")}`;

// Pulls every issue of the configured projects (spaces) and their display names. Read-only against Jira.
export async function syncJira(){if(!configured())return {configured:false,synced:0};const projects=jiraProjects();if(!projects.length)return {configured:true,synced:0};const auth=authHeader();let synced=0;
 // The space names, so the dashboard shows "Electro Taxi" rather than only "ELC". A missing one keeps its key.
 const names:Record<string,string>={};
 for(const project of projects){try{const r=await fetch(`${process.env.JIRA_BASE_URL}/rest/api/3/project/${encodeURIComponent(project)}`,{headers:{Authorization:auth,Accept:"application/json"}});if(r.ok){const p:any=await r.json();if(p?.name)names[project]=String(p.name);}}catch{/* keep the key */}}
 await query(`INSERT INTO system_state(key,value) VALUES('jira_projects',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`,[JSON.stringify(names)]);
 for(const project of projects){let next:string|undefined;do{const body={jql:`project = ${project} ORDER BY updated DESC`,fields:["summary","status","assignee","priority","duedate","updated","resolutiondate"],maxResults:100,...(next?{nextPageToken:next}:{})};const res=await fetch(`${process.env.JIRA_BASE_URL}/rest/api/3/search/jql`,{method:"POST",headers:{Authorization:auth,Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(body)});if(!res.ok)throw new Error(`Jira ${res.status}: ${await res.text()}`);const data:any=await res.json();for(const i of data.issues||[]){const f=i.fields;await query(`INSERT INTO jira_issues(issue_key,project_key,summary,status,status_category,assignee_email,assignee_name,priority,due_date,issue_url,raw,jira_updated_at,synced_at) VALUES($1,$2,$3,$4,$5,lower($6),$7,$8,$9,$10,$11,$12,now()) ON CONFLICT(issue_key) DO UPDATE SET summary=excluded.summary,status=excluded.status,status_category=excluded.status_category,assignee_email=excluded.assignee_email,assignee_name=excluded.assignee_name,priority=excluded.priority,due_date=excluded.due_date,raw=excluded.raw,jira_updated_at=excluded.jira_updated_at,synced_at=now()`,[i.key,project,f.summary,f.status.name,f.status.statusCategory.name,f.assignee?.emailAddress||null,f.assignee?.displayName||null,f.priority?.name||null,f.duedate||null,`${process.env.JIRA_BASE_URL}/browse/${i.key}`,JSON.stringify(i),f.updated]);synced++;}next=data.nextPageToken;}while(next);}
 await query(`INSERT INTO system_state(key,value) VALUES('jira_sync',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`,[JSON.stringify({synced,at:new Date().toISOString()})]);return {configured:true,synced};}

const allowedFor=(email?:string)=>{const allowed=csv(process.env.JIRA_ALLOWED_EMAILS);if(email&&allowed.size&&!allowed.has(email.toLowerCase()))throw new Error("Jira dashboard access is not configured for this account");};
export async function getJiraIssues(email?:string,name?:string){allowedFor(email);const me=!!email;const r=await query(`SELECT issue_key,project_key,summary,status,status_category,assignee_name,priority,to_char(due_date,'YYYY-MM-DD') due_date,issue_url FROM jira_issues ${me?"WHERE assignee_email=lower($1) OR (coalesce($2,'')<>'' AND lower(assignee_name)=lower($2))":""} ORDER BY (status_category='Done'),due_date NULLS LAST,jira_updated_at DESC LIMIT 500`,me?[email,name??""]:[]);return {configured:configured(),projects:jiraProjects(),issues:r.rows};}

// The overview: progress per space, who works in each, and a team ranking. Everything is counted in
// the database, so the page gets totals, not 1,300 issues. An issue is "done" when Jira's status
// category is Done; it was finished at its resolution date (or, for issues synced before that field
// was pulled, its last update). Overdue = not done and past its due date.
export type JiraCounts={total:number;done:number;inProgress:number;todo:number;overdue:number};
export type JiraSpace=JiraCounts&{key:string;name:string;people:number;assignees:(JiraCounts&{name:string;id:string|null})[]};
export type JiraPerson={name:string;id:string;assigned:number;done:number;doneInPeriod:number;open:number;overdue:number;withDue:number;onTime:number;spaces:string[]};
export const DONE=`status_category='Done'`,PROG=`status_category='In Progress'`;
const COUNTS=`count(*)::int total,count(*) FILTER (WHERE ${DONE})::int done,count(*) FILTER (WHERE ${PROG})::int "inProgress",
  count(*) FILTER (WHERE NOT (${DONE}) AND NOT (${PROG}))::int todo,count(*) FILTER (WHERE NOT (${DONE}) AND due_date<current_date)::int overdue`;
// Jira Cloud hides people's email addresses, so a person is their Jira account id (then email, then name).
export const WHO=`coalesce(raw->'fields'->'assignee'->>'accountId',assignee_email,assignee_name)`;
export const COMPLETED=`coalesce(nullif(raw->'fields'->>'resolutiondate','')::timestamptz,jira_updated_at)`;
export async function getJiraOverview(days:number){
  const names=(await query<{value:Record<string,string>}>(`SELECT value FROM system_state WHERE key='jira_projects'`)).rows[0]?.value??{};
  const spaces=(await query<JiraCounts&{key:string;people:number}>(`SELECT project_key key,${COUNTS},count(DISTINCT ${WHO})::int people FROM jira_issues GROUP BY 1`)).rows;
  const people=(await query<JiraCounts&{key:string;name:string;id:string|null}>(`SELECT project_key key,coalesce(max(assignee_name),'') name,${WHO} id,${COUNTS} FROM jira_issues GROUP BY 1,3 ORDER BY 1,count(*) FILTER (WHERE ${DONE}) DESC`)).rows;
  const since=days>0?`AND ${COMPLETED}>=now()-make_interval(days=>$1::int)`:"";
  const team=(await query<JiraPerson>(`SELECT coalesce(max(assignee_name),max(assignee_email),'') name,${WHO} id,count(*)::int assigned,count(*) FILTER (WHERE ${DONE})::int done,
      count(*) FILTER (WHERE ${DONE} ${since})::int "doneInPeriod",count(*) FILTER (WHERE NOT (${DONE}))::int open,
      count(*) FILTER (WHERE NOT (${DONE}) AND due_date<current_date)::int overdue,count(*) FILTER (WHERE ${DONE} AND due_date IS NOT NULL)::int "withDue",
      count(*) FILTER (WHERE ${DONE} AND due_date IS NOT NULL AND ${COMPLETED}::date<=due_date)::int "onTime",array_agg(DISTINCT project_key) spaces
    FROM jira_issues WHERE ${WHO} IS NOT NULL GROUP BY 2`,days>0?[days]:[])).rows;
  // Best first: most finished in the period, then the better on-time rate, then the better completion rate.
  const rate=(a:number,b:number)=>b?a/b:0;
  team.sort((a,b)=>b.doneInPeriod-a.doneInPeriod||rate(b.onTime,b.withDue)-rate(a.onTime,a.withDue)||rate(b.done,b.assigned)-rate(a.done,a.assigned));
  const byKey=new Map(spaces.map(s=>[s.key,s]));
  const keys=[...new Set([...jiraProjects(),...spaces.map(s=>s.key)])];
  const zero:JiraCounts={total:0,done:0,inProgress:0,todo:0,overdue:0};
  const out:JiraSpace[]=keys.map(k=>({...zero,people:0,...byKey.get(k),key:k,name:names[k]||k,assignees:people.filter(p=>p.key===k).map(({key:_,...p})=>p)})).sort((a,b)=>b.total-a.total);
  const sync=(await query<{value:{at?:string;synced?:number}}>(`SELECT value FROM system_state WHERE key='jira_sync'`)).rows[0]?.value??null;
  return {configured:configured(),days,spaces:out,team,syncedAt:sync?.at??null};
}

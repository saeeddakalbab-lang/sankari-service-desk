import { mkdir,writeFile } from "node:fs/promises";
import path from "node:path";

const token=process.env.CLICKUP_API_TOKEN;
if(!token)throw new Error("Set CLICKUP_API_TOKEN");
const lists=[
  {id:process.env.CLICKUP_HELPDESK_LIST_ID||"901522165191",name:"helpdesk"},
  {id:process.env.CLICKUP_EMAIL_LIST_ID||"901522764966",name:"email"}
];
const headers={Authorization:token};
const output=path.resolve(process.env.MIGRATION_INPUT_DIR||"/tmp/sankari-migration/input");
await mkdir(output,{recursive:true});

for(const list of lists){
  const summaries:any[]=[];
  for(let page=0;;page++){
    const response=await fetch(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true&subtasks=true&page=${page}`,{headers});
    if(!response.ok)throw new Error(`ClickUp list ${list.id}: ${response.status} ${await response.text()}`);
    const data:any=await response.json();
    summaries.push(...(data.tasks||[]));
    if(data.last_page===true||(data.tasks||[]).length<100)break;
  }
  const details:any[]=[];
  for(let index=0;index<summaries.length;index+=10){
    const chunk=await Promise.all(summaries.slice(index,index+10).map(async task=>{
      const response=await fetch(`https://api.clickup.com/api/v2/task/${task.id}?include_subtasks=true`,{headers});
      if(!response.ok)throw new Error(`ClickUp task ${task.id}: ${response.status} ${await response.text()}`);
      return response.json();
    }));
    details.push(...chunk);
  }
  await writeFile(path.join(output,`clickup-details-${list.name}.json`),JSON.stringify(details,null,2),{mode:0o600});
  console.log(`${list.name}: exported ${details.length} tasks`);
}

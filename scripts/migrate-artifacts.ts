import { readdir,readFile,mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db";
import { mapClickupTask } from "../lib/migration";

const mode=process.argv[2];
if(!["dry-run","commit"].includes(mode))throw new Error("Use dry-run or commit");
const input=path.resolve(process.env.MIGRATION_INPUT_DIR||"migration-input"),output=path.resolve(process.env.MIGRATION_OUTPUT_DIR||"migration-output");
await mkdir(output,{recursive:true});
function tasks(data:any):any[]{if(Array.isArray(data))return data;if(Array.isArray(data.tasks))return data.tasks;if(Array.isArray(data.results))return data.results;if(data.structuredContent)return tasks(data.structuredContent);return [];}

if(mode==="dry-run"){
  const allFiles=(await readdir(input)).filter(f=>f.endsWith(".json"));
  const details=allFiles.filter(f=>f.includes("details"));
  const files=details.length?details:allFiles.filter(f=>!f.includes("summary"));
  if(!files.length)throw new Error("No migration JSON files found");
  const batch=randomUUID(),seen=new Set<string>();
  const report:any={batch,files:[],totals:{source:0,unique:0,valid:0,flagged:0,duplicates:0},warnings:[]};
  for(const file of files){
    const rows=tasks(JSON.parse(await readFile(path.join(input,file),"utf8")));
    let valid=0,flagged=0,duplicates=0;
    for(const raw of rows){
      const mapped=mapClickupTask(raw);
      if(mapped.sourceId&&seen.has(mapped.sourceId)){duplicates++;continue;}
      if(mapped.sourceId)seen.add(mapped.sourceId);
      await pool.query(`INSERT INTO migration_staging(batch_id,source,source_id,target_data,warnings,valid) VALUES($1,$2,$3,$4,$5,$6)`,[batch,file,mapped.sourceId,JSON.stringify(mapped.target),JSON.stringify(mapped.warnings),mapped.valid]);
      mapped.valid?valid++:flagged++;
      if(mapped.warnings.length)report.warnings.push({file,id:mapped.sourceId,warnings:mapped.warnings});
    }
    report.files.push({file,source:rows.length,valid,flagged,duplicates});
    report.totals.source+=rows.length;report.totals.valid+=valid;report.totals.flagged+=flagged;report.totals.duplicates+=duplicates;
  }
  report.totals.unique=seen.size;
  await writeFile(path.join(output,`migration-${batch}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.totals));
  console.log(`Batch ${batch}. Review ${output} before commit.`);
}else{
  const batch=process.env.MIGRATION_BATCH_ID;
  if(!batch)throw new Error("Set MIGRATION_BATCH_ID to a reviewed dry-run batch");
  const counts=await pool.query(`SELECT count(*)::int source,count(*) FILTER(WHERE valid)::int valid,count(*) FILTER(WHERE NOT valid)::int flagged FROM migration_staging WHERE batch_id=$1`,[batch]);
  if(!counts.rows[0]?.source)throw new Error("Migration batch not found");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const rows=await client.query(`SELECT * FROM migration_staging WHERE batch_id=$1 AND valid AND committed_request_id IS NULL FOR UPDATE`,[batch]);
    for(const row of rows.rows){
      const d=row.target_data;
      const r=await client.query(`INSERT INTO requests(type,requester_name,requester_email,department,company,subject,description,priority,status,created_at,sla_due_at,resolved_at,closed_at,details,import_source,import_id,import_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,$10::timestamptz+interval '72 hours'),$12,$13,$14,$15,$16,$17) ON CONFLICT(import_source,import_id) DO UPDATE SET updated_at=now() RETURNING id`,[d.type,d.requester_name,d.requester_email,d.department,d.company,d.subject,d.description,d.priority,d.status,d.created_at,d.sla_due_at,d.resolved_at,d.closed_at,d.details,d.import_source,d.import_id,d.import_url]);
      await client.query(`UPDATE migration_staging SET committed_request_id=$2 WHERE id=$1`,[row.id,r.rows[0].id]);
    }
    await client.query("COMMIT");
    console.log(`Committed ${rows.rowCount} rows; ${counts.rows[0].flagged} flagged rows remain unimported.`);
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
await pool.end();

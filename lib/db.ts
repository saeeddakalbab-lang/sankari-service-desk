import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalDb=globalThis as typeof globalThis&{__sankariPool?:Pool};
export const pool=globalDb.__sankariPool??new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,ssl:process.env.DATABASE_SSL==="require"?{rejectUnauthorized:true}:undefined});
if(process.env.NODE_ENV!=="production")globalDb.__sankariPool=pool;
export async function query<T extends QueryResultRow=QueryResultRow>(text:string,values:unknown[]=[]){return pool.query<T>(text,values);}
export async function transaction<T>(fn:(client:PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query("BEGIN");const result=await fn(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}

import {pool} from "../lib/db";
if(process.env.NODE_ENV==="production"&&process.env.AUTH_DEV_BYPASS==="true")throw new Error("Development seed is forbidden in production");
if(process.env.AUTH_DEV_BYPASS==="true")await pool.query(`INSERT INTO users(id,email,name,roles) VALUES('00000000-0000-4000-8000-000000000001','dev@sankari-holding.com','Development Admin',ARRAY['employee','agent','admin','board','dev']) ON CONFLICT(id) DO UPDATE SET name=excluded.name,roles=excluded.roles`);
console.log("Seed complete. Production users are created through Google Workspace SSO.");await pool.end();

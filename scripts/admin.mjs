import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import { createStore } from '../server/store.js';
import { hashPassword } from '../server/auth.js';
import { email,str,uid,nowIso } from '../server/domain.js';
if(existsSync('.env'))process.loadEnvFile('.env');
const rl=createInterface({input:stdin,output:stdout});
try{
 const e=email(process.env.ADMIN_EMAIL||await rl.question('Administrator email: '));
 const name=str(process.env.ADMIN_NAME||await rl.question('Administrator name: '),120,true);
 const password=process.env.ADMIN_PASSWORD||await rl.question('Password (12+ characters; visible on this terminal): ');
 const store=createStore();const old=store.db.prepare('SELECT id FROM users WHERE email=?').get(e);
 if(old){store.db.prepare('UPDATE users SET name=?,password=?,is_admin=1,disabled=0 WHERE id=?').run(name,hashPassword(password),old.id);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(old.id);}
 else store.db.prepare('INSERT INTO users VALUES(?,?,?,?,1,0,?)').run(uid(),e,name,hashPassword(password),nowIso());
 store.close();console.log('Administrator saved.');
}finally{rl.close();}

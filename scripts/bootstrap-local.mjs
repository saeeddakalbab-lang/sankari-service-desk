import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createStore } from '../server/store.js';
import { hashPassword } from '../server/auth.js';
import { uid, nowIso } from '../server/domain.js';

if(process.env.NODE_ENV==='production')throw new Error('Local bootstrap is disabled in production.');
const store=createStore(),email='saeed.dakalbab@sankari-holding.com';
try{
  const password=randomBytes(15).toString('base64url');
  const old=store.db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if(old){
    store.db.prepare('UPDATE users SET name=?,password=?,is_admin=1,disabled=0 WHERE id=?').run('Mohamed Saeed Dakalbab (IT)',hashPassword(password),old.id);
    store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(old.id);
  } else {
    store.db.prepare('INSERT INTO users VALUES(?,?,?,?,1,0,?)').run(uid(),email,'Mohamed Saeed Dakalbab (IT)',hashPassword(password),nowIso());
  }
  writeFileSync('LOCAL-ACCESS.txt',`Sankari Service Desk - local access\r\n\r\nHelpdesk: http://localhost:3000/helpdesk\r\nEmail requests: http://localhost:3000/email\r\nEmail: ${email}\r\nPassword: ${password}\r\n\r\nThis file is excluded from Git. Change the password from Your account after signing in.\r\n`,{mode:0o600});
  console.log('Local administrator and LOCAL-ACCESS.txt created.');
} finally { store.close(); }

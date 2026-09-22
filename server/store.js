import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENTS, uid, nowIso, fail } from './domain.js';
export function createStore(dir=process.env.DATA_DIR||'./data'){
  mkdirSync(dir,{recursive:true});mkdirSync(resolve(dir,'uploads'),{recursive:true});
  const db=new DatabaseSync(resolve(dir,'sankari.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,is_admin INTEGER NOT NULL DEFAULT 0,disabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,kind TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),version INTEGER NOT NULL DEFAULT 1,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS requests_owner ON requests(kind,owner_id);
    CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS comments_request ON comments(request_id);
    CREATE TABLE IF NOT EXISTS agents(id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(id,kind));
    CREATE TABLE IF NOT EXISTS settings(kind TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor_id TEXT,request_id TEXT,action TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mail_jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,request_id TEXT,recipient TEXT NOT NULL,subject TEXT NOT NULL,html TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,sent_at TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scheduler(job TEXT PRIMARY KEY,last_slot TEXT,last_run_at TEXT,last_error TEXT);
  `);
  for(const kind of ['helpdesk','email']){
    const seeded=db.prepare('SELECT data FROM settings WHERE kind=?').get(kind);
    if(!seeded){for(const a of AGENTS)db.prepare('INSERT OR IGNORE INTO agents VALUES(?,?,?)').run(a.id,kind,JSON.stringify({...a,addedAt:nowIso()}));db.prepare('INSERT INTO settings VALUES(?,?)').run(kind,JSON.stringify({organization:'Sankari Holding',accent:'#b6602f'}));}
  }
  const audit=(actor,request,action)=>db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(uid(),actor,request,action,nowIso());
  return {db,dir:resolve(dir),audit,
    agents:kind=>db.prepare('SELECT data FROM agents WHERE kind=? ORDER BY rowid').all(kind).map(r=>JSON.parse(r.data)),
    list:(kind,user)=>db.prepare(`SELECT data,version FROM requests WHERE kind=? ${user.isAdmin?'':'AND owner_id=?'} ORDER BY rowid DESC`).all(...(user.isAdmin?[kind]:[kind,user.id])).map(r=>({...JSON.parse(r.data),version:r.version})),
    get(kind,id,user){const r=db.prepare('SELECT * FROM requests WHERE id=? AND kind=?').get(id,kind);if(!r||(!user.isAdmin&&r.owner_id!==user.id))fail('Request not found',404);return {...JSON.parse(r.data),version:r.version};},
    insert(kind,r){db.prepare('INSERT INTO requests(id,kind,owner_id,version,data) VALUES(?,?,?,?,?)').run(r.id,kind,r.requesterUserId,1,JSON.stringify(r));return r;},
    update(kind,r,version){if(!Number.isInteger(version))fail('A record version is required',428);const next={...r,version:version+1};const result=db.prepare('UPDATE requests SET data=?,version=version+1 WHERE id=? AND kind=? AND version=?').run(JSON.stringify(next),r.id,kind,version);if(!result.changes)fail('version_mismatch: another person changed this request. Refresh before retrying.',409);return next;},
    comments:id=>db.prepare('SELECT data FROM comments WHERE request_id=? ORDER BY rowid').all(id).map(r=>JSON.parse(r.data)),
    close:()=>db.close()
  };
}

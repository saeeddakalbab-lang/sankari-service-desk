import { existsSync,mkdirSync,cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync,backup } from 'node:sqlite';
if(existsSync('.env'))process.loadEnvFile('.env');
const dir=resolve(process.env.DATA_DIR||'data'),out=resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(out,{recursive:true});
const db=new DatabaseSync(resolve(dir,'sankari.sqlite'));await backup(db,resolve(out,'sankari.sqlite'));db.close();cpSync(resolve(dir,'uploads'),resolve(out,'uploads'),{recursive:true});console.log('Backup saved: '+out);

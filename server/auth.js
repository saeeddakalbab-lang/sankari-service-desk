import { scryptSync,randomBytes,timingSafeEqual,createHash } from 'node:crypto';
import { fail } from './domain.js';
export function hashPassword(password){if(typeof password!=='string'||password.length<12||password.length>200)fail('Password must have 12–200 characters');const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function verifyPassword(password,stored){const [salt,hash]=stored.split(':');if(typeof password!=='string'||password.length>200)return false;const actual=scryptSync(password,salt,64),expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export const tokenHash=t=>createHash('sha256').update(t).digest('hex');
export const safeUser=u=>({id:u.id,name:u.name,email:u.email,isAdmin:!!u.is_admin});
export function authMiddleware(store){return (req,res,next)=>{const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('sankari_session='))?.slice(16);if(raw){const u=store.db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.disabled=0').get(tokenHash(raw),Date.now());if(u)req.user=safeUser(u);}next();};}
export const requireUser=(req,res,next)=>req.user?next():res.status(401).json({error:'Sign in to continue'});
export const requireAdmin=(req,res,next)=>req.user?.isAdmin?next():res.status(403).json({error:'Administrator access required'});
export const newToken=()=>randomBytes(32).toString('hex');

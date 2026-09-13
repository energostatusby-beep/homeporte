import http from 'node:http';
import {readFileSync, existsSync, mkdirSync, chmodSync, realpathSync, createReadStream, statSync} from 'node:fs';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(ROOT, '.env'))) process.loadEnvFile(resolve(ROOT, '.env'));
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const port = Number(process.env.PORT || 8766);
const host = process.env.HOST || '127.0.0.1';
const origins = new Set((process.env.ALLOWED_ORIGINS || `http://127.0.0.1:${port},http://localhost:${port}`).split(',').map(x => x.trim()).filter(Boolean));
const dataDir = resolve(process.env.DATA_DIR || resolve(ROOT, 'var'));
process.umask(0o077);
mkdirSync(dataDir, {recursive: true, mode: 0o700});
const db = new DatabaseSync(resolve(dataDir, 'leads.sqlite'));
chmodSync(resolve(dataDir, 'leads.sqlite'), 0o600);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS leads (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, digest TEXT NOT NULL,
 payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
 created INTEGER NOT NULL, sent INTEGER, telegram_message_id INTEGER, last_error TEXT);
 CREATE INDEX IF NOT EXISTS due_leads ON leads(status,next_attempt);
 CREATE TABLE IF NOT EXISTS rate_hits (ip TEXT NOT NULL, created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS rate_time ON rate_hits(created);
 CREATE INDEX IF NOT EXISTS rate_ip ON rate_hits(ip,created);`);

// Counters survive retention cleanup and restarts; month is the date of receipt in Minsk.
const columns = db.prepare('PRAGMA table_info(leads)').all().map(c=>c.name);
if (!columns.includes('lead_month')) db.exec('ALTER TABLE leads ADD COLUMN lead_month TEXT');
if (!columns.includes('lead_number')) db.exec('ALTER TABLE leads ADD COLUMN lead_number INTEGER');
db.exec(`CREATE TABLE IF NOT EXISTS lead_counters (month TEXT PRIMARY KEY, last_number INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS lead_month_number ON leads(lead_month,lead_number)`);
export function leadMonth(now) {
 const parts = new Intl.DateTimeFormat('en', {timeZone:'Europe/Minsk',year:'numeric',month:'2-digit'}).formatToParts(new Date(now));
 return parts.find(p=>p.type==='year').value + '-' + parts.find(p=>p.type==='month').value;
}
function allocateNumber(month) {
 return db.prepare('INSERT INTO lead_counters(month,last_number) VALUES(?,1) ON CONFLICT(month) DO UPDATE SET last_number=last_number+1 RETURNING last_number').get(month).last_number;
}
// Already delivered legacy messages stay untouched. Pending leads receive stable numbers.
db.exec('BEGIN IMMEDIATE');
try {
 for (const row of db.prepare("SELECT id,created FROM leads WHERE status='pending' AND lead_number IS NULL ORDER BY created,id").all()) {
  const month=leadMonth(row.created);
  db.prepare('UPDATE leads SET lead_month=?,lead_number=? WHERE id=?').run(month,allocateNumber(month),row.id);
 }
 db.exec('COMMIT');
} catch(e) { db.exec('ROLLBACK'); throw e; }

const hash = value => createHash('sha256').update(value).digest('hex');
export function validate(input) {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Неверный формат заявки.');
 const string = (key, max, required=false) => {
  const value = input[key] ?? '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('Проверьте поля заявки.');
  if (required && !value.trim()) throw new Error('Укажите телефон или Telegram для связи.');
  return value.trim();
 };
 const source = string('source',20,true);
 if (!['quiz','quick'].includes(source)) throw new Error('Неизвестная форма.');
 const contact = string('contact',80,true);
 if (!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(contact) && !(/^\+?[\d\s()\-]+$/.test(contact) && contact.replace(/\D/g,'').length>=7 && contact.replace(/\D/g,'').length<=15)) throw new Error('Введите телефон с кодом страны или Telegram в формате @username.');
 const payload = {source, name:string('name',80), contact, comment:string('comment',1600)};
 if (source==='quiz') {
  for (const [key, values] of Object.entries({item:['Межкомнатные двери','Лофт-перегородка','Шкаф','Кухня','Несколько позиций'],qty:['Одно','2–4','5 и больше','Пока не знаю'],stage:['Только планирую','Черновая отделка','Чистовая отделка','Ремонт завершён']})) {
   payload[key]=string(key,80,true);
   if (!values.includes(payload[key])) throw new Error('Проверьте ответы в квизе.');
  }
 }
 return payload;
}
export function leadText(number,p) {
 return [`Новая заявка HomePorte №${number}`, `Источник: ${p.source==='quiz'?'квиз':'обратный звонок'}`,p.name && `Имя: ${p.name}`,`Контакт: ${p.contact}`,p.item && `Изделие: ${p.item}`,p.qty && `Количество: ${p.qty}`,p.stage && `Этап ремонта: ${p.stage}`,p.comment && `Комментарий: ${p.comment}`].filter(Boolean).join('\n');
}
export function saveLead(requestId,payload,now=Date.now()) {
 const packed=JSON.stringify(payload), digest=hash(packed);
 const existing=db.prepare('SELECT id,digest FROM leads WHERE request_id=?').get(requestId);
 if (existing) {
  if (existing.digest!==digest) return {conflict:true};
  return {id:existing.id,duplicate:true};
 }
 // Suppress the same form retried with a new request ID within ten minutes.
 const recent=db.prepare('SELECT id FROM leads WHERE digest=? AND created>? ORDER BY created DESC LIMIT 1').get(digest,now-600000);
 if(recent)return {id:recent.id,duplicate:true};
 const id=randomUUID();
 db.exec('BEGIN IMMEDIATE');
 try {
  const month=leadMonth(now), number=allocateNumber(month);
  db.prepare('INSERT INTO leads(id,request_id,digest,payload,created,lead_month,lead_number) VALUES(?,?,?,?,?,?,?)').run(id,requestId,digest,packed,now,month,number);
  db.exec('COMMIT');
 } catch(e) { db.exec('ROLLBACK'); throw e; }
 return {id,duplicate:false};
}
const securityHeaders = {
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
 'X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
function json(res,status,data,extra={}) {
 res.writeHead(status,{...securityHeaders,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});
 res.end(JSON.stringify(data));
}
async function body(req) {
 if (Number(req.headers['content-length']||0)>8192) throw new Error('too_large');
 let size=0;const parts=[];
 for await (const chunk of req) {size+=chunk.length;if(size>8192)throw new Error('too_large');parts.push(chunk);}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function rateAllowed(req,now) {
 let ip=req.socket.remoteAddress || 'unknown';
 if(process.env.TRUST_PROXY==='1' && typeof req.headers['x-real-ip']==='string')ip=req.headers['x-real-ip'];
 const key=hash(token+'|'+ip);
 db.prepare('DELETE FROM rate_hits WHERE created<?').run(now-3600000);
 const count=db.prepare('SELECT count(*) AS n FROM rate_hits WHERE ip=?').get(key).n;
 const global=db.prepare('SELECT count(*) AS n FROM rate_hits WHERE created>?').get(now-60000).n;
 if(count>=10 || global>=60)return false;
 db.prepare('INSERT INTO rate_hits(ip,created) VALUES(?,?)').run(key,now);return true;
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
export const server = http.createServer(async (req,res)=>{
 try {
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/api/health' && req.method==='GET')return json(res,200,{ok:true,acceptingLeads:Boolean(token&&chatId)});
  if(pathname==='/api/leads') {
   if(req.method!=='POST')return json(res,405,{error:'Method not allowed'},{Allow:'POST'});
   if(!origins.has(req.headers.origin))return json(res,403,{error:'Отправка с этого адреса запрещена.'});
   if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))return json(res,415,{error:'Неверный формат.'});
   if(!token||!chatId)return json(res,503,{error:'Приём заявок временно недоступен. Позвоните нам или попробуйте позже.'});
   if(!rateAllowed(req,Date.now()))return json(res,429,{error:'Слишком много попыток. Попробуйте позже или позвоните.'},{'Retry-After':'3600'});
   let input;
   try {input=await body(req);}catch(e){return json(res,e.message==='too_large'?413:400,{error:'Не удалось прочитать заявку.'});}
   if(input?.website)return json(res,400,{error:'Не удалось отправить заявку.'});
   if(typeof input?.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId))return json(res,400,{error:'Обновите страницу и повторите отправку.'});
   let payload;
   try{payload=validate(input);}catch(e){return json(res,400,{error:e.message});}
   if(db.prepare("SELECT count(*) AS n FROM leads WHERE status='pending'").get().n>=1000)return json(res,503,{error:'Приём временно недоступен. Позвоните нам.'});
   const stored=saveLead(input.requestId,payload);
   if(stored.conflict)return json(res,409,{error:'Данные заявки изменились. Повторите отправку.'});
   return json(res,202,{ok:true,id:stored.id,status:'accepted'});
  }
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
  let path;
  try {path=decodeURIComponent(pathname);}catch{return json(res,400,{error:'Invalid path'});}
  if(path==='/')path='/index.html';
  // Explicit allowlist: never serve .env, SQLite, server code, Git or directory listings.
  if(!['/index.html','/guide.html','/favicon.svg'].includes(path) && !/^\/(assets\/img|css|js)\/[A-Za-z0-9_./-]+$/.test(path))return json(res,404,{error:'Not found'});
  if(path.split('/').some(v=>v==='..'||v.startsWith('.')))return json(res,404,{error:'Not found'});
  const file=resolve(ROOT,'.'+path);
  if(!mime[extname(file)]||!existsSync(file)||!statSync(file).isFile()||!realpathSync(file).startsWith(ROOT+sep))return json(res,404,{error:'Not found'});
  const size=statSync(file).size;
  res.writeHead(200,{...securityHeaders,'Content-Type':mime[extname(file)],'Content-Length':size,'Cache-Control':path.startsWith('/assets/')?'public, max-age=86400':'no-cache'});
  if(req.method==='HEAD')return res.end();
  const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
 }catch {if(!res.headersSent)json(res,500,{error:'Временная ошибка. Повторите отправку.'});else res.destroy();}
});
server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=15000;server.maxRequestsPerSocket=100;
let busy=false,stopping=false;
export async function deliverOne(send=sendTelegram) {
 if(busy||stopping)return false;
 busy=true;
 try{
  const row=db.prepare("SELECT * FROM leads WHERE status='pending' AND next_attempt<=? ORDER BY created LIMIT 1").get(Date.now());
  if(!row)return false;
  try{
   const result=await send(leadText(row.lead_number,JSON.parse(row.payload)));
   db.prepare("UPDATE leads SET status='sent',sent=?,telegram_message_id=?,last_error=NULL WHERE id=?").run(Date.now(),result.message_id,row.id);
   console.log(`Lead delivered: ${row.id}`);
  }catch(e){
   const delay=Math.max(Number(e.retryAfter)||0,Math.min(3600,5*2**Math.min(row.attempts,10)));
   db.prepare('UPDATE leads SET attempts=attempts+1,next_attempt=?,last_error=? WHERE id=?').run(Date.now()+delay*1000,e.code||'network',row.id);
   console.error(`Lead delivery deferred: ${row.id} (${e.code||'network'})`);
  }
  return true;
 }finally{busy=false;}
}
async function sendTelegram(text){
 const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(12000)});
 const data=await response.json();
 if(!response.ok||data.ok!==true||!data.result?.message_id){const e=new Error('Telegram delivery failed');e.code=`telegram_${response.status}`;e.retryAfter=data.parameters?.retry_after;throw e;}
 return data.result;
}
export function queueState(){return db.prepare('SELECT id,status,attempts,last_error FROM leads ORDER BY created').all();}
if(process.env.NODE_ENV!=='test'){
 server.listen(port,host,()=>console.log(`HomePorte listening on ${host}:${port}; delivery ${token&&chatId?'enabled':'not configured'}`));
 const worker=setInterval(()=>{if(token&&chatId)deliverOne().catch(()=>console.error('Queue unavailable'));},2000);
 const cleanup=setInterval(()=>{db.prepare("DELETE FROM leads WHERE status='sent' AND sent<?").run(Date.now()-30*86400000);},3600000);
 const stop=()=>{stopping=true;clearInterval(worker);clearInterval(cleanup);server.close(()=>{const drain=setInterval(()=>{if(!busy){clearInterval(drain);db.close();process.exit(0);}},100);});setTimeout(()=>process.exit(0),15000).unref();};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
}

import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
process.env.NODE_ENV='test';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'hp-test-'));
process.env.TELEGRAM_BOT_TOKEN='test-only';process.env.TELEGRAM_CHAT_ID='test-only';
process.env.ALLOWED_ORIGINS='http://test.local';
const {validate,saveLead,deliverOne,queueState,server,leadMonth,leadText}=await import('./app.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const p={source:'quick',name:'Тест',contact:'@test_user',comment:''};
const post=(data,origin='http://test.local')=>fetch(base+'/api/leads',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
after(async()=>{await new Promise(r=>server.close(r));rmSync(process.env.DATA_DIR,{recursive:true,force:true});});
test('validates contact and quiz answers',()=>{
 assert.deepEqual(validate(p),p);
 for(const contact of ['', 'hello', '123', '@a', '<script>'])assert.throws(()=>validate({...p,contact}));
 assert.throws(()=>validate({...p,source:'quiz',item:'forged'}));
 assert.throws(()=>validate({...p,comment:'a'.repeat(1601)}));
});
test('rejects cross-origin and protects private files',async()=>{
 assert.equal((await post({...p,requestId:'first-request-123456'},'https://evil.example')).status,403);
 for(const path of ['/.env','/.git/config','/var/leads.sqlite','/server/app.mjs','/css/%2e%2e/.env','/projects.json']) assert.equal((await fetch(base+path)).status,404,path);
 assert.equal((await fetch(base+'/')).status,200);
 assert.equal((await fetch(base+'/js/main.js')).status,200);
 assert.equal((await post({...p,requestId:'bad-contact-123456',contact:''})).status,400);
 assert.equal((await post({...p,requestId:'large-body-123456',comment:'a'.repeat(9000)})).status,413);
});
test('durably accepts and deduplicates retries; rejects changed payload under same key',async()=>{
 const req={...p,requestId:'request-test-123456'};
 const r=await post(req);assert.equal(r.status,202);const first=await r.json();
 assert.equal((await (await post(req)).json()).id,first.id);
 assert.equal((await (await post({...req,requestId:'request-test-789012'})).json()).id,first.id);
 assert.equal((await post({...req,name:'Другой'})).status,409);
 const reopened=new DatabaseSync(join(process.env.DATA_DIR,'leads.sqlite'));
 assert.equal(reopened.prepare('SELECT count(*) AS n FROM leads').get().n,1);reopened.close();
});
test('failed delivery stays queued; later succeeds and is not resent',async()=>{
 await deliverOne(async()=>{throw Object.assign(new Error('failure'),{code:'telegram_503'});});
 assert.equal(queueState()[0].status,'pending');assert.equal(queueState()[0].attempts,1);
 const other=new DatabaseSync(join(process.env.DATA_DIR,'leads.sqlite'));
 other.prepare('UPDATE leads SET next_attempt=0').run();other.close();
 let calls=0;
 await deliverOne(async text=>{calls++;assert.match(text,/@test_user/);return {message_id:123};});
 assert.equal(queueState()[0].status,'sent');
 assert.equal(await deliverOne(async()=>{calls++;}),false);assert.equal(calls,1);
});

test('monthly numbers reset at Minsk midnight, survive cleanup, and retries keep their number',()=>{
 const before=Date.parse('2030-01-31T20:59:59Z'), after=Date.parse('2030-01-31T21:00:00Z');
 assert.equal(leadMonth(before),'2030-01');assert.equal(leadMonth(after),'2030-02');
 const a=saveLead('month-boundary-a',{...p,name:'a'},before);
 const b=saveLead('month-boundary-b',{...p,name:'b'},before);
 const c=saveLead('month-boundary-c',{...p,name:'c'},after);
 assert.equal(saveLead('month-boundary-c',{...p,name:'c'},after+1).id,c.id);
 const conn=new DatabaseSync(join(process.env.DATA_DIR,'leads.sqlite'));
 const number=id=>conn.prepare('SELECT lead_month,lead_number FROM leads WHERE id=?').get(id);
 assert.equal(number(a.id).lead_number,1);assert.equal(number(b.id).lead_number,2);
 assert.equal(number(c.id).lead_number,1);assert.equal(number(c.id).lead_month,'2030-02');
 conn.prepare('DELETE FROM leads WHERE id=?').run(c.id);
 const d=saveLead('month-boundary-d',{...p,name:'d'},after+2);
 assert.equal(number(d.id).lead_number,2);
 assert.equal(leadText(2,p).split('\n')[0],'Новая заявка HomePorte №2');
 conn.close();
});

import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const brand={};for(const name of ['logo-dark','logo-white','crest-dark','crest-white'])brand[name]='data:image/png;base64,'+readFileSync(new URL('assets/'+name+'.png',root)).toString('base64');
mkdirSync(new URL('dist/',root),{recursive:true});
for(const kind of ['helpdesk','email']){const html=read('web/index.html').replace('__TITLE__',kind==='helpdesk'?'IT Helpdesk':'Email Account Requests').replace('__CSS__',()=>read('web/style.css')).replace('__KIND__',kind).replace('__BRAND__',()=>JSON.stringify(brand)).replace('__JS__',()=>read('web/strings.js')+'\n'+read('web/app.js'));writeFileSync(new URL('dist/'+kind+'.html',root),html);console.log(`Built ${kind}.html (${Math.round(Buffer.byteLength(html)/1024)} KB)`);}

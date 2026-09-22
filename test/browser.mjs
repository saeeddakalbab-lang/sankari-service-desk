import { chromium } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { uid, nowIso } from '../server/domain.js';

const dataDir=mkdtempSync(join(tmpdir(),'sankari-browser-'));
const store=createStore(dataDir),userId=uid();
store.db.prepare('INSERT INTO users VALUES(?,?,?,?,1,0,?)').run(userId,'admin@sankari.test','Sankari Administrator',hashPassword('Browser-test-password-12!'),nowIso());
const server=createApp(store,{baseUrl:'http://localhost:31777'}).listen(31777,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:980},colorScheme:'light'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('401 (Unauthorized)'))errors.push(m.text());});
 await page.goto('http://localhost:31777/helpdesk');
 await page.getByLabel('Email').fill('admin@sankari.test');
 await page.getByLabel('Password').fill('Browser-test-password-12!');
 await page.getByRole('button',{name:/Sign in/}).click();
 await page.getByRole('heading',{name:'A clearer view of your work.'}).waitFor();
 await page.screenshot({path:'test-results/helpdesk-dashboard.png',fullPage:true});
 await page.getByRole('button',{name:'New ticket'}).first().click();
 await page.getByLabel('Department *',{exact:true}).selectOption('it');
 await page.getByLabel('Company').selectOption('Sankari Holding');
 await page.getByLabel('Category').selectOption('network');
 await page.getByLabel('Priority').selectOption('urgent');
 await page.getByLabel('Subject').fill('Browser verification ticket');
 await page.getByLabel('Description').fill('This request verifies the complete browser submission flow.');
 await page.getByRole('button',{name:/Submit request/}).click();
 await page.getByRole('heading',{name:'Browser verification ticket'}).waitFor();
 await page.getByRole('button',{name:/Close dialog/}).click();
 await page.getByRole('button',{name:'العربية'}).click();
 await page.getByRole('heading',{name:'رؤية أوضح لطلباتك.'}).waitFor();
 if(await page.locator('html').getAttribute('dir')!=='rtl')throw new Error('Arabic did not activate RTL layout');
 await page.screenshot({path:'test-results/helpdesk-arabic.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://localhost:31777/email');
 await page.getByRole('button',{name:'العربية'}).click();
 await page.getByRole('heading',{name:'كل حساب. كل خطوة.'}).waitFor();
 await page.screenshot({path:'test-results/email-mobile-arabic.png',fullPage:true});
 if(errors.length)throw new Error('Browser errors: '+errors.join(' | '));
 console.log('Browser verification passed: desktop, mobile, English, Arabic, login and request submission.');
} finally {
 await browser.close();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dataDir,{recursive:true,force:true});
}

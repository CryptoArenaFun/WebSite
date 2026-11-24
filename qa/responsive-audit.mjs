import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const engine=process.env.BROWSER || 'chromium';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const sizes=process.env.QA_SMOKE==='1'?[[320,568],[390,650],[430,932],[1366,768]]:[[320,480],[320,568],[360,560],[360,640],[360,800],[375,570],[375,667],[390,650],[390,844],[393,852],[412,700],[412,915],[430,932],[440,956],[568,320],[844,390],[768,1024],[1024,768],[1366,768],[1920,1080],[2560,1440]];
const routes=process.env.QA_SMOKE==='1'?['/']:['/','/test3/','/test4/','/test4/?pool=awaiting'];
const out='qa-results/'+(process.env.QA_SMOKE==='1'?'live-':'')+engine;
await mkdir(out,{recursive:true});
const browser=await ({chromium,firefox,webkit}[engine]).launch();
const report=[];
const rects=()=> {
 const vv=window.visualViewport;
 const view={width:vv?.width??innerWidth,height:vv?.height??innerHeight,top:vv?.offsetTop??0,left:vv?.offsetLeft??0};
 const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const inspect=s=>{const e=document.querySelector(s);if(!visible(e))return null;const b=rect(e);const hit=document.elementFromPoint(b.x+b.w/2,b.y+b.h/2);return {...b,font:parseFloat(getComputedStyle(e).fontSize),uncovered:!!hit&&(hit===e||e.contains(hit))};};
 const controls=[...document.querySelectorAll('button,a[href],input')].filter(visible).filter(e=>!e.closest('[inert]')).map(e=>({name:(e.getAttribute('aria-label')||e.textContent||e.id||'input').trim().slice(0,80),...rect(e),font:parseFloat(getComputedStyle(e).fontSize)}));
 return {view,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,predict:inspect('.predict'),nav:inspect('.bottom-nav'),chart:inspect('.plot'),choices:inspect('.choices'),amount:inspect('#amount'),controls,dialog:inspect('[role=dialog]')};
};
function record(r,check,pass,details='',severity='failure'){r.checks.push({check,pass:!!pass,details,severity});}
function inside(b,v){return !!b&&b.x>=v.left-2&&b.right<=v.left+v.width+2&&b.y>=v.top-2&&b.bottom<=v.top+v.height+2;}
for(const [width,height] of sizes) for(const route of routes){
 const id=width+'x'+height+'-'+(route==='/'?'home':route.replaceAll('/','').replace('?pool=','-'));
 const r={engine,route,width,height,checks:[],pageErrors:[],networkErrors:[]}; report.push(r);
 const mobile=width<=440;
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?2:1,hasTouch:mobile,...(engine!=='firefox'?{isMobile:mobile}:{}),reducedMotion:'reduce'});
 const page=await context.newPage();page.setDefaultTimeout(3500);
 page.on('pageerror',e=>r.pageErrors.push(e.message));
 page.on('requestfailed',req=>{if(r.networkErrors.length<30)r.networkErrors.push({url:req.url(),error:req.failure()?.errorText});});
 try{
  const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:20000});
  record(r,'HTTP response',response?.ok(),response?.status());
  await page.locator('.predict').waitFor({state:'visible',timeout:8000});
  await page.evaluate(()=>document.fonts.ready);
  const initial=await page.evaluate(rects);r.initial=initial;
  record(r,'No horizontal overflow',initial.scrollWidth<=initial.clientWidth+2,initial.scrollWidth+' / '+initial.clientWidth);
  record(r,'Predict visible above fold',inside(initial.predict,initial.view)&&initial.predict.uncovered,initial.predict);
  record(r,'Navigation visible above fold',inside(initial.nav,initial.view),initial.nav??'hidden or absent','review');
  record(r,'Chart visible above fold',inside(initial.chart,initial.view),initial.chart,'review');
  record(r,'UP/DOWN visible above fold',inside(initial.choices,initial.view)&&initial.choices.uncovered,initial.choices,'review');
  record(r,'Amount visible above fold',inside(initial.amount,initial.view),initial.amount,'review');
  const small=initial.controls.filter(c=>c.w<24||c.h<24);
  record(r,'Minimum 24px target geometry (WCAG spacing exceptions not evaluated)',!small.length,small,'review');
  const tiny=initial.controls.filter(c=>c.font<12&&c.name);
  record(r,'Control labels at least 12px',!tiny.length,tiny,'review');
  await page.screenshot({path:out+'/'+id+'-initial.png',animations:'disabled',timeout:8000});
  const predict=page.locator('.predict'), down=page.locator('.choices .down'), up=page.locator('.choices .up');
  if(await down.count()){
   await down.click(); record(r,'Select DOWN',await down.getAttribute('aria-pressed')==='true');
   await up.click(); record(r,'Select UP',await up.getAttribute('aria-pressed')==='true');
  }
  const plot=page.locator('.plot');
  if(await plot.count()){
   const attr=route==='/test3/'?'aria-pressed':'data-chart-view';const before=await plot.getAttribute(attr);await plot.click();const second=await plot.getAttribute(attr);await plot.click();const third=await plot.getAttribute(attr);if(route==='/test3/'){record(r,'Two chart modes',before!==second&&third===before,[before,second,third]);}else{await plot.click();const restored=await plot.getAttribute(attr);record(r,'Three chart modes',before!==second&&second!==third&&third!==before&&restored===before,[before,second,third,restored]);}
  }
  const amount=page.locator('#amount');
  if(await amount.count()){
   await amount.fill('0');record(r,'Zero stake disabled',await predict.isDisabled());
   await amount.fill('25');record(r,'Valid stake enabled',await predict.isEnabled());
   await page.waitForTimeout(250);await page.screenshot({path:out+'/'+id+'-amount.png',animations:'disabled',timeout:8000});
   await amount.blur();await page.waitForTimeout(250);
  }
  const pool=page.locator('.pool-heading');
  if(await pool.count()){
   const before=await pool.getAttribute('aria-expanded');await pool.click();record(r,'Pool toggles',before!==await pool.getAttribute('aria-expanded'));await pool.click();
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  const connect=page.locator('.connect');
  if(await connect.count()){
   await connect.click();await page.getByRole('dialog').waitFor();
   const modal=await page.evaluate(rects);record(r,'Wallet dialog fits viewport',inside(modal.dialog,modal.view),modal.dialog);
   await page.screenshot({path:out+'/'+id+'-dialog.png',animations:'disabled',timeout:8000});
   await page.getByRole('button',{name:'Close',exact:true}).click();
   record(r,'Wallet dialog closes',await page.getByRole('dialog').count()===0);
  }
  if(mobile){
   // Reduced viewport approximates available space with expanded browser chrome,
   // not actual browser chrome or a real mobile keyboard.
   await page.setViewportSize({width,height:Math.max(320,height-100)});
   await page.waitForTimeout(250);
   const reduced=await page.evaluate(rects);
   record(r,'Reduced viewport: Predict stays visible',inside(reduced.predict,reduced.view),reduced.predict);
   record(r,'Reduced viewport: no horizontal overflow',reduced.scrollWidth<=reduced.clientWidth+2);
   await page.screenshot({path:out+'/'+id+'-reduced.png',animations:'disabled',timeout:8000});
  }
 }catch(e){record(r,'Scenario completes',false,String(e));try{await page.screenshot({path:out+'/'+id+'-error.png',timeout:3000});}catch{}}
 finally{record(r,'No uncaught page errors',r.pageErrors.length===0,r.pageErrors);await context.close();}
 console.log(id, r.checks.filter(c=>!c.pass&&c.severity==='failure').length+' failures');
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));
}
await browser.close();
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const failureCount=report.flatMap(r=>r.checks).filter(c=>!c.pass&&c.severity==='failure').length;
await writeFile(out+'/index.html','<!doctype html><meta charset=utf-8><title>Responsive QA</title><h1>'+esc(engine)+' — '+failureCount+' failures</h1><p>Emulated viewport; not real browser chrome or OS keyboard. Review items require manual judgment.</p>'+report.map(r=>'<h2>'+esc(r.route)+' '+r.width+'×'+r.height+'</h2><ul>'+r.checks.map(c=>'<li>'+ (c.pass?'PASS':c.severity==='review'?'REVIEW':'FAIL')+' '+esc(c.check)+(c.pass?'':' — '+esc(JSON.stringify(c.details)))+'</li>').join('')+'</ul>').join(''));
if(failureCount)process.exitCode=1;

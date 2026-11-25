import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await ({chromium,firefox,webkit}[process.env.BROWSER || 'chromium']).launch();
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const out = 'qa-results/chart-connection-'+(process.env.BROWSER || 'chromium');
await mkdir(out,{recursive:true});
try {
 for (const route of ['/', '/test5/']) {
  const id=route==='/'?'home':'test5';
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const round=Math.floor(Date.now()/900000)*900000, server=round+120000;
  let release;const historyGate=new Promise(resolve=>release=resolve);
  const sockets=[];
  await page.route('https://data-api.binance.vision/api/v3/**', async req=>{
   const u=new URL(req.request().url());
   let body;
   if(u.pathname.endsWith('/time'))body={serverTime:server};
   else {
    await historyGate;
    body=u.searchParams.get('interval')==='15m'?[[round,'100.00000000','110','90','101']]:
     [[round,'100','110','90','104'],[round+1000,'104','110','90','102']];
   }
   await req.fulfill({status:200,headers:{'access-control-allow-origin':'*'},json:body});
  });
  await page.routeWebSocket('wss://data-stream.binance.vision/ws/btcusdt@aggTrade',ws=>{sockets.push(ws)});
  const poll=async fn=>{for(let i=0;i<100;i++){if(fn())return;await page.waitForTimeout(100)}throw Error('Socket timeout')};
  const checkLoading=async label=>{
   await page.waitForFunction(label=>{
    const p=document.querySelector('.plot'),l=document.querySelector('.chart-loading'),line=document.querySelector('.chart-loading-line');
    const text=document.querySelector('.chart-loading-label');
    if(!p||!l||!line||!text)return false;
    const c=getComputedStyle(line),s=getComputedStyle(line,'::after');
    return p.dataset.chartLoading==='true'&&l.dataset.show==='true'&&text.textContent.startsWith(label)&&
     c.display!=='none'&&c.visibility==='visible'&&s.animationName==='chart-loading-sweep'&&
     [...p.querySelectorAll('canvas,.target-label,.price-point,.price-badge,.price-axis,.time-axis')].every(e=>getComputedStyle(e).visibility==='hidden');
   },label,{timeout:12000});
  };
  const send=(ws,p,t)=>ws.send(JSON.stringify({e:'aggTrade',s:'BTCUSDT',p:String(p),T:t}));
  const checkLive=async price=>{
   await page.waitForFunction(price=>{
    const p=document.querySelector('.plot'),c=p?.querySelector('canvas'),l=p?.querySelector('.chart-loading');
    return p?.dataset.chartLoading==='false'&&l?.dataset.show==='false'&&c?.dataset.roundOpen==='100.00000000'&&
     getComputedStyle(c).visibility==='visible'&&p.querySelector('.price-badge').textContent===price;
   },price,{timeout:12000});
  };
  try {
   await page.goto(base+route,{waitUntil:'domcontentloaded'});
   await checkLoading('Connecting');
   await page.screenshot({path:out+'/'+id+'-connecting.png'});
   release();await poll(()=>sockets.length===1);
   await page.waitForFunction(()=>document.querySelector('.metrics strong')?.textContent.includes('100.00'));
   await checkLoading('Connecting');
   send(sockets[0],105,server+1000);await checkLive('105.00');
   const target=await page.locator('.metrics strong').first().textContent();
   await page.waitForFunction(()=>document.querySelector('.plot canvas')?.dataset.feedState==='Waiting',null,{timeout:10000});
   await checkLoading('Reconnecting');
   assert.equal(await page.locator('.metrics strong').first().textContent(),target);
   await page.screenshot({path:out+'/'+id+'-waiting.png'});
   send(sockets[0],106,server+7000);await checkLive('106.00');
   await sockets[0].close();await checkLoading('Reconnecting');
   await poll(()=>sockets.length===2);
   await checkLoading('Reconnecting');
   await page.screenshot({path:out+'/'+id+'-reconnecting.png'});
   send(sockets[1],107,server+13000);await checkLive('107.00');
   assert.equal(await page.locator('.metrics strong').first().textContent(),target);
   assert.deepEqual(errors,[]);
   console.log(id+': Connecting, Waiting, Reconnecting and Live verified in browser');
  } finally {release();await page.close();}
 }
} finally {await browser.close();}

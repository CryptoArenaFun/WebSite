import {chromium,firefox,webkit} from 'playwright';
const engine=process.env.BROWSER;
const browser=await ({chromium,firefox,webkit}[engine]).launch();
let failures=0,total=0;
for(const trial of [false,true]) for(const [width,height] of [[360,640],[390,738]]) for(const mode of ['overlay','pan','inner-mismatch','resize-content']) for(const pool of ['expanded','collapsed']){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:'reduce'});
 const page=await context.newPage();page.setDefaultTimeout(5000);
 const result={engine,trial,width,height,mode,pool};
 try{
 await page.goto('http://127.0.0.1:4173/test5/'+(trial?'?scrollfix=1':''),{waitUntil:'domcontentloaded'});
 await page.locator('#amount').waitFor();await page.evaluate(()=>document.fonts.ready);
 if(pool==='collapsed')await page.locator('.pool-heading').click();
 await page.evaluate(()=>scrollTo(0,0));
 await page.locator('#amount').evaluate(e=>e.focus({preventScroll:true}));
 await page.waitForTimeout(250);
 if(mode==='resize-content')await page.setViewportSize({width,height:height-270});
 else await page.evaluate(({height,mode})=>{
  const vv=visualViewport;let h=height-270,t=mode==='pan'?180:0;
  Object.defineProperty(vv,'height',{configurable:true,get:()=>h});
  Object.defineProperty(vv,'offsetTop',{configurable:true,get:()=>t});
  if(mode==='inner-mismatch')Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>h});
  window.__clearPan=()=>{t=0;};
  vv.dispatchEvent(new Event('resize'));
 },{height,mode});
 await page.waitForTimeout(250);
 // Stop auto-fit using a real wheel action; then reach the end.
 await page.mouse.move(width/2,100);await page.mouse.wheel(0,2000);await page.waitForTimeout(250);
 await page.evaluate(()=>scrollTo(0,1e7));await page.waitForTimeout(250);
 // A compositor pan can change before JS receives the next scroll event.
 if(mode==='pan')await page.evaluate(()=>window.__clearPan());
 result.end=await page.evaluate(()=>{
  const b=document.querySelector('.predict').getBoundingClientRect(), vv=visualViewport;
  const root=document.scrollingElement, shell=document.querySelector('.shell');
  const top=vv.offsetTop,bottom=top+vv.height;
  const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
  return {y:scrollY,max:root.scrollHeight-root.clientHeight,rootHeight:root.clientHeight,inner:innerHeight,visualHeight:vv.height,top,bottom,buttonTop:b.top,buttonBottom:b.bottom,clear:shell.style.getPropertyValue('--amount-keyboard-clearance'),open:document.querySelector('#amount').getAttribute('aria-expanded'),reachable:b.top>=top-2&&b.bottom<=bottom+2&&!!hit&&(hit===document.querySelector('.predict')||document.querySelector('.predict').contains(hit))};
 });
 result.pass=result.end.reachable&&result.end.open==='true';
 if(trial&&!result.pass)failures++;
 }catch(e){result.error=String(e);if(trial)failures++;}
 total++;console.log('DOCK_REACH '+JSON.stringify(result));await context.close();
}
await browser.close();console.log('DOCK_TOTAL '+total+' TRIAL_FAILURES '+failures);if(failures)process.exitCode=1;

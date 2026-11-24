import {chromium,firefox} from 'playwright';
const engine=process.env.BROWSER;
const browser=await ({chromium,firefox}[engine]).launch();
let failures=0;
for(const trial of [false,true]) for(const y of [0,70]) for(const method of ['escape','preset','outside','drag-keyboard-resize']) for(let repeat=0;repeat<2;repeat++){
 const context=await browser.newContext({viewport:{width:390,height:650},hasTouch:true,reducedMotion:'no-preference'});
 const page=await context.newPage();page.setDefaultTimeout(5000);
 const results={engine,trial,y,method,repeat};
 const state=()=>page.evaluate(()=>({y:scrollY,open:document.querySelector('#amount').getAttribute('aria-expanded'),editing:document.querySelector('.shell').dataset.amountEditing??'',height:innerHeight}));
 try{
 await page.goto('http://127.0.0.1:4173/test5/'+(trial?'?scrollfix=1':''),{waitUntil:'domcontentloaded'});
 await page.locator('#amount').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(y=>scrollTo(0,y),y);
 await page.waitForTimeout(100);
 results.origin=await state();
 await page.locator('#amount').evaluate(e=>e.focus({preventScroll:true}));
 await page.waitForTimeout(250);
 await page.setViewportSize({width:390,height:390});
 await page.waitForTimeout(300);
 results.open=await state();
 await page.mouse.move(190,140);await page.mouse.wheel(0,-250);await page.waitForTimeout(200);
 results.scrolled=await state();
 if(method==='drag-keyboard-resize'){
 // Synthetic touch/pointer sequences deliberately reproduce keyboard dismissal
 // while an outside scroll gesture is active; not a physical Android keyboard.
 await page.evaluate(()=>{
 const target=document.querySelector('.header');
 const touch=new Touch({identifier:9,target,clientX:150,clientY:120});
 target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch]}));
 target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0,pointerId:9,pointerType:'touch'}));
 const moved=new Touch({identifier:9,target,clientX:150,clientY:210});
 target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[moved]}));
 });
 await page.setViewportSize({width:390,height:650});await page.waitForTimeout(150);
 await page.evaluate(()=>{const target=document.querySelector('.header');target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,isPrimary:true,pointerId:9,pointerType:'touch'}));target.dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,touches:[]}));});
 await page.waitForTimeout(800);
 results.afterDrag=await state();
 // Record the actual behavior; the intended editor stays open through the gesture.
 if(trial&&results.afterDrag.open!=='true') failures++;
 if(results.afterDrag.open==='true')await page.keyboard.press('Escape');
 }else{
 if(method==='escape')await page.keyboard.press('Escape');
 if(method==='preset')await page.getByRole('button',{name:'50%',exact:true}).click();
 if(method==='outside')await page.locator('.header').click({position:{x:5,y:5}});
 await page.setViewportSize({width:390,height:650});
 }
 await page.waitForTimeout(1800);
 results.final=await state();
 results.restored=results.final.open==='false'&&Math.abs(results.final.y-results.origin.y)<=3&&!results.final.editing;
 if(trial&&!results.restored)failures++;
 }catch(e){results.error=String(e);if(trial)failures++;}
 console.log('SCROLL_REPRO '+JSON.stringify(results));await context.close();
}
await browser.close();console.log('TRIAL_FAILURES '+failures);if(failures)process.exitCode=1;

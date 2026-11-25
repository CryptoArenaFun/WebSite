const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, globals = {}) {
 const scope = { exports: {}, ...globals };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope);
 return scope.exports;
}
const math = load('test2/chart-motion.ts');
const { viewport, blend, ema, controls, appendKeyframe, paddedRange, detailRange, visiblePoints } = math;
test('ten-second viewport advances between samples and stays inside round', () => {
 const a = viewport(900, 1020.01), b = viewport(900, 1020.026);
 assert.ok(b.end > a.end && b.begin > a.begin); assert.equal(a.end - a.begin, 10);
 assert.equal(viewport(900, 905).begin, 900); assert.equal(viewport(900, 1801).end, 1800);
});
test('EMA uses 0.25 and frame-normalized tip/scale interpolation do not overshoot', () => {
 assert.equal(ema(100, 104), 101);
 for (const factor of [.08, .1]) {
  assert.ok(Math.abs((1-blend(factor,1000/60))**6-(1-blend(factor,1000/120))**12)<1e-12);
  assert.ok(blend(factor,1000)>0 && blend(factor,1000)<1);
 }
});
test('padding is 15% of range, with a finite flat-market fallback', () => {
 assert.equal(paddedRange(100, 200).min, 85); assert.equal(paddedRange(100, 200).max, 215);
 assert.ok(paddedRange(100, 100).max > paddedRange(100, 100).min);
});
test('flat-market timestamps are preserved without manufacturing oscillations', () => {
 const points=[];
 for(let i=0;i<100;i++) appendKeyframe(points,{time:i,value:100});
 assert.equal(points.length,100);assert.ok(points.every(p=>p.value===100));appendKeyframe(points,{time:101,value:101});assert.equal(points.length,101);
});
test('cubic controls remain finite and bounded around extrema with uneven spacing', () => {
 const points=[{x:0,y:0},{x:1,y:100},{x:500,y:0},{x:501,y:0}];
 for(let i=0;i<points.length-1;i++){
  const c=controls(points,i),a=points[i],b=points[i+1];
  assert.ok(c.c1x>=a.x && c.c1x<=b.x && c.c2x>=a.x && c.c2x<=b.x);
  for(const y of [c.c1y,c.c2y])assert.ok(y>=Math.min(a.y,b.y)&&y<=Math.max(a.y,b.y));
 }
});
function harness(start = 900, outgoing = [], fetchGate = Promise.resolve(), options = {}) {
 let now=0, next=0;const raf=new Map(),timers=new Map(),sockets=[],quotes=[],statuses=[],paths=[];
 const element=()=>({style:{},hidden:false,textContent:'',querySelectorAll:()=>[]});
 const ctx=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}});
 const canvas={style:{},dataset:{},classList:{add(name){canvas.animation=name}},getContext:()=>ctx,remove(){this.removed=true}};
 const listeners=new Map();
 const elements={host:{...element(),querySelectorAll:()=>outgoing,appendChild(){},getBoundingClientRect:()=>({width:650,height:274}),parentElement:{querySelector:()=>element()}},badge:element(),point:element(),targetLabel:element(),priceAxis:{...element(),querySelectorAll:()=>Array.from({length:4},element)},timeAxis:{...element(),querySelectorAll:()=>Array.from({length:3},element)}};
 const globals={require:()=>math,Intl,AbortController,console,performance:{now:()=>now},
  document:{hidden:false,createElement:()=>canvas,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)},
  window:{devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),setTimeout:(f)=>{timers.set(++next,f);return next},clearTimeout:id=>timers.delete(id),setInterval:f=>{timers.set(++next,f);return next},clearInterval:id=>timers.delete(id)},
  requestAnimationFrame:f=>{raf.set(++next,f);return next},cancelAnimationFrame:id=>raf.delete(id),
  ResizeObserver:class{observe(){}disconnect(){this.disconnected=true}},
  Path2D:class{constructor(){paths.push(this);this.cubics=0}moveTo(x,y){this.first=[x,y]}lineTo(){}closePath(){}bezierCurveTo(){this.cubics++}},
  fetch:async url=>{await fetchGate;return {ok:true,json:async()=>url.includes('interval=15m') ? [[options.openingTime ?? start*1000,'100.00000000','105','95','102']] : options.empty ? [] : [[start*1000,'100','105','95',String(options.firstClose ?? 100)],[(start+1)*1000,'100','105','95','102']]};},
  WebSocket:class{constructor(){sockets.push(this)}close(){this.closed=true;this.onclose?.()}},
 };
 const {startLiveChart}=load(options.engine ?? 'src/home/live-chart.ts',globals);
 const mode={current:"round"};
 const stop=startLiveChart(start,elements,q=>quotes.push(q),s=>statuses.push(s),mode,()=>options.exchangeMs ?? (start+2)*1000);
 return {mode,stop,quotes,statuses,sockets,paths,elements,canvas,listeners,raf,timers,retry(){[...timers.values()].at(-1)()},tick(ms){now+=ms;const jobs=[...raf.values()];raf.clear();jobs.forEach(f=>f(now));}};
}
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
test('network quotes are separated from cubic rendering and cleanup cancels owned resources',async()=>{
 const h=harness();await settle();assert.equal(h.sockets.length,1);h.tick(16);
 const before=h.quotes.length;
 h.sockets[0].onmessage({data:JSON.stringify({e:'aggTrade',s:'BTCUSDT',p:'104',T:902000})});
 assert.equal(h.quotes.length,before);h.tick(200);
 assert.equal(h.quotes.at(-1).price,104);assert.equal(h.quotes.at(-1).target,100);
 assert.ok(h.paths.some(p=>p.cubics>0));assert.equal(h.elements.point.style.left,'650px');
 h.stop();assert.equal(h.raf.size,0);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);assert.ok(h.canvas.removed);assert.ok(h.sockets[0].closed);assert.equal(h.sockets[0].onmessage,null);
});
test('invalid or next-round ticks cannot alter the current raw quote',async()=>{
 const h=harness();await settle();h.tick(200);const original=h.quotes.at(-1).price;
 for(const trade of [{p:'NaN',T:902000},{p:'999',T:1800000},{p:'-1',T:902000}]) h.sockets[0].onmessage({data:JSON.stringify({e:'aggTrade',s:'BTCUSDT',...trade})});
 h.tick(200);assert.equal(h.quotes.at(-1).price,original);h.stop();
});

test('adjacent cubic segments share tangent at plateau boundaries', () => {
 const p=[{x:0,y:0},{x:10,y:0},{x:20,y:10},{x:30,y:10}];
 const left=controls(p,0), middle=controls(p,1), right=controls(p,2);
 assert.equal(left.c2y, middle.c1y);
 assert.equal(middle.c2y, right.c1y);
});

test('round view expands from open while detail stays at 10 seconds', () => {
 assert.equal(viewport(900, 1450, 'round').begin, 900);
 assert.equal(viewport(900, 1450, 'detail').begin, 1440);
});
test('detail excludes old extremes and target; flat cent moves remain visible', () => {
 const points=[{time:0,value:500},{time:100,value:100},{time:101,value:100.01}];
 const range=detailRange(points,100,100.01,100.01);
 // The boundary predecessor must be near the active window, not an arbitrary old extreme.
 const active=detailRange(points,100.5,100.01,100.01);
 assert.ok(active.max-active.min<.05);
 assert.ok(active.min>99 && active.max<101);
 assert.ok(range.max-range.min<.05);
});
test('view switching does not discard full-round history', () => {
 const points=Array.from({length:100},(_,i)=>({time:i,value:i}));
 const recent=visiblePoints(points,80,100);
 assert.equal(recent[0].time,78);
 assert.equal(points.length,100);
 assert.equal(visiblePoints(points,0,100).length,100);
});

test('detail axis preserves exact tick values during small range changes', () => {
 const grid=math.stableDetailTicks(100,110);
 assert.equal(math.stableDetailTicks(100.02,110.02,grid),grid);
 assert.ok(grid.values.every(n=>Math.round(n*100)===n*100));
});
test('detail axis rebases only when old labels are out of range or scale changes materially', () => {
 const grid=math.stableDetailTicks(100,110);
 const moved=math.stableDetailTicks(120,130,grid);
 assert.notEqual(moved,grid);assert.ok(moved.values.some(n=>n>=120&&n<=130));
 assert.notEqual(math.stableDetailTicks(100,100.05,grid),grid);
});

test('sub-keyframe reversals are recorded and committed history remains unchanged', () => {
 const points=[{time:0,value:100}];
 let previous=points[0], direction=0;
 for (const point of [{time:.1,value:101},{time:.2,value:103},{time:.3,value:102},{time:.4,value:99},{time:.5,value:100}]) {
  direction=math.recordMotion(points,previous,point,direction);previous=point;
 }
 assert.ok(points.some(p=>p.time===.2&&p.value===103));
 assert.ok(points.some(p=>p.time===.4&&p.value===99));
 const saved=JSON.stringify(points);
 math.recordMotion(points,previous,{time:1.2,value:200},direction);
 assert.equal(JSON.stringify(points.slice(0,-1)),saved);
});
test('round rollover retains the rendered canvas while new data is pending then fades it out',async()=>{
 const old=harness();await settle();old.tick(200);old.stop(true);
 assert.equal(old.canvas.removed,undefined);assert.equal(old.canvas.dataset.outgoing,'true');
 assert.equal(old.raf.size,0);assert.equal(old.timers.size,0);assert.ok(old.sockets[0].closed);
 let release;const gate=new Promise(resolve=>release=resolve);
 const next=harness(1800,[old.canvas],gate);next.tick(200);
 assert.equal(old.canvas.removed,undefined);assert.equal(old.canvas.animation,undefined);
 release();await settle();next.tick(200);
 assert.equal(old.canvas.animation,'round-chart-exit');assert.equal(next.canvas.dataset.roundStart,'1800');
 assert.equal(next.quotes.at(-1).start,1800);
 next.stop();assert.equal(old.canvas.removed,true);assert.equal(next.raf.size,0);assert.equal(next.timers.size,0);
});


test('round-ten clips time to ten seconds, including round boundaries', () => {
 const view=viewport(900,1450,'round-ten');
 assert.equal(view.begin,1440);assert.equal(view.end,1450);
 assert.equal(viewport(900,905,'round-ten').begin,900);
 assert.equal(viewport(900,1801,'round-ten').end,1800);
});
test('round-ten restores full-round scale and target after detail zoom without reconnecting',async()=>{
 const h=harness();await settle();
 const frames=()=>{for(let i=0;i<180;i++)h.tick(16.667)};
 frames();const original=[h.canvas.dataset.rangeMin,h.canvas.dataset.rangeMax];
 h.mode.current='detail';frames();
 assert.ok(Number(h.canvas.dataset.rangeMax)-Number(h.canvas.dataset.rangeMin)<1);
 h.mode.current='round-ten';frames();
 assert.deepEqual([h.canvas.dataset.rangeMin,h.canvas.dataset.rangeMax],original);
 assert.equal(h.canvas.dataset.chartView,'round-ten');assert.equal(h.canvas.dataset.windowSeconds,'10');
 assert.equal(h.elements.targetLabel.style.visibility,'visible');assert.equal(h.sockets.length,1);
 h.mode.current='round';frames();assert.equal(h.canvas.dataset.chartView,'round');
 assert.deepEqual([h.canvas.dataset.rangeMin,h.canvas.dataset.rangeMax],original);h.stop();
});

for (const engine of ['src/home/live-chart.ts','test5/live-chart.ts']) {
 test(engine + ': opening anchor matches official 15m Open with first 1s Close above or below',async()=>{
  for(const firstClose of [96,100,104]){
   const h=harness(900,[],Promise.resolve(),{engine,firstClose});
   await settle();h.tick(200);
   assert.equal(h.quotes.at(-1).target,100);
   assert.equal(h.quotes.at(-1).targetOpen,'100.00000000');
   assert.equal(h.canvas.dataset.roundOpen,'100.00000000');
   const path=h.paths.find(p=>p.first && p.cubics>0);
   assert.ok(path);assert.equal(path.first[0],0);
   assert.equal(path.first[1],parseFloat(h.elements.targetLabel.style.top));
   h.stop();
  }
 });
 test(engine + ': reconnect rebuilds from the same exact anchor',async()=>{
  const h=harness(900,[],Promise.resolve(),{engine,firstClose:104});
  await settle();h.tick(200);h.sockets[0].close();h.retry();await settle();h.tick(200);
  assert.equal(h.sockets.length,2);
  const path=h.paths.filter(p=>p.first && p.cubics>0).at(-1);
  assert.equal(path.first[0],0);assert.equal(path.first[1],parseFloat(h.elements.targetLabel.style.top));
  assert.equal(h.quotes.at(-1).target,100);h.stop();
 });
 test(engine + ': incorrect 15m timestamp or missing 1s history cannot publish a quote',async()=>{
  for(const options of [{openingTime:0},{empty:true}]){
   const h=harness(900,[],Promise.resolve(),{engine,...options});
   await settle();h.tick(200);
   assert.equal(h.quotes.length,0);assert.equal(h.sockets.length,0);assert.equal(h.canvas.dataset.roundStart,undefined);
   h.stop();
  }
 });
 test(engine + ': new round removes prior frame and waits for validated open',async()=>{
  const old=harness(900,[],Promise.resolve(),{engine});await settle();old.tick(200);old.stop();
  assert.equal(old.canvas.removed,true);assert.equal(old.elements.targetLabel.style.visibility,'hidden');
  let release;const gate=new Promise(resolve=>release=resolve);
  const next=harness(1800,[],gate,{engine,firstClose:96});
  next.tick(200);assert.equal(next.quotes.length,0);
  release();await settle();next.tick(200);
  assert.equal(next.quotes.at(-1).start,1800);
  const path=next.paths.find(p=>p.first && p.cubics>0);
  assert.equal(path.first[0],0);assert.equal(path.first[1],parseFloat(next.elements.targetLabel.style.top));next.stop();
 });
}
test('exchange clock uses Binance server time rather than the device wall clock',async()=>{
 let now=200;const samples=[],timers=new Map();let n=0;
 const {startRoundClock}=load('src/home/round-clock.ts',{
  performance:{now:()=>now},AbortController,
  document:{hidden:false,addEventListener(){},removeEventListener(){}},
  window:{setTimeout:f=>{timers.set(++n,f);return n},clearTimeout:id=>timers.delete(id),setInterval:f=>{timers.set(++n,f);return n},clearInterval:id=>timers.delete(id)},
  fetch:async url=>{assert.ok(url.endsWith('/api/v3/time'));return {ok:true,json:async()=>({serverTime:1800000})}},
 });
 const stop=startRoundClock((ms,offset)=>samples.push([ms,offset]));
 assert.equal(samples.length,0);await settle();assert.equal(samples.at(-1)[0],1800000);
 now+=250;[...timers.values()][0]();assert.equal(samples.at(-1)[0],1800250);
 stop();assert.equal(timers.size,0);
});

for (const engine of ['src/home/live-chart.ts','test5/live-chart.ts']) {
test(engine + ': freezes the curve during a disconnect, preserves the Target and resumes after a real trade',async()=>{
 const h=harness(900,[],Promise.resolve(),{engine,firstClose:104});
 await settle();h.tick(200);
 const frozenInitial=h.canvas.dataset.visibleEnd;
 h.tick(1000);assert.equal(h.canvas.dataset.visibleEnd,frozenInitial);
 assert.equal(h.elements.point.style.backgroundColor,'#929ba4');
 h.sockets[0].onmessage({data:JSON.stringify({e:'aggTrade',s:'BTCUSDT',p:'104',T:903000})});
 h.tick(200);assert.equal(h.canvas.dataset.feedState,'Live');
 const before={end:h.canvas.dataset.visibleEnd,top:h.elements.point.style.top,target:h.elements.targetLabel.style.top,price:h.quotes.at(-1).price};
 h.listeners.get('offline')();h.tick(6000);
 assert.equal(h.canvas.dataset.feedState,'Reconnecting');
 assert.equal(h.canvas.dataset.visibleEnd,before.end);
 assert.equal(h.elements.point.style.top,before.top);
 assert.equal(h.elements.targetLabel.style.top,before.target);
 assert.equal(h.elements.point.style.backgroundColor,'#929ba4');
 assert.equal(h.quotes.at(-1).price,before.price);
 h.retry();await settle();h.tick(200);assert.equal(h.sockets.length,2);
 assert.equal(h.canvas.dataset.feedState,'Reconnecting');
 const repaired=h.canvas.dataset.visibleEnd;
 h.tick(1000);assert.equal(h.canvas.dataset.visibleEnd,repaired);
 h.sockets[1].onmessage({data:JSON.stringify({e:'aggTrade',s:'BTCUSDT',p:'105',T:912000})});
 assert.equal(h.statuses.at(-1),'Reconnecting');
 h.tick(16);assert.equal(h.statuses.at(-1),'Live');
 assert.equal(h.canvas.dataset.feedState,'Live');assert.ok(Number(h.canvas.dataset.visibleEnd)>Number(repaired));
 assert.equal(h.quotes.at(-1).price,105);assert.equal(h.quotes.at(-1).target,100);
 h.stop();assert.equal(h.listeners.size,0);
});

test(engine + ': publishes the matching opening and current price on the first paint before 150ms',async()=>{
 const h=harness(900,[],Promise.resolve(),{engine,firstClose:104});
 await settle();assert.equal(h.quotes.length,0);h.tick(16);
 assert.equal(h.quotes.length,1);
 assert.equal(h.quotes[0].target,100);assert.equal(h.quotes[0].price,102);
 assert.equal(h.canvas.dataset.roundStart,'900');
 const path=h.paths.find(p=>p.first && p.cubics>0);
 assert.ok(path);assert.equal(path.first[0],0);assert.equal(path.first[1],parseFloat(h.elements.targetLabel.style.top));
 h.stop();
});
test(engine + ': hides every real chart layer while the matching quote is not yet committed',()=>{
 const css=fs.readFileSync(engine.replace('live-chart.ts','style.css'),'utf8');
 const app=fs.readFileSync(engine.replace('live-chart.ts','main.tsx'),'utf8');
 assert.match(app,/const chartLoading = !quote \|\| feedStatus !== 'Live';/);
 assert.match(app,/data-chart-loading=\{chartLoading\}/);
 assert.match(app,/data-show=\{chartLoading\}/);
 assert.doesNotMatch(css,/\.chart-loading\[data-stale=true\]/);
 for(const selector of ['.chart canvas','.target-label','.price-point','.price-badge','.price-axis','.time-axis']){
  assert.ok(css.includes('.plot[data-chart-loading=true] '+selector));
 }
 assert.ok(css.includes('.time-axis{visibility:hidden!important}'));
});
}

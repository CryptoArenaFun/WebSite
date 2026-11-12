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
test('deduping does not manufacture oscillations in a flat market', () => {
 const points=[];
 for(let i=0;i<100;i++) appendKeyframe(points,{time:i,value:100});
 assert.equal(points.length,1);appendKeyframe(points,{time:101,value:101});assert.equal(points.length,2);
});
test('cubic controls remain finite and bounded around extrema with uneven spacing', () => {
 const points=[{x:0,y:0},{x:1,y:100},{x:500,y:0},{x:501,y:0}];
 for(let i=0;i<points.length-1;i++){
  const c=controls(points,i),a=points[i],b=points[i+1];
  assert.ok(c.c1x>=a.x && c.c1x<=b.x && c.c2x>=a.x && c.c2x<=b.x);
  for(const y of [c.c1y,c.c2y])assert.ok(y>=Math.min(a.y,b.y)&&y<=Math.max(a.y,b.y));
 }
});
function harness() {
 let now=0, next=0;const raf=new Map(),timers=new Map(),sockets=[],quotes=[],statuses=[],paths=[];
 const element=()=>({style:{},hidden:false,textContent:'',querySelectorAll:()=>[]});
 const ctx=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}});
 const canvas={style:{},dataset:{},getContext:()=>ctx,remove(){this.removed=true}};
 const listeners=new Map();
 const elements={host:{...element(),appendChild(){},getBoundingClientRect:()=>({width:650,height:274}),parentElement:{querySelector:()=>element()}},badge:element(),point:element(),targetLabel:element(),priceAxis:{...element(),querySelectorAll:()=>Array.from({length:4},element)},timeAxis:{...element(),querySelectorAll:()=>Array.from({length:3},element)}};
 const globals={require:()=>math,Intl,AbortController,console,performance:{now:()=>now},
  document:{hidden:false,createElement:()=>canvas,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)},
  window:{devicePixelRatio:1,matchMedia:()=>({matches:false}),setTimeout:(f)=>{timers.set(++next,f);return next},clearTimeout:id=>timers.delete(id),setInterval:f=>{timers.set(++next,f);return next},clearInterval:id=>timers.delete(id)},
  requestAnimationFrame:f=>{raf.set(++next,f);return next},cancelAnimationFrame:id=>raf.delete(id),
  ResizeObserver:class{observe(){}disconnect(){this.disconnected=true}},
  Path2D:class{constructor(){paths.push(this);this.cubics=0}moveTo(){}lineTo(){}closePath(){}bezierCurveTo(){this.cubics++}},
  fetch:async()=>({ok:true,json:async()=>[[900000,'100','105','95','100'],[901000,'100','105','95','102']]}),
  WebSocket:class{constructor(){sockets.push(this)}close(){this.closed=true;this.onclose?.()}},
 };
 const {startLiveChart}=load('test2/live-chart.ts',globals);
 const stop=startLiveChart(900,elements,q=>quotes.push(q),s=>statuses.push(s));
 return {stop,quotes,statuses,sockets,paths,elements,canvas,listeners,raf,timers,tick(ms){now+=ms;const jobs=[...raf.values()];raf.clear();jobs.forEach(f=>f(now));}};
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

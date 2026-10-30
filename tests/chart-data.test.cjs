const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('public/test1/index.html','utf8');
const engine='//'+html.split('// Official cumulative klines own OHLC/volume;')[1].split('</script>')[0].replace(/\}\)\(\);\s*$/,'');
const row=(time,volume=2)=>[time*1000,'100','105','95','102',String(volume),time*1000+59999,String(volume*100)];
const kline=(time,volume=3,event=100)=>({e:'kline',E:event,k:{s:'BTCUSDT',i:'1m',t:time*1000,o:'100',h:'105',l:'95',c:'103',v:String(volume),q:String(volume*100)}});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(){
 const elements=new Map(),timers=new Map(),sockets=[],calls=[];let timerId=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,style:{},children:[],listeners:{},classList:{toggle(){}},appendChild(e){this.children.push(e)},addEventListener(name,fn){this.listeners[name]=fn}});return elements.get(id)};
 const scale={range:{from:0,to:10},getVisibleLogicalRange(){return this.range},setVisibleLogicalRange(r){this.range=r}};
 class Clock extends Date {static now(){return 180000}}
 const context={console,Map,Number,Math,Date:Clock,AbortController,Error,JSON,Promise,
  $:element,document:{hidden:false,createElement:()=>element('retry'),addEventListener(){},querySelectorAll:()=>[]},window:{addEventListener(){}},
  setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId},clearTimeout(id){timers.delete(id)},setInterval(fn,delay){timers.set(++timerId,{fn,delay,interval:true});return timerId},requestAnimationFrame:fn=>fn(),
  fetch:async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('klines')?[row(60),row(120)]:{priceChangePercent:'1.5'}}},
  WebSocket:class {constructor(url){this.url=url;this.readyState=0;sockets.push(this)}close(){this.readyState=3;this.onclose?.()}open(){this.readyState=1;this.onopen?.()}sendEvent(d){this.onmessage?.({data:JSON.stringify({data:d})})}},
  history:[],historyReady:false,period:'1m',mode:'candle',request:0,closed:false,retry:0,last:0,lastTrade:0,socket:null,selectedCandleTime:null,
  visualLastTime:0,visualPrice:0,visualTarget:0,reference:0,visualColor:'',visualRightOffset:null,numberLastPaint:0,
  chart:{timeScale:()=>scale,applyOptions(){}},series:{setData(){},update(d){context.lastSeriesUpdate=d}},
  intervalSeconds:()=>context.period==='1m'?60:300,
  render(){context.rendered=context.history.slice()},scheduleInspectorUpdate(){},build(){},closeInspector(){},
  update(price,time){context.last=price;context.lastTrade=time||Date.now();context.visualTarget=price},
  status(ok,msg){context.statusValue={ok,msg}},setChartLoading(on,msg){context.loading={on,msg}},pct:n=>n.toFixed(3)+'%',color:()=> 'green'
 };
 vm.createContext(context);vm.runInContext(engine+"\nglobalThis.api={load,loadOlder,applyKline,refreshStatus,refreshTicker,connect,get retryButton(){return retryButton}}",context);
 return {context,elements,timers,sockets,calls,scale,flush};
}
test('REST bootstraps without WebSocket; valid messages restore stale status',async()=>{
 const h=setup();await flush();assert.equal(h.context.history.length,2);
 h.sockets[0].open();await flush();
 assert.equal(h.context.statusValue.ok,false);
 h.sockets[0].sendEvent({e:'trade',s:'BTCUSDT',t:1,T:180000,p:'103'});
 assert.equal(h.context.statusValue.ok,true);
 vm.runInContext('lastMessageAt=Date.now()-13000',h.context);h.context.api.refreshStatus();assert.match(h.context.statusValue.msg,/stale/);
 h.sockets[0].sendEvent({e:'trade',s:'BTCUSDT',t:2,T:180000,p:'104'});assert.equal(h.context.statusValue.ok,true);
 h.sockets[0].sendEvent({e:'trade',s:'BTCUSDT',t:1,T:180000,p:'99'});assert.equal(h.context.last,104);
});
test('history error exposes retry; retry succeeds; automatic retries are bounded',async()=>{
 const h=setup();await flush();h.context.fetch=async()=>({ok:false,status:503});
 await h.context.api.load();assert.equal(h.context.api.retryButton.hidden,false);assert.equal(h.context.historyReady,false);
 for(let i=0;i<5;i++){const entry=[...h.timers].find(([,v])=>!v.interval);if(!entry)break;h.timers.delete(entry[0]);entry[1].fn();await flush()}
 assert.equal([...h.timers.values()].filter(v=>!v.interval).length,0);
 h.context.fetch=async()=>({ok:true,json:async()=>[row(120),row(180)]});h.context.api.retryButton.listeners.click();await flush();
 assert.equal(h.context.historyReady,true);assert.equal(h.context.api.retryButton.hidden,true);
});
test('timeout aborts a hung history request and makes retry available',async()=>{
 const h=setup();await flush();h.context.fetch=(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('aborted'))));
 const pending=h.context.api.load();const timeout=[...h.timers.values()].find(v=>v.delay===10000&&!v.interval);timeout.fn();await pending;
 assert.equal(h.context.api.retryButton.hidden,false);
});
test('buffered cumulative candles reconcile with REST without duplicate volume or regression',async()=>{
 const h=setup();await flush();let resolve;
 h.context.fetch=()=>new Promise(r=>resolve=r);const pending=h.context.api.load();
 h.context.api.applyKline(kline(120,4,200));h.context.api.applyKline(kline(120,4,200));h.context.api.applyKline(kline(120,3,100));
 resolve({ok:true,json:async()=>[row(120,3)]});await pending;
 assert.equal(h.context.history.at(-1).volume,4);
 h.context.api.applyKline(kline(120,3,100));assert.equal(h.context.history.at(-1).volume,4);
 h.context.api.applyKline(kline(120,4,200));assert.equal(h.context.history.at(-1).volume,4);
});
test('reconnect repairs missing intervals and keeps previously loaded history',async()=>{
 const h=setup();await flush();h.context.fetch=async()=>({ok:true,json:async()=>[row(120,8),row(180,9),row(240,10)]});
 h.context.api.connect();h.sockets.at(-1).open();await flush();
 assert.deepEqual(Array.from(h.context.history,b=>b.time),[60,120,180,240]);assert.equal(h.context.history[1].volume,8);
});
test('older pages prepend without moving the viewed candles; all candles reach renderer',async()=>{
 const h=setup();await flush();h.scale.range={from:0,to:1};h.context.fetch=async()=>({ok:true,json:async()=>[row(0)]});
 await h.context.api.loadOlder();assert.deepEqual(Array.from(h.context.history,b=>b.time),[0,60,120]);assert.equal(h.context.rendered.length,3);
 assert.equal(h.scale.range.from,1);assert.equal(h.scale.range.to,2);
});
test('ticker stream updates percentage and a late REST result cannot overwrite it',async()=>{
 const h=setup();await flush();h.sockets[0].open();await flush();let resolve;
 h.context.fetch=()=>new Promise(r=>resolve=r);const pending=h.context.api.refreshTicker();
 h.sockets[0].sendEvent({e:'24hrTicker',P:'2.5'});resolve({ok:true,json:async()=>({priceChangePercent:'1.5'})});await pending;
 assert.match(h.elements.get('daychange').textContent,/2.500/);
});
test('obsolete history responses and old socket messages cannot affect new interval',async()=>{
 const h=setup();await flush();let resolve;
 h.context.fetch=()=>new Promise(r=>resolve=r);const pending=h.context.api.load();
 h.context.period='5m';h.context.request++;resolve({ok:true,json:async()=>[row(600)]});await pending;
 assert.equal(h.context.history.at(-1).time,120);
 const old=h.sockets[0];h.context.api.connect();old.sendEvent({e:'trade',s:'BTCUSDT',t:99,T:180000,p:'999'});assert.notEqual(h.context.last,999);
});
test('bubble script and CSS are untouched by the data repair',()=>{
 const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
 assert.equal(hash(html.split('</script><script>').at(-1)),'6cc4f0f17ca241983671274578077bd686e555bde847d0796042d786445a8d63');
 assert.equal(hash(html.split('</style>')[0]),'892a5d136bb7d92c68f848ebb29f3c0dac562e7bba7fa5bc78f6fb3675c014d9');
});
test('large reconnect gap is recovered across REST pages',async()=>{
 const h=setup();await flush();let count=0;
 h.context.fetch=async url=>{count++;return {ok:true,json:async()=>count===1?Array.from({length:1000},(_,i)=>row(120+i*60)): [row(60120)]}};
 await h.context.api.load();assert.equal(count,2);assert.equal(h.context.history.length,1002);assert.equal(h.context.history.at(-1).time,60120);
});
test('very long absence resets to a recent window instead of endless recovery',async()=>{
 const h=setup();await flush();h.context.Date.now=()=>1000000000;let url;
 h.context.fetch=async u=>{url=u;return {ok:true,json:async()=>[row(999960)]}};
 await h.context.api.load();assert.equal(url.includes('startTime'),false);assert.equal(h.context.history.length,1);assert.equal(h.context.historyReady,true);
});
test('bad candle payloads are rejected without mutating history',async()=>{
 const h=setup();await flush();const invalid=kline(180);invalid.k.h='90';h.context.api.applyKline(invalid);
 assert.equal(h.context.history.length,2);assert.equal(h.context.history.at(-1).time,120);
});
test('starting a new candle commits the exact preceding close',async()=>{
 const h=setup();await flush();const writes=[];h.context.series.update=d=>writes.push(d);
 h.context.api.applyKline(kline(180));assert.equal(writes[0].time,120);assert.equal(writes[0].close,102);assert.equal(writes[1].time,180);
});
test('full inline scripts remain syntactically valid',()=>{
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});

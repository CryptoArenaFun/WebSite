const {test,before}=require('node:test');
const assert=require('node:assert/strict');
let M;
before(async()=>{M=await import('../public/test1/five-minute-model.js')});
const bar=(extra={})=>({start:300000,open:100,high:110,low:95,close:105,volume:10,quoteVolume:1030,trades:5,buyVolume:6,lastId:100,eventTime:350000,...extra});
const trade=(t,p=106,q=2,m=false,T=360000)=>({e:'trade',s:'BTCUSDT',t,p:String(p),q:String(q),m,T});
test('5m countdown uses exact UTC boundaries and restarts at 05:00',()=>{
 assert.equal(M.candleClock(366000).text,'03:54');assert.equal(M.candleClock(366000).elapsed,.22);
 assert.equal(M.candleClock(599999).text,'00:01');assert.equal(M.candleClock(600000).text,'05:00');
 assert.equal(M.candleClock(600000).start,600000);
});
test('REST fields map to real trade count and taker-buy base volume',()=>{
 const b=M.fromRest([300000,'100','110','95','105','10',599999,'1030',5,'6','620','0']);
 assert.equal(b.trades,5);assert.equal(b.buyVolume,6);assert.equal(b.lastId,null);
 const metrics=M.metrics(b);assert.equal(metrics.buy,60);assert.equal(metrics.sell,40);
});
test('stream rejects wrong interval and malformed extrema',()=>{
 const d={e:'kline',E:350000,k:{s:'BTCUSDT',i:'5m',t:300000,o:'100',h:'110',l:'95',c:'105',v:'10',q:'1030',n:5,V:'6',L:100}};
 assert.equal(M.fromKline(d).lastId,100);d.k.i='1m';assert.equal(M.fromKline(d),null);d.k.i='5m';d.k.h='99';assert.equal(M.fromKline(d),null);
});
test('buffered trades replay exactly once beyond snapshot last-trade ID',()=>{
 const model=new M.CandleModel();model.acceptTrade(trade(101));model.acceptTrade(trade(101));model.acceptSnapshot(bar());
 let current=model.current(300000);assert.equal(current.volume,12);assert.equal(current.trades,6);assert.equal(current.buyVolume,8);
 model.acceptSnapshot(bar({lastId:101,eventTime:360000,volume:12,quoteVolume:1242,trades:6,buyVolume:8,close:106}));
 current=model.current(300000);assert.equal(current.volume,12);assert.equal(current.trades,6);assert.equal(model.pending.size,0);
});
test('REST snapshots never double-count trades with an unknown boundary',()=>{
 const model=new M.CandleModel();model.acceptSnapshot(bar({lastId:null}));model.acceptTrade(trade(101));
 assert.equal(model.current(300000).volume,10);
 model.acceptSnapshot(bar());assert.equal(model.current(300000).volume,12);
 assert.equal(model.acceptSnapshot(bar({lastId:null,volume:13})),false);
});
test('buyer maker means sell aggression; buyer taker means buy aggression',()=>{
 const model=new M.CandleModel();model.acceptSnapshot(bar());model.acceptTrade(trade(101,112,2,true));model.acceptTrade(trade(102,93,3,false));
 const current=model.current(300000),metrics=M.metrics(current);
 assert.equal(current.volume,15);assert.equal(current.buyVolume,9);assert.equal(current.high,112);assert.equal(current.low,93);assert.equal(current.close,93);assert.equal(current.trades,7);
 assert.equal(metrics.buy,60);assert.equal(metrics.sell,40);
});
test('missing trade IDs pause replay until canonical snapshots bridge the gap',()=>{
 const model=new M.CandleModel();model.acceptSnapshot(bar());model.acceptTrade(trade(102));assert.equal(model.current(300000).volume,10);
 model.acceptTrade(trade(101));assert.equal(model.current(300000).volume,14);
});
test('late snapshots and previous-candle trades cannot regress the current candle',()=>{
 const model=new M.CandleModel();model.acceptSnapshot(bar({start:600000,eventTime:650000,lastId:200}));
 assert.equal(model.acceptSnapshot(bar()),false);assert.equal(model.acceptTrade(trade(201,105,1,false,360000)),false);
 assert.equal(model.current(300000),null);assert.equal(model.current(600000).volume,10);
});
test('next-interval trades do not modify previous candle and wait for its own open',()=>{
 const model=new M.CandleModel();model.acceptSnapshot(bar());model.acceptTrade(trade(101,120,1,false,600001));
 assert.equal(model.current(300000).close,105);assert.equal(model.current(600000),null);
 model.acceptSnapshot(bar({start:600000,open:120,high:120,low:120,close:120,volume:1,trades:1,buyVolume:1,lastId:101,eventTime:600010}));
 assert.equal(model.current(600000).volume,1);
});
test('zero-volume and flat candles avoid invented buy/sell percentages and NaN',()=>{
 const b=bar({open:100,high:100,low:100,close:100,volume:0,buyVolume:0,trades:0});
 const metrics=M.metrics(b);assert.equal(metrics.bodyPct,0);assert.equal(metrics.buy,null);assert.equal(metrics.sell,null);
 const g=M.candleGeometry(b,20,280);assert.equal(g.high,g.low);assert.ok(Number.isFinite(g.open));
});
test('candle geometry is proportional and respects extrema for both directions',()=>{
 for(const b of [bar(),bar({open:105,close:100})]){
  const g=M.candleGeometry(b,20,280);assert.ok(g.high<=g.open&&g.high<=g.close);assert.ok(g.low>=g.open&&g.low>=g.close);
  assert.ok(Math.abs(Math.abs(g.open-g.close)/(g.low-g.high)-Math.abs(b.open-b.close)/(b.high-b.low))<1e-10);
 }
});
test('invalid taker volume and trade payloads are ignored',()=>{
 assert.equal(M.validCandle(bar({buyVolume:11})),false);assert.equal(M.validTrade(trade(101,105,-1)),false);assert.equal(M.validTrade({...trade(101),m:undefined}),false);
});

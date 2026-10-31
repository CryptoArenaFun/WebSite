import {PERIOD_MS,bucketStart,candleClock,fromRest,fromKline,validTrade,CandleModel,metrics,candleGeometry} from './five-minute-model.js';

const root=document.getElementById('five-minute');
if(root) startFiveMinute();
function startFiveMinute(){
  const $=name=>document.getElementById('fm-'+name);
  const API='https://data-api.binance.vision/api/v3/';
  const money=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const number=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const utc=t=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC',hour12:false});
  const up='#15dfac',down='#ff637b',neutral='#b5c5d7';
  let model=new CandleModel(),socket=null,generation=0,closed=false,ready=false;
  let serverAnchor=Date.now(),performanceAnchor=performance.now(),clockKnown=false;
  let reconnectTimer=null,retryTimer=null,retryCount=0,loadAttempts=0,historyRequest=null,clockRequest=null;
  let receivedAt=0,openedAt=0,lastBucket=null,dirty=true,lastPaint=0,lastBar=null,viewWidth=0;
  let pendingFrame=0,glyphFrame=0,drawn=null,lastStatus='',visible=!document.hidden;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const now=()=>serverAnchor+performance.now()-performanceAnchor;
  function setClock(time,at=performance.now()){
    if(!Number.isFinite(time))return;
    serverAnchor=time;performanceAnchor=at;clockKnown=true;dirty=true;
  }
  async function json(path,controller){
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetch(API+path,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}
    finally{clearTimeout(timeout);}
  }
  async function syncClock(){
    if(clockRequest||closed)return;
    const controller=new AbortController();clockRequest=controller;const start=performance.now();
    try{const data=await json('time',controller);if(!closed)setClock(data.serverTime,(start+performance.now())/2);}catch{}
    finally{if(clockRequest===controller)clockRequest=null;}
  }
  async function loadSnapshot(){
    if(closed||historyRequest)return;
    clearTimeout(retryTimer);const controller=new AbortController(),id=generation;historyRequest=controller;
    try{
      const rows=await json('klines?symbol=BTCUSDT&interval=5m&limit=2',controller);
      if(closed||id!==generation)return;
      if(!Array.isArray(rows))throw Error('Invalid candle response');
      const candidates=rows.map(fromRest).filter(Boolean);
      const bar=candidates.find(b=>b.start===bucketStart(now()));
      if(!bar)throw Error('Current candle is not available yet');
      model.acceptSnapshot(bar);loadAttempts=0;ready=true;dirty=true;
    }catch{
      if(closed||id!==generation)return;
      $('retry').hidden=false;
      if(loadAttempts++<3)retryTimer=setTimeout(loadSnapshot,Math.min(8000,1000*2**(loadAttempts-1)));
    }finally{if(historyRequest===controller)historyRequest=null;}
  }
  function connect(){
    if(closed)return;
    clearTimeout(reconnectTimer);clearTimeout(retryTimer);historyRequest?.abort();historyRequest=null;
    const id=++generation;if(socket){socket.onclose=null;socket.close();}
    model=new CandleModel();ready=false;receivedAt=0;openedAt=performance.now();loadAttempts=0;dirty=true;
    loadSnapshot();syncClock();
    function reconnect(){
      if(closed||id!==generation)return;
      dirty=true;
      reconnectTimer=setTimeout(connect,Math.min(20000,1000*2**Math.min(retryCount++,4))+Math.random()*300);
    }
    try{
      socket=new WebSocket('wss://data-stream.binance.vision:443/stream?streams=btcusdt@kline_5m/btcusdt@trade');
      socket.onopen=()=>{if(id!==generation)return;openedAt=performance.now();retryCount=0;dirty=true;};
      socket.onmessage=event=>{
        if(closed||id!==generation)return;
        let d;try{d=JSON.parse(event.data);d=d.data||d;}catch{return;}
        const bar=fromKline(d);
        if(bar){
          if(!clockKnown)setClock(d.E);
          if(model.acceptSnapshot(bar)){receivedAt=performance.now();ready=true;loadAttempts=0;clearTimeout(retryTimer);dirty=true;}
        }else if(validTrade(d)){
          if(!clockKnown&&Number.isFinite(d.E))setClock(d.E);
          if(model.acceptTrade(d)){receivedAt=performance.now();dirty=true;}
        }
      };
      socket.onerror=()=>socket.close();socket.onclose=reconnect;
    }catch{reconnect();}
  }
  function attr(id,values){const el=$(id);for(const [key,value] of Object.entries(values))el.setAttribute(key,String(value));}
  function text(id,value){const el=$(id);if(el.textContent!==value)el.textContent=value;}
  function clearData(){
    for(const id of ['price','range','range-pct','volume','quote-volume','trades','body-pct','buy','sell'])text(id,'—');
    text('change','— · 5m');$('body-fill').style.width='0%';$('buy-fill').style.width='0%';$('sell-fill').style.width='0%';
    $('taker-bar').setAttribute('aria-label','Waiting for current candle volume');
    attr('glyph',{visibility:'hidden'});$('empty').hidden=false;
    text('empty',clockKnown?'Waiting for current 5m candle…':'Synchronizing market data…');
    cancelAnimationFrame(glyphFrame);glyphFrame=0;drawn=null;lastBar=null;
  }
  function drawGeometry(points,x,width,shade){
    attr('wick',{x1:x,x2:x,y1:points.high,y2:points.low,stroke:shade});
    attr('body',{x:x-width/2,y:Math.min(points.open,points.close),width,height:Math.max(2,Math.abs(points.close-points.open)),fill:shade});
    attr('live-dot',{cx:x,cy:points.close});
    drawn={...points};
  }
  function paintChart(bar,shade){
    const width=$('plot').clientWidth,height=$('plot').clientHeight;
    if(width<100)return;
    attr('svg',{viewBox:`0 0 ${width} ${height}`});
    const left=width<500?50:72,right=width-12,top=28,bottom=height-40;
    const x=left+(right-left)*.37,bodyWidth=width<500?27:40;
    const geo=candleGeometry(bar,top,bottom);
    // Axis ticks follow the exact same price transform as body and wick.
    const svgNS='http://www.w3.org/2000/svg';$('grid').replaceChildren();
    for(let i=0;i<=4;i++){
      const y=top+(bottom-top)*i/4,value=geo.max-(geo.max-geo.min)*i/4;
      const line=document.createElementNS(svgNS,'line');
      for(const [key,v] of Object.entries({x1:left,x2:right,y1:y,y2:y,stroke:'#203248','stroke-opacity':'.65'}))line.setAttribute(key,v);
      const label=document.createElementNS(svgNS,'text');label.setAttribute('x',left-7);label.setAttribute('y',y+3);label.setAttribute('text-anchor','end');label.style.fontSize=width<500?'9px':'11px';label.style.fill='#8198b7';label.textContent=Math.abs(geo.max-geo.min)<10?value.toFixed(2):value.toFixed(0);
      $('grid').append(line,label);
    }
    const tagWidth=width<500?103:127,tagLeft=right-tagWidth;
    const liveY=geo.close;
    attr('live-line',{x1:x,x2:tagLeft,y1:liveY,y2:liveY,stroke:shade});
    attr('live-tag',{x:tagLeft,y:liveY-11,width:tagWidth,height:22,fill:shade});
    attr('live-label',{x:tagLeft+tagWidth/2,y:liveY+4});text('live-label',number(bar.close)+' LIVE');
    const openLabelY=Math.abs(geo.open-liveY)<26?Math.min(height-23,geo.open+30):geo.open+4;
    attr('open-line',{x1:x,x2:Math.max(x,right-126),y1:geo.open,y2:geo.open});
    attr('open-label',{x:right,y:openLabelY});text('open-label','OPEN '+number(bar.open));
    attr('high-label',{x,y:geo.high-12});text('high-label',money(bar.high));
    attr('low-label',{x,y:geo.low+20});text('low-label',money(bar.low));
    attr('time-label',{x,y:height-10});text('time-label',utc(bar.start)+' UTC');
    $('svg').setAttribute('aria-label',`Current 5 minute candle. High ${number(bar.high)}, current ${number(bar.close)}, open ${number(bar.open)}, low ${number(bar.low)}.`);
    attr('glyph',{visibility:'visible'});$('empty').hidden=true;
    const target={high:geo.high,low:geo.low,open:geo.open,close:geo.close};
    cancelAnimationFrame(glyphFrame);
    if(!drawn||!lastBar||lastBar.start!==bar.start||viewWidth!==width||reducedMotion.matches){drawGeometry(target,x,bodyWidth,shade);}
    else{
      const from={...drawn},began=performance.now();
      const animate=time=>{
        const t=Math.min(1,(time-began)/130),ease=1-(1-t)**3,points={};
        for(const key of Object.keys(target))points[key]=from[key]+(target[key]-from[key])*ease;
        drawGeometry(points,x,bodyWidth,shade);
        if(t<1)glyphFrame=requestAnimationFrame(animate);
      };
      glyphFrame=requestAnimationFrame(animate);
    }
    viewWidth=width;
  }
  function paintBar(bar){
    const m=metrics(bar),shade=m.change>0?up:m.change<0?down:neutral,sign=m.change>0?'+':m.change<0?'−':'';
    text('price',money(bar.close));text('change',`${sign}${money(Math.abs(m.change))} (${sign}${Math.abs(m.changePct).toFixed(3)}%) · 5m`);$('change').style.color=shade;
    text('range',money(m.range));text('range-pct',`(${m.rangePct.toFixed(3)}%)`);
    text('volume',bar.volume.toLocaleString('en-US',{maximumFractionDigits:3})+' BTC');text('quote-volume',money(bar.quoteVolume));
    text('trades',bar.trades.toLocaleString('en-US'));text('body-pct',m.bodyPct.toFixed(1)+'%');$('body-fill').style.width=m.bodyPct+'%';
    const buy=m.buy===null?null:Math.round(m.buy*10)/10,sell=buy===null?null:100-buy;
    text('buy',buy===null?'—':buy.toFixed(1)+'%');text('sell',sell===null?'—':sell.toFixed(1)+'%');
    $('buy-fill').style.width=(buy??0)+'%';$('sell-fill').style.width=(sell??0)+'%';
    $('taker-bar').setAttribute('aria-label',buy===null?'No traded volume yet':`Taker buy ${buy.toFixed(1)} percent, taker sell ${sell.toFixed(1)} percent of BTC volume`);
    paintChart(bar,shade);lastBar=bar;
  }
  function paint(){
    pendingFrame=0;if(closed||!visible)return;
    const clock=candleClock(now());
    if(clockKnown){
      text('countdown',clock.text);text('window',`${utc(clock.start)} — ${utc(clock.end)} UTC`);
      $('progress-fill').style.width=(clock.elapsed*100)+'%';$('progress').setAttribute('aria-valuenow',String(Math.round(clock.elapsed*100)));
    }
    if(lastBucket!==clock.start){
      lastBucket=clock.start;dirty=true;loadAttempts=0;
      if(clockKnown&&!model.current(clock.start))loadSnapshot();
    }
    const fresh=receivedAt>0&&performance.now()-receivedAt<12000;
    const bar=clockKnown?model.current(clock.start):null;
    const live=!!bar&&socket?.readyState===1&&fresh;
    const status=live?'FORMING':navigator.onLine===false?'OFFLINE':bar?'DATA DELAYED':ready?'NEW CANDLE · SYNCING':'CONNECTING…';
    if(status!==lastStatus){
      text('status',status);$('status').classList.toggle('is-live',live);text('live-state',live?'LIVE':bar?'DELAYED':'SYNCING');$('live-state').classList.toggle('is-live',live);lastStatus=status;
    }
    if(live)$('retry').hidden=true;
    else if(performance.now()-openedAt>12000)$('retry').hidden=false;
    if(dirty&&performance.now()-lastPaint>=90){
      dirty=false;lastPaint=performance.now();if(bar)paintBar(bar);else clearData();
    }
  }
  const frame=()=>{if(!pendingFrame)pendingFrame=requestAnimationFrame(paint);};
  const tick=setInterval(frame,125);
  const watchdog=setInterval(()=>{
    if(!closed&&visible&&socket?.readyState===1&&performance.now()-(receivedAt||openedAt)>20000)connect();
  },3000);
  const clockTimer=setInterval(()=>{if(visible)syncClock();},60000);
  const resize=new ResizeObserver(()=>{dirty=true;drawn=null;frame();});resize.observe($('plot'));
  $('retry').addEventListener('click',()=>{if(socket?.readyState!==1)connect();else{loadAttempts=0;loadSnapshot();syncClock();}});
  function resume(){if(closed)return;visible=!document.hidden;dirty=true;if(visible){syncClock();if(!socket||socket.readyState>1||performance.now()-receivedAt>12000)connect();frame();}}
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  window.addEventListener('offline',()=>{dirty=true;frame();});
  window.addEventListener('pagehide',()=>{closed=true;generation++;socket?.close();historyRequest?.abort();clockRequest?.abort();clearTimeout(reconnectTimer);clearTimeout(retryTimer);clearInterval(tick);clearInterval(watchdog);clearInterval(clockTimer);cancelAnimationFrame(pendingFrame);cancelAnimationFrame(glyphFrame);resize.disconnect();});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  syncClock();connect();frame();
}

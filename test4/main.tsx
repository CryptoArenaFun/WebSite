import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startLiveChart } from '../test2/live-chart';
import type { ChartView } from '../test2/chart-motion';
import { RollingPrice } from '../test2/RollingPrice';
import '@fontsource-variable/inter/wght.css';
import { amountViewportFit } from './amount-viewport';
import './style.css';

const interval = 900;
const now = () => Math.floor(Date.now() / 1000);
const money = (value?: number) => value === undefined ? '—' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(value);
const time = (value: number) => new Intl.DateTimeFormat('en-GB', {hour:'2-digit',minute:'2-digit'}).format(value * 1000);
const asset = (name: string) => '/test4-assets/img' + name + '.svg';
function Icon({name, className = ''}: {name: string; className?: string}) { return <img className={'icon ' + className} src={asset(name)} alt="" aria-hidden="true"/>; }

export function App() {
  const mode = useRef<ChartView>('round');
  const [view,setView] = useState<ChartView>('round');
  const [flash,setFlash] = useState(0);
  const host = useRef<HTMLDivElement>(null), badge = useRef<HTMLSpanElement>(null), point = useRef<HTMLSpanElement>(null), target = useRef<HTMLSpanElement>(null);
  const priceAxis = useRef<HTMLDivElement>(null), timeAxis = useRef<HTMLDivElement>(null);
  const [clock,setClock] = useState(now);
  const [quote,setQuote] = useState<{start:number;target:number;price:number}>();
  const [status,setStatus] = useState('Connecting');
  const params = new URLSearchParams(window.location.search);
  const funded = params.get('pool') !== 'awaiting';
  const [side,setSide] = useState<'UP'|'DOWN'>(funded ? 'UP' : 'DOWN');
  const [amount,setAmount] = useState('25.00');
  const [percentOpen,setPercentOpen] = useState(false);
  const amountEditOrigin = useRef<{x:number;y:number;height:number}|null>(null);
  const pendingScrollRestore = useRef<(() => void)|null>(null);
  const amountField = useRef<HTMLDivElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const percentPicker = useRef<HTMLDivElement>(null);
  const payoutBox = useRef<HTMLDivElement>(null);
  const availableBalance = 250;
  const [expanded,setExpanded] = useState(true);
  const [navVisible,setNavVisible] = useState(true);
  const [dialog,setDialog] = useState<'wallet'|'help'|'notifications'|'payout'|'profit'|null>(null);
  const start = Math.floor(clock / interval) * interval;
  const remaining = Math.max(0,start + interval - clock);
  const nextRound = time(start + interval) + '–' + time(start + 2 * interval);
  const stake = Number(amount);
  const valid = Number.isFinite(stake) && stake > 0 && stake <= availableBalance;
  const upPool = funded ? 475 : 25, downPool = funded ? 500 : 0;
  const selectedPool = side === 'UP' ? upPool : downPool;
  const payout = funded && valid ? Math.max(stake, stake / (selectedPool + stake) * (upPool + downPool + stake) * .95) : undefined;
  const change = quote ? (quote.price - quote.target) / quote.target : undefined;
  useEffect(() => { const timer = window.setInterval(() => setClock(now()),250); return () => clearInterval(timer); },[]);
  useEffect(() => {
    const scrollPosition = () => Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight));
    let previous = scrollPosition();
    let travel = 0;
    let visible = true;
    const show = (next: boolean) => {
      if (next === visible) return;
      visible = next;
      setNavVisible(next);
    };
    const onScroll = () => {
      const current = scrollPosition();
      const delta = current - previous;
      previous = current;
      if (current <= 8) { travel = 0; show(true); return; }
      if (!delta) return;
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      if (Math.abs(travel) >= 12) { show(travel < 0); travel = 0; }
    };
    window.addEventListener('scroll', onScroll, {passive:true});
    return () => window.removeEventListener('scroll', onScroll);
  },[]);
  useEffect(() => {
    if (!host.current || !badge.current || !point.current || !target.current || !priceAxis.current || !timeAxis.current) return;
    const stop = startLiveChart(start,{host:host.current,badge:badge.current,point:point.current,targetLabel:target.current,priceAxis:priceAxis.current,timeAxis:timeAxis.current},setQuote,setStatus,mode);
    return () => stop(true);
  },[start]);
  useEffect(() => { if (!dialog) return; const key = (event:KeyboardEvent) => { if(event.key === 'Escape')setDialog(null); }; document.addEventListener('keydown',key); return () => document.removeEventListener('keydown',key); },[dialog]);
  useLayoutEffect(() => {
    if (!percentOpen) return;
    const viewport = window.visualViewport;
    const picker = percentPicker.current;
    const field = amountField.current;
    const payout = payoutBox.current;
    const shell = field?.closest<HTMLElement>('.shell');
    const origin = amountEditOrigin.current;
    if (!picker || !field || !payout || !shell || !origin) return;
    const height = () => viewport?.height ?? window.innerHeight;
    const width = () => viewport?.width ?? window.innerWidth;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motion: ScrollBehavior = reducedMotion ? 'instant' : 'smooth';
    let baseline = Math.max(origin.height, height());
    let previousWidth = width();
    let keyboardWasOpen = false;
    let fitFrame = 0;
    let settleTimer = 0;
    let extra = 0;
    let lastRequested = Number.NaN;
    let lastGeometry = '';
    let densityGeometry = '';
    let tooShort = false;
    let closing = false;
    let manualScroll = false;
    let touchOrigin: {x:number;y:number}|null = null;
    const releaseAutoScroll = () => {
      if (manualScroll) return;
      manualScroll=true;
      window.cancelAnimationFrame(fitFrame);
      fitFrame=0;
      window.clearTimeout(settleTimer);
    };
    const touchStart = (event: TouchEvent) => {
      const target = event.target;
      if (event.touches.length !== 1 || (target instanceof Element && target.closest('input[type="range"]'))) {
        touchOrigin=null;
        return;
      }
      const finger=event.touches[0];
      touchOrigin={x:finger.clientX,y:finger.clientY};
    };
    const touchMove = (event: TouchEvent) => {
      if (!touchOrigin || event.touches.length !== 1) return;
      const finger=event.touches[0];
      const dx=Math.abs(finger.clientX-touchOrigin.x),dy=Math.abs(finger.clientY-touchOrigin.y);
      if (dy>=6 && dy>=dx) releaseAutoScroll();
    };
    const touchEnd = () => {touchOrigin=null;};
    const wheelScroll = (event: WheelEvent) => {
      if (!event.ctrlKey && Math.abs(event.deltaY)>0) releaseAutoScroll();
    };
    const scrollKey = (event: KeyboardEvent) => {
      const target=event.target;
      if (target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key) || (event.key === ' ' && !(target instanceof Element && target.closest('button,a,[role="button"]')))) releaseAutoScroll();
    };
    let outsidePointer: number | null = null;
    let outsideTimer = 0;
    let keyboardDismissedDuringTap = false;
    shell.dataset.amountEditing = 'true';
    const close = () => {if (closing) return;closing=true;amountInput.current?.blur();setPercentOpen(false);};
    const bounds = () => {
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + height();
      return {top,bottom};
    };
    const fit = () => {
      fitFrame = 0;
      if (closing || manualScroll || outsidePointer !== null) return;
      const visible = bounds();
      const available = visible.bottom-visible.top;
      const geometryKey = Math.round(available)+':'+Math.round(width());
      if (densityGeometry !== geometryKey) {
        densityGeometry=geometryKey;
        shell.dataset.amountDensity=available < 310 ? 'tight' : available < 430 ? 'compact' : 'normal';
      }
      // Prefer the original appearance, but compact based on measured content, not width guesses.
      const regionHeight = () => payout.getBoundingClientRect().bottom-field.getBoundingClientRect().top;
      if (regionHeight()>available-16 && shell.dataset.amountDensity==='normal') shell.dataset.amountDensity='compact';
      if (regionHeight()>available-16 && shell.dataset.amountDensity==='compact') shell.dataset.amountDensity='tight';
      const top=field.getBoundingClientRect().top;
      const bottom=payout.getBoundingClientRect().bottom;
      const scrollY=window.scrollY;
      const maxScroll=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
      const result=amountViewportFit(top,bottom,visible.top,visible.bottom,scrollY,maxScroll);
      const wasTooShort=tooShort;
      tooShort=!result.fits;
      const geometry=[Math.round(top+scrollY),Math.round(bottom+scrollY),Math.round(available),Math.round(width())].join(':');
      if (tooShort && wasTooShort && geometry===lastGeometry) return;
      lastGeometry=geometry;
      if (result.extra>0) {
        extra+=result.extra;
        shell.style.setProperty('--amount-edit-extra',extra+'px');
      }
      if (Math.abs(result.target-scrollY)<=1) {lastRequested=Number.NaN;return;}
      // Do not restart animations or fight the browser's own focus scroll.
      if (Math.abs(result.target-lastRequested)<=.5 && result.extra===0) return;
      lastRequested=result.target;
      window.scrollTo({left:window.scrollX,top:result.target,behavior:'instant'});
    };
    const scheduleFit = () => {
      if (!fitFrame && !closing && !manualScroll && outsidePointer === null) fitFrame=window.requestAnimationFrame(fit);
    };
    const settle = () => {
      if (manualScroll || closing) return;
      window.clearTimeout(settleTimer);
      settleTimer=window.setTimeout(()=>{lastRequested=Number.NaN;scheduleFit();},180);
    };
    const keyboardResize = () => {
      if (closing) return;
      const current=height(),currentWidth=width();
      if (Math.abs(currentWidth-previousWidth)>35 || (viewport && Math.abs(viewport.scale-1)>.05)) {
        baseline=current;previousWidth=currentWidth;
      }
      if (!keyboardWasOpen) baseline=Math.max(baseline,current);
      const lostHeight=baseline-current;
      const visibleLoss=window.innerHeight-current;
      if (lostHeight>120 || visibleLoss>120) {
        keyboardWasOpen=true;
        shell.dataset.amountKeyboard='true';
      } else if (keyboardWasOpen && lostHeight<70 && visibleLoss<70) {
        if (outsidePointer !== null) {keyboardDismissedDuringTap=true;return;}
        close();return;
      }
      lastRequested=Number.NaN;
      scheduleFit();settle();
    };
    const onViewportScroll = () => {scheduleFit();settle();};
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(field);observer.observe(picker);observer.observe(payout);
    viewport?.addEventListener('resize',keyboardResize);
    viewport?.addEventListener('scroll',onViewportScroll);
    window.addEventListener('resize',keyboardResize);
    window.addEventListener('scroll',onViewportScroll,{passive:true});
    keyboardResize();
    const isOutside = (target: EventTarget | null) => target instanceof Node && !field.contains(target) && !picker.contains(target);
    const outside = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || !isOutside(event.target)) return;
      window.clearTimeout(outsideTimer);
      outsidePointer=event.pointerId;
      keyboardDismissedDuringTap=false;
      // Preserve the native click target until the gesture finishes. Never replay clicks.
      window.cancelAnimationFrame(fitFrame);fitFrame=0;
      window.clearTimeout(settleTimer);
      if (event.cancelable && event.target instanceof Element && event.target.closest('button:not(:disabled),a[href],[role="button"]')) event.preventDefault();
    };
    const outsideUp = (event: PointerEvent) => {
      if (event.pointerId !== outsidePointer) return;
      outsideTimer=window.setTimeout(()=>{
        outsidePointer=null;
        if (keyboardDismissedDuringTap) close();else scheduleFit();
      },350);
    };
    const outsideCancel = (event: PointerEvent) => {
      if (event.pointerId !== outsidePointer) return;
      window.clearTimeout(outsideTimer);
      outsidePointer=null;
      if (keyboardDismissedDuringTap) close();else scheduleFit();
    };
    const outsideClick = (event: MouseEvent) => {
      if (!isOutside(event.target)) return;
      window.clearTimeout(outsideTimer);
      // Close after native dispatch and the clicked element's React handler.
      outsideTimer=window.setTimeout(close,0);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || (event.key === 'Enter' && event.target === amountInput.current)) close();
    };
    document.addEventListener('touchstart',touchStart,{capture:true,passive:true});
    document.addEventListener('touchmove',touchMove,{capture:true,passive:true});
    document.addEventListener('touchend',touchEnd,{capture:true,passive:true});
    document.addEventListener('touchcancel',touchEnd,{capture:true,passive:true});
    document.addEventListener('wheel',wheelScroll,{capture:true,passive:true});
    document.addEventListener('keydown',scrollKey,true);
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('pointerup',outsideUp,true);
    document.addEventListener('pointercancel',outsideCancel,true);
    document.addEventListener('click',outsideClick,true);
    document.addEventListener('keydown',escape);
    return () => {
      document.removeEventListener('touchstart',touchStart,true);
      document.removeEventListener('touchmove',touchMove,true);
      document.removeEventListener('touchend',touchEnd,true);
      document.removeEventListener('touchcancel',touchEnd,true);
      document.removeEventListener('wheel',wheelScroll,true);
      document.removeEventListener('keydown',scrollKey,true);
      document.removeEventListener('pointerdown',outside,true);
      document.removeEventListener('pointerup',outsideUp,true);
      document.removeEventListener('pointercancel',outsideCancel,true);
      document.removeEventListener('click',outsideClick,true);
      window.clearTimeout(outsideTimer);
      document.removeEventListener('keydown',escape);
      viewport?.removeEventListener('resize',keyboardResize);
      viewport?.removeEventListener('scroll',onViewportScroll);
      window.removeEventListener('resize',keyboardResize);
      window.removeEventListener('scroll',onViewportScroll);
      observer.disconnect();
      window.cancelAnimationFrame(fitFrame);
      window.clearTimeout(settleTimer);
      amountEditOrigin.current = null;
      const collapsedAt = performance.now() + (reducedMotion ? 0 : 180);
      // Keep the temporary scroll room until the single return animation finishes.
      let restoreSettleTimer = 0;
      let deadline = 0;
      let finishFrame = 0;
      let restoring = false;
      const cancelRestore = () => {
        window.clearTimeout(restoreSettleTimer);
        window.clearTimeout(deadline);
        window.cancelAnimationFrame(finishFrame);
        viewport?.removeEventListener('resize',onRestoreResize);
        window.removeEventListener('resize',onRestoreResize);
        shell.style.removeProperty('--amount-edit-extra');
        delete shell.dataset.amountDensity;
        delete shell.dataset.amountEditing;
        delete shell.dataset.amountKeyboard;
        if (pendingScrollRestore.current === cancelRestore) pendingScrollRestore.current = null;
      };
      const restore = () => {
        if (restoring) return;
        if (performance.now() < collapsedAt) {restoreSettleTimer=window.setTimeout(restore,Math.ceil(collapsedAt-performance.now()));return;}
        restoring = true;
        delete shell.dataset.amountDensity;
        window.clearTimeout(restoreSettleTimer);
        window.clearTimeout(deadline);
        viewport?.removeEventListener('resize',onRestoreResize);
        window.removeEventListener('resize',onRestoreResize);
        if (Math.abs(window.scrollY-origin.y) <= 2 && Math.abs(window.scrollX-origin.x) <= 2) {cancelRestore();return;}
        window.scrollTo({left:origin.x,top:origin.y,behavior:motion});
        const began = performance.now();
        const finish = () => {
          if (Math.abs(window.scrollY-origin.y) <= 2 || performance.now()-began > 600) {cancelRestore();return;}
          finishFrame = window.requestAnimationFrame(finish);
        };
        finishFrame = window.requestAnimationFrame(finish);
      };
      const onRestoreResize = () => {
        window.clearTimeout(restoreSettleTimer);
        if (height() >= origin.height-70 && window.innerHeight-height() < 70) restoreSettleTimer = window.setTimeout(restore,Math.max(140,Math.ceil(collapsedAt-performance.now())));
      };
      pendingScrollRestore.current = cancelRestore;
      viewport?.addEventListener('resize',onRestoreResize);
      window.addEventListener('resize',onRestoreResize);
      deadline = window.setTimeout(() => {if (height() >= origin.height-70 || window.innerHeight-height() < 70) restore();else cancelRestore();},1400);
      onRestoreResize();
    };
  },[percentOpen]);
  const captureAmountOrigin = () => {
    if (percentOpen || amountEditOrigin.current) return;
    pendingScrollRestore.current?.();
    amountEditOrigin.current = {x:window.scrollX,y:window.scrollY,height:window.visualViewport?.height ?? window.innerHeight};
  };
  const openAmountPicker = () => {
    captureAmountOrigin();
    setPercentOpen(true);
  };
  const toggle = () => { mode.current = mode.current === 'round' ? 'detail' : mode.current === 'detail' ? 'round-ten' : 'round';setView(mode.current);setFlash(v => v + 1); };
  return <main className="shell" data-version="figma-v7-test4">
    <header className="header">
      <a className="brand" href={window.location.pathname === "/" ? "/" : "/test4/"}><Icon name="CryptoArenaLogo"/><span>Crypto <b>Arena</b></span></a>
      <button className="notifications" aria-label="Notifications" onClick={() => setDialog('notifications')}><Icon name="Notifications"/></button>
      <button className="connect" onClick={() => setDialog('wallet')}><Icon name="WalletIcon"/><span>Connect Wallet</span></button>
    </header>
    <section className="overview panel" aria-label="Current Bitcoin round">
      <div className="market">
        <Icon name="BitcoinBadge" className="bitcoin"/>
        <div className="market-title"><h1>BTC Up / Down</h1><p><Icon name="RoundClock"/>15-Minute Round</p></div>
        <span className="change" data-negative={change !== undefined && change < 0}><Icon name={change !== undefined && change < 0 ? "DownRightArrow" : "UpRightArrow"}/>{change === undefined ? '—' : new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'}).format(change)}</span>
        <span className="feed" data-live={status === 'Live'} role="status"><Icon name="LiveGreenDot"/>Binance · {status}</span>
      </div>
      <div className="plot" role="button" tabIndex={0} data-chart-view={view} aria-label={view === 'round' ? 'Full round chart. Tap for ten-second detail.' : view === 'detail' ? 'Ten-second detail. Tap for ten seconds at full-round scale.' : 'Last ten seconds at full-round scale. Tap for full round.'} onClick={toggle} onKeyDown={e => {if(e.key === 'Enter' || e.key === ' '){e.preventDefault();toggle();}}}>
        <div className="chart-grid" aria-hidden="true"><Icon name="FaintChartGrid"/></div>
        <div className="chart" ref={host}/><div className="axis-frame" aria-hidden="true"/>
        <div className="price-axis" ref={priceAxis} aria-hidden="true">{[0,1,2,3].map(i => <span key={i} hidden/>)}</div>
        <div className="time-axis" ref={timeAxis} aria-hidden="true">{[0,1,2].map(i => <span key={i} hidden/>)}</div>
        <span className="target-label" ref={target}>Target</span><span className="price-point" ref={point} aria-hidden="true"/>
        <span className="price-badge" ref={badge} aria-hidden="true">{quote ? new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(quote.price) : '—'}</span>
        {flash > 0 && <span className="chart-switch-flash" key={flash} aria-hidden="true"/>}
      </div>
      <div className="metrics">
        <div><span>Price To Beat</span><strong>{money(quote?.target)}</strong></div>
        <div><span>Current Price</span><strong><RollingPrice value={quote?.price} currency/></strong></div>
        <div><span>Round Ends In</span><div className="countdown"><strong><RollingPrice value={Math.floor(remaining / 60)} fractionDigits={0} minimumIntegerDigits={2} flash={false}/><small>MIN</small></strong><strong><RollingPrice value={remaining % 60} fractionDigits={0} minimumIntegerDigits={2} flash={false}/><small>SECS</small></strong></div></div>
      </div>
    </section>
    <section className="prediction panel">
      <div className="section-title"><h2>Make a Prediction</h2><button className="help-link" onClick={() => setDialog('help')}><Icon name="PoolInfoIcon"/>How it works</button></div>
      <div className="timing"><div><span>NEXT ROUND</span><strong>{nextRound}</strong></div><div><span>ENTRY CLOSES IN</span><div><strong>{String(Math.floor(remaining / 60)).padStart(2,'0')}:{String(remaining % 60).padStart(2,'0')}</strong><small>min : sec</small></div></div></div>
      <div className="choices">{(['UP','DOWN'] as const).map(s => <button key={s} className={s.toLowerCase()} aria-pressed={side === s} onClick={() => setSide(s)}><b><Icon name={s === 'UP' ? (side === 'UP' ? 'UpSelectedArrow' : 'UpDirectionArrow') : (side === 'DOWN' ? 'DownDirectionArrow' : 'DownIdleArrow')}/>{s === 'UP' ? 'Up' : 'Down'}<i aria-hidden="true"/></b><span>{s === 'UP' ? 'Above' : 'Below'} opening price</span></button>)}</div>
      <div className="entry" dir="ltr" onPointerDownCapture={event => {if (event.target instanceof Element && event.target.closest('.amount-input,label[for="amount"]')) captureAmountOrigin();}}>
        <div className="amount-label"><label htmlFor="amount">Amount</label><span>Available: {availableBalance.toFixed(2)} USDT</span></div>
        <div className="amount-control" data-open={percentOpen}>
        <div className="amount-input" ref={amountField} onClick={() => {openAmountPicker();if (document.activeElement !== amountInput.current) amountInput.current?.focus({preventScroll:true});}}>
          <input ref={amountInput} id="amount" inputMode="decimal" type="number" min="0.01" max={availableBalance} step="0.01" value={amount} onFocus={openAmountPicker} onChange={e => setAmount(e.target.value)} aria-invalid={!valid} aria-controls="amount-percent-picker" aria-expanded={percentOpen}/>
          <span className="amount-currency">USDT</span>
        </div>
        <div className="percent-disclosure" data-open={percentOpen} inert={!percentOpen} aria-hidden={!percentOpen}>
          <div className="percent-disclosure-clip">
        <div ref={percentPicker} id="amount-percent-picker" className="percent-picker" role="group" aria-label="Select a percentage of your available wallet balance">
          <div className="percent-picker-heading"><span>Wallet balance</span><strong>{availableBalance.toFixed(2)} USDT</strong></div>
          <label className="percent-range-label" htmlFor="amount-percent-range"><span>Select percentage</span><strong>{Number.isFinite(stake) && stake >= 0 && stake <= availableBalance ? Number((stake / availableBalance * 100).toFixed(2)) : '—'}%</strong></label>
          <input id="amount-percent-range" className="percent-range" type="range" min="0" max="100" step="1" dir="ltr" value={Math.round(Number.isFinite(stake) ? Math.max(0,Math.min(100,stake / availableBalance * 100)) : 0)} onChange={e => setAmount((availableBalance * Number(e.target.value) / 100).toFixed(2))}/>
          <div className="percent-picker-presets">{[25,50,75,100].map(p => <button type="button" key={p} onClick={() => {setAmount((availableBalance * p / 100).toFixed(2));amountInput.current?.blur();setPercentOpen(false);}}>{p === 100 ? 'Max' : p + '%'}</button>)}</div>
        </div>
          </div>
        </div>
        </div>
      </div>
      <div ref={payoutBox} className="payout box" data-funded={funded}>
        <div className="payout-row"><span className="estimate-label"><button type="button" className="help-link estimate-info" aria-haspopup="dialog" aria-label="About estimated payout if you win" onClick={() => setDialog('payout')}><Icon name="PoolInfoIcon"/>Estimated payout if you win</button></span><strong>{payout === undefined ? '—' : payout.toFixed(2) + ' USDT'}</strong></div>
        <hr/>{funded ? <div className="payout-row"><span className="estimate-label"><button type="button" className="help-link estimate-info" aria-haspopup="dialog" aria-label="About estimated profit" onClick={() => setDialog('profit')}><Icon name="PoolInfoIcon"/>Estimated profit</button></span><strong className="profit">{payout === undefined ? '—' : '+' + (payout - stake).toFixed(2) + ' USDT'}</strong></div> : <><h3>Waiting for the opposite side</h3><p>Both sides need funds for the round to run.</p></>}
      </div>
      {!funded && <p className="payout-note"><Icon name="PoolInfoIcon"/>Payout appears once both sides have funds.</p>}
      <div className="pool box"><button className="pool-heading" aria-expanded={expanded} aria-controls="pool-details" onClick={() => setExpanded(v => !v)}>Pool details &amp; fees<Icon name="ChevronUp" className={expanded ? '' : 'collapsed'}/></button>{expanded && <div id="pool-details" className="pool-details"><hr/><p>Next round · {nextRound}</p><div><span>UP pool</span><span>{upPool.toFixed(2)} USDT</span></div><div><span>DOWN pool</span><span>{downPool.toFixed(2)} USDT</span></div><div><span>Total pool</span><span>{(upPool + downPool).toFixed(2)} USDT</span></div><p>Excludes your unconfirmed {valid ? stake : 0} USDT entry.</p><hr/><div><span>Standard game fee</span><span>5% of total pool</span></div><div className="refund"><span>Canceled / tied round</span><span>100% refund · 0% fee</span></div><hr/><p>If you win, your payout will never be less than your entry amount.</p></div>}</div>
      <p className="network-note">Network fee is shown in your wallet.</p>
    </section>
    <footer className="predict-dock" data-nav-visible={navVisible}>
      <div className="predict-actions">
        <button className="predict" disabled={!valid} onClick={() => setDialog('wallet')}>Predict {side} · {valid ? stake : '—'} USDT</button>
      </div>
      <div className="dock-nav-collapse" inert={!navVisible}><div>
      <nav className="bottom-nav" aria-label="Main navigation"><a href={window.location.pathname === "/" ? "/" : "/test4/"} className="active" aria-current="page"><Icon name="LiveIcon"/><span>Live</span></a><button onClick={() => setDialog('help')}><Icon name="HowItWorksIcon"/><span>How it works</span></button><button onClick={() => setDialog('wallet')}><Icon name="WalletOutline"/><span>Wallet</span></button></nav>
      </div></div>
    </footer>
    {dialog && <div className="dialog-backdrop" onClick={() => setDialog(null)}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="dialog" onClick={e => e.stopPropagation()}><button className="close" aria-label="Close" autoFocus onClick={() => setDialog(null)}>×</button><h2 id="dialog-title">{dialog === 'wallet' ? 'Wallet preview' : dialog === 'help' ? 'How it works' : dialog === 'payout' ? 'Estimated payout if you win' : dialog === 'profit' ? 'Estimated profit' : 'Notifications'}</h2>{dialog === 'wallet' ? <p>This is a design preview. Wallet connection and on-chain predictions are not enabled. The balance and pools are sample data; the chart uses live Binance prices.</p> : dialog === 'help' ? <><p>Choose Up or Down for the next 15-minute BTC round. Both sides need funds. A canceled or tied round receives a full refund.</p><p>Pool amounts and the 5% fee shown here follow the Version 7 design and are preview values. No funds are collected.</p><p>Chart: tap to cycle through the full round, ten-second detail, and the last ten seconds at full-round scale.</p></> : dialog === 'payout' ? <p>Includes your stake · After game fees</p> : dialog === 'profit' ? <p>Estimate changes until entry closes.</p> : <p>No notifications. This page is a design preview.</p>}</section></div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startLiveChart } from '../test2/live-chart';
import type { ChartView } from '../test2/chart-motion';
import { RollingPrice } from '../test2/RollingPrice';
import '@fontsource-variable/inter/wght.css';
import './style.css';

const interval = 900;
const now = () => Math.floor(Date.now() / 1000);
const money = (value?: number) => value === undefined ? '—' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(value);
const time = (value: number) => new Intl.DateTimeFormat('en-GB', {hour:'2-digit',minute:'2-digit'}).format(value * 1000);
const asset = (name: string) => '/test3-assets/img' + name + '.svg';
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
  const [expanded,setExpanded] = useState(true);
  const [dialog,setDialog] = useState<'wallet'|'help'|'notifications'|null>(null);
  const start = Math.floor(clock / interval) * interval;
  const remaining = Math.max(0,start + interval - clock);
  const nextRound = time(start + interval) + '–' + time(start + 2 * interval);
  const stake = Number(amount);
  const valid = Number.isFinite(stake) && stake > 0 && stake <= 250;
  const upPool = funded ? 475 : 25, downPool = funded ? 500 : 0;
  const selectedPool = side === 'UP' ? upPool : downPool;
  const payout = funded && valid ? Math.max(stake, stake / (selectedPool + stake) * (upPool + downPool + stake) * .95) : undefined;
  const change = quote ? (quote.price - quote.target) / quote.target : undefined;
  useEffect(() => { const timer = window.setInterval(() => setClock(now()),250); return () => clearInterval(timer); },[]);
  useEffect(() => {
    if (!host.current || !badge.current || !point.current || !target.current || !priceAxis.current || !timeAxis.current) return;
    const stop = startLiveChart(start,{host:host.current,badge:badge.current,point:point.current,targetLabel:target.current,priceAxis:priceAxis.current,timeAxis:timeAxis.current},setQuote,setStatus,mode);
    return () => stop(true);
  },[start]);
  useEffect(() => { if (!dialog) return; const key = (event:KeyboardEvent) => { if(event.key === 'Escape')setDialog(null); }; document.addEventListener('keydown',key); return () => document.removeEventListener('keydown',key); },[dialog]);
  const toggle = () => { mode.current = mode.current === 'round' ? 'detail' : 'round';setView(mode.current);setFlash(v => v + 1); };
  return <main className="shell" data-version="figma-v7-test3">
    <header className="header">
      <a className="brand" href="/test3/"><Icon name="CryptoArenaLogo"/><span>Crypto <b>Arena</b></span></a>
      <button className="notifications" aria-label="Notifications" onClick={() => setDialog('notifications')}><Icon name="Notifications"/></button>
      <button className="connect" onClick={() => setDialog('wallet')}><Icon name="WalletIcon"/><span>Connect Wallet</span></button>
    </header>
    <section className="overview panel" aria-label="Current Bitcoin round">
      <div className="market">
        <Icon name="BitcoinBadge" className="bitcoin"/>
        <div className="market-title"><h1>BTC Up / Down</h1><p><Icon name="RoundClock"/>15-Minute Round</p></div>
        <span className="change" data-negative={change !== undefined && change < 0}><Icon name="UpRightArrow"/>{change === undefined ? '—' : new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'}).format(change)}</span>
        <span className="feed" data-live={status === 'Live'} role="status"><Icon name="LiveGreenDot"/>Binance · {status}</span>
      </div>
      <div className="plot" role="button" tabIndex={0} aria-pressed={view === 'detail'} aria-label={view === 'round' ? 'Full round chart. Tap for ten-second detail.' : 'Ten-second detail. Tap for full round.'} onClick={toggle} onKeyDown={e => {if(e.key === 'Enter' || e.key === ' '){e.preventDefault();toggle();}}}>
        <div className="chart-grid" aria-hidden="true"><Icon name="FaintChartGrid"/></div>
        <div className="chart" ref={host}/><div className="axis-frame" aria-hidden="true"/>
        <div className="price-axis" ref={priceAxis} aria-hidden="true">{[0,1,2,3].map(i => <span key={i} hidden/>)}</div>
        <div className="time-axis" ref={timeAxis} aria-hidden="true">{[0,1,2].map(i => <span key={i} hidden/>)}</div>
        <span className="target-label" ref={target}>Target</span><span className="price-point" ref={point} aria-hidden="true"/>
        <span className="price-badge" ref={badge} aria-hidden="true"><RollingPrice value={quote?.price} flash={false}/></span>
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
      <div className="entry"><div className="amount-label"><label htmlFor="amount">Amount</label><span>Available: 250.00 USDT</span></div><div className="amount-input"><input id="amount" inputMode="decimal" type="number" min="0.01" max="250" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} aria-invalid={!valid}/><span>USDT</span></div></div>
      <div className="presets">{[25,50,75,100].map(p => <button key={p} onClick={() => setAmount((250 * p / 100).toFixed(2))}>{p === 100 ? 'Max' : p + '%'}</button>)}</div>
      <div className="payout box"><div className="payout-row"><span>Estimated payout if you win</span><strong>{payout === undefined ? '—' : payout.toFixed(2) + ' USDT'}</strong></div><hr/>{funded ? <><div className="payout-row"><span>Estimated profit</span><strong className="profit">{payout === undefined ? '—' : '+' + (payout - stake).toFixed(2) + ' USDT'}</strong></div><p>Includes your stake · After game fees</p></> : <><h3>Waiting for the opposite side</h3><p>Both sides need funds for the round to run.</p></>}</div>
      <p className="payout-note"><Icon name="PoolInfoIcon"/>{funded ? 'Estimate changes until entry closes.' : 'Payout appears once both sides have funds.'}</p>
      <div className="pool box"><button className="pool-heading" aria-expanded={expanded} aria-controls="pool-details" onClick={() => setExpanded(v => !v)}>Pool details &amp; fees<Icon name="ChevronUp" className={expanded ? '' : 'collapsed'}/></button>{expanded && <div id="pool-details" className="pool-details"><hr/><p>Next round · {nextRound}</p><div><span>UP pool</span><span>{upPool.toFixed(2)} USDT</span></div><div><span>DOWN pool</span><span>{downPool.toFixed(2)} USDT</span></div><div><span>Total pool</span><span>{(upPool + downPool).toFixed(2)} USDT</span></div><p>Excludes your unconfirmed {valid ? stake : 0} USDT entry.</p><hr/><div><span>Standard game fee</span><span>5% of total pool</span></div><div className="refund"><span>Canceled / tied round</span><span>100% refund · 0% fee</span></div><hr/><p>If you win, your payout will never be less than your entry amount.</p></div>}</div>
      <button className="predict" disabled={!valid} onClick={() => setDialog('wallet')}>Predict {side} · {valid ? stake : '—'} USDT</button>
      <p className="network-note">Network fee is shown in your wallet.</p>
    </section>
    <nav className="bottom-nav" aria-label="Main navigation"><a href="/test3/" className="active" aria-current="page"><Icon name="LiveIcon"/><span>Live</span></a><button onClick={() => setDialog('help')}><Icon name="HowItWorksIcon"/><span>How it works</span></button><button onClick={() => setDialog('wallet')}><Icon name="WalletOutline"/><span>Wallet</span></button></nav>
    {dialog && <div className="dialog-backdrop" onClick={() => setDialog(null)}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="dialog" onClick={e => e.stopPropagation()}><button className="close" aria-label="Close" autoFocus onClick={() => setDialog(null)}>×</button><h2 id="dialog-title">{dialog === 'wallet' ? 'Wallet preview' : dialog === 'help' ? 'How it works' : 'Notifications'}</h2>{dialog === 'wallet' ? <p>This is a design preview. Wallet connection and on-chain predictions are not enabled. The balance and pools are sample data; the chart uses live Binance prices.</p> : dialog === 'help' ? <><p>Choose Up or Down for the next 15-minute BTC round. Both sides need funds. A canceled or tied round receives a full refund.</p><p>Pool amounts and the 5% fee shown here follow the Version 7 design and are preview values. No funds are collected.</p><p>Chart: tap to switch between the full round and ten-second detail.</p></> : <p>No notifications. This page is a design preview.</p>}</section></div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);

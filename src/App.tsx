import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Clock3, Info, Radio, ShieldCheck, Wallet } from "lucide-react";
import "./style.css";

type SymbolKey = "BTC" | "ETH" | "BNB";
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
type Ticker = { price: number; change: number; high: number; low: number; volume: number };
type MarketState = { candles: Candle[]; ticker: Ticker | null; lastUpdate: number; connected: boolean; error: string | null };
const MARKETS: { symbol: SymbolKey; name: string; pair: string; color: string }[] = [
  { symbol: "BTC", name: "Bitcoin", pair: "btcusdt", color: "#f7931a" },
  { symbol: "ETH", name: "Ethereum", pair: "ethusdt", color: "#7787f6" },
  { symbol: "BNB", name: "BNB", pair: "bnbusdt", color: "#f0b90b" }
];
const initial = (): MarketState => ({ candles: [], ticker: null, lastUpdate: 0, connected: false, error: null });
const formatPrice = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 5 : 2 });
const signed = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const parseCandle = (k: unknown[]): Candle => ({ t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) });
const api = "https://data-api.binance.vision/api/v3";
const stream = "wss://data-stream.binance.vision:443/stream?streams=";

function useMarketData() {
  const [data, setData] = useState<Record<SymbolKey, MarketState>>({ BTC: initial(), ETH: initial(), BNB: initial() });
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const load = async (symbol: SymbolKey) => {
      const pair = MARKETS.find(m => m.symbol === symbol)!.pair.toUpperCase();
      try {
        const [candlesResponse, tickerResponse] = await Promise.all([
          fetch(api + "/klines?symbol=" + pair + "&interval=1s&limit=180", { signal: abort.signal }),
          fetch(api + "/ticker/24hr?symbol=" + pair, { signal: abort.signal })
        ]);
        if (!candlesResponse.ok || !tickerResponse.ok) throw new Error("Market data unavailable");
        const candles = (await candlesResponse.json() as unknown[][]).map(parseCandle);
        const t = await tickerResponse.json() as Record<string, string>;
        if (active) setData(prev => ({ ...prev, [symbol]: { ...prev[symbol], candles, ticker: { price: Number(t.lastPrice), change: Number(t.priceChangePercent), high: Number(t.highPrice), low: Number(t.lowPrice), volume: Number(t.quoteVolume) }, lastUpdate: Date.now(), error: null } }));
      } catch {
        if (active && !abort.signal.aborted) setData(prev => ({ ...prev, [symbol]: { ...prev[symbol], error: "Feed unavailable" } }));
      }
    };
    MARKETS.forEach(m => { void load(m.symbol); });
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const connect = () => {
      if (!active) return;
      socket = new WebSocket(stream + MARKETS.map(m => m.pair + "@kline_1s/" + m.pair + "@ticker").join("/"));
      socket.onopen = () => { attempt = 0; setData(prev => Object.fromEntries(MARKETS.map(m => [m.symbol, { ...prev[m.symbol], connected: true, error: null }])) as Record<SymbolKey, MarketState>); };
      socket.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data)) as { data?: Record<string, unknown> };
          const payload = message.data;
          if (!payload || typeof payload.s !== "string") return;
          const symbol = payload.s.replace("USDT", "") as SymbolKey;
          if (!MARKETS.some(m => m.symbol === symbol)) return;
          const now = Date.now();
          setData(prev => {
            const old = prev[symbol];
            if (payload.e === "kline" && payload.k && typeof payload.k === "object") {
              const k = payload.k as Record<string, unknown>;
              const next: Candle = { t: Number(k.t), o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c), v: Number(k.v) };
              const candles = old.candles.filter(c => c.t < next.t).concat(next).slice(-180);
              return { ...prev, [symbol]: { ...old, candles, lastUpdate: now } };
            }
            if (payload.e === "24hrTicker") {
              return { ...prev, [symbol]: { ...old, ticker: { price: Number(payload.c), change: Number(payload.P), high: Number(payload.h), low: Number(payload.l), volume: Number(payload.q) }, lastUpdate: now } };
            }
            return prev;
          });
        } catch { /* Ignore malformed external feed messages. */ }
      };
      socket.onclose = () => {
        if (!active) return;
        setData(prev => Object.fromEntries(MARKETS.map(m => [m.symbol, { ...prev[m.symbol], connected: false }])) as Record<SymbolKey, MarketState>);
        retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)) + Math.random() * 500);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { active = false; abort.abort(); if (retry) clearTimeout(retry); socket?.close(); };
  }, []);
  return data;
}

function PriceChart({ candles, price, mode }: { candles: Candle[]; price: number | undefined; mode: "candles" | "line" }) {
  const width = 900, height = 390, top = 25, bottom = 35, left = 15, right = 96;
  const values = candles.flatMap(c => [c.h, c.l]);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const padding = Math.max((maximum - minimum) * .14, maximum * .00008);
  const low = minimum - padding, high = maximum + padding;
  const x = (i: number) => left + i * (width - left - right) / Math.max(1, candles.length - 1);
  const y = (value: number) => top + (high - value) * (height - top - bottom) / (high - low || 1);
  const line = candles.map((c, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(c.c).toFixed(1)).join(" ");
  const last = candles.at(-1);
  const ticks = Array.from({ length: 5 }, (_, i) => low + (high - low) * i / 4);
  return <div className="chart-frame" role="img" aria-label={candles.length ? "Live Binance one-second " + mode + " chart" : "Waiting for live market data"}>
    {candles.length ? <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="price-chart">
      {ticks.map(v => <g key={v}><line x1={left} x2={width - right + 5} y1={y(v)} y2={y(v)} stroke="#1c2a3b" strokeWidth="1"/><text x={width - right + 12} y={y(v) + 4} fill="#74849b" fontSize="15">{formatPrice(v)}</text></g>)}
      {mode === "line" ? <><path d={line} fill="none" stroke="#16dca1" strokeWidth="2.6" vectorEffect="non-scaling-stroke"/><path d={line + " L" + x(candles.length - 1) + "," + (height - bottom) + " L" + x(0) + "," + (height - bottom) + " Z"} fill="#0ed69a" opacity=".08"/></> : candles.map((c, i) => {
        const color = c.c >= c.o ? "#16dca1" : "#ff526d";
        const bodyWidth = Math.max(1.4, Math.min(9, (width - left - right) / candles.length * .72));
        return <g key={c.t}><line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1.3"/><rect x={x(i) - bodyWidth / 2} y={Math.min(y(c.o), y(c.c))} width={bodyWidth} height={Math.max(1.3, Math.abs(y(c.o) - y(c.c)))} fill={color}/></g>;
      })}
      {last && <><line x1={left} x2={width - right} y1={y(last.c)} y2={y(last.c)} stroke="#16dca1" strokeDasharray="5 5" opacity=".65"/><rect x={width - right} y={y(last.c) - 13} width={right - 2} height="26" rx="5" fill="#05b98b"/><text x={width - right + 5} y={y(last.c) + 5} fill="#031a17" fontSize="14" fontWeight="bold">{formatPrice(price ?? last.c)}</text></>}
      {candles.filter((_, i) => i % Math.max(1, Math.floor(candles.length / 6)) === 0).map(c => <text key={c.t} x={x(candles.indexOf(c))} y={height - 8} fontSize="14" fill="#71829c">{new Date(c.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" })}</text>)}
    </svg> : <div className="chart-empty"><Activity size={36}/><strong>Waiting for market data</strong><span>Connecting to Binance public feed…</span></div>}
    <div className="chart-attribution">Binance Spot · USDT · UTC</div>
  </div>;
}

function CoinIcon({ symbol, size = 36 }: { symbol: SymbolKey; size?: number }) {
  const colors: Record<SymbolKey, string> = { BTC: "#F7931A", ETH: "#627EEA", BNB: "#F0B90B" };
  return <span className="coin-icon" style={{ width: size, height: size }} aria-hidden="true">
    {symbol === "BTC" ? <svg viewBox="0 0 40 40" width={size} height={size}><circle cx="20" cy="20" r="19" fill={colors.BTC}/><path d="M24.9 18.5c1.5-.8 2.3-2.1 2-3.9-.4-2.5-2.6-3.5-5.7-3.7l.6-3-1.9-.4-.6 3-1.7-.3.6-3-1.9-.4-.6 3-3.8-.8-.5 2.1 1.5.3c.8.2 1 .6.9 1.2l-2.3 11.1c-.2.5-.5.7-1.1.6l-1.6-.3-.9 2.3 3.8.8-.6 3 1.9.4.6-3 1.7.3-.6 3 1.9.4.6-3c4.3.6 7.6-.3 8.5-4.1.6-2.7-.4-4.4-2.8-5.6Zm-7-5.6c2.5.5 5.4.9 4.9 3.2-.5 2.3-3.4 1.4-5.9.9l1-4.1Zm-1.7 8.2c3 .6 6.5 1.1 5.9 3.8-.6 2.7-4 1.7-7 1.1l1.1-4.9Z" fill="#fff" transform="translate(3 1) scale(.92)"/></svg> :
    symbol === "ETH" ? <svg viewBox="0 0 40 40" width={size} height={size}><circle cx="20" cy="20" r="19" fill="#182540"/><path d="M20 5 11 20l9-4 9 4L20 5Z" fill="#8EA7FF"/><path d="m20 5 9 15-9-4V5Z" fill="#627EEA"/><path d="m11 22 9 13 9-13-9 5-9-5Z" fill="#8EA7FF"/><path d="m20 27 9-5-9 13v-8Z" fill="#627EEA"/></svg> :
    <svg viewBox="0 0 40 40" width={size} height={size}><circle cx="20" cy="20" r="19" fill={colors.BNB}/><g fill="#fff"><path d="m20 7 4.5 4.5-4.5 4.5-4.5-4.5L20 7Zm-8.5 8.5L16 20l-4.5 4.5L7 20l4.5-4.5Zm17 0L33 20l-4.5 4.5L24 20l4.5-4.5ZM20 24l4.5 4.5L20 33l-4.5-4.5L20 24Z"/><path d="m20 16 4 4-4 4-4-4 4-4Z"/></g></svg>}
  </span>;
}

export default function App() {
  const markets = useMarketData();
  const [selected, setSelected] = useState<SymbolKey>("BTC");
  const [mode, setMode] = useState<"candles" | "line">("candles");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const market = markets[selected], ticker = market.ticker;
  const age = market.lastUpdate ? now - market.lastUpdate : Infinity;
  const fresh = market.connected && age < 5000 && !!ticker;
  const remaining = 300 - Math.floor(now / 1000) % 300;
  const time = String(Math.floor(remaining / 60)).padStart(2, "0") + ":" + String(remaining % 60).padStart(2, "0");
  const changePositive = (ticker?.change ?? 0) >= 0;
  const recent = useMemo(() => market.candles.slice(-8).reverse(), [market.candles]);
  return <div className="arena-shell">
    <header className="topbar"><a href="/" className="logo"><span className="logo-mark">◢</span> Crypto<span>Arena</span><small>.fun</small></a><nav><a className="active" href="#arena">Arena</a><a href="#markets">Markets</a><a href="#about">How it works</a></nav><span className="preview-pill"><Info size={14}/><span className="preview-long">Market-data preview · Trading disabled</span><span className="preview-short">Preview</span></span><div className="wallet"><Wallet size={17}/> Wallet coming soon</div></header>
    <div className="arena-layout" id="arena">
      <aside className="sidebar" id="markets" aria-label="Select cryptocurrency"><div className="sidebar-title">MARKETS <span>SPOT / USDT</span></div>{MARKETS.map(m => {
        const t = markets[m.symbol].ticker;
        return <button className={"asset " + (selected === m.symbol ? "selected" : "")} key={m.symbol} onClick={() => setSelected(m.symbol)} aria-pressed={selected === m.symbol}><CoinIcon symbol={m.symbol} size={36}/><span className="asset-name"><b>{m.symbol}</b><small>{m.name}</small></span><span className="asset-price"><b>{t ? "$" + formatPrice(t.price) : "—"}</b><small className={t && t.change < 0 ? "negative" : "positive"}>{t ? signed(t.change) : "Waiting"}</small></span></button>;
      })}<div className="sidebar-note"><ShieldCheck size={18}/><span>Verified public exchange data. No simulated volume or bets.</span></div></aside>
      <main className="main-area"><section className="market-header"><div className="market-heading"><CoinIcon symbol={selected} size={44}/><div><h1>{selected} <span>/ USDT</span></h1><small>Live spot market</small></div></div><div className="headline-price"><strong>{ticker ? "$" + formatPrice(ticker.price) : "—"}</strong><span className={changePositive ? "positive" : "negative"}>{ticker ? signed(ticker.change) + " (24h)" : "Loading"}</span></div><div className="header-stat"><small>24h Volume (USDT)</small><strong>{ticker ? "$" + Math.round(ticker.volume).toLocaleString("en-US") : "—"}</strong></div><div className="header-stat"><small>24h High</small><strong>{ticker ? "$" + formatPrice(ticker.high) : "—"}</strong></div><div className="round-clock"><small>Next 5m UTC boundary</small><strong><Clock3 size={19}/>{time}</strong><div className="progress"><i style={{ width: (100 * (300 - remaining) / 300) + "%" }}/></div></div></section>
        <div className="trade-grid"><section className="chart-panel"><div className="panel-heading"><div><b>Price action</b><span className="feed-label"><Radio size={14}/>{fresh ? "LIVE" : market.lastUpdate ? "STALE / RECONNECTING" : "CONNECTING"}</span></div><div className="chart-controls"><button className={mode === "candles" ? "on" : ""} onClick={() => setMode("candles")}>Candles</button><button className={mode === "line" ? "on" : ""} onClick={() => setMode("line")}>Line</button><span>1s</span></div></div><PriceChart candles={market.candles} price={ticker?.price} mode={mode}/><div className="chart-footer"><span><Activity size={15}/> 1-second candles</span><span>Last feed update: {Number.isFinite(age) ? Math.max(0, Math.floor(age / 1000)) + "s ago" : "—"}</span><span>Source: Binance</span></div>{market.error && <p className="feed-error" role="status">{market.error}. Live prices may be unavailable on this network.</p>}</section>
        <aside className="prediction-panel"><div className="prediction-heading"><b>5-minute prediction</b><span>PREVIEW ONLY</span></div><p>Predict whether {selected} will finish above or below the round's opening price.</p><div className="directions"><div className="direction up"><ArrowUpRight size={27}/><strong>UP</strong><small>Above opening price</small></div><div className="direction down"><ArrowDownRight size={27}/><strong>DOWN</strong><small>Below opening price</small></div></div><div className="prediction-row"><span>Round status</span><b>Not launched</b></div><div className="prediction-row"><span>Opening / target price</span><b>Not available</b></div><div className="prediction-row"><span>UP / DOWN pools</span><b>Not available</b></div><div className="prediction-row"><span>Estimated payout</span><b>Not available</b></div><label className="stake-label" htmlFor="stake">Your prediction amount</label><div className="stake-field"><span>$</span><input id="stake" placeholder="0.00" disabled aria-label="Prediction amount unavailable"/></div><div className="quick-amounts">{[10,25,50,100].map(v => <button key={v} disabled>${v}</button>)}</div><button className="place-button" disabled>Predictions coming soon</button><div className="notice"><ShieldCheck size={17}/><span>No wallet connection or financial transactions are enabled. Pool figures and outcomes will appear only when backed by verified protocol data.</span></div></aside></div>
        <div className="lower-grid"><section className="info-panel"><div className="panel-heading"><b><BarChart3 size={17}/> Market statistics</b><span>24 HOURS</span></div><div className="stats-grid"><div><small>Last price</small><strong>{ticker ? "$" + formatPrice(ticker.price) : "—"}</strong></div><div><small>24h change</small><strong className={changePositive ? "positive" : "negative"}>{ticker ? signed(ticker.change) : "—"}</strong></div><div><small>24h high</small><strong>{ticker ? "$" + formatPrice(ticker.high) : "—"}</strong></div><div><small>24h low</small><strong>{ticker ? "$" + formatPrice(ticker.low) : "—"}</strong></div></div></section><section className="info-panel"><div className="panel-heading"><b><Activity size={17}/> Recent market candles</b><span>1 SECOND · UTC</span></div><div className="recent-table"><div className="table-head"><span>Time</span><span>Open</span><span>Close</span><span>Direction</span></div>{recent.length ? recent.map(c => <div className="table-row" key={c.t}><span>{new Date(c.t).toLocaleTimeString("en-GB", { timeZone: "UTC" })}</span><span>{formatPrice(c.o)}</span><span>{formatPrice(c.c)}</span><span className={c.c >= c.o ? "positive" : "negative"}>{c.c >= c.o ? "▲ UP" : "▼ DOWN"}</span></div>) : <p className="table-empty">Waiting for live candles…</p>}</div></section></div>
        <section className="about-strip" id="about"><Info size={18}/><p><strong>Market data is live, prediction rounds are not.</strong> The five-minute countdown shows UTC boundaries only; it is not a settlement clock or a price-to-beat reference. Binance spot prices are informational, not an authoritative settlement oracle. Financial features require audited contracts and a separately verified settlement feed.</p></section>
      </main></div><footer className="site-footer"><span>◢ CryptoArena.fun</span><span>Market data © respective exchange · Preview only · No real-money actions</span></footer>
  </div>;
}

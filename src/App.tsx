import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, ColorType, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Clock3, Info, Radio, ShieldCheck, Wallet } from "lucide-react";
import "./style.css";

type SymbolKey = "BTC" | "ETH" | "BNB";
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
type Trade = { id: number; time: number; price: number; qty: number; buy: boolean };
type Ticker = { price: number; change: number; high: number; low: number; volume: number };
type MarketState = { candles: Candle[]; ticker: Ticker | null; trades: Trade[]; lastUpdate: number; connected: boolean; error: string | null };
const MARKETS: { symbol: SymbolKey; name: string; pair: string; color: string }[] = [
  { symbol: "BTC", name: "Bitcoin", pair: "btcusdt", color: "#f7931a" },
  { symbol: "ETH", name: "Ethereum", pair: "ethusdt", color: "#7787f6" },
  { symbol: "BNB", name: "BNB", pair: "bnbusdt", color: "#f0b90b" }
];
const initial = (): MarketState => ({ candles: [], ticker: null, trades: [], lastUpdate: 0, connected: false, error: null });
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
      socket = new WebSocket(stream + MARKETS.map(m => m.pair + "@kline_1s/" + m.pair + "@ticker/" + m.pair + "@trade").join("/"));
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
            if (payload.e === "trade") {
              const trade: Trade = { id: Number(payload.t), time: Number(payload.T), price: Number(payload.p), qty: Number(payload.q), buy: !payload.m };
              return { ...prev, [symbol]: { ...old, trades: [trade, ...old.trades.filter(t => t.id !== trade.id)].slice(0, 12), lastUpdate: now } };
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

function PriceChart({ candles, mode }: { candles: Candle[]; price?: number; mode: "candles" | "line" }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const primary = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#081320" }, textColor: "#8ea3bc", fontFamily: "DM Sans, sans-serif", fontSize: 12 },
      grid: { vertLines: { color: "#14263a" }, horzLines: { color: "#14263a" } },
      rightPriceScale: { borderColor: "#26394e", scaleMargins: { top: .08, bottom: .25 } },
      timeScale: { borderColor: "#26394e", timeVisible: true, secondsVisible: true, rightOffset: 5, barSpacing: 7 },
      crosshair: { vertLine: { color: "#45698b", labelBackgroundColor: "#24548c" }, horzLine: { color: "#45698b", labelBackgroundColor: "#24548c" } },
      handleScale: { pinch: true, mouseWheel: true }
    });
    chart.current = c;
    primary.current = mode === "candles"
      ? c.addSeries(CandlestickSeries, { upColor: "#00dba4", downColor: "#ff4d70", wickUpColor: "#00dba4", wickDownColor: "#ff4d70", borderVisible: false })
      : c.addSeries(LineSeries, { color: "#00dba4", lineWidth: 2 });
    volume.current = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
    c.priceScale("volume").applyOptions({ scaleMargins: { top: .8, bottom: 0 } });
    return () => { chart.current = null; primary.current = null; volume.current = null; c.remove(); };
  }, [mode]);
  useEffect(() => {
    const series = primary.current;
    if (!series || !volume.current || !candles.length) return;
    const ordered = [...new Map(candles.map(c => [c.t, c])).values()].sort((a,b) => a.t-b.t);
    if (mode === "candles") (series as ISeriesApi<"Candlestick">).setData(ordered.map(c => ({ time: Math.floor(c.t/1000) as Time, open: c.o, high: c.h, low: c.l, close: c.c })));
    else (series as ISeriesApi<"Line">).setData(ordered.map(c => ({ time: Math.floor(c.t/1000) as Time, value: c.c })));
    volume.current.setData(ordered.map(c => ({ time: Math.floor(c.t/1000) as Time, value: c.v, color: c.c >= c.o ? "#0d7e6377" : "#943b5377" })));
  }, [candles, mode]);
  return <div className="chart-frame" role="group" aria-label="Interactive Binance spot price chart">
    <div ref={host} className="professional-chart" />
    {!candles.length && <div className="chart-empty chart-overlay"><Activity size={28}/><strong>Connecting to live chart…</strong></div>}
    <span className="chart-attribution">BINANCE SPOT · 1s · UTC</span>
  </div>;
}

function CoinIcon({ symbol, size = 36 }: { symbol: SymbolKey; size?: number }) {
  const url: Record<SymbolKey, string> = {
    BTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
    ETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
    BNB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png"
  };
  return <span className={"coin-icon coin-" + symbol.toLowerCase()} style={{ width: size, height: size }}>
    <img src={url[symbol]} alt={symbol + " logo"} width={size} height={size} loading="lazy" onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement?.classList.add("icon-fallback"); }} />
    <span className="fallback-glyph" aria-hidden="true">{symbol === "BTC" ? "₿" : symbol === "ETH" ? "Ξ" : "◆"}</span>
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
        <div className="lower-grid"><section className="info-panel live-trades"><div className="panel-heading"><b><Activity size={17}/> Live trades</b><span>BINANCE · UTC</span></div><div className="trade-table"><div className="trade-head"><span>Time</span><span>Price (USDT)</span><span>Size</span><span>Side</span></div>{market.trades.length ? market.trades.slice(0,8).map(t => <div className="trade-row" key={t.id}><span>{new Date(t.time).toLocaleTimeString("en-GB", {timeZone:"UTC"})}</span><span className={t.buy ? "positive" : "negative"}>{formatPrice(t.price)}</span><span>{t.qty.toFixed(5)}</span><span className={t.buy ? "positive" : "negative"}>{t.buy ? "BUY" : "SELL"}</span></div>) : <p className="table-empty">Waiting for live trades…</p>}</div></section><section className="info-panel recent-rounds"><div className="panel-heading"><b><Clock3 size={17}/> Recent rounds</b><span>PREVIEW</span></div><div className="rounds-empty"><Clock3 size={25}/><strong>No rounds yet</strong><span>Verified round results will appear when the protocol launches.</span></div></section><section className="info-panel"><div className="panel-heading"><b><BarChart3 size={17}/> Market statistics</b><span>24 HOURS</span></div><div className="stats-grid"><div><small>Last price</small><strong>{ticker ? "$" + formatPrice(ticker.price) : "—"}</strong></div><div><small>24h change</small><strong className={changePositive ? "positive" : "negative"}>{ticker ? signed(ticker.change) : "—"}</strong></div><div><small>24h high</small><strong>{ticker ? "$" + formatPrice(ticker.high) : "—"}</strong></div><div><small>24h low</small><strong>{ticker ? "$" + formatPrice(ticker.low) : "—"}</strong></div></div></section><section className="info-panel"><div className="panel-heading"><b><Activity size={17}/> Recent market candles</b><span>1 SECOND · UTC</span></div><div className="recent-table"><div className="table-head"><span>Time</span><span>Open</span><span>Close</span><span>Direction</span></div>{recent.length ? recent.map(c => <div className="table-row" key={c.t}><span>{new Date(c.t).toLocaleTimeString("en-GB", { timeZone: "UTC" })}</span><span>{formatPrice(c.o)}</span><span>{formatPrice(c.c)}</span><span className={c.c >= c.o ? "positive" : "negative"}>{c.c >= c.o ? "▲ UP" : "▼ DOWN"}</span></div>) : <p className="table-empty">Waiting for live candles…</p>}</div></section></div>
        <section className="about-strip" id="about"><Info size={18}/><p><strong>Market data is live, prediction rounds are not.</strong> The five-minute countdown shows UTC boundaries only; it is not a settlement clock or a price-to-beat reference. Binance spot prices are informational, not an authoritative settlement oracle. Financial features require audited contracts and a separately verified settlement feed.</p></section>
      </main></div><footer className="site-footer"><span>◢ CryptoArena.fun</span><span>Market data © respective exchange · Preview only · No real-money actions</span></footer>
  </div>;
}

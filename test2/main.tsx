import type { ChartView } from "./chart-motion";
import { startLiveChart } from "./live-chart";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Wallet } from "lucide-react";
import { RollingPrice } from "./RollingPrice";
import brand from "./brand.svg";
import "@fontsource-variable/inter/wght.css";
import "./style.css";

const interval = 900;
const round = (time: number) => Math.floor(time / interval) * interval;
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const display = (price?: number) => price === undefined ? "—" : dollars.format(price);
const now = () => Math.floor(Date.now() / 1000);

export function App() {
  const mode = useRef<ChartView>("round");
  const [view, setView] = useState<ChartView>("round");
  const [switchFlash, setSwitchFlash] = useState(0);
  const toggleView = () => {
    setSwitchFlash(value => value + 1);
    mode.current = mode.current === "round" ? "detail" : "round";
    setView(mode.current);
  };
  const host = useRef<HTMLDivElement>(null);
  const badge = useRef<HTMLSpanElement>(null);
  const point = useRef<HTMLSpanElement>(null);
  const targetLabel = useRef<HTMLSpanElement>(null);
  const priceAxis = useRef<HTMLDivElement>(null);
  const timeAxis = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(now);
  const [quote, setQuote] = useState<{ start: number; target: number; price: number }>();
  const [status, setStatus] = useState("Connecting");
  const start = round(clock);
  const current = quote;
  const remaining = start + interval - clock;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const [priceBadge, pricePoint, targetText] = [badge.current, point.current, targetLabel.current];
    const prices = priceAxis.current;
    const times = timeAxis.current;
    if (!host.current || !priceBadge || !pricePoint || !targetText || !prices || !times) return;
    const stop = startLiveChart(start, { host: host.current, badge: priceBadge, point: pricePoint, targetLabel: targetText, priceAxis: prices, timeAxis: times }, setQuote, setStatus, mode);
    return () => stop(true);
  }, [start]);

  return <main className="shell">
    <header><a className="brand" href="/"><img src={brand} alt=""/><span>Crypto<b>Arena</b></span></a><button className="wallet" disabled><Wallet size={24} aria-hidden="true"/>Connect Wallet</button></header>
    <nav><span className="active">Predict</span><a href="#how">How it works</a></nav>
    <section className="card">
      <div className="market"><span className="btc" aria-hidden="true">₿</span><div><h1>BTC Up / Down</h1><p>15-Minute Round</p></div><span className="feed" data-live={status === "Live"} role="status">Binance · {status}</span></div>
      <div className="plot" role="button" tabIndex={0} aria-pressed={view === "detail"}
        aria-label={view === "round" ? "Full round chart. Tap to show ten-second detail." : "Ten-second detail chart. Tap to show full round."}
        onClick={event => { event.currentTarget.blur(); toggleView(); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleView(); } }}>
        {switchFlash > 0 && <span key={switchFlash} className="chart-switch-flash" aria-hidden="true"/>}
        <div className="chart" ref={host} aria-label="Live BTC/USDT price chart"/>
        <div className="axis-frame" aria-hidden="true"/>
        <div className="price-axis" ref={priceAxis} aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <span key={index} hidden/>)}</div>
        <div className="time-axis" ref={timeAxis} aria-hidden="true">{[0, 1, 2].map(index => <span key={index} hidden/>)}</div>
        <span ref={targetLabel} className="target-label">Target</span>
        <span ref={point} className="price-point" aria-hidden="true"/>
        <span ref={badge} className="price-badge" aria-hidden="true"><RollingPrice value={current?.price} flash={false}/></span>
      </div>
      <div className="metrics">
        <div><span>Price to beat</span><strong>{display(current?.target)}</strong></div>
        <div><span>Current Price {current && <em className={current.price >= current.target ? "up" : "down"}>{((current.price - current.target) / current.target).toLocaleString("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" })}</em>}</span><strong><RollingPrice value={current?.price} currency/></strong></div>
        <div><span>Round Ends In</span><div className="countdown"><strong><RollingPrice value={Math.floor(remaining / 60)} fractionDigits={0} minimumIntegerDigits={2} flash={false}/><small>MIN</small></strong><strong><RollingPrice value={remaining % 60} fractionDigits={0} minimumIntegerDigits={2} flash={false}/><small>SECS</small></strong></div></div>
      </div>
    </section>
    <section className="card prediction" id="how">
      <div className="section-title"><h2>Make a Prediction</h2><span><i>ⓘ</i> Parimutuel (Pool-Based)</span></div>
      <div className="choices">
        <button disabled><b><ArrowUpRight aria-hidden="true"/>UP</b><span>Price will be higher</span><span>Estimated Payout</span><strong>$11.20</strong><small>(+12.0%)</small></button>
        <button disabled><b><ArrowDownRight aria-hidden="true"/>DOWN</b><span>Price will be lower</span><span>Estimated Payout</span><strong>$18.90</strong><small>(+89.0%)</small></button>
      </div>
      <div className="amount-label">Your Amount</div>
      <div className="amount-row">
        <div className="amount"><strong>10</strong><span>USDT</span></div>
        <div className="presets">{[5, 10, 25, 50].map(value => <button key={value} disabled className={value === 10 ? "selected" : ""}>{value}</button>)}</div>
      </div>
      <div className="pool">
        <div><span>Pool (This Round)</span><strong>$124.50</strong></div>
        <div className="pool-shares"><div className="pool-bar"/><div className="pool-legend"><span><i className="up-dot"/> <em>UP 65%</em> &nbsp;($80.93)</span><span><i className="down-dot"/> DOWN <em>35%</em> &nbsp;($43.57)</span></div></div>
      </div>
    </section>
    <section className="card recent">
      <div className="section-title"><h2>Recent Rounds <small>(BTC, 15 min)</small></h2><button disabled>View All</button></div>
      {[["$100,188.40 → $100,245.32", "UP", "2.14×", "14:45"], ["$100,310.20 → $100,020.11", "DOWN", "3.01×", "14:30"], ["$99,980.75 → $100,310.20", "UP", "1.87×", "14:15"]].map(([prices, side, multiplier, time]) =>
        <div className="recent-row" key={time}><span className="round-prices">{prices.split(" → ")[0]}<ArrowRight aria-label="to"/>{prices.split(" → ")[1]}</span><span className={side === "UP" ? "up" : "down"}>{side === "UP" ? <ArrowUpRight aria-hidden="true"/> : <ArrowDownRight aria-hidden="true"/>}</span><b className={side === "UP" ? "up" : "down"}>{side}</b><strong>{multiplier}</strong><strong>{time}</strong></div>
      )}
    </section>
    <footer>Preview · Payout, pool and recent rounds are sample data. <span>Live data: Binance</span></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);

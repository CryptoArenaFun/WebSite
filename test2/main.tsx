import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BaselineSeries, ColorType, createChart, LineStyle, type UTCTimestamp } from "lightweight-charts";
import { Wallet } from "lucide-react";
import brand from "./brand.svg";
import "./style.css";

const interval = 900;
const round = (time: number) => Math.floor(time / interval) * interval;
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const axisPrice = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const axisTick = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const display = (price?: number) => price === undefined ? "—" : dollars.format(price);
const now = () => Math.floor(Date.now() / 1000);
const two = (value: number) => String(value).padStart(2, "0");
type Candle = [number, string, string, string, string];

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const badge = useRef<HTMLSpanElement>(null);
  const point = useRef<HTMLSpanElement>(null);
  const targetLabel = useRef<HTMLSpanElement>(null);
  const [clock, setClock] = useState(now);
  const [quote, setQuote] = useState<{ start: number; target: number; price: number }>();
  const [status, setStatus] = useState("Connecting");
  const start = round(clock);
  const current = quote?.start === start ? quote : undefined;
  const remaining = start + interval - clock;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const [priceBadge, pricePoint, targetText] = [badge.current, point.current, targetLabel.current];
    if (!host.current || !priceBadge || !pricePoint || !targetText) return;
    const controller = new AbortController();
    const chartHost = host.current;
    const chart = createChart(chartHost, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#fff" }, textColor: "#667085", fontFamily: "Inter, system-ui, sans-serif", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderColor: "#e8ebee", minimumWidth: 48 },
      localization: { priceFormatter: (price: number) => axisTick.format(price) },
      timeScale: { rightOffset: 2, timeVisible: true, secondsVisible: false, borderColor: "#e8ebee" },
      handleScroll: false,
      handleScale: false,
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
    });
    const series = chart.addSeries(BaselineSeries, {
      topLineColor: "#00c52e", bottomLineColor: "#ee5264", lineWidth: 1,
      topFillColor1: "#00c52e40", topFillColor2: "#00c52e03",
      bottomFillColor1: "#ee526406", bottomFillColor2: "#ee526438",
      priceLineVisible: false, lastValueVisible: false,
    });
    let socket: WebSocket | undefined;
    let retry = 0;
    let latest: { time: UTCTimestamp; price: number; target: number } | undefined;
    let frame = 0;

    function positionLabels() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!latest || !priceBadge || !pricePoint || !targetText) return;
        const y = series.priceToCoordinate(latest.price);
        const x = chart.timeScale().timeToCoordinate(latest.time);
        const targetY = series.priceToCoordinate(latest.target);
        if (y === null || x === null || targetY === null) return;
        const color = latest.price >= latest.target ? "#00a928" : "#d93b53";
        const axisStart = chartHost.clientWidth - chart.priceScale("right").width();
        priceBadge.style.top = y + "px";
        priceBadge.style.left = (axisStart + 2) + "px";
        priceBadge.style.backgroundColor = color;
        pricePoint.style.top = y + "px";
        pricePoint.style.left = x + "px";
        pricePoint.style.backgroundColor = color;
        targetText.style.top = targetY + "px";
        for (const element of [priceBadge, pricePoint, targetText]) element.style.visibility = "visible";
      });
    }

    const resize = new ResizeObserver(() => {
      const scale = Math.min(1, chartHost.clientWidth / 783);
      chart.applyOptions({
        layout: { fontSize: Math.max(9, Math.round(18 * scale)) },
        rightPriceScale: { minimumWidth: Math.round(113 * scale) },
      });
      positionLabels();
    });
    resize.observe(chartHost);
    chart.timeScale().subscribeVisibleLogicalRangeChange(positionLabels);

    async function connect() {
      setStatus("Connecting");
      try {
        const response = await fetch("https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1s&limit=900&startTime=" + start * 1000, { signal: controller.signal });
        if (!response.ok) throw new Error("Market data unavailable");
        const candles: Candle[] = await response.json();
        if (controller.signal.aborted) return;
        if (!candles.length || Math.floor(candles[0][0] / 1000) !== start) throw new Error("Round open unavailable");
        const target = Number(candles[0][1]);
        const points = candles.map(c => ({ time: Math.floor(c[0] / 1000) as UTCTimestamp, value: Number(c[4]) }));
        if (!Number.isFinite(target) || points.some(p => !Number.isFinite(p.value))) throw new Error("Invalid market data");
        series.applyOptions({ baseValue: { type: "price", price: target } });
        targetLine.applyOptions({ price: target, lineVisible: true });
        series.setData(points);
        chart.timeScale().fitContent();
        let last = points[points.length - 1].time;
        const update = (price: number) => {
          setQuote({ start, target, price });
          latest = { time: last, price, target };
          positionLabels();
        };
        update(points[points.length - 1].value);
        socket = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@kline_1s");
        socket.onmessage = (event) => {
          try {
            const { k } = JSON.parse(event.data);
            if (k?.s !== "BTCUSDT" || k.i !== "1s") return;
            const time = Math.floor(k.t / 1000) as UTCTimestamp;
            const price = Number(k.c);
            if (!Number.isFinite(time) || !Number.isFinite(price) || time < last || round(time) !== start) return;
            series.update({ time, value: price });
            last = time;
            update(price);
            setStatus("Live");
          } catch { /* Ignore malformed exchange messages. */ }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = scheduleRetry;
      } catch {
        if (!controller.signal.aborted) scheduleRetry();
      }
    }

    function scheduleRetry() {
      if (controller.signal.aborted) return;
      setStatus("Reconnecting");
      retry = window.setTimeout(() => void connect(), 5000);
    }

    const targetLine = series.createPriceLine({ price: 0, color: "#969da3", lineStyle: LineStyle.Dashed, title: "Target", axisLabelVisible: false, lineVisible: false });
    void connect();
    return () => {
      controller.abort();
      resize.disconnect();
      cancelAnimationFrame(frame);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(positionLabels);
      for (const element of [priceBadge, pricePoint, targetText]) {
        element.style.visibility = "hidden";
      }
      window.clearTimeout(retry);
      if (socket) { socket.onclose = null; socket.close(); }
      series.removePriceLine(targetLine);
      chart.remove();
    };
  }, [start]);

  return <main className="shell">
    <header><a className="brand" href="/"><img src={brand} alt=""/><span>Crypto<b>Arena</b></span></a><button className="wallet" disabled><Wallet size={24} aria-hidden="true"/>Connect Wallet</button></header>
    <nav><span className="active">Predict</span><a href="#how">How it works</a></nav>
    <section className="card">
      <div className="market"><span className="btc" aria-hidden="true">₿</span><div><h1>BTC Up / Down</h1><p>15-Minute Round</p></div><span className="feed" data-live={status === "Live"} role="status">Binance · {status}</span></div>
      <div className="plot">
        <div className="chart" ref={host} aria-label="Live BTC/USDT price chart"/>
        <span ref={targetLabel} className="target-label">Target</span>
        <span ref={point} className="price-point" aria-hidden="true"/>
        <span ref={badge} className="price-badge" aria-hidden="true">{current && axisPrice.format(current.price)}</span>
      </div>
      <div className="metrics">
        <div><span>Price to beat</span><strong>{display(current?.target)}</strong></div>
        <div><span>Current Price {current && <em className={current.price >= current.target ? "up" : "down"}>{((current.price - current.target) / current.target).toLocaleString("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" })}</em>}</span><strong>{display(current?.price)}</strong></div>
        <div><span>Round Ends In</span><div className="countdown"><strong>{two(Math.floor(remaining / 60))}<small>MIN</small></strong><strong>{two(remaining % 60)}<small>SECS</small></strong></div></div>
      </div>
    </section>
    <section className="card prediction" id="how">
      <div className="section-title"><h2>Make a Prediction</h2><span><i>ⓘ</i> Parimutuel (Pool-Based)</span></div>
      <div className="choices">
        <button disabled><b>↗ &nbsp;UP</b><span>Price will be higher</span><span>Estimated Payout</span><strong>$11.20</strong><small>(+12.0%)</small></button>
        <button disabled><b>↘ &nbsp;DOWN</b><span>Price will be lower</span><span>Estimated Payout</span><strong>$18.90</strong><small>(+89.0%)</small></button>
      </div>
      <div className="amount-label">Your Amount</div>
      <div className="amount-row">
        <div className="amount"><strong>10</strong><span>USDT</span></div>
        <div className="presets">{[5, 10, 25, 50].map(value => <button key={value} disabled className={value === 10 ? "selected" : ""}>{value}</button>)}</div>
      </div>
      <div className="pool">
        <div><span>Pool (This Round)</span><strong>$124.50</strong></div>
        <div className="pool-shares"><div className="pool-bar"/><div className="pool-legend"><span>● UP 65% &nbsp;($80.93)</span><span>● DOWN 35% &nbsp;($43.57)</span></div></div>
      </div>
    </section>
    <section className="card recent">
      <div className="section-title"><h2>Recent Rounds <small>(BTC, 15 min)</small></h2><button disabled>View All</button></div>
      {[["$100,188.40 → $100,245.32", "UP", "2.14×", "14:45"], ["$100,310.20 → $100,020.11", "DOWN", "3.01×", "14:30"], ["$99,980.75 → $100,310.20", "UP", "1.87×", "14:15"]].map(([prices, side, multiplier, time]) =>
        <div className="recent-row" key={time}><span>{prices}</span><span className={side === "UP" ? "up" : "down"}>{side === "UP" ? "↗" : "↘"}</span><b className={side === "UP" ? "up" : "down"}>{side}</b><strong>{multiplier}</strong><strong>{time}</strong></div>
      )}
    </section>
    <footer>Preview · Payout, pool and recent rounds are sample data. <a href="https://www.tradingview.com/">Chart by TradingView</a></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);

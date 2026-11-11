import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BaselineSeries, ColorType, createChart, LineStyle, type UTCTimestamp } from "lightweight-charts";
import { Wallet } from "lucide-react";
import brand from "./brand.svg";
import "./style.css";

const interval = 900;
const round = (time: number) => Math.floor(time / interval) * interval;
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const display = (price?: number) => price === undefined ? "—" : dollars.format(price);
const now = () => Math.floor(Date.now() / 1000);
const two = (value: number) => String(value).padStart(2, "0");
type Candle = [number, string, string, string, string];

export function App() {
  const host = useRef<HTMLDivElement>(null);
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
    if (!host.current) return;
    const controller = new AbortController();
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#fff" }, textColor: "#667085", fontFamily: "Inter, system-ui, sans-serif", attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderColor: "#e8ebee", minimumWidth: 96 },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#e8ebee" },
      handleScroll: false,
      handleScale: false,
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
    });
    const series = chart.addSeries(BaselineSeries, {
      topLineColor: "#008a30", bottomLineColor: "#d5384f", lineWidth: 2,
      topFillColor1: "#00c52e33", topFillColor2: "#00c52e06",
      bottomFillColor1: "#ee526406", bottomFillColor2: "#ee526438",
      priceLineVisible: false, lastValueVisible: false,
    });
    let socket: WebSocket | undefined;
    let retry = 0;
    let latest: ReturnType<typeof series.createPriceLine> | undefined;

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
        let marker = latest;
        const update = (price: number) => {
          setQuote({ start, target, price });
          const options = { price, color: price >= target ? "#008a30" : "#c43248" };
          if (marker) marker.applyOptions(options);
          else latest = marker = series.createPriceLine({ ...options, lineVisible: false, axisLabelVisible: true });
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
      <div className="market"><span className="btc" aria-hidden="true">₿</span><div><h1>BTC Up / Down</h1><p>15-Minute Round</p></div><span className="feed" role="status">Binance · {status}</span></div>
      <div className="chart" ref={host} aria-label="Live BTC/USDT price chart"/>
      <div className="metrics">
        <div><span>Price to beat</span><strong>{display(current?.target)}</strong></div>
        <div><span>Current Price</span><strong>{display(current?.price)}</strong></div>
        <div><span>Round Ends In</span><div className="countdown"><strong>{two(Math.floor(remaining / 60))}<small>MIN</small></strong><strong>{two(remaining % 60)}<small>SECS</small></strong></div></div>
      </div>
    </section>
    <section className="card" id="how">
      <div className="section-title"><h2>Make a Prediction</h2><span>Parimutuel (Pool-Based)</span></div>
      <div className="choices">
        <button disabled>↗ UP <small>Price will be higher</small><small>Estimated Payout</small><strong>—</strong></button>
        <button disabled>↘ DOWN <small>Price will be lower</small><small>Estimated Payout</small><strong>—</strong></button>
      </div>
      <label className="amount-label">Your Amount<input disabled placeholder="— USDT"/></label>
      <div className="pool"><span>Pool (This Round)</span><strong>—</strong></div>
    </section>
    <section className="card"><h2>Recent Rounds <small>(BTC, 15 min)</small></h2><p className="preview-note">Live market preview. Settlement data is unavailable.</p></section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);

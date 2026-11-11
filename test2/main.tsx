import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BaselineSeries, ColorType, createChart, LineStyle, LineType, type AutoscaleInfo, type UTCTimestamp } from "lightweight-charts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Wallet } from "lucide-react";
import { RollingPrice } from "./RollingPrice";
import brand from "./brand.svg";
import "@fontsource-variable/inter/wght.css";
import "./style.css";

const interval = 900;
const klines = "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT";
const round = (time: number) => Math.floor(time / interval) * interval;
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const timeLabel = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const timeLabelWithSeconds = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const axisTick = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const display = (price?: number) => price === undefined ? "—" : dollars.format(price);
const now = () => Math.floor(Date.now() / 1000);
type Candle = [number, string, string, string, string];

export function App() {
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
  const current = quote?.start === start ? quote : undefined;
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
    const priceTicks = Array.from(prices.querySelectorAll("span"));
    const timeTicks = Array.from(times.querySelectorAll("span"));
    const controller = new AbortController();
    const chartHost = host.current;
    const chart = createChart(chartHost, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#fff" }, textColor: "#667085", fontFamily: "Inter Variable, system-ui, sans-serif", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false, scaleMargins: { top: 0, bottom: 0 } },
      timeScale: { visible: false, rightOffset: 0, minBarSpacing: 0.001, shiftVisibleRangeOnNewBar: false },
      handleScroll: false,
      handleScale: false,
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
    });
    let target = 0;
    let low = Infinity;
    let high = -Infinity;
    const priceRange = () => {
      if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
      const padding = high === low ? 0.01 : (high - low) * 0.1;
      return { minValue: low - padding, maxValue: high + padding };
    };
    const inRange = () => {
      const range = priceRange();
      return range !== null && target >= range.minValue && target <= range.maxValue;
    };
    let displayedRange: ReturnType<typeof priceRange> = null;
    const series = chart.addSeries(BaselineSeries, {
      topLineColor: "#00c52e", bottomLineColor: "#ee5264", lineWidth: 1,
      topFillColor1: "#00c52e40", topFillColor2: "#00c52e03",
      bottomFillColor1: "#ee526406", bottomFillColor2: "#ee526438",
      baseValue: { type: "price", price: target }, lineType: LineType.Curved,
      priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const range = displayedRange ?? priceRange();
        return range ? { priceRange: range } : original();
      },
    });
    let socket: WebSocket | undefined;
    let retry = 0;
    let latest: { time: UTCTimestamp; price: number } | undefined;
    let frame = 0;

    let displayedPrice = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderedSlot = 0;
    let lastFrameTime = 0;
    let lastQuoteFrame = 0;
    let publishedPrice = NaN;
    let connected = false;
    let marketClock = 0;
    let marketClockReceived = 0;

    function animatePrice(time: UTCTimestamp, price: number) {
      latest = { time, price };

    }

    function positionLabels() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!latest || !priceBadge || !pricePoint || !targetText) return;
        const y = series.priceToCoordinate(displayedPrice);
        const paneWidth = chart.paneSize().width;
        const x = paneWidth - 1;
        // Use the actual canvas width (the library rounds it), not a separate CSS percentage.
        const axis = chartHost.parentElement?.querySelector<HTMLElement>(".axis-frame");
        if (axis) axis.style.width = paneWidth + "px";
        const targetY = series.priceToCoordinate(target);
        if (y === null || x === null || targetY === null) return;
        const color = displayedPrice >= target ? "#00C52E" : "#EE5264";
        priceBadge.style.top = y + "px";
        priceBadge.style.backgroundColor = color;
        pricePoint.style.top = y + "px";
        pricePoint.style.left = x + "px";
        pricePoint.style.backgroundColor = color;
        targetText.style.top = targetY + "px";
        for (const element of [priceBadge, pricePoint]) element.style.visibility = "visible";
        targetText.style.visibility = inRange() ? "visible" : "hidden";

        const range = displayedRange ?? priceRange();
        if (!range) return;
        const chartHeight = chartHost.clientHeight;
        const badgeClearance = chartHeight * 27 / 274;
        // Four evenly spaced levels in the central 70%; only the level covered by the live badge is hidden.
        priceTicks.forEach((element, index) => {
          const price = range.maxValue - (range.maxValue - range.minValue) * (0.15 + index * 0.7 / 3);
          const top = series.priceToCoordinate(price);
          const visible = top !== null && Math.abs(top - y) > badgeClearance;
          element.hidden = !visible;
          if (visible) {
            element.textContent = axisTick.format(price);
            element.style.top = top + "px";
          }
        });
        const end = latest.time;
        const format = end - start < 120 ? timeLabelWithSeconds : timeLabel;
        timeTicks.forEach((element, index) => {
          element.textContent = format.format(Math.floor(start + (end - start) * index / 2) * 1000);
          element.hidden = index !== 0 && end === start;
        });
      });
    }

    let clockFrame = 0;
    function advanceTime(timestamp: number) {
      if (latest && !document.hidden) {
        const elapsed = Math.min(100, lastFrameTime ? timestamp - lastFrameTime : 16.67);
        const blend = reducedMotion.matches ? 1 : 1 - Math.pow(1 - 0.22, elapsed / (1000 / 60));
        displayedPrice += (latest.price - displayedPrice) * blend;
        const desired = priceRange();
        if (desired && displayedRange) {
          displayedRange = {
            minValue: displayedRange.minValue + (desired.minValue - displayedRange.minValue) * blend,
            maxValue: displayedRange.maxValue + (desired.maxValue - displayedRange.maxValue) * blend,
          };
        } else displayedRange = desired;
        const marketNow = marketClock + (timestamp - marketClockReceived) / 1000;
        const slot = Math.max(renderedSlot, Math.floor((marketNow - start) * 10));
        while (renderedSlot < slot) {
          // Commit the interpolated display path; quote and OHLC remain raw exchange data.
          series.update({ time: (start + renderedSlot / 10) as UTCTimestamp, value: displayedPrice });
          renderedSlot++;
        }
        series.update({ time: (start + renderedSlot / 10) as UTCTimestamp, value: displayedPrice });
        chart.timeScale().setVisibleLogicalRange({ from: 0, to: Math.max(1, renderedSlot) - 0.5 });
        positionLabels();
        if (timestamp - lastQuoteFrame >= 150 && latest.price !== publishedPrice) {
          publishedPrice = latest.price;
          lastQuoteFrame = timestamp;
          setQuote({ start, target, price: latest.price });
        }
        if (!connected) { connected = true; setStatus("Live"); }
      }
      lastFrameTime = timestamp;
      clockFrame = requestAnimationFrame(advanceTime);
    }
    clockFrame = requestAnimationFrame(advanceTime);
    const resize = new ResizeObserver(positionLabels);
    resize.observe(chartHost);
    chart.timeScale().subscribeVisibleLogicalRangeChange(positionLabels);

    async function connect() {
      connected = false;
      setStatus("Connecting");
      try {
        const options = { signal: controller.signal };
        const [historyResponse, roundResponse] = await Promise.all([
          fetch(klines + "&interval=1s&limit=900&startTime=" + start * 1000, options),
          fetch(klines + "&interval=15m&limit=1&startTime=" + start * 1000, options),
        ]);
        if (!historyResponse.ok || !roundResponse.ok) throw new Error("Market data unavailable");
        const [candles, rounds]: [Candle[], Candle[]] = await Promise.all([historyResponse.json(), roundResponse.json()]);
        if (controller.signal.aborted) return;
        const opening = rounds[0];
        const openingPrice = Number(opening?.[1]);
        if (opening?.[0] !== start * 1000 || !Number.isFinite(openingPrice) || openingPrice <= 0 || !candles.length) {
          throw new Error("Round open unavailable");
        }
        const points = candles.map(c => ({ time: Math.floor(c[0] / 1000) as UTCTimestamp, value: Number(c[4]) }));
        const lows = candles.map(c => Number(c[3]));
        const highs = candles.map(c => Number(c[2]));
        if ([...lows, ...highs, ...points.map(p => p.value)].some(value => !Number.isFinite(value) || value <= 0)) {
          throw new Error("Invalid market data");
        }
        low = Math.min(low, ...lows);
        high = Math.max(high, ...highs);
        target = openingPrice;
        series.applyOptions({ baseValue: { type: "price", price: target } });
        targetLine.applyOptions({ price: target, lineVisible: inRange() });

        displayedRange = priceRange();
        const lastPoint = points[points.length - 1];
        latest = { time: lastPoint.time, price: lastPoint.value };
        displayedPrice = lastPoint.value;

        const dense = [];
        for (let index = 0; index < points.length; index++) {
          const previous = points[Math.max(0, index - 1)].value;
          for (let part = 0; part < 10; part++) {
            dense.push({ time: (points[index].time + part / 10) as UTCTimestamp, value: previous + (points[index].value - previous) * part / 10 });
          }
        }
        renderedSlot = (dense[dense.length - 1].time - start) * 10;
        renderedSlot = Math.round(renderedSlot);
        marketClock = dense[dense.length - 1].time;
        marketClockReceived = performance.now();
        series.setData(dense);
        chart.timeScale().fitContent();
        setQuote({ start, target, price: lastPoint.value });
        positionLabels();
        socket = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@aggTrade");
        socket.onmessage = (event) => {
          try {
            const trade = JSON.parse(event.data);
            const k = { s: trade.s, i: "1s", t: trade.T, c: trade.p, l: trade.p, h: trade.p };
            if (trade.e !== "aggTrade" || k.s !== "BTCUSDT") return;
            const time = (k.t / 1000) as UTCTimestamp;
            const price = Number(k.c);
            if (!Number.isFinite(time) || !Number.isFinite(price) || (latest !== undefined && time < latest.time) || round(time) !== start) return;
            const candleLow = Number(k.l);
            const candleHigh = Number(k.h);
            if (!Number.isFinite(candleLow) || !Number.isFinite(candleHigh) || candleLow <= 0 || candleHigh < candleLow) return;
            low = Math.min(low, candleLow);
            high = Math.max(high, candleHigh);
            if (targetLine.options().lineVisible !== inRange()) targetLine.applyOptions({ lineVisible: inRange() });
            marketClock = Math.max(marketClock + (performance.now() - marketClockReceived) / 1000, time);
            marketClockReceived = performance.now();
            animatePrice(time, price);

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

    const targetLine = series.createPriceLine({ price: target, color: "#969da3", lineStyle: LineStyle.Dashed, axisLabelVisible: false, lineVisible: false });
    void connect();
    return () => {
      controller.abort();
      resize.disconnect();
      cancelAnimationFrame(frame);

      cancelAnimationFrame(clockFrame);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(positionLabels);
      for (const element of [priceBadge, pricePoint, targetText]) {
        element.style.visibility = "hidden";
      }
      for (const element of [...priceTicks, ...timeTicks]) element.hidden = true;
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
    <footer>Preview · Payout, pool and recent rounds are sample data. <a href="https://www.tradingview.com/">Chart by TradingView</a></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);

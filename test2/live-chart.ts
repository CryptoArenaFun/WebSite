import { appendKeyframe, recordMotion, stableDetailTicks, blend, controls, detailRange, visiblePoints, ema, paddedRange, viewport, type Point, type ChartView, type TickGrid } from "./chart-motion";

type Quote = { start: number; target: number; price: number };
type Elements = { host: HTMLDivElement; badge: HTMLSpanElement; point: HTMLSpanElement; targetLabel: HTMLSpanElement; priceAxis: HTMLDivElement; timeAxis: HTMLDivElement };
type Candle = [number, string, string, string, string];
const fineTickFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const tickFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function startLiveChart(start: number, el: Elements, quote: (q: Quote) => void, status: (s: string) => void, mode: { current: ChartView } = { current: "round" }) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none";
  el.host.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); status("Chart unavailable"); return () => {}; }
  const abort = new AbortController();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const priceTicks = Array.from(el.priceAxis.querySelectorAll("span"));
  const timeTicks = Array.from(el.timeAxis.querySelectorAll("span"));
  const axis = el.host.parentElement?.querySelector<HTMLElement>(".axis-frame");
  let width = 0, height = 0, dpr = 1;
  function resize() {
    const box = el.host.getBoundingClientRect();
    width = box.width; height = box.height; dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    if (axis) axis.style.width = width + "px";
  }
  const observer = new ResizeObserver(resize); observer.observe(el.host); resize();
  let points: Point[] = [], raw = NaN, smoothed = NaN, tip = NaN, target = NaN;
  let low = Infinity, high = -Infinity, minY = NaN, maxY = NaN;
  let lastTrade = 0, clock = start, clockAt = performance.now(), visibleEnd = start;
  let frame = 0, retry = 0, fetchTimeout = 0, lastFrame = 0, lastPublish = 0, published = NaN;
  let measurementStart = 0, measuredFrames = 0;
  let previousSample: Point | undefined, direction = 0, firstPaint = true;
  const outgoing = Array.from(el.host.querySelectorAll<HTMLCanvasElement>("canvas[data-outgoing]"));
  let transitionTimer = 0;
  // Freeze control points in price/time coordinates once both endpoints are committed.
  const segments = new Map<number, ReturnType<typeof controls>>();
  let socket: WebSocket | undefined;
  let tickGrid: TickGrid | undefined;
  let tickGridUpdated = -Infinity;
  let receivedAt = 0, messageCount = 0, priceChanges = 0, feedState = "";
  const reportStatus = (value: string) => { if (feedState !== value) { feedState = value; status(value); } };
  const watchdog = window.setInterval(() => {
    if (abort.signal.aborted) return;
    canvas.dataset.streamMessages = String(messageCount);
    canvas.dataset.priceChanges = String(priceChanges);
    canvas.dataset.lastTradeTime = String(lastTrade);
    if (receivedAt) {
      const age = performance.now() - receivedAt;
      canvas.dataset.messageAgeMs = age.toFixed(0);
      if (socket?.readyState === WebSocket.OPEN && age > 5000) reportStatus("Waiting");
      if (socket?.readyState === WebSocket.OPEN && age > 30000) socket.close();
    }
  }, 1000);
  let localTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function refreshTimezone() {
    localTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    lastFrame = 0; measurementStart = 0; measuredFrames = 0;
  }
  document.addEventListener("visibilitychange", refreshTimezone);
  const y = (value: number) => (maxY - value) / (maxY - minY) * height;

  function paint(timestamp: number) {
    if (abort.signal.aborted) return;
    const renderStarted = performance.now();
    const dt = lastFrame ? timestamp - lastFrame : 1000 / 60;
    lastFrame = timestamp;
    if (!document.hidden && Number.isFinite(raw) && width && height) {
      if (!measurementStart) measurementStart = timestamp;
      measuredFrames++;
      if (timestamp - measurementStart >= 1000) {
        canvas.dataset.renderFps = (measuredFrames * 1000 / (timestamp - measurementStart)).toFixed(1);
        canvas.dataset.windowSeconds = mode.current === "detail" ? "10" : "900";
        canvas.dataset.chartView = mode.current;
        measurementStart = timestamp; measuredFrames = 0;
      }
      if (dpr !== Math.min(window.devicePixelRatio || 1, 3)) resize();
      tip += (smoothed - tip) * (reduced.matches ? 1 : blend(0.08, dt));
      visibleEnd = Math.max(visibleEnd, Math.min(start + 900, clock + (timestamp - clockAt) / 1000));
      const view = viewport(start, visibleEnd, mode.current);
      const desired = mode.current === "detail" ? detailRange(points, view.begin, tip, tip, view.end) : paddedRange(low, high);
      const scaleBlend = reduced.matches ? 1 : blend(0.1, dt);
      minY += (desired.min - minY) * scaleBlend;
      maxY += (desired.max - maxY) * scaleBlend;

      const sample = { time: view.end, value: tip };
      direction = recordMotion(points, previousSample, sample, direction);
      previousSample = sample;
      const pathPoints = visiblePoints(points, view.begin, view.end);
      pathPoints.push({ time: view.end, value: tip });
      const xy = pathPoints.map(p => ({ x: (p.time - view.begin) / (view.end - view.begin) * width, y: y(p.value) }));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0); ctx!.clearRect(0, 0, width, height);
      if (xy.length > 1) {
        const path = new Path2D(); path.moveTo(xy[0].x, xy[0].y);
        const priceCoordinates = pathPoints.map(p => ({ x: p.time, y: p.value }));
        for (let i = 0; i < xy.length - 1; i++) {
          const a = pathPoints[i], b = pathPoints[i + 1];
          let c = segments.get(a.time);
          if (!c) {
            c = controls(priceCoordinates, i);
            if (b.time < view.end) segments.set(a.time, c);
          }
          const x = (time: number) => (time - view.begin) / (view.end - view.begin) * width;
          path.bezierCurveTo(x(c.c1x), y(c.c1y), x(c.c2x), y(c.c2y), xy[i + 1].x, xy[i + 1].y);
        }
        const targetY = y(target), split = Math.max(0, Math.min(height, targetY));
        const area = new Path2D(path);
        // Straight segments close only the fill boundary; historical prices are cubic curves.
        area.lineTo(width, targetY); area.lineTo(xy[0].x, targetY); area.closePath();
        const regions = [
          { top: 0, bottom: split, color: "#00c52e", from: "#00c52e40", to: "#00c52e03" },
          { top: split, bottom: height, color: "#ee5264", from: "#ee526406", to: "#ee526438" },
        ];
        for (const region of regions) {
          if (region.bottom <= region.top) continue;
          ctx!.save(); ctx!.beginPath(); ctx!.rect(0, region.top, width, region.bottom - region.top); ctx!.clip();
          const gradient = ctx!.createLinearGradient(0, region.top, 0, region.bottom);
          gradient.addColorStop(0, region.from); gradient.addColorStop(1, region.to);
          ctx!.fillStyle = gradient; ctx!.fill(area);
          ctx!.strokeStyle = region.color; ctx!.lineWidth = mode.current === "round" ? 1 : 2; ctx!.lineJoin = "round"; ctx!.lineCap = "round"; ctx!.stroke(path);
          ctx!.restore();
        }
      }
      if (firstPaint) {
        firstPaint = false;
        canvas.dataset.roundStart = String(start);
        for (const old of outgoing) {
          if (reduced.matches) old.remove();
          else old.classList.add("round-chart-exit");
        }
        transitionTimer = window.setTimeout(() => outgoing.forEach(old => old.remove()), 400);
      }
      canvas.dataset.rangeMin = minY.toFixed(4); canvas.dataset.rangeMax = maxY.toFixed(4);
      const targetY = y(target), tipY = y(tip), color = tip >= target ? "#00c52e" : "#ee5264";
      if (targetY >= 0 && targetY <= height) {
        ctx!.beginPath(); ctx!.setLineDash([4, 3]); ctx!.lineWidth = 1; ctx!.strokeStyle = "#969da3";
        ctx!.moveTo(0, targetY); ctx!.lineTo(width, targetY); ctx!.stroke(); ctx!.setLineDash([]);
        el.targetLabel.style.top = targetY + "px"; el.targetLabel.style.visibility = "visible";
      } else el.targetLabel.style.visibility = "hidden";
      el.point.style.left = width + "px";
      // Halo's maximum radius is 1.1rem; badge starts at its outer edge.
      el.badge.style.left = `calc(${width}px + 1.1rem)`;
      for (const element of [el.point, el.badge]) {
        element.style.top = tipY + "px"; element.style.backgroundColor = color; element.style.visibility = "visible";
      }
      if (mode.current === "detail" && (timestamp - tickGridUpdated >= 500 || !tickGrid)) {
        tickGrid = stableDetailTicks(minY, maxY, tickGrid);
        tickGridUpdated = timestamp;
      }
      priceTicks.forEach((element, i) => {
        const detail = mode.current === "detail";
        const value = detail && tickGrid ? tickGrid.values[i] : maxY - (maxY - minY) * (0.15 + i * 0.7 / 3);
        const top = y(value);
        element.hidden = Math.abs(top - tipY) < height * 27 / 274 || (detail && (top < height * 0.1 || top > height * 0.9));
        const format = detail ? tickFormat : maxY - minY < 0.1 ? fineTickFormat : tickFormat;
        const text = format.format(value);
        if (element.textContent !== text) element.textContent = text;
        element.style.top = top + "px";
      });
      timeTicks.forEach((element, i) => {
        const text = localTime.format(Math.floor(view.begin + (view.end - view.begin) * i / 2) * 1000);
        if (element.textContent !== text) element.textContent = text;
        element.hidden = false;
      });
      if (timestamp - lastPublish >= 150 && raw !== published) {
        quote({ start, target, price: raw }); published = raw; lastPublish = timestamp;
      }
    }
    canvas.dataset.renderMs = (performance.now() - renderStarted).toFixed(2);
    canvas.dataset.frameIntervalMs = dt.toFixed(1);
    frame = requestAnimationFrame(paint);
  }
  frame = requestAnimationFrame(paint);

  function reconnect() {
    if (abort.signal.aborted) return;
    reportStatus("Reconnecting"); window.clearTimeout(retry); retry = window.setTimeout(() => void connect(), 5000);
  }
  async function connect() {
    if (abort.signal.aborted) return;
    reportStatus(outgoing.length && firstPaint ? "Changing round" : "Connecting");
    const requestAbort = new AbortController();
    const cancelRequest = () => requestAbort.abort();
    abort.signal.addEventListener("abort", cancelRequest, { once: true });
    fetchTimeout = window.setTimeout(cancelRequest, 12000);
    try {
      const url = "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&startTime=" + start * 1000;
      const responses = await Promise.all([
        fetch(url + "&interval=1s&limit=900", { signal: requestAbort.signal }),
        fetch(url + "&interval=15m&limit=1", { signal: requestAbort.signal }),
      ]);
      if (responses.some(r => !r.ok)) throw new Error("Market data unavailable");
      const [candles, rounds]: [Candle[], Candle[]] = await Promise.all([responses[0].json(), responses[1].json()]);
      if (abort.signal.aborted) return;
      const opening = rounds[0];
      if (!opening || opening[0] !== start * 1000 || !(Number(opening[1]) > 0)) throw new Error("Missing round open");
      const valid = candles.filter(c => c[0] >= start * 1000 && c[0] < (start + 900) * 1000);
      if (!valid.length) valid.push(opening);
      if (valid.some(c => [c[2], c[3], c[4]].some(v => !Number.isFinite(Number(v)) || Number(v) <= 0))) throw new Error("Invalid history");
      target = Number(opening[1]); low = Math.min(target, ...valid.map(c => Number(c[3]))); high = Math.max(target, ...valid.map(c => Number(c[2])));
      points = []; smoothed = Number(valid[0][4]);
      for (const candle of valid) {
        smoothed = ema(smoothed, Number(candle[4]));
        appendKeyframe(points, { time: candle[0] / 1000, value: smoothed });
      }
      raw = Number(valid[valid.length - 1][4]); tip = smoothed;
      lastTrade = valid[valid.length - 1][0];
      clock = lastTrade / 1000; clockAt = performance.now(); visibleEnd = clock;
      const range = paddedRange(low, high); minY = range.min; maxY = range.max;
      previousSample = undefined; direction = 0; segments.clear();
      socket = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@aggTrade");
      socket.onmessage = event => {
        if (abort.signal.aborted) return;
        try {
          const trade = JSON.parse(event.data), value = Number(trade.p), time = Number(trade.T);
          if (trade.e !== "aggTrade" || trade.s !== "BTCUSDT" || !Number.isFinite(time) || !Number.isFinite(value) || value <= 0 || time < lastTrade || time < start * 1000 || time >= (start + 900) * 1000) return;
          receivedAt = performance.now(); messageCount++;
          if (value !== raw) priceChanges++;
          lastTrade = time; raw = value; smoothed = ema(smoothed, raw);
          reportStatus("Live");
          low = Math.min(low, raw); high = Math.max(high, raw);
          // Keep the display clock monotonic without accelerating exchange time.
          const stamp = performance.now();
          clock = Math.max(clock + (stamp - clockAt) / 1000, time / 1000); clockAt = stamp;
        } catch { /* Ignore malformed messages. */ }
      };
      socket.onopen = () => { if (!abort.signal.aborted) { receivedAt = performance.now(); reportStatus("Connecting"); } };
      socket.onerror = () => socket?.close(); socket.onclose = reconnect;
    } catch { reconnect(); }
    finally { window.clearTimeout(fetchTimeout); abort.signal.removeEventListener("abort", cancelRequest); }
  }
  void connect();
  return (preserveFrame = false) => {
    abort.abort(); window.clearInterval(watchdog); cancelAnimationFrame(frame); window.clearTimeout(retry); window.clearTimeout(fetchTimeout);
    observer.disconnect(); document.removeEventListener("visibilitychange", refreshTimezone);
    if (socket) { socket.onmessage = null; socket.onopen = null; socket.onclose = null; socket.onerror = null; socket.close(); }
    window.clearTimeout(transitionTimer);
    outgoing.forEach(old => old.remove());
    if (preserveFrame && !firstPaint) {
      canvas.dataset.outgoing = "true";
      canvas.style.zIndex = "1";
      canvas.style.background = "#fff";
    } else canvas.remove();
    points = []; segments.clear();
    if (preserveFrame) return;
    for (const element of [el.point, el.badge, el.targetLabel]) element.style.visibility = "hidden";
    for (const element of [...priceTicks, ...timeTicks]) element.hidden = true;
  };
}

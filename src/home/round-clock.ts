// Exchange time is estimated from Binance's server timestamp and a monotonic local clock.
// Never select a round using the device's wall clock.
export function startRoundClock(publish: (timeMs: number, offsetMs: number) => void) {
  let offset: number | undefined;
  let stopped = false;
  let retry = 0;
  let request: AbortController | undefined;
  const tick = () => {
    if (!stopped && offset !== undefined) publish(performance.now() + offset, offset);
  };
  async function sync() {
    if (stopped || request) return;
    window.clearTimeout(retry);
    const controller = new AbortController();
    request = controller;
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    const sent = performance.now();
    let delay = 5000;
    try {
      const response = await fetch("https://data-api.binance.vision/api/v3/time", {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("Exchange time unavailable");
      const data = await response.json();
      const received = performance.now();
      if (!Number.isSafeInteger(data.serverTime) || data.serverTime <= 0) throw new Error("Invalid exchange time");
      if (stopped || controller.signal.aborted) return;
      offset = data.serverTime - (sent + received) / 2;
      tick();
      delay = 60000;
    } catch { /* Keep a previous exchange offset; retry if unavailable. */ }
    finally {
      window.clearTimeout(timeout);
      request = undefined;
      if (!stopped) retry = window.setTimeout(() => void sync(), delay);
    }
  }
  const timer = window.setInterval(tick, 250);
  const resume = () => { if (!document.hidden) void sync(); };
  document.addEventListener("visibilitychange", resume);
  void sync();
  return () => {
    stopped = true;
    request?.abort();
    window.clearTimeout(retry);
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", resume);
  };
}

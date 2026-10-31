// Binance UTC klines are cumulative; trade IDs delimit the snapshot precisely.
export const PERIOD_MS = 300000;
export const bucketStart = time => Math.floor(time / PERIOD_MS) * PERIOD_MS;
export function candleClock(now) {
  const start = bucketStart(now), remaining = Math.max(0, start + PERIOD_MS - now);
  const seconds = Math.ceil(remaining / 1000);
  return { start, end: start + PERIOD_MS, remaining, elapsed: (PERIOD_MS - remaining) / PERIOD_MS,
    text: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` };
}
export function validCandle(b) {
  return b && Number.isSafeInteger(b.start) && b.start >= 0 && b.start % PERIOD_MS === 0 &&
    [b.open,b.high,b.low,b.close,b.volume,b.quoteVolume,b.buyVolume].every(Number.isFinite) &&
    b.low > 0 && b.high >= Math.max(b.open,b.close,b.low) && b.low <= Math.min(b.open,b.close) &&
    b.volume >= 0 && b.quoteVolume >= 0 && b.buyVolume >= 0 && b.buyVolume <= b.volume + 1e-8 &&
    Number.isSafeInteger(b.trades) && b.trades >= 0;
}
export function fromRest(row) {
  if (!Array.isArray(row)) return null;
  const b = {start:+row[0],open:+row[1],high:+row[2],low:+row[3],close:+row[4],volume:+row[5],
    quoteVolume:+row[7],trades:+row[8],buyVolume:+row[9],lastId:null,eventTime:0};
  return validCandle(b) ? b : null;
}
export function fromKline(d) {
  const k = d?.k;
  if (d?.e !== 'kline' || k?.s !== 'BTCUSDT' || k.i !== '5m' || !Number.isFinite(+d.E) || !Number.isSafeInteger(k.L)) return null;
  const b = {start:+k.t,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v,
    quoteVolume:+k.q,trades:+k.n,buyVolume:+k.V,lastId:k.L,eventTime:+d.E};
  return validCandle(b) ? b : null;
}
export function validTrade(d) {
  return d?.e === 'trade' && d.s === 'BTCUSDT' && Number.isSafeInteger(d.t) && d.t >= 0 &&
    Number.isFinite(d.T) && d.T >= 0 && Number.isFinite(+d.p) && +d.p > 0 &&
    Number.isFinite(+d.q) && +d.q > 0 && typeof d.m === 'boolean';
}
export class CandleModel {
  constructor() { this.snapshot = null; this.pending = new Map(); }
  acceptSnapshot(bar) {
    if (!validCandle(bar)) return false;
    const old = this.snapshot;
    if (old && (bar.start < old.start || (bar.start === old.start && (
      bar.volume < old.volume || bar.trades < old.trades ||
      (old.lastId !== null && (bar.lastId === null || bar.lastId < old.lastId)) ||
      (bar.lastId !== null && old.lastId !== null && bar.eventTime < old.eventTime)
    )))) return false;
    this.snapshot = {...bar};
    for (const [id,trade] of this.pending) {
      if (bucketStart(trade.T) < bar.start || (bar.lastId !== null && id <= bar.lastId)) this.pending.delete(id);
    }
    return true;
  }
  acceptTrade(d) {
    if (!validTrade(d)) return false;
    if (this.snapshot && (bucketStart(d.T) < this.snapshot.start || (this.snapshot.lastId !== null && d.t <= this.snapshot.lastId))) return false;
    this.pending.set(d.t,d);
    // Bound memory if snapshots stop arriving. A missing ID blocks extrapolation
    // until the next authoritative snapshot, rather than inventing missing volume.
    if (this.pending.size > 10000) this.pending.delete(this.pending.keys().next().value);
    return true;
  }
  current(start) {
    const b = this.snapshot;
    if (!b || b.start !== start) return null;
    const result = {...b};
    if (b.lastId === null) return result; // REST has no last-trade ID: never sum onto it.
    const trades = [...this.pending.values()].filter(d => bucketStart(d.T) === start && d.t > b.lastId).sort((a,b)=>a.t-b.t);
    let nextId = b.lastId + 1;
    for (const d of trades) {
      if (d.t !== nextId) break;
      nextId++;
      const price = +d.p, quantity = +d.q;
      result.high = Math.max(result.high,price); result.low = Math.min(result.low,price); result.close = price;
      result.volume += quantity; result.quoteVolume += price * quantity; result.trades++;
      // m=true means the buyer was maker, so the seller was the aggressor.
      if (!d.m) result.buyVolume += quantity;
    }
    return result;
  }
}
export function metrics(b) {
  const change = b.close-b.open, range = b.high-b.low;
  const buy = b.volume > 0 ? Math.max(0,Math.min(100,b.buyVolume/b.volume*100)) : null;
  return {change,changePct:change/b.open*100,range,rangePct:range/b.open*100,
    bodyPct:range > 0 ? Math.min(100,Math.abs(change)/range*100) : 0,buy,sell:buy === null ? null : 100-buy};
}
export function candleGeometry(b,top,bottom) {
  const span = Math.max(b.high-b.low, b.close*0.000001, 0.1);
  const min = (b.high+b.low)/2-span*.75, max = (b.high+b.low)/2+span*.75;
  const y = value => bottom-(value-min)/(max-min)*(bottom-top);
  return {y,min,max,high:y(b.high),low:y(b.low),open:y(b.open),close:y(b.close)};
}

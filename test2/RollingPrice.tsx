import { memo, useEffect, useRef } from "react";

type Props = { value?: number; currency?: boolean; fractionDigits?: number; minimumIntegerDigits?: number; flash?: boolean };

export const RollingPrice = memo(function RollingPrice({ value, currency = false, fractionDigits = 2, minimumIntegerDigits = 1, flash = true }: Props) {
  const previous = useRef(value);
  const root = useRef<HTMLSpanElement>(null);
  const animation = useRef<Animation | undefined>(undefined);
  useEffect(() => {
    const element = root.current;
    if (flash && element && value !== undefined && previous.current !== undefined && value !== previous.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const from = getComputedStyle(element).color;
      const base = getComputedStyle(element.parentElement!).color;
      animation.current?.cancel();
      animation.current = element.animate([
        { color: from, offset: 0 },
        { color: value > previous.current ? "#00a526" : "#ee5264", offset: 0.3 },
        { color: base, offset: 1 },
      ], { duration: 500, easing: "ease-in-out" });
    }
    previous.current = value;
  }, [value, flash]);
  useEffect(() => () => animation.current?.cancel(), []);
  const text = value === undefined ? "—" : new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits, minimumIntegerDigits,
  }).format(value);
  return <span ref={root} className="rolling-price" aria-label={(currency ? "$" : "") + text}>
    {currency && <span aria-hidden="true">$</span>}
    {Array.from(text).map((char, index) => /\d/.test(char)
      ? <span className="digit-window" key={text.length - index} aria-hidden="true">
          <span className="digit-reel" style={{ transform: "translateY(-" + Number(char) * 10 + "%)" }}>
            {"0123456789".split("").map(digit => <span key={digit}>{digit}</span>)}
          </span>
        </span>
      : <span key={"separator-" + index} aria-hidden="true">{char}</span>)}
  </span>;
});

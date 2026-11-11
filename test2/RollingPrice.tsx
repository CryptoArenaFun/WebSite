import { memo, useEffect, useRef, useState } from "react";

export const RollingPrice = memo(function RollingPrice({ value, currency = false }: { value?: number; currency?: boolean }) {
  const previous = useRef(value);
  const [direction, setDirection] = useState("neutral");
  useEffect(() => {
    if (value !== undefined && previous.current !== undefined && value !== previous.current) {
      setDirection(value > previous.current ? "up" : "down");
    }
    previous.current = value;
  }, [value]);
  const text = value === undefined ? "—" : new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
  return <span className="rolling-price" aria-label={(currency ? "$" : "") + text}>
    <span key={value} className={"price-flash " + direction} aria-hidden="true"/>
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

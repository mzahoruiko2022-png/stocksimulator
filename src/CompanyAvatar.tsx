import { useState } from "react";
import "./CompanyAvatar.css";

/** FMP filenames don’t always match Yahoo (e.g. MRSH vs MMC). */
const FMP_LOGO_SYMBOL: Record<string, string> = {
  MRSH: "MMC",
};

/** Public ticker logos (PNG). Falls back to two-letter symbol on error. */
export function logoUrlForSymbol(symbol: string): string {
  const sym = symbol.toUpperCase();
  const file = FMP_LOGO_SYMBOL[sym] ?? sym;
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(file)}.png`;
}

type Props = {
  symbol: string;
};

export function CompanyAvatar({ symbol }: Props) {
  const [failed, setFailed] = useState(false);
  const sym = symbol.toUpperCase();

  if (failed) {
    return <span className="company-avatar-fallback">{sym.slice(0, 2)}</span>;
  }

  return (
    <img
      className="company-avatar-img"
      src={logoUrlForSymbol(sym)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** Shared pieces for the instant simulators. */
export const fmtMult = (m: number) => `${m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2)}×`;
export const pct = (p: number) => `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;

export const TAU = Math.PI * 2;
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const wrapAngle = (a: number) => ((a % TAU) + TAU) % TAU;
export const signedAngleDelta = (a: number, b: number) => {
  let d = wrapAngle(b - a);
  if (d > Math.PI) d -= TAU;
  return d;
};
export const distance2D = (ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax; const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
};
export const gaussian = (x: number, sigma: number) => Math.exp(-(x * x) / (2 * sigma * sigma));
export const impedanceMatch = (za: number, zb: number) => {
  const denom = (za + zb) * (za + zb);
  return denom <= 1e-12 ? 0 : clamp01((4 * za * zb) / denom);
};
export const safeLog = (v: number) => Math.log(Math.max(v, 1e-12));
export const quantize = (v: number, step: number) => Math.round(v / step) * step;

// Special functions: erfc, the normal log-density and ln Gamma.

const SQRT_PI = Math.sqrt(Math.PI);
const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

// Below this |x| erfc = 1 - erf with erf from its series; above it the continued fraction.
// At x = 2, erfc = 4.7e-3, so 1 - erf loses at most about 2 digits to cancellation.
const SERIES_MAX = 2;

// erf(x) = (2/sqrt(pi)) e^{-x^2} sum_n 2^n x^{2n+1} / (1 * 3 * ... * (2n+1)).
// Every term is positive, so there is no cancellation inside the sum.
function erfSeries(x) {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 200; n++) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return (2 / SQRT_PI) * Math.exp(-x2) * sum;
}

// erfc(x) for x >= SERIES_MAX by the continued fraction
// erfc(x) = e^{-x^2} / (sqrt(pi) (x + (1/2)/(x + 1/(x + (3/2)/(x + 2/(x + ...)))))),
// evaluated with the modified Lentz method.
function erfcContinuedFraction(x) {
  const tiny = 1e-300;
  let f = x;
  let C = f;
  let D = 0;
  for (let n = 1; n < 1000; n++) {
    const a = n / 2;
    D = x + a * D;
    if (Math.abs(D) < tiny) D = tiny;
    C = x + a / C;
    if (Math.abs(C) < tiny) C = tiny;
    D = 1 / D;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

// Complementary error function, relative error below 1e-12 for every finite x
// (erfc underflows to 0 above x of about 26.5).
export function erfc(x) {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return 0;
  if (x === -Infinity) return 2;
  const z = Math.abs(x);
  const r = z < SERIES_MAX ? 1 - erfSeries(z) : erfcContinuedFraction(z);
  return x >= 0 ? r : 2 - r;
}

// ln N(x; mu, sigma) for the normal density with mean mu and standard deviation sigma > 0.
export function normalLogPdf(x, mu, sigma) {
  const z = (x - mu) / sigma;
  return -0.5 * z * z - Math.log(sigma) - LOG_SQRT_2PI;
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

// ln |Gamma(x)| (Lanczos, g = 7, n = 9; reflection below 0.5).
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return LOG_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

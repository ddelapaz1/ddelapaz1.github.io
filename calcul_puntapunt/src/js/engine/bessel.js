// Funcions de Bessel de primera espècie (aproximacions d'Abramowitz & Stegun 9.4).

export function besselJ0(x) {
  const ax = Math.abs(x);
  if (ax <= 3) {
    const y = (x / 3) ** 2;
    return 1 + y * (-2.2499997 + y * (1.2656208 + y * (-0.3163866 + y * (0.0444479 + y * (-0.0039444 + y * 0.00021)))));
  }
  const z = 3 / ax;
  const f0 = 0.79788456 + z * (-0.00000077 + z * (-0.0055274 + z * (-0.00009512 + z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))));
  const t0 = ax - 0.78539816 + z * (-0.04166397 + z * (-0.00003954 + z * (0.00262573 + z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))));
  return (f0 * Math.cos(t0)) / Math.sqrt(ax);
}

export function besselJ1(x) {
  const ax = Math.abs(x);
  let r;
  if (ax <= 3) {
    const y = (x / 3) ** 2;
    r = ax * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289 + y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
  } else {
    const z = 3 / ax;
    const f1 = 0.79788456 + z * (0.00000156 + z * (0.01659667 + z * (0.00017105 + z * (-0.00249511 + z * (0.00113653 - z * 0.00020033)))));
    const t1 = ax - 2.35619449 + z * (0.12499612 + z * (0.0000565 + z * (-0.00637879 + z * (0.00074348 + z * (0.00079824 - z * 0.00029166)))));
    r = (f1 * Math.cos(t1)) / Math.sqrt(ax);
  }
  return x < 0 ? -r : r;
}

// J2 per sèrie de potències a valors petits (evita cancel·lacions) i per recurrència a valors grans.
export function besselJ2(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const h = ax / 2;
    let term = (h * h) / 2; // m = 0: (x/2)^2 / (0! 2!)
    let sum = term;
    for (let m = 1; m < 40; m++) {
      term *= -(h * h) / (m * (m + 2));
      sum += term;
      if (Math.abs(term) < 1e-16) break;
    }
    return sum;
  }
  return (2 * besselJ1(ax)) / ax - besselJ0(ax);
}

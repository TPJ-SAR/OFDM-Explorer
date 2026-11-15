// =====================================================================
// ofdm-math.js — ALL the OFDM math lives here (no drawing code).
// Keeping it separate means every formula can be checked on its own.
//
// Notation follows the WCM555 OFDM handout:
//   τS  = OFDM symbol time (s)
//   Δf  = subcarrier spacing = 1/τS = RS (symbol / baud rate)  (Hz)
//   fk  = k·Δf  (k = 1..N), the k-th subcarrier frequency
//   Xk  = the QAM/PSK symbol (complex number) carried by subcarrier k
// =====================================================================
const OFDM = (() => {
  const TWO_PI = 2 * Math.PI;

  // Normalized sinc: sinc(x) = sin(πx)/(πx), with sinc(0) = 1.
  // It is zero at every non-zero integer x — that is WHY orthogonal
  // subcarriers spaced by Δf = 1/τS don't interfere.
  function sinc(x) {
    if (Math.abs(x) < 1e-12) return 1;
    const px = Math.PI * x;
    return Math.sin(px) / px;
  }

  // Constellations, scaled to an average power of 1 (E|X|² = 1).
  const CONSTELLATIONS = {
    BPSK: { bits: 1, points: [{ re: 1, im: 0 }, { re: -1, im: 0 }] },
    QPSK: {
      bits: 2,
      points: [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => ({ re: a / Math.SQRT2, im: b / Math.SQRT2 })),
    },
    '16-QAM': {
      bits: 4,
      points: (() => {
        const L = [-3, -1, 1, 3], p = [];
        for (const a of L) for (const b of L) p.push({ re: a / Math.sqrt(10), im: b / Math.sqrt(10) });
        return p;
      })(),
    },
  };

  // Pick N random constellation points (the "data" on each subcarrier).
  function randomSymbols(N, mod) {
    const pts = CONSTELLATIONS[mod].points;
    return Array.from({ length: N }, () => pts[Math.floor(Math.random() * pts.length)]);
  }

  const mag = X => Math.hypot(X.re, X.im);
  const phase = X => Math.atan2(X.im, X.re); // radians

  // Subcarrier k frequency. eps = frequency offset as a fraction of Δf
  // (e.g. from oscillator error or Doppler). eps = 0 → perfectly orthogonal.
  function subcarrierFreq(k, df, eps = 0) {
    return (k + eps) * df;
  }

  // One subcarrier in the time domain: Re{Xk·e^(j2πfk·t)} = |Xk|·cos(2πfk·t + ∠Xk)
  function subcarrierWave(X, f, t) {
    return mag(X) * Math.cos(TWO_PI * f * t + phase(X));
  }

  // Composite OFDM symbol (what the IFFT produces):
  //   x(t) = Σ Xk·e^(j2πfk·t),  0 ≤ t < τS.  We plot its real part.
  function compositeWave(symbols, df, eps, t) {
    let s = 0;
    for (let i = 0; i < symbols.length; i++) s += subcarrierWave(symbols[i], subcarrierFreq(i + 1, df, eps), t);
    return s;
  }

  // PAPR = (peak power)/(average power) = Vpk² / Vrms²  (handout p.8)
  function papr(samples) {
    let pk = 0, ms = 0;
    for (const v of samples) { pk = Math.max(pk, v * v); ms += v * v; }
    ms /= samples.length;
    return { papr: pk / ms, vpk: Math.sqrt(pk), vrms: Math.sqrt(ms) };
  }

  // Worst case PAPR: every subcarrier peaks at the same instant.
  //   Vpk = Σ|Xk|,  Vrms² = Σ|Xk|²/2   → for N equal amplitudes = 2N
  //   (N = 1 gives 2 → 3 dB, matching the QPSK exercise in the handout)
  function paprMax(symbols) {
    let sa = 0, sp = 0;
    for (const X of symbols) { sa += mag(X); sp += mag(X) ** 2; }
    return (sa * sa) / (sp / 2);
  }

  // Spectrum of ONE subcarrier: a tone switched on for τS seconds
  // (a rectangular pulse) has a sinc-shaped spectrum centred on fk:
  //   |Sk(f)| = |Xk|·|sinc((f − fk)·τS)|      (normalized so the peak = |Xk|)
  // Its nulls are at fk ± n/τS = fk ± n·Δf → exactly on the other subcarriers.
  function lobe(X, f, fk, tauS) {
    return mag(X) * Math.abs(sinc((f - fk) * tauS));
  }

  // Spectrum of the WHOLE symbol: add the complex sinc lobes.
  // The Fourier transform of Xk·e^(j2πfk t) on [0, τS) is
  //   Xk·τS·sinc((f−fk)τS)·e^(−jπ(f−fk)τS).
  // Because fk·τS = k + eps, the phase term is a common factor times (−1)^k,
  // so the (−1)^k must be kept when summing.
  function compositeSpectrum(symbols, f, df, eps, tauS) {
    let re = 0, im = 0;
    for (let i = 0; i < symbols.length; i++) {
      const k = i + 1;
      const s = sinc((f - subcarrierFreq(k, df, eps)) * tauS) * (k % 2 ? -1 : 1);
      re += symbols[i].re * s;
      im += symbols[i].im * s;
    }
    return Math.hypot(re, im);
  }

  // "Multiply & integrate" (handout p.5), done in discrete time like the slide:
  //   result = (2/Ns)·Σ cos(2π·fa·tn)·cos(2π·fb·tn),   tn spread over [0, T)
  // ≈ (2/T)∫₀ᵀ cos(2πfa t)cos(2πfb t) dt
  // → 1 if fa = fb, → 0 if fa ≠ fb, BUT only when T covers whole periods (T = τS).
  // Returns the final value plus the product and running sum for plotting.
  function correlate(fa, fb, T, Ns = 1500, keepTrace = false) {
    let sum = 0;
    const t = keepTrace ? new Float64Array(Ns) : null;
    const p = keepTrace ? new Float64Array(Ns) : null;
    const run = keepTrace ? new Float64Array(Ns) : null;
    for (let n = 0; n < Ns; n++) {
      const tn = ((n + 0.5) * T) / Ns;
      const prod = Math.cos(TWO_PI * fa * tn) * Math.cos(TWO_PI * fb * tn);
      sum += prod;
      if (keepTrace) { t[n] = tn; p[n] = prod; run[n] = (2 * sum) / Ns; }
    }
    return { value: (2 * sum) / Ns, t, p, run };
  }

  // Inter-carrier interference from a frequency offset eps (fraction of Δf).
  // The receiver's FFT bin m picks up:
  //   wanted:   sinc(eps)              from its own subcarrier
  //   unwanted: sinc(k − m + eps)      from every other subcarrier k
  // With unit-power random data:  SIR_ICI = sinc²(eps) / Σ_(k≠m) sinc²(k − m + eps)
  // averaged over all bins m. eps = 0 → no interference (∞ dB).
  function iciSIR(N, eps) {
    if (N < 2 || Math.abs(eps) < 1e-9) return Infinity;
    const S = sinc(eps) ** 2;
    let Itot = 0;
    for (let m = 1; m <= N; m++) {
      for (let k = 1; k <= N; k++) if (k !== m) Itot += sinc(k - m + eps) ** 2;
    }
    return S / (Itot / N);
  }

  // Throughput (no cyclic prefix yet — that comes in tab 2):
  //   Rb = N·log2(M) / τS    (bits per OFDM symbol ÷ symbol time)
  function bitRate(N, bitsPerSymbol, tauS) {
    return (N * bitsPerSymbol) / tauS;
  }

  // Null-to-null bandwidth, so OFDM and FDM are compared the same way:
  //   OFDM: lobes overlap → from f1 − Δf to fN + Δf = (N + 1)·Δf
  //   FDM (no overlap, no guard bands): each channel needs 2·RS = 2Δf → 2N·Δf
  const bwOFDM = (N, df) => (N + 1) * df;
  const bwFDM = (N, df) => 2 * N * df;

  // =================================================================
  //  TAB 2 — multipath & cyclic prefix (discrete-time, sample by sample)
  // =================================================================

  // 64-QAM (used by tab 2 and the Wi-Fi modes in tab 3), unit average power
  CONSTELLATIONS['64-QAM'] = {
    bits: 6,
    points: (() => {
      const L = [-7, -5, -3, -1, 1, 3, 5, 7], p = [];
      for (const a of L) for (const b of L) p.push({ re: a / Math.sqrt(42), im: b / Math.sqrt(42) });
      return p;
    })(),
  };

  // Small seeded random generator (mulberry32) so the same data/noise is
  // reused while you drag sliders — only "New random data" changes it.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Gaussian sample (Box–Muller) for additive white Gaussian noise
  function gauss(r) {
    const u = Math.max(r(), 1e-12), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);
  }

  // In-place radix-2 FFT (inverse=true → IFFT, including the 1/N scale).
  //   FFT:  X[k] = Σ x[n]·e^(−j2πkn/N)      IFFT: x[n] = (1/N)·Σ X[k]·e^(+j2πkn/N)
  function fft(re, im, inverse = false) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {           // bit-reversal reorder
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {       // butterflies
      const ang = (TWO_PI / len) * (inverse ? 1 : -1);
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  // Signed subcarrier index k (−N/2 … N/2−1) → FFT bin (0 … N−1)
  const bin = (k, N) => ((k % N) + N) % N;

  // 802.11a subcarrier roles: 52 used (−26…26 without 0), pilots at ±7, ±21
  const WIFI_PILOTS = [-21, -7, 7, 21];
  function wifiRole(k) {
    if (k === 0) return 'dc';
    if (Math.abs(k) > 26) return 'guard';
    return WIFI_PILOTS.includes(k) ? 'pilot' : 'data';
  }
  const WIFI_ACTIVE = Array.from({ length: 53 }, (_, i) => i - 26).filter(k => k !== 0);

  // Channel frequency response of a two-path channel
  //   h[n] = δ[n] + a·e^(jφ)·δ[n − D]   →   H(f) = 1 + a·e^(jφ)·e^(−j2πfτ),  τ = D·Ts
  // Nulls (deep fades) repeat every 1/τ in frequency → "frequency-selective fading"
  function twoPathH(f, a, phi, tau) {
    const ang = phi - TWO_PI * f * tau;
    return { re: 1 + a * Math.cos(ang), im: a * Math.sin(ang) };
  }

  // Full link: data → IFFT → add CP → two-path channel (+ noise) → remove CP → FFT → equalize
  //   N      FFT size            L   CP length (samples)     D  echo delay (samples)
  //   a, phi echo gain & phase   snrDb per-subcarrier SNR (null = no noise)
  function simulateLink({ N = 64, L, D, a, phi, mod, nSym = 10, snrDb = null, equalize = true, seed = 1, active = WIFI_ACTIVE }) {
    const R = rng(seed), Rn = rng(seed * 7919 + 13);
    const pts = CONSTELLATIONS[mod].points;
    const symLen = N + L, total = nSym * symLen;

    // 1) transmitter: random symbols on the active subcarriers, IFFT, prepend CP
    const X = [], txRe = new Float64Array(total), txIm = new Float64Array(total);
    for (let s = 0; s < nSym; s++) {
      const re = new Float64Array(N), im = new Float64Array(N), Xs = {};
      for (const k of active) {
        const p = pts[Math.floor(R() * pts.length)];
        Xs[k] = p; re[bin(k, N)] = p.re; im[bin(k, N)] = p.im;
      }
      X.push(Xs);
      fft(re, im, true);                             // IFFT → time samples
      const o = s * symLen;
      for (let n = 0; n < L; n++) { txRe[o + n] = re[N - L + n]; txIm[o + n] = im[N - L + n]; } // CP = copy of the tail
      for (let n = 0; n < N; n++) { txRe[o + L + n] = re[n]; txIm[o + L + n] = im[n]; }
    }

    // 2) channel: direct path + delayed, scaled, phase-rotated echo (+ AWGN)
    const ca = a * Math.cos(phi), sa = a * Math.sin(phi);
    const echoRe = new Float64Array(total), echoIm = new Float64Array(total);
    const rxRe = new Float64Array(total), rxIm = new Float64Array(total);
    // noise per complex sample so that SNR per subcarrier after the FFT = snr:  σ² = 1/(N·snr)
    const sigma = snrDb == null ? 0 : Math.sqrt(1 / (N * 10 ** (snrDb / 10)) / 2);
    for (let n = 0; n < total; n++) {
      if (n >= D) {
        echoRe[n] = ca * txRe[n - D] - sa * txIm[n - D];
        echoIm[n] = ca * txIm[n - D] + sa * txRe[n - D];
      }
      rxRe[n] = txRe[n] + echoRe[n] + (sigma ? sigma * gauss(Rn) : 0);
      rxIm[n] = txIm[n] + echoIm[n] + (sigma ? sigma * gauss(Rn) : 0);
    }

    // channel at each FFT bin (what a receiver estimates from the preamble)
    const H = {};
    for (const k of active) {
      const ang = phi - (TWO_PI * k * D) / N;
      H[k] = { re: 1 + a * Math.cos(ang), im: a * Math.sin(ang) };
    }

    // 3) receiver: drop the CP, FFT the next N samples, one-tap equalizer Y/H
    const Y = [];
    let errPow = 0, refPow = 0, symErr = 0, count = 0;
    for (let s = 0; s < nSym; s++) {
      const o = s * symLen + L, re = new Float64Array(N), im = new Float64Array(N);
      for (let n = 0; n < N; n++) { re[n] = rxRe[o + n]; im[n] = rxIm[o + n]; }
      fft(re, im, false);
      const Ys = {};
      for (const k of active) {
        let yr = re[bin(k, N)], yi = im[bin(k, N)];
        if (equalize) {                                   // complex divide by H[k]
          const h = H[k], d = h.re * h.re + h.im * h.im || 1e-12;
          [yr, yi] = [(yr * h.re + yi * h.im) / d, (yi * h.re - yr * h.im) / d];
        }
        Ys[k] = { re: yr, im: yi };
        if (s === 0) continue; // symbol 0 has no symbol before it → skip in the statistics
        const x = X[s][k];
        errPow += (yr - x.re) ** 2 + (yi - x.im) ** 2;
        refPow += x.re ** 2 + x.im ** 2;
        // nearest-point decision → symbol error?
        let best = null, bd = Infinity;
        for (const p of pts) { const dd = (yr - p.re) ** 2 + (yi - p.im) ** 2; if (dd < bd) { bd = dd; best = p; } }
        if (best !== x) symErr++;
        count++;
      }
      Y.push(Ys);
    }
    return {
      X, Y, H, txRe, txIm, echoRe, echoIm, rxRe, rxIm, symLen,
      evm: Math.sqrt(errPow / refPow), ser: symErr / count, symErr, count,
    };
  }

  // =================================================================
  //  TAB 3 — 802.11a numbers (VSA OFDM tutorial table)
  // =================================================================
  const WIFI_MODES = [
    { mod: 'BPSK', R: [1, 2] }, { mod: 'BPSK', R: [3, 4] },
    { mod: 'QPSK', R: [1, 2] }, { mod: 'QPSK', R: [3, 4] },
    { mod: '16-QAM', R: [1, 2] }, { mod: '16-QAM', R: [3, 4] },
    { mod: '64-QAM', R: [2, 3] }, { mod: '64-QAM', R: [3, 4] },
  ];
  //  fs = sample clock (20 MHz for 802.11a), N_FFT = 64
  //  Δf = fs/64,  T_FFT = 1/Δf,  T_GI = T_FFT/4 (long) or /8 (802.11n short GI)
  //  N_DBPS = 48 · bits/subcarrier · code rate,  Rb = N_DBPS / T_SYM
  function wifiTiming(bwHz, shortGI = false) {
    const df = bwHz / 64, Tfft = 1 / df, Tgi = shortGI ? Tfft / 8 : Tfft / 4;
    return {
      df, Tfft, Tgi, Tsym: Tfft + Tgi,
      Tshort: (10 * Tfft) / 4, Tlong: Tfft / 2 + 2 * Tfft, // short & long training (8 µs + 8 µs at 20 MHz)
      Tsignal: Tfft + Tfft / 4,                             // SIGNAL always uses the long GI
    };
  }
  function wifiRate(mode, timing) {
    const nbpsc = CONSTELLATIONS[mode.mod].bits;
    const ndbps = (48 * nbpsc * mode.R[0]) / mode.R[1];
    return { nbpsc, ndbps, rate: ndbps / timing.Tsym };
  }
  // PSDU of `bytes` → SERVICE (16 bits) + data + tail (6 bits), padded to whole OFDM symbols
  function wifiFrame(bytes, mode, timing) {
    const { ndbps } = wifiRate(mode, timing);
    const nSym = Math.ceil((16 + 8 * bytes + 6) / ndbps);
    const Tpre = timing.Tshort + timing.Tlong;
    const T = Tpre + timing.Tsignal + nSym * timing.Tsym;
    return { nSym, Tpre, T, throughput: (8 * bytes) / T };
  }

  return {
    sinc, CONSTELLATIONS, randomSymbols, mag, phase, subcarrierFreq, subcarrierWave,
    compositeWave, papr, paprMax, lobe, compositeSpectrum, correlate, iciSIR, bitRate, bwOFDM, bwFDM,
    rng, fft, bin, twoPathH, simulateLink, WIFI_PILOTS, WIFI_ACTIVE, wifiRole, WIFI_MODES, wifiTiming, wifiRate, wifiFrame,
  };
})();

// Allow `node` to load this file for testing.
if (typeof module !== 'undefined') module.exports = OFDM;

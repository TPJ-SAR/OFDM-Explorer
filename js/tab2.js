// =====================================================================
// tab2.js — "Multipath & cyclic prefix"
// A sample-by-sample OFDM link with Wi-Fi numbers:
//   N = 64-point FFT, fs = 20 MHz → Ts = 50 ns, T_FFT = 64·Ts = 3.2 µs,
//   52 active subcarriers (−26…26, DC unused).
// Channel: direct path + one echo delayed by τ = D·Ts.
// =====================================================================
const Tab2 = (() => {
  const $ = id => document.getElementById(id);
  const N = 64, FS = 20e6, TS = 1 / FS, TFFT = N * TS, DF = FS / N;
  const DEFAULTS = { L: 16, D: 10, a: 0.6, phiDeg: 60, mod: '16-QAM', eq: true, noise: false, snr: 25, seed: 1 };
  const S = { ...DEFAULTS };
  const active = OFDM.WIFI_ACTIVE;               // k = −26 … 26 (no DC)
  const subCols = Plot.colors(active.length);    // rainbow across the band
  const colOf = k => subCols[active.indexOf(k)];
  const symCols = ['#8b5cf6', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899']; // one colour per OFDM symbol
  const us = n => n * TS * 1e6;                  // samples → µs

  // ---------- controls ----------
  function bind() {
    const sync = () => {
      $('t2L').value = S.L; $('t2LVal').textContent = `${us(S.L).toFixed(2)} µs (${S.L} samples)`;
      $('t2D').value = S.D; $('t2DVal').textContent = `${us(S.D).toFixed(2)} µs (${S.D} samples)`;
      $('t2A').value = S.a; $('t2AVal').textContent = `${S.a.toFixed(2)} (${S.a > 0 ? (20 * Math.log10(S.a)).toFixed(1) + ' dB' : '−∞ dB'})`;
      $('t2Phi').value = S.phiDeg; $('t2PhiVal').textContent = `${S.phiDeg}°`;
      $('t2Mod').value = S.mod;
      $('t2Eq').checked = S.eq;
      $('t2Noise').checked = S.noise;
      $('t2Snr').value = S.snr; $('t2SnrVal').textContent = `${S.snr} dB`;
      $('t2Snr').disabled = !S.noise;
    };
    const on = (id, ev, fn) => $(id).addEventListener(ev, () => { fn($(id)); sync(); schedule(); });
    on('t2L', 'input', el => (S.L = +el.value));
    on('t2D', 'input', el => (S.D = +el.value));
    on('t2A', 'input', el => (S.a = +el.value));
    on('t2Phi', 'input', el => (S.phiDeg = +el.value));
    on('t2Mod', 'change', el => (S.mod = el.value));
    on('t2Eq', 'change', el => (S.eq = el.checked));
    on('t2Noise', 'change', el => (S.noise = el.checked));
    on('t2Snr', 'input', el => (S.snr = +el.value));
    on('t2Reroll', 'click', () => (S.seed += 1));
    on('t2PresetOk', 'click', () => Object.assign(S, { L: 16, D: 10, a: 0.6, eq: true }));
    on('t2PresetIsi', 'click', () => Object.assign(S, { L: 16, D: 24, a: 0.6, eq: true }));
    on('t2PresetNoCp', 'click', () => Object.assign(S, { L: 0, D: 6, a: 0.6, eq: true }));
    on('t2PresetNoEq', 'click', () => Object.assign(S, { L: 16, D: 10, a: 0.6, eq: false }));
    on('t2Reset', 'click', () => Object.assign(S, DEFAULTS));
    window.addEventListener('resize', schedule);
    sync();
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  }

  // =================================================================
  function render() {
    if (!$('t2').classList.contains('active')) return;
    const sim = OFDM.simulateLink({
      N, L: S.L, D: S.D, a: S.a, phi: (S.phiDeg * Math.PI) / 180, mod: S.mod,
      nSym: 12, snrDb: S.noise ? S.snr : null, equalize: S.eq, seed: S.seed,
    });
    drawTimeline(sim);
    drawConstellation(sim);
    drawChannel();
    readouts(sim);
  }

  // ---------- 1. direct / echo / received streams with CP and FFT windows ----------
  function drawTimeline(sim) {
    const symLen = sim.symLen;
    const n0 = symLen, n1 = 4 * symLen;                        // show OFDM symbols 1, 2, 3
    const c = Plot.setup($('t2Time'), 380);
    const { ctx, X, Y, A } = Plot.frame(c, {
      xMin: 0, xMax: us(n1 - n0), yMin: 0, yMax: 3, yTicks: false,
      xLabel: 'Time t (µs), starting at OFDM symbol 1', margin: { l: 112, r: 14, t: 30 },
    });
    const lanes = [
      { name: 'Direct path', re: sim.txRe, shift: 0 },
      { name: 'Echo a·x(t−τ)', re: sim.echoRe, shift: S.D },
      { name: 'Received (sum)', re: sim.rxRe, shift: null },
    ];
    let peak = 1e-9;
    for (let n = n0; n < n1; n++) peak = Math.max(peak, Math.abs(sim.rxRe[n]), Math.abs(sim.txRe[n]));
    const scale = 0.4 / peak;
    const xs = [];
    for (let n = n0; n < n1; n++) xs.push(us(n - n0));

    Plot.clip(ctx, A);
    lanes.forEach((ln, li) => {
      const yTop = 3 - li, yBot = 2 - li, yc = yBot + 0.5;
      // coloured symbol bands: darker = cyclic prefix, lighter = FFT body
      if (ln.shift !== null) {
        for (let s = 0; s < 5; s++) {
          const st = s * symLen + ln.shift;
          const band = (a, b, alpha) => {
            ctx.fillStyle = symCols[s % symCols.length] + alpha;
            ctx.fillRect(X(us(a - n0)), Y(yTop), X(us(b - n0)) - X(us(a - n0)), Y(yBot) - Y(yTop));
          };
          if (S.L > 0) band(st, st + S.L, '55');
          band(st + S.L, st + symLen, '1c');
          if (S.L > 0 && X(us(st + S.L - n0)) - X(us(st - n0)) > 22 && st >= n0 && st < n1) {
            ctx.fillStyle = '#334155'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText('CP', X(us(st + S.L / 2 - n0)), Y(yTop) + 3);
          }
        }
      }
      // ISI: part of the PREVIOUS symbol's echo that lands inside the current FFT window
      if (li > 0 && S.D > S.L && S.a > 0) {
        for (let s = 1; s <= 3; s++) {
          const w0 = s * symLen + S.L, w1 = Math.min(w0 + (S.D - S.L), w0 + N);
          ctx.fillStyle = 'rgba(220, 38, 38, 0.30)';
          ctx.fillRect(X(us(w0 - n0)), Y(yTop), X(us(w1 - n0)) - X(us(w0 - n0)), Y(yBot) - Y(yTop));
          ctx.strokeStyle = 'rgba(220, 38, 38, 0.8)'; ctx.lineWidth = 1;
          for (let x = X(us(w0 - n0)); x < X(us(w1 - n0)); x += 6) {     // hatching
            ctx.beginPath(); ctx.moveTo(x, Y(yBot)); ctx.lineTo(Math.min(x + 10, X(us(w1 - n0))), Y(yTop)); ctx.stroke();
          }
        }
      }
      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath(); ctx.moveTo(A.x, Y(yc)); ctx.lineTo(A.x + A.w, Y(yc)); ctx.stroke();
      const ys = [];
      for (let n = n0; n < n1; n++) ys.push(yc + ln.re[n] * scale);
      Plot.line(ctx, X, Y, xs, ys, li === 2 ? '#111827' : '#334155', li === 2 ? 1.6 : 1.2);
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath(); ctx.moveTo(A.x, Y(yBot)); ctx.lineTo(A.x + A.w, Y(yBot)); ctx.stroke();
    });

    // FFT windows (what the receiver keeps after dropping the CP)
    for (let s = 1; s <= 3; s++) {
      const w0 = us(s * symLen + S.L - n0), w1 = us(s * symLen + S.L + N - n0);
      Plot.line(ctx, X, Y, [w0, w0], [0, 3], '#111827', 1.2, [5, 4]);
      Plot.line(ctx, X, Y, [w1, w1], [0, 3], '#111827', 1.2, [5, 4]);
    }
    ctx.restore();
    // window labels above the plot
    ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let s = 1; s <= 3; s++) {
      const w0 = us(s * symLen + S.L - n0), w1 = us(s * symLen + S.L + N - n0);
      ctx.fillStyle = symCols[s];
      ctx.fillText(`FFT window, symbol ${s} (3.2 µs)`, (X(w0) + X(w1)) / 2, A.y - 8);
    }
    // lane names
    ctx.font = '600 12px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#26303c';
    lanes.forEach((ln, li) => ctx.fillText(ln.name, A.x - 8, Y(2.5 - li)));
  }

  // ---------- 2. received constellation, coloured by subcarrier ----------
  function drawConstellation(sim) {
    const canvas = $('t2Const');
    const size = Math.min(canvas.clientWidth, 400);
    const c = Plot.setup(canvas, size);
    let m = 0;
    for (let s = 1; s < sim.Y.length; s++) for (const k of active) m = Math.max(m, Math.abs(sim.Y[s][k].re), Math.abs(sim.Y[s][k].im));
    const lim = Math.min(2.6, Math.max(1.4, m * 1.08));
    const { ctx, X, Y, A } = Plot.frame(c, {
      xMin: -lim, xMax: lim, yMin: -lim, yMax: lim, xTickCount: 6, yTickCount: 6,
      xLabel: 'In-phase I (normalized)', yLabel: 'Quadrature Q (normalized)', margin: { l: 56, r: 12, t: 12, b: 42 },
    });
    Plot.clip(ctx, A);
    // ideal points (drawn first so received dots sit on top)
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
    for (const p of OFDM.CONSTELLATIONS[S.mod].points) {
      const x = X(p.re), y = Y(p.im);
      ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
    }
    for (let s = 1; s < sim.Y.length; s++) {
      for (const k of active) {
        const p = sim.Y[s][k];
        ctx.fillStyle = colOf(k).solid;
        ctx.beginPath(); ctx.arc(X(p.re), Y(p.im), 3, 0, 2 * Math.PI); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- 3. channel frequency response |H(f)| ----------
  function drawChannel() {
    const c = Plot.setup($('t2Chan'), 300);
    const tau = S.D * TS, phi = (S.phiDeg * Math.PI) / 180;
    // y-range adapts to the deepest fade (1 − a), floored at −40 dB
    const yMin = Math.max(-40, Math.min(-12, Math.floor((20 * Math.log10(Math.max(1 - S.a, 0.01)) - 4) / 5) * 5)), yMax = 9;
    const { ctx, X, Y, A } = Plot.frame(c, {
      xMin: -10, xMax: 10, yMin, yMax, xLabel: 'Frequency offset from channel centre (MHz)', yLabel: '|H(f)| (dB)',
      margin: { r: 12 },
    });
    const H2dB = h => Math.max(yMin, 10 * Math.log10(h.re * h.re + h.im * h.im + 1e-12));
    Plot.clip(ctx, A);
    // continuous response
    const fs = [], ys = [];
    for (let i = 0; i <= 600; i++) { const f = -10e6 + (20e6 * i) / 600; fs.push(f / 1e6); ys.push(H2dB(OFDM.twoPathH(f, S.a, phi, tau))); }
    Plot.line(ctx, X, Y, fs, ys, '#94a3b8', 1.5, [4, 3]);
    // value seen by each active subcarrier (stems)
    for (const k of active) {
      const v = H2dB(OFDM.twoPathH(k * DF, S.a, phi, tau));
      const col = colOf(k);
      ctx.strokeStyle = col.stroke; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X((k * DF) / 1e6), Y(0)); ctx.lineTo(X((k * DF) / 1e6), Y(v)); ctx.stroke();
      ctx.fillStyle = col.solid;
      ctx.beginPath(); ctx.arc(X((k * DF) / 1e6), Y(v), 3, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
    ctx.font = '600 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#26303c';
    const msg = S.D > 0 && S.a > 0
      ? `Fades repeat every 1/τ = ${Plot.fmtHz(1 / tau)}   ·   deepest fade ${(20 * Math.log10(Math.max(1 - S.a, 1e-3))).toFixed(1)} dB`
      : 'Flat channel (no echo): every subcarrier sees the same gain';
    ctx.fillText(msg, A.x + 8, A.y + 6);
  }

  // ---------- readouts + equations ----------
  function readouts(sim) {
    const Tcp = S.L * TS, tau = S.D * TS;
    const ok = S.D <= S.L || S.a === 0;
    const eff = TFFT / (TFFT + Tcp);
    const card = (label, value, note, cls = '') =>
      `<div class="ro ${cls}"><div class="ro-l">${label}</div><div class="ro-v">${value}</div><div class="ro-n">${note}</div></div>`;
    $('t2Readouts').innerHTML = [
      card('Cyclic prefix T<sub>CP</sub>', Plot.fmtUs(Tcp), `${S.L} samples × 50 ns`),
      card('Echo delay τ', Plot.fmtUs(tau), `${S.D} samples × 50 ns`),
      card('ISI check', ok ? 'τ ≤ T<sub>CP</sub> ✓' : 'τ > T<sub>CP</sub> ✗',
        ok ? 'echo dies out inside the CP' : `echo spills ${Plot.fmtUs(tau - Tcp)} into the FFT window`, ok ? 'good' : 'warn'),
      card('CP efficiency', `${(eff * 100).toFixed(1)} %`, `T<sub>FFT</sub>/(T<sub>FFT</sub>+T<sub>CP</sub>), symbol = ${Plot.fmtUs(TFFT + Tcp)}`, 'accent'),
      card('EVM', sim.evm < 1e-9 ? '0.00 %' : `${(sim.evm * 100).toFixed(2)} %`, sim.evm < 1e-9 ? 'perfect recovery' : `${(20 * Math.log10(sim.evm)).toFixed(1)} dB`),
      card('Symbol errors', `${sim.symErr} / ${sim.count}`, `SER = ${sim.ser.toExponential(1)}`, sim.symErr ? 'warn' : 'good'),
    ].join('');

    $('t2Equations').innerHTML = `
      <div class="eqs">
        <div><span class="f">y(t) = x(t) + a·e<sup>jφ</sup>·x(t − τ)  (+ noise)</span><span class="v">a = ${S.a.toFixed(2)}, φ = ${S.phiDeg}°, τ = ${Plot.fmtUs(tau)}</span></div>
        <div><span class="f">ISI-free if  T<sub>CP</sub> ≥ τ<sub>max</sub>  (delay spread)</span><span class="v">${Plot.fmtUs(Tcp)} ${ok ? '≥' : '<'} ${Plot.fmtUs(tau)} → ${ok ? 'no ISI' : 'ISI'}</span></div>
        <div><span class="f">H(f<sub>k</sub>) = 1 + a·e<sup>jφ</sup>·e<sup>−j2πf<sub>k</sub>τ</sup></span><span class="v">fades every 1/τ${S.D ? ' = ' + Plot.fmtHz(1 / tau) : ''}</span></div>
        <div><span class="f">Y<sub>k</sub> = H<sub>k</sub>·X<sub>k</sub> (exact only if T<sub>CP</sub> ≥ τ)  →  X̂<sub>k</sub> = Y<sub>k</sub> / H<sub>k</sub></span><span class="v">${S.eq ? 'ON' : 'OFF: each subcarrier stays scaled/rotated by H<sub>k</sub>'}</span></div>
        <div><span class="f">η<sub>CP</sub> = T<sub>FFT</sub> / (T<sub>FFT</sub> + T<sub>CP</sub>)</span><span class="v">= 3.2 / ${(us(N + S.L)).toFixed(2)} µs = ${(eff * 100).toFixed(1)} %</span></div>
        <div><span class="f">EVM = √( Σ|X̂<sub>k</sub> − X<sub>k</sub>|² / Σ|X<sub>k</sub>|² )</span><span class="v">= ${(sim.evm * 100).toFixed(2)} %</span></div>
      </div>`;
  }

  const start = () => { bind(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
  return { render };
})();

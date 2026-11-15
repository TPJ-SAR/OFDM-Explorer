// =====================================================================
// tab1.js — "Subcarriers & orthogonality"
// Reads the controls → computes with OFDM.* (ofdm-math.js) → draws with Plot.* (plot.js)
// =====================================================================
const Tab1 = (() => {
  const $ = id => document.getElementById(id);
  const DEFAULTS = { N: 8, tauUs: 3.2, mod: 'QPSK', eps: 0, showSum: true, i: 3, j: 4, win: 1 };
  const S = { ...DEFAULTS, symbols: [] };

  // Keep 16 random symbols so changing N doesn't reshuffle the existing subcarriers.
  let matrixGeom = null; // where the matrix was drawn (for click → cell)
  const newData = () => { S.symbols = OFDM.randomSymbols(16, S.mod); };

  // ---------- small formatting helpers ----------
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = n => String(n).split('').map(d => SUB[+d]).join('');
  function fmtHz(v) {
    if (v >= 1e9) return (v / 1e9).toPrecision(4).replace(/\.?0+$/, '') + ' GHz';
    if (v >= 1e6) return (v / 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' MHz';
    if (v >= 1e3) return (v / 1e3).toPrecision(4).replace(/\.?0+$/, '') + ' kHz';
    return v.toPrecision(4) + ' Hz';
  }
  const fmtRate = (v, u) => fmtHz(v).replace('Hz', u);
  const dB = x => (isFinite(x) ? (10 * Math.log10(x)).toFixed(1) + ' dB' : '∞ dB');
  const deg = X => {
    let d = (OFDM.phase(X) * 180) / Math.PI;
    if (d < 0) d += 360;
    return Math.round(d) + '°';
  };
  // Pick a frequency unit for an axis from its max value
  const freqUnit = fMax => (fMax >= 1e6 ? [1e6, 'MHz'] : fMax >= 1e3 ? [1e3, 'kHz'] : [1, 'Hz']);

  // ---------- wire up the controls ----------
  function bind() {
    const sync = () => {
      $('nSlider').value = S.N; $('nVal').textContent = S.N;
      $('tauSlider').value = S.tauUs; $('tauVal').textContent = S.tauUs.toFixed(1);
      $('modSel').value = S.mod;
      $('epsSlider').value = S.eps; $('epsVal').textContent = (S.eps >= 0 ? '+' : '') + S.eps.toFixed(2);
      $('showSum').checked = S.showSum;
      $('winSlider').value = S.win; $('winVal').textContent = S.win.toFixed(2);
      // subcarrier pickers only list 1..N
      S.i = Math.min(S.i, S.N); S.j = Math.min(S.j, S.N);
      for (const [id, key] of [['iSel', 'i'], ['jSel', 'j']]) {
        const sel = $(id);
        if (sel.options.length !== S.N) {
          sel.innerHTML = '';
          for (let k = 1; k <= S.N; k++) sel.add(new Option(`f${sub(k)} = ${k}Δf`, k));
        }
        sel.value = S[key];
      }
    };

    const on = (id, ev, fn) => $(id).addEventListener(ev, () => { fn($(id)); sync(); schedule(); });
    on('nSlider', 'input', el => (S.N = +el.value));
    on('tauSlider', 'input', el => (S.tauUs = +el.value));
    on('modSel', 'change', el => { S.mod = el.value; newData(); });
    on('reroll', 'click', () => newData());
    on('epsSlider', 'input', el => (S.eps = +el.value));
    on('showSum', 'change', el => (S.showSum = el.checked));
    on('iSel', 'change', el => (S.i = +el.value));
    on('jSel', 'change', el => (S.j = +el.value));
    on('winSlider', 'input', el => (S.win = +el.value));
    on('presetLecture', 'click', () => {
      // Handout p.11: four subcarriers, QPSK, phases 45°, 225°, 135°, 315°
      Object.assign(S, { N: 4, mod: 'QPSK', eps: 0, win: 1, i: 1, j: 2 });
      const q = OFDM.CONSTELLATIONS.QPSK.points; // [45°, 135°, 225°, 315°]
      S.symbols = [q[0], q[2], q[1], q[3], ...OFDM.randomSymbols(12, 'QPSK')];
    });
    on('presetReset', 'click', () => { Object.assign(S, DEFAULTS); newData(); });

    // Click a matrix cell → load it into the multiply & integrate test
    $('cvMatrix').addEventListener('click', e => {
      const g = matrixGeom;
      if (!g) return;
      const r = e.target.getBoundingClientRect();
      const col = Math.floor((e.clientX - r.left - g.x) / g.cell);
      const row = Math.floor((e.clientY - r.top - g.y) / g.cell);
      if (col >= 0 && row >= 0 && col < S.N && row < S.N) {
        S.i = row + 1; S.j = col + 1; sync(); schedule();
      }
    });

    window.addEventListener('resize', schedule);
    sync();
  }

  // Redraw at most once per animation frame (keeps sliders smooth)
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  }

  // =================================================================
  function render() {
    if (!$('t1').classList.contains('active')) return;
    const N = S.N;
    const tau = S.tauUs * 1e-6;        // s
    const df = 1 / tau;                // Hz   Δf = 1/τS
    const sym = S.symbols.slice(0, N);
    const cols = Plot.colors(N);
    const bits = OFDM.CONSTELLATIONS[S.mod].bits;

    const timeInfo = drawTime(N, tau, df, sym, cols);
    drawSum(N, tau, df, sym, timeInfo);
    drawSpectrum(N, tau, df, sym, cols);
    const corr = drawCorr(N, tau, df, cols);
    drawMatrix(N, tau, df);
    readouts(N, tau, df, bits, sym, timeInfo, corr);
  }

  // ---------- 1. stacked subcarriers ----------
  function drawTime(N, tau, df, sym, cols) {
    const lane = Math.max(30, Math.min(58, 460 / N));
    const c = Plot.setup($('cvTime'), 60 + N * lane);
    const F = Plot.frame(c, {
      xMin: 0, xMax: S.tauUs, yMin: 0, yMax: N, yTicks: false,
      xLabel: 'Time t (µs)', margin: { l: 82, r: 56 },
    });
    const { ctx, X, Y, A } = F;
    const Ns = 900;
    const ts = Array.from({ length: Ns }, (_, n) => (n / (Ns - 1)) * tau);
    const tUs = ts.map(t => t * 1e6);
    const maxA = Math.max(...OFDM.CONSTELLATIONS[S.mod].points.map(OFDM.mag));

    for (let k = 1; k <= N; k++) {
      const X_k = sym[k - 1];
      const yc = N - k + 0.5;                        // lane centre, k = 1 on top
      const f = OFDM.subcarrierFreq(k, df, S.eps);
      const ys = ts.map(t => yc + (0.42 * OFDM.subcarrierWave(X_k, f, t)) / maxA);
      ctx.strokeStyle = '#eef0f4';
      ctx.beginPath(); ctx.moveTo(A.x, Y(yc)); ctx.lineTo(A.x + A.w, Y(yc)); ctx.stroke();
      Plot.clip(ctx, A);
      Plot.line(ctx, X, Y, tUs, ys, cols[k - 1].stroke, 2);
      ctx.restore();
      // labels: frequency on the left, data phase on the right
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = cols[k - 1].stroke; ctx.textBaseline = 'middle';
      ctx.textAlign = 'right'; ctx.fillText(`f${sub(k)} = ${k}Δf`, A.x - 8, Y(yc));
      ctx.textAlign = 'left'; ctx.fillText(`∠${deg(X_k)}`, A.x + A.w + 8, Y(yc));
    }
    return { ts, tUs };
  }

  // ---------- 2. composite waveform with Vpk / Vrms ----------
  function drawSum(N, tau, df, sym, { ts, tUs }) {
    const ys = ts.map(t => OFDM.compositeWave(sym, df, S.eps, t));
    const p = OFDM.papr(ys);
    const lim = Math.max(1, p.vpk) * 1.15;
    const c = Plot.setup($('cvSum'), 240);
    const { ctx, X, Y, A } = Plot.frame(c, {
      xMin: 0, xMax: S.tauUs, yMin: -lim, yMax: lim,
      xLabel: 'Time t (µs)', yLabel: 'Amplitude (V, normalized)', margin: { l: 82, r: 56, t: 30 },
    });
    Plot.clip(ctx, A);
    Plot.area(ctx, X, Y, tUs, ys, 'rgba(79, 70, 229, 0.10)');
    for (const s of [1, -1]) {
      Plot.line(ctx, X, Y, [0, S.tauUs], [s * p.vpk, s * p.vpk], '#e11d48', 1.2, [6, 4]);
      Plot.line(ctx, X, Y, [0, S.tauUs], [s * p.vrms, s * p.vrms], '#0f766e', 1.2, [2, 3]);
    }
    Plot.line(ctx, X, Y, tUs, ys, '#3730a3', 2);
    ctx.restore();
    // legend above the plot area so it never collides with the dashed lines
    ctx.font = '600 12px system-ui'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillStyle = '#e11d48'; ctx.fillText(`– – ±Vpk = ${p.vpk.toFixed(2)} V`, A.x, A.y - 8);
    ctx.fillStyle = '#0f766e'; ctx.fillText(`··· ±Vrms = ${p.vrms.toFixed(2)} V`, A.x + 150, A.y - 8);
    ctx.fillStyle = '#26303c'; ctx.fillText(`PAPR = Vpk²/Vrms² = ${dB(p.papr)}`, A.x + 305, A.y - 8);
    drawSum.last = p;
  }

  // ---------- 3. the colourful sinc spectrum ----------
  function drawSpectrum(N, tau, df, sym, cols) {
    const fMax = (N + 1) * df;
    const [u, uName] = freqUnit(fMax);
    const Ns = Math.max(600, 70 * (N + 1));
    const fs = Array.from({ length: Ns }, (_, n) => (n / (Ns - 1)) * fMax);
    const fsU = fs.map(f => f / u);

    const comp = S.showSum ? fs.map(f => OFDM.compositeSpectrum(sym, f, df, S.eps, tau)) : null;
    const yMax = Math.max(1.15, comp ? Math.max(...comp) * 1.08 : 0);

    const c = Plot.setup($('cvSpec'), 340);
    const { ctx, X, Y, A } = Plot.frame(c, {
      xMin: 0, xMax: fMax / u, yMin: 0, yMax,
      xLabel: `Frequency f (${uName})`, yLabel: '|S(f)| (normalized)', margin: { r: 20, t: 26 },
    });
    Plot.clip(ctx, A);

    // dashed lines = receiver FFT sample points at k·Δf (no offset)
    for (let m = 1; m <= N; m++) Plot.line(ctx, X, Y, [(m * df) / u, (m * df) / u], [0, yMax], '#b7bdc8', 1, [4, 4]);

    // each subcarrier's sinc lobe, filled
    for (let k = 1; k <= N; k++) {
      const fk = OFDM.subcarrierFreq(k, df, S.eps);
      const ys = fs.map(f => OFDM.lobe(sym[k - 1], f, fk, tau));
      Plot.area(ctx, X, Y, fsU, ys, cols[k - 1].fill);
      Plot.line(ctx, X, Y, fsU, ys, cols[k - 1].stroke, 1.6);
    }
    if (comp) Plot.line(ctx, X, Y, fsU, comp, 'rgba(17, 24, 39, 0.85)', 2.2);

    // dots: what each lobe contributes at every FFT sample point
    for (let k = 1; k <= N; k++) {
      const fk = OFDM.subcarrierFreq(k, df, S.eps);
      for (let m = 1; m <= N; m++) {
        const v = OFDM.lobe(sym[k - 1], m * df, fk, tau);
        if (m !== k && v < 0.004) continue;
        ctx.beginPath();
        ctx.arc(X((m * df) / u), Y(v), m === k ? 5 : 4, 0, 2 * Math.PI);
        ctx.fillStyle = m === k ? cols[k - 1].solid : '#fff';
        ctx.strokeStyle = cols[k - 1].stroke; ctx.lineWidth = 2;
        ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();

    // f_k labels above each FFT point
    if (N <= 16) {
      ctx.font = `600 ${N > 10 ? 10 : 12}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (let k = 1; k <= N; k++) { ctx.fillStyle = cols[k - 1].stroke; ctx.fillText(`f${sub(k)}`, X((k * df) / u), A.y - 6); }
    }
  }

  // ---------- 4. multiply & integrate ----------
  function drawCorr(N, tau, df, cols) {
    const fi = OFDM.subcarrierFreq(S.i, df, S.eps); // received (carries the offset)
    const fj = S.j * df;                              // receiver's reference
    const T = S.win * tau;
    const r = OFDM.correlate(fi, fj, T, 1500, true);
    const tUs = Array.from(r.t, t => t * 1e6);

    const c = Plot.setup($('cvCorr'), 300);
    const { ctx, X, Y, A } = Plot.frame(c, {
      xMin: 0, xMax: T * 1e6, yMin: -1.15, yMax: 1.25,
      xLabel: 'Time t (µs)', yLabel: 'Product / running result',
    });
    Plot.clip(ctx, A);
    Plot.area(ctx, X, Y, tUs, Array.from(r.p), cols[S.i - 1].fill);
    Plot.line(ctx, X, Y, tUs, Array.from(r.p), cols[S.i - 1].stroke, 1);
    if (Math.abs(S.win - 1) > 1e-6) {
      Plot.line(ctx, X, Y, [S.tauUs, S.tauUs], [-1.15, 1.25], '#64748b', 1.2, [5, 4]);
      ctx.fillStyle = '#64748b'; ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('τS', X(S.tauUs) + 4, A.y + 4);
    }
    Plot.line(ctx, X, Y, tUs, Array.from(r.run), '#111827', 2.4);
    ctx.restore();

    const zero = Math.abs(r.value) < 0.01;
    $('corrTitle').innerHTML = `f<sub>${S.i}</sub> × f<sub>${S.j}</sub> = <b class="${zero ? 'ok' : 'bad'}">${r.value.toFixed(3)}</b>`;
    $('corrVerdict').innerHTML =
      S.i === S.j && !zero
        ? 'Same frequency → <b>non-zero</b>: the receiver recovers this subcarrier.'
        : zero
          ? 'Different frequencies → <b class="ok">zero</b>: orthogonal, no interference.'
          : '<b class="bad">Not zero</b>: orthogonality is lost (offset or partial window), so energy leaks between subcarriers.';
    return r;
  }

  // ---------- 5. orthogonality matrix ----------
  function drawMatrix(N, tau, df) {
    const canvas = $('cvMatrix');
    const c = Plot.setup(canvas, Math.min(canvas.clientWidth, 360));
    const ctx = c.ctx;
    const pad = { l: 46, t: 34 };
    const size = Math.min(c.w - pad.l - 10, c.h - pad.t - 10);
    const cell = size / N;
    const x0 = pad.l + (c.w - pad.l - 10 - size) / 2, y0 = pad.t;
    matrixGeom = { x: x0, y: y0, cell };
    const T = S.win * tau;

    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        const v = OFDM.correlate(OFDM.subcarrierFreq(i, df, S.eps), j * df, T, 700).value;
        const a = Math.min(1, Math.abs(v));
        // white (0) → deep indigo (1)
        ctx.fillStyle = `hsl(235, 70%, ${(97 - a * 62).toFixed(0)}%)`;
        ctx.fillRect(x0 + (j - 1) * cell, y0 + (i - 1) * cell, cell - 1, cell - 1);
        if (N <= 10) {
          ctx.fillStyle = a > 0.5 ? '#fff' : '#334155';
          ctx.font = `${Math.max(9, Math.min(13, cell / 3.4))}px system-ui`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(v.toFixed(2).replace('-0.00', '0.00'), x0 + (j - 0.5) * cell, y0 + (i - 0.5) * cell);
        }
      }
    }
    // highlight the cell used in the multiply & integrate test
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3;
    ctx.strokeRect(x0 + (S.j - 1) * cell, y0 + (S.i - 1) * cell, cell - 1, cell - 1);

    // axis labels
    ctx.fillStyle = '#26303c'; ctx.font = '600 11px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('reference j (f = jΔf)', x0 + size / 2, y0 - 16);
    ctx.font = '10px system-ui'; ctx.fillStyle = '#5b6573';
    for (let k = 1; k <= N; k++) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(k, x0 + (k - 0.5) * cell, y0 - 3);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(k, x0 - 4, y0 + (k - 0.5) * cell);
    }
    ctx.save(); ctx.translate(14, y0 + size / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#26303c'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('received i', 0, 0); ctx.restore();
  }

  // ---------- readouts + live equations ----------
  function readouts(N, tau, df, bits, sym, timeInfo, corr) {
    const Rb = OFDM.bitRate(N, bits, tau);
    const bwO = OFDM.bwOFDM(N, df), bwF = OFDM.bwFDM(N, df);
    const etaO = Rb / bwO, etaF = Rb / bwF;
    const p = drawSum.last;
    const pmax = OFDM.paprMax(sym);
    const sir = OFDM.iciSIR(N, S.eps);

    const card = (label, value, note, cls = '') =>
      `<div class="ro ${cls}"><div class="ro-l">${label}</div><div class="ro-v">${value}</div><div class="ro-n">${note}</div></div>`;
    $('readouts').innerHTML = [
      card('Subcarrier spacing Δf', fmtHz(df), `= 1/τ<sub>S</sub> = R<sub>S</sub> (${fmtRate(df, 'Bd')})`),
      card('Bit rate R<sub>b</sub>', fmtRate(Rb, 'bit/s'), `${N} × ${bits} bit / ${S.tauUs.toFixed(1)} µs`),
      card('Bandwidth (null-to-null)', fmtHz(bwO), `FDM, no guard bands: ${fmtHz(bwF)}`),
      card('Spectral efficiency η', `${etaO.toFixed(2)} bit/s/Hz`, `FDM: ${etaF.toFixed(2)} bit/s/Hz`, 'accent'),
      card('PAPR (this symbol)', dB(p.papr), `worst case for N = ${N}: ${dB(pmax)}`),
      card('Signal-to-ICI', dB(sir), Math.abs(S.eps) < 1e-9 ? 'ε = 0 → perfectly orthogonal' : `ε = ${S.eps.toFixed(2)}Δf → leakage`, Math.abs(S.eps) < 1e-9 ? 'good' : 'warn'),
    ].join('');

    $('equations').innerHTML = `
      <div class="eqs">
        <div><span class="f">Δf = 1 / τ<sub>S</sub> = R<sub>S</sub></span><span class="v">= 1 / ${S.tauUs.toFixed(1)} µs = ${fmtHz(df)}</span></div>
        <div><span class="f">f<sub>k</sub> = k · Δf,  k = 1 … N</span><span class="v">f<sub>1</sub> = ${fmtHz(df)} … f<sub>${N}</sub> = ${fmtHz(N * df)}</span></div>
        <div><span class="f">x(t) = Σ X<sub>k</sub> · e<sup>j2πf<sub>k</sub>t</sup>,  0 ≤ t &lt; τ<sub>S</sub></span><span class="v">IFFT of the ${N} data symbols (${S.mod})</span></div>
        <div><span class="f">(2/T) ∫<sub>0</sub><sup>T</sup> cos(2πf<sub>i</sub>t)·cos(2πf<sub>j</sub>t) dt = { 1 if i = j, 0 if i ≠ j }</span><span class="v">needs T = τ<sub>S</sub> (now ${S.win.toFixed(2)}τ<sub>S</sub>) → ${corr.value.toFixed(3)}</span></div>
        <div><span class="f">|S<sub>k</sub>(f)| = |X<sub>k</sub>| · |sinc((f − f<sub>k</sub>)τ<sub>S</sub>)|,  sinc(x) = sin(πx)/(πx)</span><span class="v">nulls every Δf = ${fmtHz(df)}</span></div>
        <div><span class="f">R<sub>b</sub> = N · log<sub>2</sub>M / τ<sub>S</sub></span><span class="v">= ${N} · ${bits} / ${S.tauUs.toFixed(1)} µs = ${fmtRate(Rb, 'bit/s')}</span></div>
        <div><span class="f">BW<sub>OFDM</sub> = (N + 1)Δf,  BW<sub>FDM</sub> = 2NΔf,  η = R<sub>b</sub> / BW</span><span class="v">η = ${etaO.toFixed(2)} vs ${etaF.toFixed(2)} bit/s/Hz</span></div>
        <div><span class="f">PAPR = V<sub>pk</sub><sup>2</sup> / V<sub>rms</sub><sup>2</sup></span><span class="v">= ${p.vpk.toFixed(2)}² / ${p.vrms.toFixed(2)}² = ${dB(p.papr)}</span></div>
        <div><span class="f">SIR<sub>ICI</sub> = sinc²(ε) / Σ<sub>k≠m</sub> sinc²(k − m + ε)</span><span class="v">= ${dB(sir)}</span></div>
      </div>`;
  }

  // ---------- start ----------
  newData();
  const start = () => { bind(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);

  return { render };
})();

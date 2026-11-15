// =====================================================================
// tab3.js — "Wi-Fi 802.11a preset"
// Real 802.11a parameters (VSA OFDM tutorial): 64-point FFT, 52 used
// subcarriers (48 data + 4 pilots at ±7, ±21), DC null, 0.8 µs GI.
// =====================================================================
const Tab3 = (() => {
  const $ = id => document.getElementById(id);
  const DEFAULTS = { bw: 20e6, shortGI: false, mode: 7, bytes: 1500 };
  const S = { ...DEFAULTS };
  const ks = Array.from({ length: 64 }, (_, i) => i - 32);             // −32 … 31
  const dataKs = ks.filter(k => OFDM.wifiRole(k) === 'data');
  const dataCols = Plot.colors(dataKs.length);
  const PILOT = '#111827', DCOL = '#dc2626';
  let mapGeom = null;

  const rateStr = r => String(+(r / 1e6).toFixed(2)) + ' Mbit/s';
  const modeName = m => `${m.mod} ${m.R[0]}/${m.R[1]}`;

  // ---------- controls ----------
  function bind() {
    const sync = () => {
      $('t3Bw').value = String(S.bw);
      $('t3GiLong').checked = !S.shortGI; $('t3GiShort').checked = S.shortGI;
      $('t3Bytes').value = S.bytes; $('t3BytesVal').textContent = `${S.bytes} bytes`;
      $('t3Mode').value = S.mode;
    };
    const on = (id, ev, fn) => $(id).addEventListener(ev, () => { fn($(id)); sync(); schedule(); });
    on('t3Bw', 'change', el => (S.bw = +el.value));
    on('t3GiLong', 'change', () => (S.shortGI = false));
    on('t3GiShort', 'change', () => (S.shortGI = true));
    on('t3Bytes', 'input', el => (S.bytes = +el.value));
    on('t3Mode', 'change', el => (S.mode = +el.value));
    on('t3Reset', 'click', () => Object.assign(S, DEFAULTS));
    // mode select options
    OFDM.WIFI_MODES.forEach((m, i) => $('t3Mode').add(new Option(modeName(m), i)));
    // click a table row to choose that mode
    $('t3Table').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-i]');
      if (tr) { S.mode = +tr.dataset.i; sync(); schedule(); }
    });
    // hover tooltip on the subcarrier map
    $('t3Map').addEventListener('mousemove', showTip);
    $('t3Map').addEventListener('mouseleave', () => ($('t3Tip').style.display = 'none'));
    window.addEventListener('resize', schedule);
    sync();
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  }

  function render() {
    if (!$('t3').classList.contains('active')) return;
    const T = OFDM.wifiTiming(S.bw, S.shortGI);
    const mode = OFDM.WIFI_MODES[S.mode];
    const R = OFDM.wifiRate(mode, T);
    const F = OFDM.wifiFrame(S.bytes, mode, T);
    drawMap(T);
    table(T);
    drawConst(mode);
    drawFrame(T, F);
    readouts(T, mode, R, F);
  }

  // ---------- 1. the 64-bin subcarrier map ----------
  function drawMap(T) {
    const c = Plot.setup($('t3Map'), 330);
    const { ctx, X, Y, A } = Plot.frame(c, {
      xMin: -32.5, xMax: 31.5, yMin: 0, yMax: 1.68, yTicks: false, xTickCount: 16,
      xLabel: `Subcarrier index k  (frequency offset = k · Δf = k · ${Plot.fmtHz(T.df)})`, margin: { l: 22, r: 16, t: 14 },
    });
    mapGeom = { X, A };
    Plot.clip(ctx, A);
    // sinc lobes behind the stems (like the VSA spectrum figure)
    const xs = [];
    for (let i = 0; i <= 1600; i++) xs.push(-32.5 + (64 * i) / 1600);
    for (const k of ks) {
      const role = OFDM.wifiRole(k);
      if (role !== 'data' && role !== 'pilot') continue;
      const col = role === 'pilot' ? { fill: 'rgba(17,24,39,0.10)', stroke: 'rgba(17,24,39,0.5)' } : dataCols[dataKs.indexOf(k)];
      const ys = xs.map(x => Math.abs(OFDM.sinc(x - k)));
      Plot.area(ctx, X, Y, xs, ys, col.fill);
      Plot.line(ctx, X, Y, xs, ys, col.stroke, 0.8);
    }
    // stems
    for (const k of ks) {
      const role = OFDM.wifiRole(k), x = X(k);
      if (role === 'data') {
        const col = dataCols[dataKs.indexOf(k)];
        ctx.strokeStyle = col.stroke; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, Y(0)); ctx.lineTo(x, Y(1)); ctx.stroke();
        ctx.fillStyle = col.solid; ctx.beginPath(); ctx.arc(x, Y(1), 3.5, 0, 2 * Math.PI); ctx.fill();
      } else if (role === 'pilot') {
        ctx.strokeStyle = PILOT; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, Y(0)); ctx.lineTo(x, Y(1.12)); ctx.stroke();
        ctx.fillStyle = '#facc15'; ctx.beginPath();
        ctx.moveTo(x, Y(1.12) - 7); ctx.lineTo(x + 6, Y(1.12)); ctx.lineTo(x, Y(1.12) + 7); ctx.lineTo(x - 6, Y(1.12)); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = PILOT; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(`P ${k > 0 ? '+' : ''}${k}`, x, Y(1.12) - 9);
      } else {
        const col = role === 'dc' ? DCOL : '#9ca3af', y = Y(0.05);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
      }
    }
    ctx.fillStyle = DCOL; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('DC null', X(0), Y(0.12));
    ctx.fillStyle = '#6b7280'; ctx.font = '11px system-ui';
    ctx.fillText('guard', X(-29.5), Y(0.12)); ctx.fillText('guard', X(29), Y(0.12));

    // bandwidth brackets
    const bracket = (x0, x1, y, label, col) => {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(x0), Y(y) + 5); ctx.lineTo(X(x0), Y(y)); ctx.lineTo(X(x1), Y(y)); ctx.lineTo(X(x1), Y(y) + 5); ctx.stroke();
      ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, X((x0 + x1) / 2), Y(y) - 3);
    };
    bracket(-26.5, 26.5, 1.36, `occupied: 53 × Δf = ${Plot.fmtHz(53 * T.df)}`, '#4f46e5');
    bracket(-32, 32, 1.56, `channel: 64 × Δf = ${Plot.fmtHz(64 * T.df)}`, '#334155');
    ctx.restore();
  }

  function showTip(e) {
    if (!mapGeom) return;
    const r = e.target.getBoundingClientRect();
    const px = e.clientX - r.left, { X, A } = mapGeom;
    if (px < A.x || px > A.x + A.w) return ($('t3Tip').style.display = 'none');
    // nearest subcarrier index
    let k = Math.round(-32.5 + ((px - A.x) / A.w) * 64);
    k = Math.max(-32, Math.min(31, k));
    const T = OFDM.wifiTiming(S.bw, S.shortGI);
    const role = { data: 'Data subcarrier', pilot: 'Pilot (BPSK, known value)', dc: 'DC / null (unused)', guard: 'Guard band (unused)' }[OFDM.wifiRole(k)];
    const tip = $('t3Tip');
    tip.innerHTML = `<b>k = ${k}</b><br>${role}<br>f = ${Plot.fmtHz(k * T.df)} from centre<br>FFT bin ${OFDM.bin(k, 64)}`;
    tip.style.display = 'block';
    tip.style.left = Math.min(X(k) + 12, r.width - 190) + 'px';
    tip.style.top = e.clientY - r.top + e.target.offsetTop - 20 + 'px';
  }

  // ---------- 2. rate table ----------
  function table(T) {
    const rows = OFDM.WIFI_MODES.map((m, i) => {
      const R = OFDM.wifiRate(m, T);
      return `<tr data-i="${i}" class="${i === S.mode ? 'sel' : ''}">
        <td>${m.mod}</td><td>${m.R[0]}/${m.R[1]}</td><td>${R.nbpsc}</td><td>${R.ndbps}</td><td><b>${rateStr(R.rate)}</b></td></tr>`;
    }).join('');
    $('t3Table').innerHTML = `<table class="rates">
      <thead><tr><th>Modulation</th><th>Code rate R</th><th>N<sub>BPSC</sub> (bits/subcarrier)</th><th>N<sub>DBPS</sub> (data bits/symbol)</th><th>Data rate</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  // ---------- 3. constellation of the chosen mode ----------
  function drawConst(mode) {
    const canvas = $('t3Const');
    const c = Plot.setup(canvas, Math.min(canvas.clientWidth, 270));
    const { ctx, X, Y } = Plot.frame(c, {
      xMin: -1.35, xMax: 1.35, yMin: -1.35, yMax: 1.35, xTickCount: 4, yTickCount: 4,
      xLabel: 'I (normalized)', yLabel: 'Q (normalized)', margin: { l: 50, r: 10, t: 10, b: 40 },
    });
    const pts = OFDM.CONSTELLATIONS[mode.mod].points;
    const cols = Plot.colors(pts.length);
    pts.forEach((p, i) => {
      ctx.fillStyle = cols[i].solid; ctx.strokeStyle = cols[i].stroke; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X(p.re), Y(p.im), pts.length > 16 ? 4 : 6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    });
    $('t3ConstTitle').textContent = `${mode.mod}: ${pts.length} points = ${OFDM.CONSTELLATIONS[mode.mod].bits} bits per subcarrier`;
  }

  // ---------- 4. burst / frame timeline ----------
  function drawFrame(T, F) {
    const c = Plot.setup($('t3Frame'), 190);
    const Tus = F.T * 1e6;
    const { ctx, X, Y, A } = Plot.frame(c, {
      xMin: 0, xMax: Tus, yMin: 0, yMax: 1, yTicks: false,
      xLabel: 'Time (µs) from start of burst', margin: { l: 16, r: 16, t: 34 },
    });
    const block = (t0, t1, col, label) => {
      ctx.fillStyle = col;
      ctx.fillRect(X(t0), Y(0.85), Math.max(1, X(t1) - X(t0)), Y(0.15) - Y(0.85));
      if (label && X(t1) - X(t0) > 30) {
        ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, (X(t0) + X(t1)) / 2, Y(0.5));
      }
    };
    const us = s => s * 1e6;
    let t = 0;
    block(t, us(T.Tshort), '#d97706', 'STF');
    for (let i = 1; i < 10; i++) {                                // the 10 short training symbols
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.moveTo(X((us(T.Tshort) * i) / 10), Y(0.85)); ctx.lineTo(X((us(T.Tshort) * i) / 10), Y(0.72)); ctx.stroke();
    }
    t = us(T.Tshort);
    block(t, t + us(T.Tlong), '#ea580c', 'LTF'); t += us(T.Tlong);
    block(t, t + us(T.Tsignal), '#0f766e', 'SIG'); t += us(T.Tsignal);
    const dataStart = t;
    const cols = Plot.colors(Math.min(F.nSym, 12));
    for (let s = 0; s < F.nSym; s++) {
      const col = cols[s % cols.length];
      block(t, t + us(T.Tgi), col.stroke);                         // GI (cyclic prefix), darker
      block(t + us(T.Tgi), t + us(T.Tsym), col.solid);
      t += us(T.Tsym);
    }
    // section labels
    const lab = (t0, t1, text, col) => {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(t0) + 1, A.y - 4); ctx.lineTo(X(t0) + 1, A.y - 10); ctx.lineTo(X(t1) - 1, A.y - 10); ctx.lineTo(X(t1) - 1, A.y - 4); ctx.stroke();
      ctx.font = '600 11px system-ui'; ctx.textAlign = t0 === 0 ? 'left' : 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(text, t0 === 0 ? X(t0) : (X(t0) + X(t1)) / 2, A.y - 13);
    };
    lab(0, us(F.Tpre), `Preamble ${Plot.fmtUs(F.Tpre)}`, '#c2410c');
    lab(dataStart, t, `DATA: ${F.nSym} OFDM symbols × ${Plot.fmtUs(T.Tsym)} (dark slice = GI)`, '#4338ca');
  }

  // ---------- readouts + equations ----------
  function readouts(T, mode, R, F) {
    const card = (label, value, note, cls = '') =>
      `<div class="ro ${cls}"><div class="ro-l">${label}</div><div class="ro-v">${value}</div><div class="ro-n">${note}</div></div>`;
    $('t3Readouts').innerHTML = [
      card('Subcarrier spacing Δf', Plot.fmtHz(T.df), `${Plot.fmtHz(S.bw)} / 64`),
      card('Symbol time T<sub>SYM</sub>', Plot.fmtUs(T.Tsym), `${Plot.fmtUs(T.Tfft)} FFT + ${Plot.fmtUs(T.Tgi)} GI`),
      card('PHY data rate', rateStr(R.rate), `${modeName(mode)}: ${R.ndbps} bits / ${Plot.fmtUs(T.Tsym)}`, 'accent'),
      card('Max delay spread', Plot.fmtUs(T.Tgi), `≈ ${Math.round(T.Tgi * 3e8)} m extra path length`, 'good'),
      card('Spectral efficiency η', `${(R.rate / S.bw).toFixed(2)} bit/s/Hz`, `over the ${Plot.fmtHz(S.bw)} channel`),
      card('Effective throughput', rateStr(F.throughput), `${S.bytes} B in ${Plot.fmtUs(F.T)} (PHY overhead only)`, 'warn'),
    ].join('');

    const Tgi = T.Tgi * 1e6, Tfft = T.Tfft * 1e6;
    $('t3Equations').innerHTML = `
      <div class="eqs">
        <div><span class="f">Δf = f<sub>s</sub> / N<sub>FFT</sub></span><span class="v">= ${Plot.fmtHz(S.bw)} / 64 = ${Plot.fmtHz(T.df)}</span></div>
        <div><span class="f">T<sub>FFT</sub> = 1 / Δf,   T<sub>GI</sub> = T<sub>FFT</sub> / ${S.shortGI ? 8 : 4}</span><span class="v">= ${+Tfft.toFixed(3)} µs,  ${+Tgi.toFixed(3)} µs</span></div>
        <div><span class="f">T<sub>SYM</sub> = T<sub>FFT</sub> + T<sub>GI</sub></span><span class="v">= ${+(Tfft + Tgi).toFixed(3)} µs</span></div>
        <div><span class="f">N<sub>DBPS</sub> = N<sub>SD</sub> · N<sub>BPSC</sub> · R</span><span class="v">= 48 · ${R.nbpsc} · ${mode.R[0]}/${mode.R[1]} = ${R.ndbps} bits</span></div>
        <div><span class="f">R<sub>b</sub> = N<sub>DBPS</sub> / T<sub>SYM</sub></span><span class="v">= ${R.ndbps} / ${+(Tfft + Tgi).toFixed(3)} µs = ${rateStr(R.rate)}</span></div>
        <div><span class="f">N<sub>SYM</sub> = ⌈(16 + 8·L<sub>bytes</sub> + 6) / N<sub>DBPS</sub>⌉</span><span class="v">= ⌈${16 + 8 * S.bytes + 6} / ${R.ndbps}⌉ = ${F.nSym}</span></div>
        <div><span class="f">T<sub>burst</sub> = T<sub>preamble</sub> + T<sub>SIGNAL</sub> + N<sub>SYM</sub>·T<sub>SYM</sub></span><span class="v">= ${Plot.fmtUs(F.Tpre)} + ${Plot.fmtUs(T.Tsignal)} + ${F.nSym}·${Plot.fmtUs(T.Tsym)} = ${Plot.fmtUs(F.T)}</span></div>
      </div>`;
  }

  const start = () => { bind(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
  return { render };
})();

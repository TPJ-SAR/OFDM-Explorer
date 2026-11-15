// =====================================================================
// plot.js — a tiny canvas plotting helper (no libraries).
// It only draws axes, ticks, grid and labels and gives back two
// functions X(value) and Y(value) that convert data → pixel positions.
// =====================================================================
const Plot = (() => {
  // Size the canvas for sharp lines on high-DPI screens and clear it.
  function setup(canvas, cssHeight) {
    if (cssHeight) canvas.style.height = cssHeight + 'px';
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  // "Nice" tick spacing: 1, 2 or 5 × 10^n
  function niceStep(range, target) {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  function ticks(min, max, target = 6) {
    const st = niceStep(max - min, target), out = [];
    for (let v = Math.ceil(min / st - 1e-9) * st; v <= max + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
    return out;
  }

  const fmtNum = v => String(+v.toPrecision(4));

  // Draw a framed plot area. Options:
  //   xMin,xMax,yMin,yMax, xLabel, yLabel, margin{l,r,t,b}, yTicks(false to hide)
  function frame(c, o) {
    const m = Object.assign({ l: 60, r: 16, t: 14, b: 44 }, o.margin || {});
    const A = { x: m.l, y: m.t, w: c.w - m.l - m.r, h: c.h - m.t - m.b };
    const X = v => A.x + ((v - o.xMin) / (o.xMax - o.xMin)) * A.w;
    const Y = v => A.y + A.h - ((v - o.yMin) / (o.yMax - o.yMin)) * A.h;
    const ctx = c.ctx;
    ctx.save();
    ctx.font = '12px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.lineWidth = 1;

    // x grid + tick labels
    for (const v of ticks(o.xMin, o.xMax, o.xTickCount || 8)) {
      const px = X(v);
      ctx.strokeStyle = '#eceef3';
      ctx.beginPath(); ctx.moveTo(px, A.y); ctx.lineTo(px, A.y + A.h); ctx.stroke();
      ctx.fillStyle = '#5b6573'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText((o.xFmt || fmtNum)(v), px, A.y + A.h + 6);
    }
    // y grid + tick labels
    if (o.yTicks !== false) {
      for (const v of ticks(o.yMin, o.yMax, o.yTickCount || 5)) {
        const py = Y(v);
        ctx.strokeStyle = v === 0 ? '#c9ced8' : '#eceef3';
        ctx.beginPath(); ctx.moveTo(A.x, py); ctx.lineTo(A.x + A.w, py); ctx.stroke();
        ctx.fillStyle = '#5b6573'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText((o.yFmt || fmtNum)(v), A.x - 6, py);
      }
    }
    ctx.strokeStyle = '#a3abb8';
    ctx.strokeRect(A.x + 0.5, A.y + 0.5, A.w, A.h);

    // axis titles (always with units)
    ctx.fillStyle = '#26303c';
    ctx.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (o.xLabel) ctx.fillText(o.xLabel, A.x + A.w / 2, c.h - 4);
    if (o.yLabel) {
      ctx.save(); ctx.translate(14, A.y + A.h / 2); ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle'; ctx.fillText(o.yLabel, 0, 0); ctx.restore();
    }
    ctx.restore();
    return { ctx, X, Y, A };
  }

  // Polyline through (xs[i], ys[i])
  function line(ctx, X, Y, xs, ys, stroke, width = 1.5, dash = null) {
    ctx.save();
    ctx.strokeStyle = stroke; ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) i ? ctx.lineTo(X(xs[i]), Y(ys[i])) : ctx.moveTo(X(xs[i]), Y(ys[i]));
    ctx.stroke();
    ctx.restore();
  }

  // Fill the area between a curve and y = base
  function area(ctx, X, Y, xs, ys, fill, base = 0) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(X(xs[0]), Y(base));
    for (let i = 0; i < xs.length; i++) ctx.lineTo(X(xs[i]), Y(ys[i]));
    ctx.lineTo(X(xs[xs.length - 1]), Y(base));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Clip drawing to the plot area so curves never spill over the axes
  function clip(ctx, A) {
    ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
  }

  // Rainbow palette (red → orange → yellow → green → blue → violet),
  // like the VSA "OFDM Signal Frequency Spectra" figure.
  function colors(N) {
    return Array.from({ length: N }, (_, i) => {
      const h = N === 1 ? 210 : (285 * i) / (N - 1);
      // yellows/greens need a darker stroke to stay readable on white
      const L = h > 40 && h < 170 ? 38 : 47;
      return {
        stroke: `hsl(${h.toFixed(0)}, 88%, ${L}%)`,
        fill: `hsla(${h.toFixed(0)}, 92%, 56%, 0.30)`,
        solid: `hsl(${h.toFixed(0)}, 92%, 54%)`,
      };
    });
  }

  // ---------- shared number formatting (tabs 2 & 3) ----------
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const sub = n => (n < 0 ? '₋' : '') + String(Math.abs(n)).split('').map(d => SUB[+d]).join('');
  function fmtHz(v, unit = 'Hz') {
    const a = Math.abs(v);
    const [s, p] = a >= 1e9 ? [1e9, 'G'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'k'] : [1, ''];
    return String(+(v / s).toPrecision(4)) + ' ' + p + unit;
  }
  const fmtUs = t => String(+(t * 1e6).toPrecision(4)) + ' µs';
  const dB = x => (isFinite(x) ? (10 * Math.log10(x)).toFixed(1) + ' dB' : '∞ dB');

  return { setup, frame, ticks, line, area, clip, colors, fmtNum, sub, fmtHz, fmtUs, dB };
})();

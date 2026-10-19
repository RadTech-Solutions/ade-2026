// Draws a saved ADE plan as one A4 page in the RadTech dark style (navy page, cream ink, teal and amber glows),
// and wraps it in a single-page PDF without any library.
const W = 2480, H = 3508, M = 170;                 // A4 at 300 dpi
const C = { paper: '#0B1322', ink: '#ECE7DA', dim: 'rgba(236,231,218,.72)', faint: 'rgba(236,231,218,.48)', line: 'rgba(236,231,218,.14)',
  teal: '#5FDDCF', tealDeep: '#5FDDCF', amber: '#E6A85C', navy: '#0E1A2B', cream: '#ECE7DA', mint: '#5FDDCF', gold: '#E6A85C', onTeal: '#07131F' };
const F = { display: '"Space Grotesk", "Archivo", system-ui, sans-serif', serif: '"Instrument Serif", Georgia, serif',
  body: '"IBM Plex Sans", "Archivo", system-ui, sans-serif', mono: '"JetBrains Mono", ui-monospace, monospace' };
const DAYL = ['Wednesday 21 October', 'Thursday 22 October', 'Friday 23 October', 'Saturday 24 October', 'Sunday 25 October'];
const DAYS = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon'];
const hm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

async function fonts() {
  const want = [`500 60px ${F.display}`, `600 60px ${F.display}`, `italic 400 60px ${F.serif}`, `400 40px ${F.body}`, `500 40px ${F.body}`, `400 30px ${F.mono}`, `500 30px ${F.mono}`];
  try { await Promise.all(want.map(f => document.fonts.load(f))); } catch {}
}

function logo(ctx, x, y, s) {
  ctx.fillStyle = C.navy; round(ctx, x, y, s, s, s * 0.17); ctx.fill();
  ctx.strokeStyle = 'rgba(236,231,218,.18)'; ctx.lineWidth = Math.max(2, s * 0.02); ctx.stroke();
  const cell = s * 0.2, gap = s * 0.06, o = s * 0.14;
  const col = [C.mint, 'rgba(236,231,218,.45)', C.gold, 'rgba(236,231,218,.45)', C.mint, 'rgba(236,231,218,.45)', C.gold, 'rgba(236,231,218,.45)', C.mint];
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = col[i];
    round(ctx, x + o + (i % 3) * (cell + gap), y + o + Math.floor(i / 3) * (cell + gap), cell, cell, cell * 0.2); ctx.fill();
  }
}
function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function wrap(ctx, text, width) {
  const words = String(text).split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= width || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Lay the plan out at scale s in one or two columns; returns the draw list and whether it fits.
function layout(ctx, days, s, cols, top, bottom) {
  const gap = 90, colW = (W - 2 * M - (cols - 1) * gap) / cols, timeW = 250 * s;
  const ops = [];
  let col = 0, y = top;
  const fits = h => y + h <= bottom;
  const next = () => { if (col + 1 >= cols) return false; col++; y = top; return true; };
  const X = () => M + col * (colW + gap);
  for (const [d, items] of days) {
    const headH = 110 * s;
    if (!fits(headH + 150 * s) && !next()) return { ops, ok: false };
    ops.push({ t: 'day', x: X(), y, w: colW, d, n: items.length, s });
    y += headH;
    for (const it of items) {
      ctx.font = `500 ${46 * s}px ${F.body}`;
      const tl = wrap(ctx, it.title, colW - timeW).slice(0, 3);
      ctx.font = `400 ${33 * s}px ${F.body}`;
      const vl = wrap(ctx, [it.venue, it.address, it.district].filter(Boolean).join(' · '), colW - timeW).slice(0, 2);
      const h = (tl.length * 58 + vl.length * 44 + (it.free || it.clash ? 56 : 0) + 46) * s;
      if (!fits(h) && !next()) return { ops, ok: false };
      if (y !== top || col === 0) {}
      ops.push({ t: 'item', x: X(), y, w: colW, timeW, it, tl, vl, s });
      y += h;
    }
    y += 40 * s;
  }
  return { ops, ok: true };
}

export async function renderPlan(items, meta) {
  await fonts();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(11,19,34,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  glow(W * 0.92, H * 0.04, 1500, 'rgba(95,221,207,.20)');
  glow(W * 0.02, H * 0.62, 1400, 'rgba(230,168,92,.12)');
  glow(W * 0.85, H * 0.98, 1100, 'rgba(95,221,207,.10)');
  ctx.fillStyle = 'rgba(236,231,218,.045)';
  for (let y = 60; y < H; y += 72) for (let x = 60; x < W; x += 72) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.textBaseline = 'top';

  // Header: logo, kicker, title with the serif accent word, summary.
  logo(ctx, M, M, 120);
  ctx.fillStyle = C.dim; ctx.font = `400 32px ${F.mono}`;
  ctx.fillText('RADTECH  ·  ADE 2026  ·  21 TO 25 OCTOBER', M + 160, M + 20);
  ctx.fillStyle = C.faint; ctx.fillText('UNOFFICIAL FAN PLAN', M + 160, M + 68);
  ctx.fillStyle = C.ink; ctx.font = `500 170px ${F.display}`;
  const t1 = meta.name ? `${meta.name}'s ADE ` : 'My ADE ';
  ctx.fillText(t1, M, M + 220);
  const w1 = ctx.measureText(t1).width;
  ctx.fillStyle = C.amber; ctx.font = `italic 400 196px ${F.serif}`;
  ctx.fillText('plan', M + w1, M + 200);
  const free = items.filter(i => i.free === 'FREE').length, dset = [...new Set(items.map(i => i.day))];
  ctx.fillStyle = C.dim; ctx.font = `400 46px ${F.body}`;
  ctx.fillText(`${items.length} event${items.length === 1 ? '' : 's'}  ·  ${free} free  ·  ${dset.map(d => DAYS[d]).join(', ')}`, M, M + 430);
  const rule = ctx.createLinearGradient(M, 0, W - M, 0);
  rule.addColorStop(0, C.teal); rule.addColorStop(0.5, 'rgba(236,231,218,.5)'); rule.addColorStop(1, C.amber);
  ctx.fillStyle = rule; ctx.fillRect(M, M + 520, W - 2 * M, 4);

  // Body: try one column, then two, then shrink.
  const byDay = new Map();
  for (const it of items) { if (!byDay.has(it.day)) byDay.set(it.day, []); byDay.get(it.day).push(it); }
  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const top = M + 590, bottom = H - 330;
  let L = null;
  for (const [cols, s] of [[1, 1], [2, 1], [2, 0.88], [2, 0.76], [2, 0.66], [2, 0.58]]) { L = layout(ctx, days, s, cols, top, bottom); if (L.ok) break; }
  for (const op of L.ops) {
    const s = op.s;
    if (op.t === 'day') {
      ctx.fillStyle = C.ink; ctx.font = `600 ${64 * s}px ${F.display}`;
      ctx.fillText(DAYL[op.d], op.x, op.y);
      ctx.fillStyle = C.faint; ctx.font = `400 ${30 * s}px ${F.mono}`;
      const n = `${op.n} EVENT${op.n === 1 ? '' : 'S'}`;
      ctx.fillText(n, op.x + op.w - ctx.measureText(n).width, op.y + 22 * s);
      ctx.fillStyle = C.line; ctx.fillRect(op.x, op.y + 88 * s, op.w, 3);
      continue;
    }
    const { it, x, y, timeW } = op;
    ctx.fillStyle = C.tealDeep; ctx.font = `500 ${40 * s}px ${F.mono}`;
    ctx.fillText(hm(it.start), x, y + 4 * s);
    ctx.fillStyle = C.faint; ctx.font = `400 ${28 * s}px ${F.mono}`;
    ctx.fillText((it.start >= 1440 ? DAYS[it.day + 1] + ' ' : '') + (it.end ? 'to ' + it.end : ''), x, y + 56 * s);
    let yy = y;
    ctx.fillStyle = C.ink; ctx.font = `500 ${46 * s}px ${F.body}`;
    for (const l of op.tl) { ctx.fillText(l, x + timeW, yy); yy += 58 * s; }
    ctx.fillStyle = C.dim; ctx.font = `400 ${33 * s}px ${F.body}`;
    for (const l of op.vl) { ctx.fillText(l, x + timeW, yy + 4 * s); yy += 44 * s; }
    let tx = x + timeW;
    if (it.free) {
      ctx.font = `500 ${26 * s}px ${F.mono}`;
      const tw = ctx.measureText(it.free).width + 24 * s;
      ctx.fillStyle = C.teal; round(ctx, tx, yy + 12 * s, tw, 40 * s, 6 * s); ctx.fill();
      ctx.fillStyle = C.onTeal; ctx.fillText(it.free, tx + 12 * s, yy + 20 * s);
      tx += tw + 16 * s;
    }
    if (it.clash) { ctx.fillStyle = C.amber; ctx.font = `500 ${28 * s}px ${F.mono}`; ctx.fillText('OVERLAPS PREVIOUS', tx, yy + 20 * s); }
  }
  const shown = L.ops.filter(o => o.t === 'item').length;
  if (shown < items.length) {
    ctx.fillStyle = C.amber; ctx.font = `500 34px ${F.mono}`;
    ctx.fillText(`+ ${items.length - shown} MORE IN YOUR SAVED PLAN`, M, bottom + 10);
  }

  // Footer: RadTech mark, site, map link, disclaimer.
  const fy = H - 250;
  ctx.fillStyle = rule; ctx.fillRect(M, fy, W - 2 * M, 3);
  logo(ctx, M, fy + 50, 80);
  ctx.fillStyle = C.ink; ctx.font = `500 44px ${F.display}`;
  ctx.fillText('Made by RadTech', M + 110, fy + 52);
  ctx.fillStyle = C.dim; ctx.font = `400 32px ${F.body}`;
  ctx.fillText('radtech.nl  ·  built with \u2665 for ADE 2026', M + 110, fy + 108);
  ctx.font = `400 30px ${F.mono}`; ctx.fillStyle = C.tealDeep;
  const site = (meta.site || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (site) ctx.fillText('Plan yours: ' + site, W - M - ctx.measureText('Plan yours: ' + site).width, fy + 60);
  ctx.fillStyle = C.faint; ctx.font = `400 26px ${F.body}`;
  const dis = 'Unofficial fan project, not affiliated with Amsterdam Dance Event. Times change, so check each event page.';
  ctx.fillText(dis, W - M - ctx.measureText(dis).width, fy + 112);
  return cv;
}

// One-page PDF with the page as a JPEG, sized to A4 (595 x 842 pt).
export async function canvasToPdf(cv) {
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
  const jpg = new Uint8Array(await blob.arrayBuffer());
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = p => { const b = typeof p === 'string' ? enc.encode(p) : p; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const content = `q 595.28 0 0 841.89 0 0 cm /Im0 Do Q`;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

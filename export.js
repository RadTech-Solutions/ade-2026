// Draws a saved ADE plan as one A4 page in the RadTech dark style (navy page, cream ink, teal and amber glows),
// and wraps it in a single-page PDF without any library.
const W = 2480, H = 3508, M = 170;                 // A4 at 300 dpi
const THEMES = {
  dark: { paper: '#0B1322', ink: '#ECE7DA', dim: 'rgba(236,231,218,.72)', faint: 'rgba(236,231,218,.48)', line: 'rgba(236,231,218,.14)',
    teal: '#5FDDCF', tealDeep: '#5FDDCF', amber: '#E6A85C', navy: '#0E1A2B', cream: '#ECE7DA', mint: '#5FDDCF', gold: '#E6A85C', onTeal: '#07131F',
    wash: 'rgba(236,231,218,', plate: 'rgba(236,231,218,.18)', glows: true },
  light: { paper: '#F4EEE0', ink: '#15212E', dim: 'rgba(21,33,46,.70)', faint: 'rgba(21,33,46,.45)', line: 'rgba(21,33,46,.16)',
    teal: '#137F75', tealDeep: '#0C5F57', amber: '#B07321', navy: '#0B1322', cream: '#ECE7DA', mint: '#5FDDCF', gold: '#E6A85C', onTeal: '#F4EEE0',
    wash: 'rgba(21,33,46,', plate: 'rgba(21,33,46,0)', glows: false },
};
const C = { ...THEMES.dark };
const wash = a => C.wash + a + ')';
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
  ctx.strokeStyle = C.plate; ctx.lineWidth = Math.max(2, s * 0.02); ctx.stroke();
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
  Object.assign(C, THEMES[meta.theme === 'light' ? 'light' : 'dark']);
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(11,19,34,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  if (C.glows) {
    glow(W * 0.92, H * 0.04, 1500, 'rgba(95,221,207,.20)');
    glow(W * 0.02, H * 0.62, 1400, 'rgba(230,168,92,.12)');
    glow(W * 0.85, H * 0.98, 1100, 'rgba(95,221,207,.10)');
  }
  ctx.fillStyle = wash(C.glows ? .045 : .035);
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

  // Body: one event gets a poster, several get a timetable, very crowded plans fall back to the list.
  const top = M + 590, bottom = H - 330;
  const mode = meta.layout === 'list' ? 'list' : (items.length === 1 ? 'single' : 'timetable');
  if (mode === 'single') drawSingle(ctx, items[0], top, bottom);
  else if (!(mode === 'timetable' && drawTimetable(ctx, items, top, bottom))) drawList(ctx, items, top, bottom);

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

function drawList(ctx, items, top, bottom) {
  const byDay = new Map();
  for (const it of items) { if (!byDay.has(it.day)) byDay.set(it.day, []); byDay.get(it.day).push(it); }
  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
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

const KIND = { club: ['#B78CEE', 'Club'], day: ['#EF8055', 'Day music'], art: ['#78A8F2', 'Art & film'], talk: ['#DFA63E', 'Talk'], well: ['#41C0A0', 'Wellbeing'] };
const endOf = it => { if (!it.end) return it.start + 120; let m = +it.end.slice(0, 2) * 60 + +it.end.slice(3, 5); if (it.end === '23:59') m = 1440; while (m <= it.start) m += 1440; return m; };
function fitText(ctx, text, maxW, maxLines, font, sizes) {
  for (const sz of sizes) {
    ctx.font = font(sz);
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) return { lines, sz };
  }
  ctx.font = font(sizes[sizes.length - 1]);
  const lines = wrap(ctx, text, maxW).slice(0, maxLines);
  lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  return { lines, sz: sizes[sizes.length - 1] };
}

// One event: a poster with the day, a huge time, the title and where to go.
function drawSingle(ctx, it, top, bottom) {
  const k = KIND[it.kind] || KIND.day, x = M, w = W - 2 * M;
  const tt = fitText(ctx, it.title, w - 220, 4, sz => `600 ${sz}px ${F.display}`, [150, 128, 110, 96, 84]);
  const cardH = 760 + tt.lines.length * tt.sz * 1.08 + 50 + 86 + 110 + 78 + 110;
  top = top + Math.max(0, (bottom - top - cardH) / 2) - 40;
  ctx.fillStyle = wash(.04); round(ctx, x, top + 40, w, cardH, 36); ctx.fill();
  ctx.strokeStyle = k[0]; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = k[0]; ctx.fillRect(x, top + 40, 18, cardH);
  const ix = x + 110;
  ctx.fillStyle = C.faint; ctx.font = `500 44px ${F.mono}`;
  ctx.fillText(DAYL[it.day].toUpperCase() + (it.start >= 1440 ? '  ·  AFTER MIDNIGHT' : ''), ix, top + 160);
  ctx.fillStyle = C.teal; ctx.font = `600 300px ${F.display}`;
  ctx.fillText(hm(it.start), ix - 12, top + 250);
  ctx.fillStyle = C.dim; ctx.font = `400 60px ${F.mono}`;
  if (it.end) ctx.fillText('until ' + it.end, ix, top + 590);
  const t = fitText(ctx, it.title, w - 220, 4, sz => `600 ${sz}px ${F.display}`, [150, 128, 110, 96, 84]);
  ctx.fillStyle = C.ink; let y = top + 760;
  for (const l of t.lines) { ctx.font = `600 ${t.sz}px ${F.display}`; ctx.fillText(l, ix, y); y += t.sz * 1.08; }
  y += 50;
  ctx.fillStyle = C.ink; ctx.font = `500 64px ${F.body}`; ctx.fillText(it.venue, ix, y); y += 86;
  ctx.fillStyle = C.dim; ctx.font = `400 50px ${F.body}`;
  ctx.fillText([it.address, it.district].filter(Boolean).join('  ·  '), ix, y); y += 110;
  let tx = ix;
  const pill = (txt, bg, fg) => { ctx.font = `500 40px ${F.mono}`; const tw = ctx.measureText(txt).width + 56; ctx.fillStyle = bg; round(ctx, tx, y, tw, 78, 39); ctx.fill(); ctx.fillStyle = fg; ctx.fillText(txt, tx + 28, y + 20); tx += tw + 24; };
  if (it.free) pill(it.free, C.teal, C.onTeal);
  pill(k[1].toUpperCase(), wash(.10), k[0]);
}

// Several events: days as columns, hours down the side, blocks sized by duration, overlaps side by side.
function drawTimetable(ctx, items, top, bottom) {
  const days = [...new Set(items.map(i => i.day))].sort((a, b) => a - b);
  // Exhibitions, markets and other all-day items go in the strip; long club nights stay on the grid.
  const isAllDay = i => { const d = endOf(i) - i.start; return d > 600 || (d > 360 && i.start < 720); };
  const allDay = items.filter(isAllDay), timed = items.filter(i => !isAllDay(i));
  const cols = days.length, axis = 150, gap = 18, gridX = M + axis, gridW = W - M - gridX;
  const colW = (gridW - gap * (cols - 1)) / cols, colX = d => gridX + days.indexOf(d) * (colW + gap);
  // Lanes per day so overlapping events sit side by side.
  const lanes = new Map();
  for (const d of days) {
    const evs = timed.filter(i => i.day === d).sort((a, b) => a.start - b.start), ends = [];
    for (const e of evs) { let l = ends.findIndex(x => x <= e.start); if (l < 0) { l = ends.length; ends.push(0); } ends[l] = endOf(e); e.lane = l; }
    lanes.set(d, Math.max(1, ends.length));
    for (const e of evs) e.lanes = ends.length;
  }
  if ([...lanes.values()].some(n => n > 4)) return false;
  // Column heads and the all-day strip.
  let y = top;
  for (const d of days) {
    const x = colX(d);
    ctx.fillStyle = C.ink; ctx.font = `600 ${cols > 3 ? 46 : 58}px ${F.display}`;
    ctx.fillText(DAYL[d].split(' ')[0].slice(0, cols > 3 ? 3 : 9) + ' ' + DAYL[d].split(' ')[1], x, y);
    ctx.fillStyle = C.faint; ctx.font = `400 26px ${F.mono}`;
    const n = items.filter(i => i.day === d).length;
    ctx.fillText(`${n} EVENT${n === 1 ? '' : 'S'}`, x, y + 70);
  }
  y += 130;
  if (allDay.length) {
    ctx.fillStyle = C.faint; ctx.font = `500 24px ${F.mono}`; ctx.fillText('ALL DAY', M, y + 14);
    let maxRows = 0;
    for (const d of days) {
      const list = allDay.filter(i => i.day === d);
      maxRows = Math.max(maxRows, list.length);
      list.slice(0, 4).forEach((it, r) => {
        const x = colX(d), yy = y + r * 64, k = KIND[it.kind] || KIND.day;
        ctx.fillStyle = wash(.07); round(ctx, x, yy, colW, 54, 10); ctx.fill();
        ctx.fillStyle = k[0]; ctx.fillRect(x, yy, 8, 54);
        ctx.fillStyle = C.ink; ctx.font = `500 26px ${F.body}`;
        let t = it.title; while (ctx.measureText(t).width > colW - 34 && t.length > 4) t = t.slice(0, -2);
        ctx.fillText(t === it.title ? t : t.replace(/\s*$/, '') + '…', x + 22, yy + 13);
      });
    }
    y += Math.min(maxRows, 4) * 64 + 30;
  }
  // Time axis: from the earliest start to the latest end, whole hours.
  if (!timed.length) return true;
  const t0 = Math.floor(Math.min(...timed.map(i => i.start)) / 60) * 60;
  const t1 = Math.ceil(Math.max(...timed.map(endOf)) / 60) * 60;
  const gy0 = y, gy1 = bottom - 20, ph = (gy1 - gy0) / (t1 - t0);
  const Y = m => gy0 + (m - t0) * ph;
  const hours = (t1 - t0) / 60, step = hours > 16 ? 2 : 1;
  for (let m = t0; m <= t1; m += 60 * step) {
    ctx.fillStyle = C.line; ctx.fillRect(gridX, Y(m), gridW, 2);
    ctx.fillStyle = C.faint; ctx.font = `500 30px ${F.mono}`;
    ctx.fillText(hm(m), M, Y(m) - 15);
  }
  for (const d of days) { ctx.fillStyle = wash(.03); ctx.fillRect(colX(d), gy0, colW, gy1 - gy0); }
  // Blocks.
  for (const it of timed) {
    const k = KIND[it.kind] || KIND.day, lw = colW / it.lanes;
    const x = colX(it.day) + it.lane * lw + 4, w = lw - 8, yA = Y(it.start) + 3, h = Math.max(Y(endOf(it)) - Y(it.start) - 6, 40);
    const g = ctx.createLinearGradient(x, yA, x, yA + h);
    g.addColorStop(0, k[0] + '40'); g.addColorStop(1, k[0] + '14');
    ctx.fillStyle = g; round(ctx, x, yA, w, h, 14); ctx.fill();
    ctx.strokeStyle = k[0] + 'AA'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = k[0]; ctx.fillRect(x, yA + 8, 6, h - 16);
    ctx.save(); ctx.beginPath(); ctx.rect(x, yA, w, h); ctx.clip();
    const pad = 20, inner = w - pad - 12, small = w < 260;
    let ty = yA + 14;
    ctx.fillStyle = C.teal; ctx.font = `500 ${small ? 22 : 26}px ${F.mono}`;
    ctx.fillText(hm(it.start) + (it.end && !small ? '–' + it.end : ''), x + pad, ty); ty += small ? 32 : 38;
    const room = Math.max(1, Math.floor((h - (ty - yA) - (h > 200 ? 44 : 6)) / (small ? 30 : 38)));
    const t = fitText(ctx, it.title, inner, Math.min(room, 4), sz => `600 ${sz}px ${F.display}`, small ? [26, 23, 20] : [34, 30, 26, 23]);
    ctx.fillStyle = C.ink;
    for (const l of t.lines) { ctx.font = `600 ${t.sz}px ${F.display}`; ctx.fillText(l, x + pad, ty); ty += t.sz * 1.15; }
    if (h > 200) {
      ctx.fillStyle = C.dim; ctx.font = `400 ${small ? 20 : 24}px ${F.body}`;
      let v = it.venue; while (ctx.measureText(v).width > inner && v.length > 4) v = v.slice(0, -2);
      ctx.fillText(v === it.venue ? v : v + '…', x + pad, ty + 6);
    }
    if (it.free && h > 120) {
      ctx.font = `600 ${small ? 18 : 22}px ${F.mono}`;
      const tw = ctx.measureText(it.free).width + 18;
      ctx.fillStyle = C.teal; round(ctx, x + w - tw - 12, yA + 12, tw, small ? 30 : 34, 8); ctx.fill();
      ctx.fillStyle = C.onTeal; ctx.fillText(it.free, x + w - tw - 3, yA + 18);
    }
    ctx.restore();
  }
  // Legend.
  const used = [...new Set(items.map(i => i.kind))].filter(k => KIND[k]);
  let lx = gridX; const ly = bottom + 6;
  ctx.font = `500 24px ${F.mono}`;
  for (const k of used) { ctx.fillStyle = KIND[k][0]; round(ctx, lx, ly, 22, 22, 6); ctx.fill(); ctx.fillStyle = C.dim; ctx.fillText(KIND[k][1].toUpperCase(), lx + 32, ly); lx += ctx.measureText(KIND[k][1].toUpperCase()).width + 80; }
  return true;
}

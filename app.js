// ADE 2026 over the Amsterdam building model. Tiles, packs and the tile worker come from
// "Amsterdam, building by building" by Alex Barakov (MIT); the shading is a night version of its maquette shader.
import * as THREE from './vendor/three.module.js';
import { MapControls } from './vendor/MapControls.js';

const ROOT = document.documentElement;
const FMT = ROOT.dataset.fmt || 'b64';            // 'gz' on GitHub Pages, 'b64' inside the artifact viewer
const GUIDE = ROOT.dataset.guide || '';
const COFFEE = ROOT.dataset.coffee || '';
const SITE = ROOT.dataset.site || 'https://radtech-solutions.github.io/ade-2026/';
const SKY = '#0B0D12', LAND = '#15181F', WATER = '#123049';
const FREE = new THREE.Color('#FFCB4D'), PAID = new THREE.Color('#5EC8F2');
const DAYN = ['Wed 21', 'Thu 22', 'Fri 23', 'Sat 24', 'Sun 25'];
const DAYL = ['Wednesday 21', 'Thursday 22', 'Friday 23', 'Saturday 24', 'Sunday 25'];
const KINDC = { day: '#EF8055', club: '#B78CEE', art: '#78A8F2', talk: '#DFA63E', well: '#41C0A0' };
const KINDL = { day: 'Day music', club: 'Club', art: 'Art & film', talk: 'Talk', well: 'Wellbeing' };
const ADE = 'https://www.amsterdam-dance-event.nl/en/program/2026/';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hm = m => m < 0 ? '' : String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const fold = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const coarse = matchMedia('(pointer: coarse)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => innerWidth <= 820;
const $ = id => document.getElementById(id);
// Anonymous usage events for Umami (cookieless). No-op when the script is not loaded, as in the artifact viewer.
const track = (name, data) => { try { window.umami && window.umami.track(name, data); } catch {} };

// Amsterdam clock: which ADE day it is now, counting until 05:00 as the night before.
function amsNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  let day = +p.day - 21, min = +p.hour * 60 + +p.minute;
  if (p.year !== '2026' || p.month !== '10') day = -9;
  if (min < 300) { day -= 1; min += 1440; }
  return { day, min, live: day >= 0 && day <= 4 };
}

function fail(msg) {
  $('loading').hidden = false;
  $('loading').innerHTML = `<div class="err"><b>The 3D map could not start.</b><p>${esc(msg)}</p>${GUIDE ? `<p><a href="${GUIDE}">Open the list guide instead</a></p>` : ''}</div>`;
}

async function bin(name) {
  if (FMT === 'gz') {
    const r = await fetch(`data/${name}.gz`);
    if (!r.ok) throw new Error(`${name} did not load (${r.status})`);
    return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  const r = await fetch(`data/${name.replace(/\.bin$/, '')}.gz.txt`);
  if (!r.ok) throw new Error(`${name} did not load (${r.status})`);
  const s = atob((await r.text()).trim()), raw = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) raw[i] = s.charCodeAt(i);
  return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

try { await main(); } catch (e) { console.error(e); fail(e.message || String(e)); }

async function main() {
  const canvas = $('scene');
  if (!canvas.getContext('webgl2')) throw new Error('This browser or device has WebGL 2 switched off. Try a recent Chrome, Safari or Firefox.');
  const [city, ade] = await Promise.all([fetch('data/city.json').then(r => r.json()), fetch('data/ade.json').then(r => r.json())]);
  const V = ade.venues;
  V.forEach(v => { v.s = fold(v.n + ' ' + v.vn.join(' ') + ' ' + v.a + ' ' + (v.d || '')); });
  const TOTAL = V.reduce((s, v) => s + v.ev.length, 0);

  // ---------- scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setClearColor(SKY);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 5, 60000);
  const controls = new MapControls(camera, canvas);
  controls.enableDamping = true;
  // Like Google Maps: drag moves the map, right drag (or Ctrl/Shift drag) turns and tilts, the wheel zooms toward the cursor.
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.zoomToCursor = true;
  controls.screenSpacePanning = false;
  controls.rotateSpeed = 0.6;
  controls.listenToKeyEvents(window);
  controls.keyPanSpeed = 60;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 60;
  controls.maxDistance = 30000;
  let dirty = true, busyUntil = 0;
  const wake = (sec = 0) => { dirty = true; busyUntil = Math.max(busyUntil, performance.now() + sec * 1000); };
  controls.addEventListener('change', () => wake());
  const HOME = (() => {
    const az = THREE.MathUtils.degToRad(200), el = THREE.MathUtils.degToRad(46), d = mobile() ? 5200 : 4300;
    return { t: new THREE.Vector3(0, 0, 250), p: new THREE.Vector3(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), 250 + d * Math.cos(el) * Math.cos(az)) };
  })();
  controls.target.copy(HOME.t); camera.position.copy(HOME.p);
  controls.update();

  async function loadPolygons(name) {
    const buf = await bin(name);
    const [nPoly, nRing, nVert] = new Uint32Array(buf, 0, 3);
    const ringStart = new Uint32Array(buf, 12, nPoly + 1);
    const vertStart = new Uint32Array(buf, 12 + 4 * (nPoly + 1), nRing + 1);
    const xz = new Float32Array(buf, 12 + 4 * (nPoly + 1) + 4 * (nRing + 1), 2 * nVert);
    const ring = r => { const p = []; for (let v = vertStart[r]; v < vertStart[r + 1]; v++) p.push(new THREE.Vector2(xz[2 * v], -xz[2 * v + 1])); return p; };
    const shapes = [];
    for (let p = 0; p < nPoly; p++) {
      const s = new THREE.Shape(ring(ringStart[p]));
      for (let r = ringStart[p] + 1; r < ringStart[p + 1]; r++) s.holes.push(new THREE.Path(ring(r)));
      shapes.push(s);
    }
    const g = new THREE.ShapeGeometry(shapes);
    g.rotateX(-Math.PI / 2);
    return g;
  }
  const [landGeo, waterGeo] = await Promise.all([loadPolygons('land.bin'), loadPolygons('water.bin')]);
  const land = new THREE.Mesh(landGeo, new THREE.MeshBasicMaterial({ color: LAND }));
  const water = new THREE.Mesh(waterGeo, new THREE.MeshBasicMaterial({ color: WATER }));
  land.position.y = -0.05; water.position.y = -0.4;
  scene.add(land, water);

  // Buildings: flat-shaded from screen derivatives, warm glow near free venues, venue buildings lit window by window.
  const MAXV = 48;
  const uniforms = {
    uFogColor: { value: new THREE.Color(SKY) }, uFog: { value: new THREE.Vector2(7000, 24000) },
    uLit: { value: Array.from({ length: MAXV }, () => new THREE.Vector3(0, 0, -1)) }, uLitN: { value: 0 },
    uNow: { value: 0 }, uV: { value: null }, uSel: { value: -1 }, uMode: { value: 0 }, uGlow: { value: 0.25 },
  };
  const VW = 512, vData = new Float32Array(VW * 4);
  const vTex = new THREE.DataTexture(vData, VW, 1, THREE.RGBAFormat, THREE.FloatType);
  vTex.needsUpdate = true;
  uniforms.uV.value = vTex;
  const VERT = `
    in float vid; uniform float uBorn; uniform float uNow; out vec3 vWorld; out float vVid;
    void main() {
      vVid = vid;
      vec3 p = position;
      float k = clamp((uNow - uBorn) / 0.8, 0.0, 1.0);
      p.y *= k * k * (3.0 - 2.0 * k);
      vec4 w = modelMatrix * vec4(p, 1.0); vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const FRAG = `
    precision highp float;
    uniform vec3 uFogColor; uniform vec2 uFog; uniform vec3 uLit[${MAXV}]; uniform int uLitN;
    uniform sampler2D uV; uniform float uSel; uniform int uMode; uniform float uGlow;
    in vec3 vWorld; in float vVid; out vec4 outColor;
    void main() {
      vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      float moon = max(dot(n, normalize(vec3(0.45, 0.6, -0.55))), 0.0);
      vec3 c = n.y > 0.9 ? vec3(0.20, 0.215, 0.25) : vec3(0.11, 0.12, 0.145) + 0.07 * moon;
      c *= mix(0.7, 1.0, clamp(vWorld.y / 14.0, 0.0, 1.0));
      float glow = 0.0;
      for (int i = 0; i < ${MAXV}; i++) {
        if (i >= uLitN) break;
        vec2 dv = vWorld.xz - uLit[i].xy;
        glow += uLit[i].z * exp(-dot(dv, dv) / 9000.0);
      }
      c += vec3(1.0, 0.72, 0.28) * min(glow, 1.0) * uGlow;
      if (vVid > -0.5) {
        vec4 vc = texelFetch(uV, ivec2(int(vVid + 0.5), 0), 0);
        float sel = abs(vVid - uSel) < 0.5 ? 1.0 : 0.0;
        if (vc.a > 0.0 && (uMode == 0 || sel > 0.5)) {
          vec3 lc;
          if (n.y > 0.9) lc = vc.rgb * 1.15;
          else {
            float band = step(0.42, fract(vWorld.y / 3.2));
            float colm = step(0.4, fract((vWorld.x + vWorld.z) / 2.4));
            lc = vc.rgb * (0.35 + 1.35 * band * colm);
          }
          c = mix(c, lc * (1.0 + 0.6 * sel), clamp(vc.a + sel, 0.0, 1.0));
        }
      }
      float d = length(vWorld - cameraPosition);
      c = mix(c, uFogColor, smoothstep(uFog.x, uFog.y, d));
      outColor = vec4(c, 1.0);
    }`;
  const material = born => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...uniforms, uBorn: born }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });

  // ---------- state ----------
  const S = {
    view: store.get('adem-view') || 'lit', free: store.get('adem-free') === '1', slot: store.get('adem-slot') || 'all',
    day: +(store.get('adem-day') ?? -1), sel: -1, q: [], qText: '',
  };
  const NOW = amsNow();
  if (NOW.live && !store.get('adem-day-set')) S.day = NOW.day;
  if (!(S.day >= -1 && S.day < 5)) S.day = 0;   // -1 means all five days
  const VIEWS = [['lit', 'Lit'], ['heat', 'Heat'], ['beams', 'Beams']];
  const SLOTS = [['all', 'All day'], ...(NOW.live ? [['now', 'Now']] : []), ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['night', 'Night']];
  if (!VIEWS.some(v => v[0] === S.view)) S.view = 'lit';
  if (!SLOTS.some(v => v[0] === S.slot)) S.slot = 'all';
  readHash();

  const endMin = e => { if (!e[2]) return e[1] + 120; let m = +e[2].slice(0, 2) * 60 + +e[2].slice(3, 5); if (e[2] === '23:59') m = 1440; while (m <= e[1]) m += 1440; return m; };
  const inSlot = e => {
    const m = e[1], s = S.slot;
    if (s === 'all') return true;
    if (s === 'now') { const t = amsNow(); return e[0] === t.day && m <= t.min && t.min < endMin(e); }
    if (s === 'morning') return m < 720;
    if (s === 'afternoon') return m >= 720 && m < 1020;
    if (s === 'evening') return m >= 1020 && m < 1320;
    return m >= 1320;
  };
  // Search tolerates typos: exact text first, then the same text without spaces ("lane8" finds "Lane 8"),
  // then words within one edit (4 to 6 letters) or two edits (7+ letters), swaps counting as one ("matahme" finds Mathame).
  const wordsOf = t => new Set(t.split(/[^a-z0-9]+/).filter(w => w.length > 2));
  const vocab = new Set();
  V.forEach(v => { v.w = wordsOf(v.s); v.cs = v.s.replace(/\s+/g, ''); v.w.forEach(x => vocab.add(x)); v.ev.forEach(e => { e.w = wordsOf(e[9]); e.cs = e[9].replace(/\s+/g, ''); e.w.forEach(x => vocab.add(x)); }); });
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        rowMin = Math.min(rowMin, d[i][j]);
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }
  const near = new Map();
  function nearWords(t) {
    if (near.has(t)) return near.get(t);
    const max = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0, out = [];
    if (max) for (const w of vocab) {
      // compare whole words, and also the start of longer words so half-typed misspellings still land
      if (dist(t, w, max) <= max || (w.length > t.length + 1 && dist(t, w.slice(0, t.length), max) <= max)) out.push(w);
    }
    near.set(t, out);
    return out;
  }
  // Typo matching only kicks in when the exact text (with or without spaces) appears nowhere, so real hits are never diluted.
  const exactAnywhere = new Map();
  const hasExact = t => {
    if (!exactAnywhere.has(t)) exactAnywhere.set(t, V.some(v => v.s.includes(t) || v.cs.includes(t) || v.ev.some(e => e[9].includes(t) || e.cs.includes(t))));
    return exactAnywhere.get(t);
  };
  const tokenHit = (t, v, e) => {
    if (e[9].includes(t) || v.s.includes(t) || e.cs.includes(t) || v.cs.includes(t)) return true;
    if (hasExact(t)) return false;
    const nw = nearWords(t);
    return nw.length > 0 && nw.some(w => e.w.has(w) || v.w.has(w));
  };
  // A multi-word query that exists as a phrase ("lane 8", "i hate models") matches as that phrase, not word by word.
  const qMatch = (v, e) => {
    if (!S.q.length) return true;
    if (S.q.length > 1) {
      const ph = S.q.join('');
      if (hasExact(ph)) return e.cs.includes(ph) || v.cs.includes(ph);
    }
    return S.q.every(t => tokenHit(t, v, e));
  };
  // My plan: events saved in this browser, keyed by ADE event id and night.
  const pid = e => e[6].split('/').pop() + '@' + e[0];
  const KEY = new Map();
  V.forEach((v, i) => v.ev.forEach(e => KEY.set(pid(e), [e, i])));
  const plan = new Set((() => { try { return JSON.parse(store.get('adem-plan') || '[]'); } catch { return []; } })().filter(k => KEY.has(k)));
  S.tab = 'events';
  // Genres: ADE's tree flattened; picking a parent also picks all its sub-genres. Events match any picked genre.
  const TAX = ade.tax || [], GNAMES = [], GPARENT = [];
  TAX.forEach(([g, subs]) => { const gi = GNAMES.length; GNAMES.push(g); GPARENT.push(-1); subs.forEach(sb => { GNAMES.push(sb); GPARENT.push(gi); }); });
  S.genres = new Set((S.genresIn ?? store.get('adem-genres') ?? '').split(',').filter(x => x !== '' && GNAMES[+x] !== undefined).map(Number));
  S.hideSold = S.hideSoldIn ?? (store.get('adem-hidesold') === '1');
  let gWant = null;
  const genreSet = () => {
    if (gWant) return gWant;
    gWant = new Set();
    for (const g of S.genres) { gWant.add(g); if (GPARENT[g] === -1) GNAMES.forEach((_, i) => { if (GPARENT[i] === g) gWant.add(i); }); }
    return gWant;
  };
  const genreOk = e => !S.genres.size || e[12].some(g => genreSet().has(g));
  const baseOk = (v, e) => inSlot(e) && (!S.free || e[3]) && (!S.hideSold || !e[11]) && genreOk(e) && qMatch(v, e);
  const evFor = v => S.tab === 'plan' ? v.ev.filter(e => plan.has(pid(e))) : v.ev.filter(e => (S.day < 0 || e[0] === S.day) && baseOk(v, e));

  // ---------- venue markers ----------
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true); beamGeo.translate(0, 0.5, 0);
  const coreGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false); coreGeo.translate(0, 0.5, 0);
  const discGeo = new THREE.CircleGeometry(1, 40); discGeo.rotateX(-Math.PI / 2);
  const hitGeo = new THREE.CylinderGeometry(1, 1, 1, 6); hitGeo.translate(0, 0.5, 0);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const markers = new THREE.Group(); scene.add(markers);
  // Hot pink arrow that bobs above the selected venue, drawn on top so buildings never hide it.
  // The renderer outputs linear values untouched, so give the pink in that space to land on #FF2E88 on screen.
  const PINK = new THREE.Color().setRGB(1, 0.18, 0.53, THREE.LinearSRGBColorSpace);
  const pinkMat = new THREE.MeshBasicMaterial({ color: PINK, depthTest: false, depthWrite: false, transparent: true });
  const pinkSoft = new THREE.MeshBasicMaterial({ color: PINK, depthTest: false, depthWrite: false, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const arrow = new THREE.Group();
  const tip3 = new THREE.Mesh(new THREE.ConeGeometry(1, 1.7, 28), pinkMat); tip3.rotation.x = Math.PI; tip3.position.y = 0.85;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.2, 16), pinkMat); shaft.position.y = 2.75;
  arrow.add(tip3, shaft);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 48), pinkSoft); ring.rotation.x = -Math.PI / 2;
  for (const m of [tip3, shaft, ring]) m.renderOrder = 999;
  arrow.visible = ring.visible = false;
  scene.add(arrow, ring);
  const hits = [];
  V.forEach((v, i) => {
    const g = new THREE.Group(); g.position.set(v.x, 0, v.z);
    const halo = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ ...add, opacity: 0.16, side: THREE.DoubleSide }));
    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ ...add, opacity: 0.95 }));
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ ...add, map: poolTex, opacity: 0.5 }));
    disc.position.y = 0.3;
    const hit = new THREE.Mesh(hitGeo, hitMat); hit.userData.i = i;
    g.add(halo, core, disc, hit);
    g.userData = { halo, core, disc, hit };
    markers.add(g); hits.push(hit); v.g = g;
  });

  function refreshScene() {
    const lit = [], view = S.view, beams = view === 'beams';
    uniforms.uMode.value = view === 'lit' ? 0 : view === 'heat' ? 1 : 2;
    uniforms.uGlow.value = view === 'heat' ? 0.55 : view === 'lit' ? 0.3 : 0.35;
    uniforms.uSel.value = S.sel;
    V.forEach((v, i) => {
      const e = evFor(v), u = v.g.userData;
      v.c = e.length; v.nf = e.filter(x => x[3]).length;
      v.g.visible = v.c > 0;
      const c = v.nf ? FREE : PAID;
      vData.set(v.c ? [c.r * 1.6, c.g * 1.6, c.b * 1.6, Math.min(0.6 + 0.1 * v.c, 1)] : [0, 0, 0, 0], i * 4);
      if (!v.c) return;
      const h = Math.min(70 + 45 * v.c, 520), sel = i === S.sel;
      u.halo.visible = u.core.visible = beams;
      u.halo.material.color.copy(c); u.core.material.color.copy(c); u.disc.material.color.copy(c);
      u.halo.scale.set(sel ? 34 : 18, h, sel ? 34 : 18);
      u.core.scale.set(sel ? 5 : 3, h, sel ? 5 : 3);
      const pool = view === 'heat' ? Math.min(110 + 35 * v.c, 320) : view === 'lit' ? Math.min(Math.max((v.bw || 25) * 3, 75) + 12 * v.c, 180) : 46;
      u.disc.scale.setScalar(pool * (sel ? 1.5 : 1));
      u.disc.material.opacity = view === 'heat' ? 0.55 + 0.05 * Math.min(v.c, 6) : view === 'lit' ? 0.5 : 0.3;
      const r = beams ? 40 : Math.max(v.bw || 25, 25);
      u.hit.scale.set(r, beams ? h : Math.max(v.bh || 30, 30), r);
      if (v.nf) lit.push([v.x, v.z, Math.min(0.35 + 0.12 * v.nf, 1)]);
    });
    vTex.needsUpdate = true;
    lit.sort((a, b) => b[2] - a[2]);
    uniforms.uLitN.value = Math.min(lit.length, MAXV);
    lit.slice(0, MAXV).forEach((l, k) => uniforms.uLit.value[k].set(l[0], l[1], l[2]));
    wake();
  }
  const refresh = () => { refreshScene(); panel(); writeHash(); };

  // ---------- tiles, nearest first; each venue lights the smallest building box around its address ----------
  const best = [];
  function matchVenues(m, mesh) {
    const nB = m.nB, ox = m.origin[0], oz = m.origin[1], pos = m.pos, bl = m.bld;
    const bb = new Float32Array(nB * 5);
    for (let b = 0; b < nB; b++) bb.set([Infinity, -Infinity, Infinity, -Infinity, 0], b * 5);
    let tx0 = Infinity, tx1 = -Infinity, tz0 = Infinity, tz1 = -Infinity;
    for (let v = 0; v < bl.length; v++) {
      const b = bl[v] * 5, x = ox + pos[3 * v] * 0.1, y = pos[3 * v + 1] * 0.1, z = oz + pos[3 * v + 2] * 0.1;
      if (x < bb[b]) bb[b] = x; if (x > bb[b + 1]) bb[b + 1] = x;
      if (z < bb[b + 2]) bb[b + 2] = z; if (z > bb[b + 3]) bb[b + 3] = z;
      if (y > bb[b + 4]) bb[b + 4] = y;
      if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (z < tz0) tz0 = z; if (z > tz1) tz1 = z;
    }
    const attr = mesh.geometry.getAttribute('vid');
    let changed = false;
    V.forEach((v, vi) => {
      if (v.x < tx0 - 25 || v.x > tx1 + 25 || v.z < tz0 - 25 || v.z > tz1 + 25) return;
      let win = -1, score = Infinity;
      for (let b = 0; b < nB; b++) {
        const k = b * 5, x0 = bb[k], x1 = bb[k + 1], z0 = bb[k + 2], z1 = bb[k + 3];
        let sc;
        if (v.x >= x0 - 1 && v.x <= x1 + 1 && v.z >= z0 - 1 && v.z <= z1 + 1) sc = (x1 - x0) * (z1 - z0);
        else {
          const d = Math.hypot(Math.max(0, x0 - v.x, v.x - x1), Math.max(0, z0 - v.z, v.z - z1));
          if (d > 25) continue;
          sc = 1e7 + d;
        }
        if (sc < score) { score = sc; win = b; }
      }
      if (win < 0 || (best[vi] && best[vi].score <= score)) return;
      if (best[vi]) {
        const old = best[vi].mesh.geometry.getAttribute('vid');
        for (let i = 0; i < old.array.length; i++) if (old.array[i] === vi) old.array[i] = -1;
        old.needsUpdate = true;
      }
      for (let i = 0; i < bl.length; i++) if (bl[i] === win) attr.array[i] = vi;
      attr.needsUpdate = true;
      best[vi] = { score, mesh };
      v.bh = Math.max(bb[win * 5 + 4], 12);
      v.bw = Math.max(12, Math.min(60, Math.max(bb[win * 5 + 1] - bb[win * 5], bb[win * 5 + 3] - bb[win * 5 + 2]) / 2));
      changed = true;
    });
    if (changed) refreshScene();
  }

  const queue = [...city.tiles].sort((a, b) => a.dist - b.dist);
  const packs = {};
  const pack = n => packs[n] ??= bin(n);
  let loaded = 0;
  const workers = Array.from({ length: Math.min(4, navigator.hardwareConcurrency || 4) }, () => new Worker('worker.js', { type: 'module' }));
  const tileDone = () => {
    loaded++;
    $('progress').textContent = Math.round(100 * loaded / city.tiles.length);
    if (loaded === city.tiles.length) { $('loading').hidden = true; workers.forEach(w => w.terminate()); }
  };
  for (const w of workers) {
    const next = async () => {
      const t = queue.shift(); if (!t) return;
      try {
        const buf = (await pack(t.pack)).slice(t.offset, t.offset + t.length);
        w.postMessage({ buf, id: t.file }, [buf]);
      } catch (e) { console.error(e); tileDone(); next(); }
    };
    w.onerror = e => { console.error(e); tileDone(); next(); };
    w.onmessage = ({ data: m }) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      g.setAttribute('vid', new THREE.BufferAttribute(new Float32Array(m.bld.length).fill(-1), 1));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      const mesh = new THREE.Mesh(g, material({ value: reduce ? -10 : performance.now() / 1000 }));
      mesh.scale.setScalar(0.1);
      mesh.position.set(m.origin[0], 0, m.origin[1]);
      scene.add(mesh);
      matchVenues(m, mesh);
      wake(0.9);
      tileDone();
      next();
    };
    next();
  }

  // ---------- UI ----------
  const seg = (el, items, key, cur) => { el.innerHTML = items.map(([k, l]) => `<button type="button" data-${key}="${k}" aria-pressed="${String(k) === String(cur)}">${l}</button>`).join(''); };
  const press = (el, pick) => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', pick(b)));
  seg($('days'), [[-1, 'All'], ...DAYN.map((d, i) => [i, d])], 'd', S.day);
  seg($('slots'), SLOTS, 's', S.slot);
  seg($('views'), VIEWS, 'v', S.view);
  const VT = { heat: 'Heat glow: pools of light on the ground', lit: 'Lit buildings: the venue building lights up', beams: 'Beams: light columns, height shows event count' };
  $('views').querySelectorAll('button').forEach(b => { b.title = VT[b.dataset.v]; });
  $('free').setAttribute('aria-pressed', S.free);
  $('days').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setDay(+b.dataset.d === S.day ? -1 : +b.dataset.d); });
  $('slots').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.slot = b.dataset.s; store.set('adem-slot', S.slot); press($('slots'), x => x === b); summary(); refresh(); });
  $('views').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.view = b.dataset.v; store.set('adem-view', S.view); track('view', { view: S.view }); press($('views'), x => x === b); refresh(); });
  $('free').addEventListener('click', () => { S.free = !S.free; store.set('adem-free', S.free ? '1' : '0'); $('free').setAttribute('aria-pressed', S.free); summary(); refresh(); });
  $('nosold').setAttribute('aria-pressed', S.hideSold);
  $('nosold').addEventListener('click', () => { S.hideSold = !S.hideSold; store.set('adem-hidesold', S.hideSold ? '1' : '0'); $('nosold').setAttribute('aria-pressed', S.hideSold); track('hide-sold', { on: S.hideSold }); refresh(); });
  // Genre picker: counts are events across the whole programme, so the list reads the same whatever day is picked.
  const gCount = GNAMES.map(() => 0);
  V.forEach(v => v.ev.forEach(e => e[12].forEach(g => { gCount[g]++; })));
  function drawGenres() {
    let html = '';
    TAX.forEach(([g, subs]) => {
      const gi = GNAMES.indexOf(g);
      html += `<section><button type="button" class="gpar" data-g="${gi}" aria-pressed="${S.genres.has(gi)}">${esc(g)} <em>${gCount[gi]}</em></button><div class="gsubs">` +
        subs.map(sb => { const i = GNAMES.indexOf(sb, gi); return gCount[i] ? `<button type="button" data-g="${i}" aria-pressed="${S.genres.has(i) || S.genres.has(gi)}">${esc(sb)} <em>${gCount[i]}</em></button>` : ''; }).join('') + `</div></section>`;
    });
    $('glist').innerHTML = html;
    $('gsel').textContent = S.genres.size ? [...S.genres].map(i => GNAMES[i]).join(', ') : 'No genre picked: showing everything';
  }
  function setGenres() { gWant = null; store.set('adem-genres', [...S.genres].join(',')); summary(); refresh(); drawGenres(); }
  $('genrebtn').addEventListener('click', () => { drawGenres(); $('genres').hidden = false; });
  $('gdone').addEventListener('click', () => { $('genres').hidden = true; if (mobile()) { setFilters(false); } });
  $('gclear').addEventListener('click', () => { S.genres.clear(); setGenres(); });
  $('glist').addEventListener('click', e => {
    const b = e.target.closest('button[data-g]'); if (!b) return;
    const i = +b.dataset.g, par = GPARENT[i];
    if (par !== -1 && S.genres.has(par)) {            // un-ticking one sub-genre of a fully picked group
      S.genres.delete(par); GNAMES.forEach((_, j) => { if (GPARENT[j] === par && j !== i && gCount[j]) S.genres.add(j); });
    } else if (S.genres.has(i)) S.genres.delete(i);
    else { S.genres.add(i); if (par === -1) GNAMES.forEach((_, j) => { if (GPARENT[j] === i) S.genres.delete(j); }); }
    track('genre', { genre: GNAMES[i] });
    setGenres();
  });
  function setDay(d) {
    track('day', { day: d < 0 ? 'all' : DAYN[d] });
    S.day = d; store.set('adem-day', d); store.set('adem-day-set', '1');
    press($('days'), x => +x.dataset.d === d); summary(); refresh();
  }
  const dayName = () => S.day < 0 ? 'All days' : DAYN[S.day];
  function summary() {
    $('sumtext').textContent = `${dayName()} · ${SLOTS.find(s => s[0] === S.slot)[1]}${S.free ? ' · Free only' : ''}${S.genres.size ? ' · ' + S.genres.size + ' genre' + (S.genres.size > 1 ? 's' : '') : ''}`;
    $('gcount').textContent = S.genres.size || ''; $('gcount').hidden = !S.genres.size;
    $('genrebtn').setAttribute('aria-pressed', S.genres.size > 0);
  }
  summary();
  // Phones: the filter panel and the list sheet both get out of the way of the map on demand.
  function setFilters(open) {
    $('bar').classList.toggle('open', open); document.body.classList.toggle('filters-open', open);
    $('filtertoggle').setAttribute('aria-expanded', open);
  }
  function setSheet(state) {
    S.sheet = state;
    document.body.classList.toggle('sheet-peek', state === 'peek');
    document.body.classList.toggle('sheet-full', state === 'full');
    $('sheetbtn').textContent = state === 'peek' ? 'Show list' : 'Show map';
    wake(0.3);
  }
  S.sheet = 'half';
  $('filtertoggle').addEventListener('click', () => setFilters(!$('bar').classList.contains('open')));
  $('filtersdone').addEventListener('click', () => { setFilters(false); setSheet('peek'); });
  $('hint').textContent = coarse ? 'Drag to move · pinch to zoom · two fingers to turn · tap a glow' : 'Drag to move · right drag to turn and tilt · scroll to zoom · arrow keys pan · click a glow';
  if (GUIDE) { $('guidelink').href = GUIDE; $('guidelink').hidden = false; }
  $('infobtn').addEventListener('click', () => { const o = $('info').hidden; $('info').hidden = !o; $('infobtn').setAttribute('aria-expanded', o); });
  $('infoclose').addEventListener('click', () => { $('info').hidden = true; $('infobtn').setAttribute('aria-expanded', false); });
  $('sheetbtn').addEventListener('click', () => { setFilters(false); setSheet(S.sheet === 'peek' ? 'full' : 'peek'); });

  const head = $('sidehead'), list = $('list'), status = $('status');
  const freeTag = x => x[3] === 1 ? '<span class="free">FREE</span>' : x[3] === 2 ? '<span class="free soft" title="The organiser says free entry">FREE?</span>' : '';
  const when = x => `${hm(x[1])}${x[1] >= 1440 ? `<small class="nx">${DAYN[x[0] + 1] ? DAYN[x[0] + 1].slice(0, 3) : 'Mon'}</small>` : ''}<small>${x[2] ? 'to ' + x[2] : ''}</small>`;
  const addBtn = x => { const k = pid(x), on = plan.has(k); return `<button type="button" class="add" data-k="${k}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} my plan" title="${on ? 'Remove from' : 'Add to'} my plan">${on ? '&#10003;' : '+'}</button>`; };
  const row = (x, v, i, showVenue) => `<div class="item" style="--c:${KINDC[x[4]]}"><div class="t">${when(x)}</div><div>
    <p class="n"><a href="${ADE + x[6]}/" target="_blank" rel="noopener">${esc(x[5])}</a></p>${x[13] ? `<p class="lu">${esc(x[13])}</p>` : ''}
    <div class="m">${S.day < 0 && S.tab !== 'plan' ? `<span class="dy">${DAYN[x[0]]}</span>` : ''}${x[11] ? `<span class="so">SOLD OUT</span><a class="resale" href="https://www.ticketswap.com/search?query=${encodeURIComponent(x[5])}" target="_blank" rel="noopener">Resale &#8599;</a>` : ''}${freeTag(x)}<span class="k">${KINDL[x[4]]}</span>${showVenue ? `<button type="button" class="vlink" data-i="${i}">${esc(v.vn[x[10]] || v.n)}</button>${v.d ? `<span>${esc(v.d)}</span>` : ''}` : (v.vn.length > 1 ? `<span>${esc(v.vn[x[10]])}</span>` : '')}${x[7] ? '<span class="pick">ADE pick</span>' : ''}</div></div>${addBtn(x)}</div>`;
  function planItems() {
    const out = [...plan].map(k => KEY.get(k)).filter(Boolean).map(([e, i]) => ({ e, i, v: V[i] }))
      .sort((a, b) => a.e[0] - b.e[0] || a.e[1] - b.e[1]);
    // Flag a clash only between normal-length events; all-day markets and exhibitions overlap everything by design.
    const short = e => endMin(e) - e[1] <= 360;
    let day = -1, lastEnd = -1;
    for (const it of out) {
      if (it.e[0] !== day) { day = it.e[0]; lastEnd = -1; }
      it.clash = short(it.e) && it.e[1] < lastEnd;
      if (short(it.e)) lastEnd = Math.max(lastEnd, endMin(it.e));
    }
    return out;
  }
  // Export choices, remembered per browser.
  const X = { layout: store.get('adem-xlayout') === 'list' ? 'list' : 'timetable', theme: 'dark' };
  function planPanel() {
    const items = planItems(), free = items.filter(x => x.e[3]).length;
    head.innerHTML = `<h2>My plan</h2><div class="sub"><span>${items.length} saved</span><span class="fc">${free} free</span><span>kept in this browser</span></div>
      ${items.length ? `<div class="xopts"><span>Export</span><div class="seg" id="xlayout">${[['timetable', 'Timetable'], ['list', 'List']].map(([k, l]) => `<button type="button" data-x="${k}" aria-pressed="${X.layout === k}">${l}</button>`).join('')}</div></div><div class="planbtns"><button type="button" data-act="png">Save as image</button><button type="button" data-act="pdf">Save as PDF</button><button type="button" data-act="share">Share plan</button><button type="button" data-act="clear">Clear</button></div>` : ''}`;
    if (!items.length) { list.innerHTML = `<p class="empty">Tap <b>+</b> next to any event to add it here. Then save your plan as one A4 page (image or PDF) or share it as a link. Nothing leaves your browser.</p>`; status.textContent = 'Plan is empty'; return; }
    let html = '', day = -1;
    for (const it of items) {
      if (it.e[0] !== day) { day = it.e[0]; html += `<h3 class="dayh">${DAYL[day]} Oct</h3>`; }
      html += row(it.e, it.v, it.i, true).replace('<div class="m">', `<div class="m">${it.clash ? '<span class="clash">Overlaps previous</span>' : ''}`);
    }
    list.innerHTML = html;
    status.textContent = `${items.length} events in your plan`;
  }
  function setTab(t) {
    S.tab = t; S.sel = -1;
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    $('side').classList.toggle('planmode', t === 'plan');
    refresh();
  }
  const countPlan = () => { $('plancount').textContent = plan.size; $('plancount').hidden = !plan.size; };
  function togglePlan(k) {
    plan.has(k) ? plan.delete(k) : plan.add(k);
    if (plan.has(k)) { const hit = KEY.get(k); track('plan-add', { event: hit ? hit[0][5].slice(0, 80) : k }); }
    store.set('adem-plan', JSON.stringify([...plan]));
    countPlan();
    if (plan.has(k)) toast('Added to My plan');
  }
  function otherDays() {
    if (S.slot === 'now') return '';
    const n = [0, 0, 0, 0, 0];
    if (S.day < 0) return '';
    for (const v of V) for (const e of v.ev) if (e[0] !== S.day && baseOk(v, e)) n[e[0]]++;
    const days = n.map((c, d) => [c, d]).filter(([c]) => c);
    return days.length ? `<div class="other">Also on ${days.map(([c, d]) => `<button type="button" class="dayjump" data-d="${d}">${DAYN[d]} (${c})</button>`).join('')}</div>` : '';
  }
  const slotLabel = () => S.slot === 'all' ? '' : ', ' + SLOTS.find(s => s[0] === S.slot)[1].toLowerCase();
  function panel() {
    if (S.tab === 'plan') return planPanel();
    if (S.sel >= 0) {
      const v = V[S.sel], e = evFor(v);
      head.innerHTML = `<button class="back" type="button" id="back">${S.q.length ? 'Back to results' : 'All places'}</button><h2>${esc(v.vn.length > 1 ? v.vn.join(' · ') : v.n)}</h2>
        <div class="sub"><span>${esc(v.d || '')}</span>${v.a ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.vn[0] + ', ' + v.a + ', Amsterdam')}" target="_blank" rel="noopener">${esc(v.a)} &#8599;</a>` : ''}</div>`;
      list.innerHTML = e.length ? e.map(x => row(x, v, S.sel, false)).join('')
        : `<p class="empty">Nothing here on ${S.day < 0 ? 'any day' : DAYN[S.day]}${slotLabel()}${S.free ? ' that is free' : ''}. Change the day or time, or go back.</p>`;
      status.textContent = `${e.length} events at ${v.n}`;
      return;
    }
    if (S.q.length) {
      const hits = [];
      V.forEach((v, i) => { for (const e of evFor(v)) hits.push([e, v, i]); });
      hits.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1] || a[0][5].localeCompare(b[0][5]));
      const nv = new Set(hits.map(h => h[2])).size;
      head.innerHTML = `<h2>${hits.length} result${hits.length === 1 ? '' : 's'} ${S.day < 0 ? 'across all days' : 'on ' + DAYN[S.day]}${slotLabel()}</h2>
        <div class="sub"><span>${nv} place${nv === 1 ? '' : 's'} glowing on the map</span>${S.free ? '<span>free only</span>' : ''}</div>${otherDays()}`;
      list.innerHTML = hits.length ? hits.slice(0, 250).map(([x, v, i]) => row(x, v, i, true)).join('')
        : `<p class="empty">No match ${S.day < 0 ? 'on any day' : 'on ' + DAYN[S.day]}${slotLabel()}${S.free ? ' among free events' : ''}.${S.free ? ' Try switching off Free only.' : ''} Artists only match when the organiser listed the lineup on the ADE page.</p>`;
      status.textContent = `${hits.length} results`;
      return;
    }
    const vs = V.map((v, i) => [v, i]).filter(([v]) => v.c).sort((a, b) => b[0].nf - a[0].nf || b[0].c - a[0].c);
    const total = vs.reduce((s, [v]) => s + v.c, 0), free = vs.reduce((s, [v]) => s + v.nf, 0);
    head.innerHTML = `<h2>${S.day < 0 ? 'All five days' : DAYL[S.day] + ' Oct'}${slotLabel()}</h2>
      <div class="sub"><span>${total.toLocaleString('en')} events</span><span class="fc">${free} free</span><span>${vs.length} places</span><span>${TOTAL.toLocaleString('en')} all week</span></div>`;
    list.innerHTML = vs.length ? vs.map(([v, i]) => `<button class="vbtn" type="button" data-i="${i}"><b>${esc(v.n)}</b><em class="${v.nf ? '' : 'p'}">${v.nf ? v.nf + ' free' : v.c}</em><span>${esc(v.d || '')}${v.d && v.a ? ' · ' : ''}${esc(v.a)}</span></button>`).join('')
      : `<p class="empty">${S.slot === 'now' ? 'Nothing listed as running right now. Try Night or All day.' : 'Nothing in this slot. Try another time of day or switch off Free only.'}</p>`;
    status.textContent = `${total} events at ${vs.length} places`;
  }
  list.addEventListener('click', e => {
    const a = e.target.closest('.add');
    if (a) {
      togglePlan(a.dataset.k);
      if (S.tab === 'plan') { refresh(); return; }
      const on = plan.has(a.dataset.k);
      a.setAttribute('aria-pressed', on); a.innerHTML = on ? '&#10003;' : '+';
      a.setAttribute('aria-label', (on ? 'Remove from' : 'Add to') + ' my plan');
      return;
    }
    const b = e.target.closest('.vbtn, .vlink'); if (b) select(+b.dataset.i, true);
  });
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) { setTab(b.dataset.tab); if (mobile() && S.sheet === 'peek') setSheet('half'); } });
  head.addEventListener('click', async e => {
    const xo = e.target.closest('#xlayout button');
    if (xo) {
      if (xo.dataset.x) { X.layout = xo.dataset.x; store.set('adem-xlayout', X.layout); }
      xo.parentElement.querySelectorAll('button').forEach(z => z.setAttribute('aria-pressed', z === xo));
      return;
    }
    const b = e.target.closest('.planbtns button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'clear') { if (b.dataset.sure) { plan.clear(); store.set('adem-plan', '[]'); countPlan(); refresh(); } else { b.dataset.sure = 1; b.textContent = 'Tap again to clear'; } return; }
    track('plan-' + act, { size: plan.size });
    if (act === 'share') {
      const url = SITE + '#plan=' + [...plan].join(',');
      if (navigator.share && coarse) { try { await navigator.share({ title: 'My ADE 2026 plan', url }); } catch {} return; }
      try { await navigator.clipboard.writeText(url); toast('Plan link copied'); } catch { toast(url); }
      return;
    }
    b.disabled = true; const label = b.textContent; b.textContent = 'Drawing…';
    try {
      const { renderPlan, canvasToPdf } = await import('./export.js');
      const items = planItems().map(({ e, v, clash }) => ({ day: e[0], start: e[1], end: e[2], title: e[5], venue: v.vn[e[10]] || v.n, address: v.a, district: v.d, kind: e[4], free: e[3] === 1 ? 'FREE' : e[3] === 2 ? 'FREE?' : '', clash }));
      const cv = await renderPlan(items, { site: SITE, layout: X.layout, theme: X.theme });
      track('export-style', { layout: X.layout });
      const blob = act === 'pdf' ? await canvasToPdf(cv) : await new Promise(r => cv.toBlob(r, 'image/png'));
      const name = `my-ade-2026-plan.${act === 'pdf' ? 'pdf' : 'png'}`;
      const file = new File([blob], name, { type: blob.type });
      if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'My ADE 2026 plan' }); } catch {} }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
      setTimeout(() => { $('thankskick').textContent = 'Plan saved \u2713'; $('thanks').hidden = false; $('thanksclose').focus(); }, 700);
    } catch (err) { console.error(err); toast('Could not save the plan. Try the other format.'); }
    b.disabled = false; b.textContent = label;
  });
  if (COFFEE) { $('coffee').href = COFFEE; $('coffee').hidden = false; $('coffee').addEventListener('click', () => track('drink-click')); }
  $('thanksclose').addEventListener('click', () => { $('thanks').hidden = true; });
  $('beer').addEventListener('click', () => { $('thankskick').textContent = 'Enjoying the map?'; $('thanks').hidden = false; $('thanksclose').focus(); track('drink-open'); });
  $('thanks').addEventListener('click', e => { if (e.target === $('thanks')) $('thanks').hidden = true; });
  $('thanksshare').addEventListener('click', async () => {
    if (navigator.share && coarse) { try { await navigator.share({ title: 'ADE 2026 by night', url: SITE }); } catch {} return; }
    try { await navigator.clipboard.writeText(SITE); toast('Map link copied'); } catch { toast(SITE); }
  });
  head.addEventListener('click', e => {
    if (e.target.closest('#back')) { S.sel = -1; refresh(); return; }
    const b = e.target.closest('.dayjump'); if (b) setDay(+b.dataset.d);
  });
  const qEl = $('q'), qClear = $('qclear');
  let qt = 0;
  // Log a search once: after 4 s without typing, or when a result is picked. Includes how many results it found.
  let qTrack = 0, lastLogged = '';
  const logSearch = () => {
    const q = qEl.value.trim().toLowerCase().slice(0, 60);
    if (q.length < 2 || q === lastLogged) return;
    lastLogged = q;
    let n = 0; for (const v of V) n += evFor(v).length;
    track('search', { q, results: n });
  };
  function setQuery(text) {
    clearTimeout(qTrack);
    if (text.trim().length > 1) qTrack = setTimeout(logSearch, 4000);
    S.q = fold(text).split(/\s+/).filter(Boolean);
    qClear.hidden = !text;
    S.sel = -1;
    refresh();
  }
  qEl.addEventListener('focus', () => { if (mobile() && S.sheet === 'peek') setSheet('half'); });
  qEl.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => setQuery(qEl.value), 140); });
  qClear.addEventListener('click', () => { qEl.value = ''; setQuery(''); qEl.focus(); });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('thanks').hidden) { $('thanks').hidden = true; return; }
    if (document.activeElement === qEl && qEl.value) { qEl.value = ''; setQuery(''); }
    else if (S.sel >= 0) { S.sel = -1; refresh(); }
  });

  // ---------- share and deep links (#d=2&t=night&q=techno&p=12&v=heat) ----------
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.has('d') && +h.get('d') >= -1 && +h.get('d') < 5) S.day = +h.get('d');
    if (h.has('t') && SLOTS.some(s => s[0] === h.get('t'))) S.slot = h.get('t');
    if (h.has('v') && VIEWS.some(s => s[0] === h.get('v'))) S.view = h.get('v');
    if (h.has('f')) S.free = h.get('f') === '1';
    if (h.has('g')) S.genresIn = h.get('g');
    if (h.has('h')) S.hideSoldIn = h.get('h') === '1';
    if (h.has('q')) S.qText = h.get('q');
    if (h.has('p') && V[+h.get('p')]) S.sel = +h.get('p');
    if (h.has('plan')) S.planIn = h.get('plan').split(',');
  }
  function writeHash() {
    if (S.tab === 'plan') { try { history.replaceState(null, '', '#plan=' + [...plan].join(',')); } catch {} return; }
    const h = new URLSearchParams({ d: S.day, t: S.slot, v: S.view, f: S.free ? 1 : 0 });
    if (S.genres.size) h.set('g', [...S.genres].join(','));
    if (S.hideSold) h.set('h', 1);
    if (qEl.value) h.set('q', qEl.value);
    if (S.sel >= 0) h.set('p', S.sel);
    try { history.replaceState(null, '', '#' + h.toString()); } catch {}
  }
  $('share').addEventListener('click', async () => {
    track('share-map');
    writeHash();
    const url = location.href, title = S.sel >= 0 ? `${V[S.sel].n} at ADE 2026` : 'ADE 2026 by night';
    if (navigator.share && coarse) { try { await navigator.share({ title, url }); } catch {} return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
  });
  let tt = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 2600); }

  // ---------- picking and camera flights ----------
  let flight = null;
  function moveTo(t, p, speed = 0.06) { flight = { t: 0, speed, fromT: controls.target.clone(), toT: t, fromP: camera.position.clone(), toP: p }; wake(); }
  function flyTo(x, z) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    const d = Math.min(camera.position.distanceTo(controls.target), 1500);
    const tgt = new THREE.Vector3(x, 0, z);
    // On phones the list covers the bottom of the screen, so aim a little past the venue to lift it into view.
    if (mobile()) tgt.add(new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(d * 0.12));
    moveTo(tgt, tgt.clone().add(dir.multiplyScalar(d)), 0.03);
  }
  // On-screen controls: pan by a fifth of the view, zoom by 1.6x, turn by 30 degrees, flip between top-down and tilted.
  function nav(a) {
    // Chain onto a flight that is still running, so a quick click after selecting a venue does not undo the fly-to.
    const baseT = flight ? flight.toT : controls.target, baseP = flight ? flight.toP : camera.position;
    const off = baseP.clone().sub(baseT), d = off.length();
    const fwd = new THREE.Vector3(-off.x, 0, -off.z).normalize(), right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const step = d * 0.2, t = baseT.clone();
    if (a === 'up') t.addScaledVector(fwd, step);
    if (a === 'down') t.addScaledVector(fwd, -step);
    if (a === 'left') t.addScaledVector(right, -step);
    if (a === 'right') t.addScaledVector(right, step);
    if (['up', 'down', 'left', 'right'].includes(a)) return moveTo(t, t.clone().add(off));
    if (a === 'in' || a === 'out') {
      const nd = THREE.MathUtils.clamp(d * (a === 'in' ? 0.62 : 1.6), controls.minDistance, controls.maxDistance);
      return moveTo(t, t.clone().add(off.setLength(nd)));
    }
    const sph = new THREE.Spherical().setFromVector3(off);
    if (a === 'rotl' || a === 'rotr') sph.theta += (a === 'rotl' ? 1 : -1) * Math.PI / 6;
    if (a === 'tilt') sph.phi = sph.phi > 0.25 ? 0.02 : THREE.MathUtils.degToRad(44);
    if (a === 'north') sph.theta = THREE.MathUtils.degToRad(180);
    if (a === 'home') return moveTo(HOME.t.clone(), HOME.p.clone(), 0.04);
    moveTo(t, t.clone().add(new THREE.Vector3().setFromSpherical(sph)));
  }
  $('nav').addEventListener('click', e => { const b = e.target.closest('button[data-nav]'); if (b) nav(b.dataset.nav); });
  function select(i, fly) {
    if (S.q.length) { clearTimeout(qTrack); logSearch(); }
    track('venue', { venue: V[i].n.slice(0, 80) });
    if (S.tab === 'plan') { S.tab = 'events'; document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === 'events')); $('side').classList.remove('planmode'); }
    S.sel = i; refresh();
    if (fly) flyTo(V[i].x, V[i].z);
    if (mobile()) { setFilters(false); qEl.blur(); setSheet('peek'); }
  }
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), tip = $('tip');
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const h = ray.intersectObjects(hits.filter(m => m.parent.visible), false)[0];
    return h ? h.object.userData.i : -1;
  }
  const pointers = new Set();
  let down = null, multi = false;
  canvas.addEventListener('pointerdown', e => { pointers.add(e.pointerId); if (pointers.size > 1) multi = true; else { down = [e.clientX, e.clientY]; multi = false; } });
  canvas.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
  canvas.addEventListener('pointerup', e => {
    pointers.delete(e.pointerId);
    if (multi || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const i = pick(e.clientX, e.clientY);
    if (i >= 0) select(i, true);
    else if (S.sel >= 0) { S.sel = -1; refresh(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) { tip.hidden = true; return; }
    const i = pick(e.clientX, e.clientY);
    canvas.style.cursor = i >= 0 ? 'pointer' : '';
    if (i < 0) { tip.hidden = true; return; }
    const v = V[i];
    tip.innerHTML = `${esc(v.n)}<br><span>${v.c} event${v.c > 1 ? 's' : ''}${v.nf ? ', ' + v.nf + ' free' : ''}</span>`;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 250) + 'px'; tip.style.top = e.clientY + 12 + 'px'; tip.hidden = false;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); wake();
  }
  addEventListener('resize', resize); resize();
  countPlan();
  if (S.planIn) {
    let n = 0;
    for (const k of S.planIn) if (KEY.has(k) && !plan.has(k)) { plan.add(k); n++; }
    store.set('adem-plan', JSON.stringify([...plan])); countPlan();
    S.tab = 'plan'; $('side').classList.add('planmode');
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === 'plan'));
    setTimeout(() => toast(n ? `Added ${n} shared event${n === 1 ? '' : 's'} to My plan` : 'Shared plan opened'), 400);
  }
  if (S.qText) { qEl.value = S.qText; S.q = fold(S.qText).split(/\s+/).filter(Boolean); qClear.hidden = false; }
  refresh();
  if (S.sel >= 0) flyTo(V[S.sel].x, V[S.sel].z);

  // Render only when something moves: camera, flights, tiles rising, or the slow pulse in beam view.
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    uniforms.uNow.value = now / 1000;
    if (flight) {
      flight.t = Math.min(flight.t + (reduce ? 1 : flight.speed), 1);
      const k = flight.t * flight.t * (3 - 2 * flight.t);
      controls.target.lerpVectors(flight.fromT, flight.toT, k);
      camera.position.lerpVectors(flight.fromP, flight.toP, k);
      if (flight.t >= 1) flight = null;
      dirty = true;
    }
    const sv = S.sel >= 0 ? V[S.sel] : null;
    arrow.visible = ring.visible = !!(sv && sv.g.visible);
    if (arrow.visible) {
      const sz = camera.position.distanceTo(controls.target) * 0.022, t = now / 1000;
      const bob = reduce ? 0 : Math.abs(Math.sin(t * 3.2)) * 1.4;
      arrow.scale.setScalar(sz);
      arrow.position.set(sv.x, (sv.bh || 20) + sz * (0.6 + bob), sv.z);
      ring.position.set(sv.x, 0.6, sv.z);
      const pulse = reduce ? 1 : 1 + 0.35 * ((t * 1.2) % 1);
      ring.scale.setScalar(Math.max(sv.bw || 20, 18) * 1.4 * pulse);
      pinkSoft.opacity = reduce ? 0.35 : 0.45 * (1 - ((t * 1.2) % 1));
      dirty = true;
    }
    if (S.view === 'beams' && !reduce && !document.hidden) {
      const pulse = 0.13 + 0.05 * Math.sin(now / 1000 * 2.2);
      for (const v of V) if (v.g.visible) v.g.userData.halo.material.opacity = pulse;
      dirty = true;
    }
    controls.update();
    if (dirty || now < busyUntil) { renderer.render(scene, camera); dirty = false; }
  });
}

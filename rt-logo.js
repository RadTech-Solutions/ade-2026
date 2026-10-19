// <rt-logo mode="shuffle|wave|beat" size="18"> : the RadTech 3x3 grid, with the lit squares moving around.
// shuffle: every beat the three teal and two amber squares jump to new spots.
// wave:    a diagonal sweep lights the grid corner to corner, like a level meter.
// beat:    the base pattern stays, and one square at a time slowly glows up and fades back.
const TEAL = '#5FDDCF', AMBER = '#E6A85C', DIM = 'rgba(236,231,218,.38)', BG = '#0B1322';
const BASE = [TEAL, DIM, AMBER, DIM, TEAL, DIM, AMBER, DIM, TEAL];
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

class RtLogo extends HTMLElement {
  connectedCallback() {
    const size = +(this.getAttribute('size') || 18), plate = this.hasAttribute('plate');
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{display:inline-block;width:${size}px;height:${size}px;line-height:0;vertical-align:middle}
      .p{width:100%;height:100%;box-sizing:border-box;border-radius:${plate ? '22%' : '0'};background:${plate ? BG : 'transparent'};padding:${plate ? '14%' : '0'};display:grid;grid-template-columns:repeat(3,1fr);gap:${plate ? '6%' : '9%'}}
      i{border-radius:22%;background:${DIM};transition:background-color var(--fade,.45s) ease-in-out, box-shadow var(--fade,.45s) ease-in-out, transform var(--fade,.45s) ease-in-out}
      i.hot{box-shadow:0 0 ${Math.max(2, size / 6)}px currentColor;transform:scale(1.08)}
    </style><div class="p">${'<i></i>'.repeat(9)}</div>`;
    this.cells = [...root.querySelectorAll('i')];
    this.paint(BASE);
    if (reduce) return;
    this.mode = this.getAttribute('mode') || 'shuffle';
    this.step = 0;
    const ms = { shuffle: 1100, wave: 160, beat: 2200 }[this.mode] || 1100;
    if (this.mode === 'beat') this.shadowRoot.host.style.setProperty('--fade', '1.6s');
    this.timer = setInterval(() => this.tick(), ms);
  }
  disconnectedCallback() { clearInterval(this.timer); }
  paint(cols, hot = []) {
    this.cells.forEach((c, i) => { c.style.backgroundColor = cols[i]; c.style.color = cols[i]; c.classList.toggle('hot', hot.includes(i)); });
  }
  tick() {
    const n = this.step++;
    if (this.mode === 'shuffle') {
      const idx = [...Array(9).keys()].sort(() => Math.random() - 0.5);
      const cols = Array(9).fill(DIM);
      idx.slice(0, 3).forEach(i => { cols[i] = TEAL; });
      idx.slice(3, 5).forEach(i => { cols[i] = AMBER; });
      this.paint(cols);
    } else if (this.mode === 'wave') {
      // Diagonals 0..4 light up in turn, then the grid rests on the logo for a moment.
      const phase = n % 14;
      if (phase >= 9) return this.paint(BASE);
      const d = phase % 5, cols = Array(9).fill(DIM), hot = [];
      for (let i = 0; i < 9; i++) {
        const k = (i % 3) + Math.floor(i / 3);
        if (k === d) { cols[i] = d % 2 ? AMBER : TEAL; hot.push(i); }
        else if (k === d - 1) cols[i] = d % 2 ? TEAL : AMBER;
      }
      this.paint(cols, hot);
    } else {
      // Every other tick lights one new square; the tick between lets it fade back to the logo.
      if (n % 2) return this.paint(BASE);
      let a; do { a = Math.floor(Math.random() * 9); } while (a === this.last);
      this.last = a;
      const cols = BASE.slice();
      cols[a] = cols[a] === DIM ? (Math.random() < 0.6 ? TEAL : AMBER) : '#FFFFFF';
      this.paint(cols, [a]);
    }
  }
}
if (!customElements.get('rt-logo')) customElements.define('rt-logo', RtLogo);

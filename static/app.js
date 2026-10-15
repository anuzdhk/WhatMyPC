// WhatsMyPC 2.0 — dashboard frontend (vanilla JS, no external dependencies)
'use strict';

/* ================================================================
   Core utilities
   ================================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Tagged template that escapes every interpolation unless it is already Safe HTML.
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
const toHtml = v => v == null || v === false ? '' : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(toHtml).join('') : esc(v);
const h = (strs, ...vals) => new Safe(strs.reduce((o, s, i) => o + s + (i < vals.length ? toHtml(vals[i]) : ''), ''));
const raw = s => new Safe(String(s));
const ic = n => raw(`<svg aria-hidden="true"><use href="#i-${n}"/></svg>`);

const store = {
  get(k, d) { try { const v = localStorage.getItem('wmpc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('wmpc.' + k, JSON.stringify(v)); } catch (e) {} },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lvl = (p, warn = 75, bad = 90) => p >= bad ? 'bad' : p >= warn ? 'warn' : 'ok';
const nz = v => v != null && !Number.isNaN(v);

function fmtBytes(b, d = 1) {
  if (!nz(b) || b < 0) return '–';
  if (b === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const v = b / 1024 ** i;
  return (i === 0 ? Math.round(v) : v.toFixed(v >= 100 ? 0 : d)) + ' ' + u[i];
}
const fmtRate = b => nz(b) ? fmtBytes(b) + '/s' : '–';
const fmtPct = v => nz(v) ? Math.round(v) + '%' : '–';
function fmtTemp(c) {
  if (!nz(c)) return '–';
  return settings.unit === 'F' ? Math.round(c * 9 / 5 + 32) + ' °F' : Math.round(c) + ' °C';
}
function fmtDur(sec) {
  if (!nz(sec)) return '–';
  const d = Math.floor(sec / 86400), hh = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? `${d}d ${hh}h ${m}m` : hh ? `${hh}h ${m}m` : `${m}m ${Math.floor(sec % 60)}s`;
}
const toDate = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };
const fmtDate = (v, time) => { const d = toDate(v); return d ? (time ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : d.toLocaleDateString([], { dateStyle: 'medium' })) : '–'; };
function ago(v) {
  const d = toDate(v); if (!d) return '–';
  const s = (Date.now() - d) / 1000;
  if (s < 60) return 'just now';
  const units = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [n, u] of units) if (s >= n) { const k = Math.floor(s / n); return `${k} ${u}${k > 1 ? 's' : ''} ago`; }
}
const mhzStr = m => nz(m) && m > 0 ? (m / 1000).toFixed(2) + ' GHz' : '–';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const trimDrive = l => String(l || '').replace(/[\\:]+$/, '');

/* ================================================================
   API
   ================================================================ */
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return t; }
}
const post = (path, body) => api(path, {
  method: 'POST',
  headers: Object.assign({ 'X-WhatsMyPC': '1' }, body ? { 'Content-Type': 'application/json' } : {}),
  body: body ? JSON.stringify(body) : undefined,
});
const infoCache = new Map();
function info(sec, force) {
  if (force || !infoCache.has(sec)) {
    const p = api('/api/info/' + sec).catch(e => { infoCache.delete(sec); throw e; });
    infoCache.set(sec, p);
  }
  return infoCache.get(sec);
}

/* ================================================================
   Settings (local) + server settings
   ================================================================ */
const settings = Object.assign({ theme: 'dark', accent: '#ff5a1f', compact: false, refresh: 1000, unit: 'C' }, {
  theme: store.get('theme', 'dark'), accent: store.get('accent', '#ff5a1f'), compact: store.get('compact', false),
  refresh: store.get('refresh', 1000), unit: store.get('unit', 'C'),
});
let srv = null; // server-side settings object

const resolvedTheme = () => settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : settings.theme;
function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.style.setProperty('--accent', settings.accent);
  root.classList.toggle('compact', !!settings.compact);
  $('#bTheme use').setAttribute('href', resolvedTheme() === 'dark' ? '#i-sun' : '#i-moon');
  Chart.all.forEach(c => c.draw());
}
function setSetting(k, v) {
  settings[k] = v; store.set(k, v);
  if (['theme', 'accent', 'compact'].includes(k)) applyAppearance();
  if (k === 'theme' || k === 'compact') saveServer({ theme: resolvedTheme(), compact: !!settings.compact });
}
async function saveServer(patch) {
  try {
    if (!srv) srv = await api('/api/settings');
    srv = Object.assign({}, srv, patch);
    await post('/api/settings', srv);
    return true;
  } catch (e) { return false; }
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => settings.theme === 'system' && applyAppearance());

/* ================================================================
   Live telemetry
   ================================================================ */
const HIST = 120;
const L = {
  d: null, fails: 0, last: 0,
  hist: { cpu: [], mem: [], gpu: [], dr: [], dw: [], busy: [], rx: [], tx: [] },
  peak: { cpu: 0, mem: 0, rx: 0, tx: 0 },
  sess: { rx: 0, tx: 0, since: Date.now() },
};
const memPct = d => d?.mem?.total ? d.mem.used / d.mem.total * 100 : null;

function pushHist(d) {
  const H = L.hist;
  const add = (k, v) => { H[k].push(v); if (H[k].length > HIST) H[k].shift(); };
  add('cpu', d.cpu?.total ?? null); add('mem', memPct(d)); add('gpu', d.gpu?.util ?? null);
  add('dr', d.disk?.r ?? 0); add('dw', d.disk?.w ?? 0); add('busy', d.disk?.busy ?? 0);
  add('rx', d.net?.rx ?? 0); add('tx', d.net?.tx ?? 0);
}

async function pollLive() {
  try {
    const d = await api('/api/live');
    const now = Date.now();
    if (L.last) { const dt = Math.min(10, (now - L.last) / 1000); L.sess.rx += (d.net?.rx || 0) * dt; L.sess.tx += (d.net?.tx || 0) * dt; }
    L.last = now; L.d = d; L.fails = 0;
    L.peak.cpu = Math.max(L.peak.cpu, d.cpu?.total || 0);
    L.peak.mem = Math.max(L.peak.mem, memPct(d) || 0);
    L.peak.rx = Math.max(L.peak.rx, d.net?.rx || 0);
    L.peak.tx = Math.max(L.peak.tx, d.net?.tx || 0);
    pushHist(d);
    $('#offline').hidden = true;
    shellUpdate(d);
    Alerts.check(d);
    try { view?.update?.(d); } catch (e) { console.error(e); }
  } catch (e) {
    if (++L.fails >= 3) $('#offline').hidden = false;
  }
  setTimeout(pollLive, settings.refresh);
}

async function preloadHistory() {
  try {
    const rec = await api('/api/recent');
    if (Array.isArray(rec)) rec.slice(-HIST).forEach(pushHist);
  } catch (e) {}
}

function shellUpdate(d) {
  const hl = d.health || {};
  const hEl = $('#health');
  hEl.className = 'health ' + (hl.level || '');
  hEl.querySelector('span').textContent = hl.level ? `${hl.level} · ${hl.score}` : '…';
  const c = d.cpu?.total, m = memPct(d);
  $('#sfCpu').style.width = clamp(c || 0, 0, 100) + '%'; $('#sfCpuV').textContent = fmtPct(c);
  $('#sfRam').style.width = clamp(m || 0, 0, 100) + '%'; $('#sfRamV').textContent = fmtPct(m);
  $('#sfCpu').style.background = `var(--${lvl(c || 0) === 'ok' ? 'accent' : lvl(c || 0)})`;
  $('#sfRam').style.background = `var(--${lvl(m || 0) === 'ok' ? 'c-mem' : lvl(m || 0)})`;
}

/* ================================================================
   Charts (canvas)
   ================================================================ */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
// Same, but in 1024-based units so byte axes read 500 KB / 1 MB rather than 488 KB
function niceBytes(v) { const p = 1024 ** Math.max(0, Math.floor(Math.log(Math.max(v, 1)) / Math.log(1024))); return niceMax(v / p) * p; }
class Chart {
  static all = new Set();
  // series: [{ label, color: '--css-var', get: () => array }]
  constructor(cv, o) {
    this.cv = cv;
    this.o = Object.assign({ max: 100, axis: false, fmt: fmtPct, fmtAxis: v => Math.round(v) + '%' }, o);
    this.hx = null;
    this.ro = new ResizeObserver(() => this.size());
    this.ro.observe(cv);
    if (this.o.axis) {
      cv.addEventListener('mousemove', e => { this.hx = e.clientX - cv.getBoundingClientRect().left; this.draw(); });
      cv.addEventListener('mouseleave', () => { this.hx = null; this.draw(); });
    }
    Chart.all.add(this);
    this.size();
  }
  size() {
    const d = devicePixelRatio || 1, w = this.cv.clientWidth, hh = this.cv.clientHeight;
    if (!w || !hh) return;
    this.cv.width = w * d; this.cv.height = hh * d; this.w = w; this.h = hh; this.d = d;
    this.draw();
  }
  draw() {
    const { cv, w, h: hh, d, o } = this;
    if (!w || !cv.isConnected) return;
    const x = cv.getContext('2d');
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, w, hh);
    const cs = getComputedStyle(document.documentElement);
    const col = v => { x.fillStyle = cs.getPropertyValue(v).trim() || '#888'; return x.fillStyle; };
    const alpha = (c, a) => c.startsWith('#') && c.length === 7 ? c + Math.round(a * 255).toString(16).padStart(2, '0') : c;
    const data = o.series.map(s => s.get() || []);
    const padL = o.axis ? 52 : 0, padB = o.axis ? 6 : 0, padT = o.axis ? 10 : 3;
    const W = w - padL, H = hh - padB - padT;
    let max = o.max;
    if (max === 'auto') max = (o.bytes ? niceBytes : niceMax)(Math.max(o.minMax || 1, ...data.flat().filter(nz)));
    if (o.axis) {
      x.font = '11px "Segoe UI", system-ui'; x.textAlign = 'right'; x.textBaseline = 'middle';
      const line = col('--line'), t3 = col('--t3');
      for (let i = 0; i <= 4; i++) {
        const y = Math.round(padT + H - H * i / 4) + .5;
        x.strokeStyle = line; x.lineWidth = 1; x.beginPath(); x.moveTo(padL, y); x.lineTo(w, y); x.stroke();
        x.fillStyle = t3; x.fillText(o.fmtAxis(max * i / 4), padL - 10, y);
      }
    }
    const step = W / (HIST - 1);
    const pts = data.map(arr => {
      const off = HIST - arr.length;
      return arr.map((v, i) => nz(v) ? [padL + (off + i) * step, padT + H - clamp(v / max, 0, 1) * H] : null);
    });
    o.series.forEach((s, si) => {
      const p = pts[si].filter(Boolean);
      if (p.length < 2) return;
      const c = col(s.color);
      x.beginPath();
      p.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py));
      x.strokeStyle = c; x.lineWidth = o.axis ? 2 : 1.8; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke();
      if (!s.noFill) {
        x.lineTo(p.at(-1)[0], padT + H); x.lineTo(p[0][0], padT + H); x.closePath();
        const g = x.createLinearGradient(0, padT, 0, padT + H);
        g.addColorStop(0, alpha(c, o.series.length > 1 ? .14 : .24)); g.addColorStop(1, alpha(c, 0));
        x.fillStyle = g; x.fill();
      }
    });
    if (o.axis && this.hx != null && this.hx > padL) {
      const idx = clamp(Math.round((this.hx - padL) / step), 0, HIST - 1);
      const px = padL + idx * step;
      const rows = o.series.map((s, si) => {
        const arr = data[si], v = arr[idx - (HIST - arr.length)];
        return { s, v, p: pts[si][idx - (HIST - arr.length)] };
      }).filter(r => r.p);
      if (!rows.length) return;
      x.strokeStyle = col('--line2'); x.lineWidth = 1; x.setLineDash([3, 3]);
      x.beginPath(); x.moveTo(px + .5, padT); x.lineTo(px + .5, padT + H); x.stroke(); x.setLineDash([]);
      rows.forEach(r => { x.fillStyle = col(r.s.color); x.beginPath(); x.arc(r.p[0], r.p[1], 4, 0, 7); x.fill(); x.strokeStyle = col('--s1'); x.lineWidth = 2; x.stroke(); });
      const secs = Math.round((HIST - 1 - idx) * settings.refresh / 1000);
      const lines = [secs ? `${secs}s ago` : 'now', ...rows.map(r => `${r.s.label}  ${o.fmt(r.v)}`)];
      x.font = '600 12px "Segoe UI", system-ui';
      const bw = Math.max(...lines.map(l => x.measureText(l).width)) + 22, bh = lines.length * 18 + 12;
      let bx = px + 12; if (bx + bw > w) bx = px - bw - 12;
      x.fillStyle = col('--s1'); x.strokeStyle = col('--line2'); x.lineWidth = 1;
      x.beginPath(); x.roundRect(bx, padT + 4, bw, bh, 8); x.fill(); x.stroke();
      x.textAlign = 'left'; x.textBaseline = 'top';
      lines.forEach((l, i) => { x.fillStyle = i ? col('--t1') : col('--t3'); x.fillText(l, bx + 11, padT + 11 + i * 18); });
    }
  }
  destroy() { this.ro.disconnect(); Chart.all.delete(this); }
}
const histGet = k => () => L.hist[k];

/* ================================================================
   UI primitives
   ================================================================ */
function toast(title, msg = '', type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = h`${ic(type === 'ok' ? 'check' : type === 'bad' ? 'x' : type === 'warn' ? 'alert' : 'info')}<div><b>${title}</b>${msg}</div>`;
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 4800);
}

function modal({ title, body, ok = 'Confirm', danger = false, cancel = 'Cancel' }) {
  return new Promise(res => {
    const s = document.createElement('div');
    s.className = 'scrim';
    s.innerHTML = h`<div class="modal" role="dialog" aria-modal="true" aria-label="${title}"><h3>${title}</h3><p>${body}</p>
      <div class="acts">${cancel ? h`<button class="btn ghost" data-r="0">${cancel}</button>` : ''}<button class="btn ${danger ? 'danger' : 'pri'}" data-r="1">${ok}</button></div></div>`;
    const done = v => { s.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    s.addEventListener('click', e => { if (e.target === s) done(false); const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); });
    document.addEventListener('keydown', key, true);
    $('#layer').append(s);
    s.querySelector('[data-r="1"]').focus();
  });
}

async function copyText(text, label = 'Copied to clipboard') {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
  if (!ok) {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  ok ? toast(label, '', 'ok') : toast('Copy failed', 'Clipboard access was blocked.', 'bad');
}
const cp = v => v ? h`<button class="copy" data-copy="${v}" title="Copy" aria-label="Copy">${ic('copy')}</button>` : '';
document.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy); });

function download(name, text, mime = 'application/json') {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

const ph = (title, desc, acts) => h`<div class="ph"><div><h1>${title}</h1>${desc ? h`<p>${desc}</p>` : ''}</div>${acts ? h`<div class="acts">${acts}</div>` : ''}</div>`;
const card = (title, icon, body, { cls = '', right = '' } = {}) =>
  h`<section class="card ${cls}">${title ? h`<div class="ch"><h3>${icon ? ic(icon) : ''}${title}</h3>${right ? h`<div class="r">${right}</div>` : ''}</div>` : ''}${body}</section>`;
const skel = (n = 4) => h`<div class="skl">${Array.from({ length: n }, (_, i) => h`<div class="sk" style="width:${90 - (i % 3) * 18}%"></div>`)}</div>`;
const empty = (icon, title, msg) => h`<div class="empty">${ic(icon)}<b>${title}</b>${msg || ''}</div>`;
const errBox = e => empty('alert', 'Could not load this section', String(e?.message || e));
const meter = (pct, cls = '', color) => h`<div class="meter ${cls}"><i style="width:${clamp(pct || 0, 0, 100)}%;${color ? `--c:${color}` : ''}"></i></div>`;
const kv = rows => h`<dl class="kv">${rows.filter(Boolean).map(([k, v, copy]) => h`<dt>${k}</dt><dd>${v == null || v === '' ? h`<span class="t3">–</span>` : v}${copy ? cp(copy) : ''}</dd>`)}</dl>`;
const stats = items => h`<div class="stats">${items.map(([k, v, id]) => h`<div><span>${k}</span><b ${id ? raw(`id="${id}"`) : ''}>${v}</b></div>`)}</div>`;
const badge = (t, cls = '', icon) => h`<span class="badge ${cls}">${icon ? ic(icon) : ''}${t}</span>`;

const RING_C = 2 * Math.PI * 42;
const ring = (id, sz = 132, label = '', color = '--accent') => h`<div class="ring" id="${id}" style="--sz:${sz}px;--c:var(${color})">
  <svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="42" stroke-width="9"/><circle class="fg" cx="50" cy="50" r="42" stroke-width="9" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>
  <div class="lab"><b>–</b><span>${label}</span></div></div>`;
function setRing(id, pct, text, color) {
  const r = document.getElementById(id); if (!r) return;
  r.querySelector('.fg').style.strokeDashoffset = RING_C * (1 - clamp(pct || 0, 0, 100) / 100);
  r.querySelector('b').textContent = text ?? fmtPct(pct);
  if (color) r.style.setProperty('--c', `var(${color})`);
}
const lvlVar = l => l === 'bad' ? '--bad' : l === 'warn' ? '--warn' : null;
const setText = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
const setHTML = (id, t) => { const e = document.getElementById(id); if (e) e.innerHTML = t; };
const setW = (id, p) => { const e = document.getElementById(id); if (e) e.style.width = clamp(p || 0, 0, 100) + '%'; };

/* ---------------- Data table ---------------- */
function dataTable(host, o) {
  const st = { q: '', sort: o.sort?.k || null, dir: o.sort?.dir || 1, filter: 0, rows: o.rows || [] };
  const cols = o.cols;
  const val = (c, r) => c.v ? c.v(r) : r[c.k];
  const text = r => cols.map(c => { const v = val(c, r); return v == null ? '' : String(v); }).join(' ').toLowerCase();
  host.innerHTML = h`<div class="tbar">
      ${o.search !== false ? h`<label class="search-in">${ic('search')}<input type="search" placeholder="${o.search || 'Search…'}" aria-label="Search table"></label>` : ''}
      ${o.filters ? h`<div class="row fl">${o.filters.map((f, i) => h`<button class="chip ${i === 0 ? 'on' : ''}" data-f="${i}">${f.label}<span class="n"></span></button>`)}</div>` : ''}
      <span class="cnt"></span>${o.tools || ''}
      ${o.exportName ? h`<button class="btn sm ghost" data-export>${ic('download')}Export CSV</button>` : ''}
    </div>
    <div class="tscroll" ${o.max ? raw(`style="--tmax:${o.max}"`) : ''}><table class="t"><thead><tr>${cols.map((c, i) => h`<th class="${c.sort !== false ? 's' : ''} ${c.r ? 'r' : ''}" data-c="${i}" ${c.w ? raw(`style="width:${c.w}"`) : ''}>${c.label}<span class="ar"></span></th>`)}</tr></thead><tbody></tbody></table></div>`;
  const tb = $('tbody', host), cnt = $('.cnt', host);
  function view() {
    let rows = st.rows;
    if (o.filters) rows = rows.filter(o.filters[st.filter].test);
    if (st.q) rows = rows.filter(r => text(r).includes(st.q));
    if (st.sort != null) {
      const c = cols[st.sort];
      rows = [...rows].sort((a, b) => {
        let x = c.s ? c.s(a) : val(c, a), y = c.s ? c.s(b) : val(c, b);
        if (x == null) return 1; if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }) : x - y) * st.dir;
      });
    }
    return rows;
  }
  function render() {
    const rows = view(), lim = o.limit || 400;
    tb.innerHTML = rows.length
      ? h`${rows.slice(0, lim).map(r => h`<tr ${o.rowAttr ? o.rowAttr(r) : ''}>${cols.map(c => h`<td class="${c.r ? 'n' : ''} ${c.cls || ''}">${c.cell ? c.cell(r) : val(c, r) ?? '–'}</td>`)}</tr>`)}`
      : h`<tr><td colspan="${cols.length}" style="height:auto">${empty('search', st.rows.length ? 'No matches' : (o.emptyTitle || 'Nothing here'), st.rows.length ? 'Try a different search or filter.' : (o.emptyMsg || ''))}</td></tr>`;
    cnt.textContent = rows.length === st.rows.length ? plural(rows.length, o.noun || 'item') : `${rows.length} of ${st.rows.length}`;
    if (rows.length > lim) cnt.textContent += ` · showing first ${lim}`;
    $$('th', host).forEach((th, i) => { th.classList.toggle('on', i === st.sort); $('.ar', th).textContent = i === st.sort ? (st.dir > 0 ? '↑' : '↓') : ''; });
    if (o.filters) $$('[data-f]', host).forEach((b, i) => { $('.n', b).textContent = ' ' + st.rows.filter(o.filters[i].test).length; });
  }
  if (o.sort) st.sort = cols.findIndex(c => c.k === o.sort.k || c.id === o.sort.k);
  $('input[type=search]', host)?.addEventListener('input', e => { st.q = e.target.value.trim().toLowerCase(); render(); });
  $('thead', host).addEventListener('click', e => {
    const th = e.target.closest('th.s'); if (!th) return;
    const i = +th.dataset.c;
    if (st.sort === i) st.dir *= -1; else { st.sort = i; st.dir = cols[i].r ? -1 : 1; }
    render();
  });
  host.addEventListener('click', e => {
    const f = e.target.closest('[data-f]');
    if (f) { st.filter = +f.dataset.f; $$('[data-f]', host).forEach(b => b.classList.toggle('on', b === f)); render(); }
    if (e.target.closest('[data-export]')) {
      const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const csv = [cols.map(c => q(c.label)).join(','), ...view().map(r => cols.map(c => q(c.csv ? c.csv(r) : val(c, r))).join(','))].join('\r\n');
      download(`${o.exportName}-${stamp()}.csv`, '\ufeff' + csv, 'text/csv');
    }
  });
  render();
  return { set(rows) { st.rows = rows || []; render(); }, rows: () => st.rows };
}

/* ================================================================
   Actions
   ================================================================ */
const Actions = {
  async specs() {
    try { const t = await api('/api/specs'); await copyText(String(t).trim() + '\n\nGenerated by WhatsMyPC', 'Specs copied to clipboard'); }
    catch (e) { toast('Could not read specs', e.message, 'bad'); }
  },
  async shot() {
    try { const r = await post('/api/screenshot'); r?.file ? toast('Screenshot saved', r.file, 'ok') : toast('Screenshot failed', '', 'bad'); }
    catch (e) { toast('Screenshot failed', e.message, 'bad'); }
  },
  async overlay() {
    try { await post('/api/overlay'); toast('Gaming overlay opened', 'A compact always-on-top HUD is now running.', 'ok'); }
    catch (e) { toast('Overlay failed', e.message, 'bad'); }
  },
  theme() { setSetting('theme', resolvedTheme() === 'dark' ? 'light' : 'dark'); },
  sidebar() { setSetting('compact', !settings.compact); },
  async clean() {
    const ok = await modal({ title: 'Clean temporary files?', body: 'Removes files in the Windows and user Temp folders and web caches. Files that are in use are skipped. This cannot be undone.', ok: 'Clean now', danger: true });
    if (!ok) return null;
    try {
      const r = await post('/api/cleanup');
      const log = store.get('cleanLog', []); log.unshift({ t: new Date().toISOString(), freed: r.freed || 0 }); store.set('cleanLog', log.slice(0, 50));
      toast('Cleanup complete', `Freed ${fmtBytes(r.freed || 0)} of disk space.`, 'ok');
      return r;
    } catch (e) { toast('Cleanup failed', e.message, 'bad'); return null; }
  },
};

/* ================================================================
   Alerts engine (runs client-side on every live tick)
   ================================================================ */
const ALERT_DEFAULTS = [
  { id: 'cpu', label: 'CPU usage above', unit: '%', value: 90, secs: 30, on: true },
  { id: 'ram', label: 'Memory usage above', unit: '%', value: 90, secs: 30, on: true },
  { id: 'disk', label: 'Any drive free space below', unit: '%', value: 10, secs: 0, on: true },
  { id: 'cpuT', label: 'CPU temperature above', unit: '°C', value: 90, secs: 10, on: true },
  { id: 'gpuT', label: 'GPU temperature above', unit: '°C', value: 85, secs: 10, on: true },
];
const Alerts = {
  rules: (() => { const s = store.get('alerts', []); return ALERT_DEFAULTS.map(d => Object.assign({}, d, s.find(x => x.id === d.id) || {})); })(),
  since: {}, fired: {},
  COOLDOWN: 10 * 60 * 1000,
  save() { store.set('alerts', this.rules.map(({ id, value, secs, on }) => ({ id, value, secs, on }))); },
  metric(id, d) {
    if (id === 'cpu') return d.cpu?.total;
    if (id === 'ram') return memPct(d);
    if (id === 'cpuT') return d.cpu?.tempC;
    if (id === 'gpuT') return d.gpu?.tempC;
    if (id === 'disk') { const f = (d.drives || []).filter(x => x.total).map(x => x.free / x.total * 100); return f.length ? Math.min(...f) : null; }
  },
  check(d) {
    const now = Date.now();
    for (const r of this.rules) {
      const v = this.metric(r.id, d);
      const hit = r.on && nz(v) && (r.id === 'disk' ? v < r.value : v > r.value);
      if (!hit) { delete this.since[r.id]; continue; }
      this.since[r.id] ??= now;
      if (now - this.since[r.id] >= r.secs * 1000 && now - (this.fired[r.id] || 0) > this.COOLDOWN) {
        this.fired[r.id] = now;
        const shown = r.unit === '°C' ? fmtTemp(v) : fmtPct(v);
        const text = `${r.label.replace(/ (above|below)$/, '')} is ${shown} (limit ${r.unit === '°C' ? fmtTemp(r.value) : r.value + '%'})`;
        toast('Alert', text, 'warn');
        const log = store.get('alertLog', []); log.unshift({ t: new Date().toISOString(), id: r.id, text }); store.set('alertLog', log.slice(0, 200));
        setBadge('alerts', String(store.get('alertLog', []).length), 'warn');
      }
    }
  },
};

/* ================================================================
   Pages
   ================================================================ */
const GROUPS = ['Monitor', 'System', 'Tools'];
const PAGES = [];
const page = (id, group, title, icon, keys, render) => PAGES.push({ id, group, title, icon, keys, render });

const pickGpu = list => (list || []).find(g => /nvidia|radeon|amd|arc/i.test(g.name)) || (list || [])[0];
const memSummary = (m, sys) => {
  const mods = m?.modules || [];
  const total = mods.reduce((a, x) => a + (x.bytes || 0), 0) || sys?.ramBytes;
  const t = mods[0]?.type, sp = mods[0]?.configured || mods[0]?.speed;
  return [fmtBytes(total, 0), t, sp ? `${sp} MT/s` : ''].filter(Boolean).join(' · ');
};

/* ---------- Overview ---------- */
page('overview', 'Monitor', 'Overview', 'overview', 'home dashboard summary health', async (el, ctx) => {
  el.innerHTML = h`
    ${ph('Overview', h`<span id="ovSub">Your PC at a glance</span>`)}
    <div class="grid">
      <section class="card c12"><div class="hero">
        ${ring('ovHealth', 150, 'health score')}
        <div><h2 id="ovHeadline">Checking your PC…</h2><div class="sub" id="ovHealthSub">Analysing live telemetry</div>
        <div class="facts" id="ovFacts">${skel(3)}</div></div>
      </div></section>
      ${[['cpu', 'Processor', '--c-cpu'], ['mem', 'Memory', '--c-mem'], ['gpu', 'Graphics', '--c-gpu'], ['busy', 'Disk activity', '--c-disk']].map(([k, t, c]) => h`
        <section class="card c3"><div class="kpi" style="--c:var(${c})">
          <div class="lbl"><span class="dot"></span>${t}<span class="r" id="ov-${k}-r"></span></div>
          <div class="big num" id="ov-${k}">–</div><div class="meta" id="ov-${k}-m">&nbsp;</div>
        </div><canvas class="spark" id="ov-${k}-c"></canvas></section>`)}
      ${card('Network', 'network', h`<div class="row sp" style="margin-bottom:10px">
          <div class="legend"><span><i style="--c:var(--c-rx)"></i>Download <b class="num" id="ovRx">–</b></span><span><i style="--c:var(--c-tx)"></i>Upload <b class="num" id="ovTx">–</b></span></div>
          <span class="sub">Latency <b class="num" id="ovLat">–</b></span></div>
        <canvas class="chart sm" id="ovNet"></canvas>`, { cls: 'c8', right: h`<a class="btn sm ghost" href="#/network">Details ${ic('chev')}</a>` })}
      ${card('Drives', 'drive', h`<div id="ovDrives">${skel(4)}</div>`, { cls: 'c4', right: h`<a class="btn sm ghost" href="#/storage">Details ${ic('chev')}</a>` })}
      ${card('Recommendations', 'sparkle', h`<ul class="recs" id="ovRecs"></ul>`, { cls: 'c5' })}
      ${card('Top processes', 'list', h`<div id="ovTop"></div>`, { cls: 'c7 pad0', right: h`<a class="btn sm ghost" href="#/processes">All processes ${ic('chev')}</a>` })}
    </div>`;
  $('#ovTop').closest('.card').querySelector('.ch').style.cssText = 'padding:18px 20px 0';
  const charts = [
    new Chart($('#ov-cpu-c'), { series: [{ color: '--c-cpu', get: histGet('cpu') }] }),
    new Chart($('#ov-mem-c'), { series: [{ color: '--c-mem', get: histGet('mem') }] }),
    new Chart($('#ov-gpu-c'), { series: [{ color: '--c-gpu', get: histGet('gpu') }] }),
    new Chart($('#ov-busy-c'), { series: [{ color: '--c-disk', get: histGet('busy') }] }),
    new Chart($('#ovNet'), { axis: true, max: 'auto', minMax: 64 * 1024, bytes: true, fmt: fmtRate, fmtAxis: v => fmtBytes(v, 0), series: [{ label: 'Down', color: '--c-rx', get: histGet('rx') }, { label: 'Up', color: '--c-tx', get: histGet('tx') }] }),
  ];
  ctx.onDestroy(() => charts.forEach(c => c.destroy()));

  const [sys, cpu, mem, gpu, sto] = await Promise.allSettled(['system', 'cpu', 'memory', 'gpu', 'storage'].map(s => info(s)));
  if (ctx.dead) return;
  const S = sys.value, C = cpu.value?.[0], G = pickGpu(gpu.value), M = mem.value, ST = sto.value;
  ctx.cpu = C;
  if (S) setHTML('ovSub', h`${S.manufacturer} ${S.model} · ${S.host}`);
  const totalDisk = (ST?.disks || []).reduce((a, d) => a + (d.size || 0), 0);
  setHTML('ovFacts', h`${[
    ['cpu', 'Processor', C?.name?.replace(/\(R\)|\(TM\)/g, '').replace(/\s+/g, ' ')],
    ['gpu', 'Graphics', G?.name],
    ['memory', 'Memory', memSummary(M, S)],
    ['drive', 'Storage', totalDisk ? `${fmtBytes(totalDisk, 0)} · ${(ST.disks || []).map(d => d.bus).filter(Boolean).join(', ')}` : null],
    ['devices', 'Windows', S ? `${S.os?.replace('Microsoft ', '')} · build ${S.build}` : null],
    ['clock', 'Uptime', h`<span id="ovUp">–</span>`],
  ].map(([i, k, v]) => h`<div class="fact"><span>${ic(i)}${k}</span><b title="${v instanceof Safe ? '' : v || ''}">${v || '–'}</b></div>`)}`);
  this_update(L.d);

  function this_update(d) {
    if (!d || ctx.dead) return;
    const hl = d.health || {}, score = hl.score ?? 0;
    setRing('ovHealth', score, String(score), hl.level === 'Critical' ? '--bad' : hl.level === 'Warning' ? '--warn' : '--ok');
    setText('ovHeadline', hl.level === 'Critical' ? 'Your PC needs attention' : hl.level === 'Warning' ? 'A few things need attention' : 'Your PC is running smoothly');
    setText('ovHealthSub', `Health is ${String(hl.level || 'unknown').toLowerCase()} · ${plural((hl.recs || []).length, 'recommendation')} · up ${fmtDur(d.uptime)}`);
    setText('ovUp', fmtDur(d.uptime));
    const c = d.cpu || {}, m = d.mem || {}, g = d.gpu || {}, k = d.disk || {};
    setText('ov-cpu', fmtPct(c.total));
    setText('ov-cpu-r', fmtTemp(c.tempC) !== '–' ? fmtTemp(c.tempC) : '');
    setText('ov-cpu-m', ctx.cpu ? `${ctx.cpu.cores} cores · ${ctx.cpu.threads} threads · ${c.mhz ? mhzStr(c.mhz) : mhzStr(ctx.cpu.baseMHz) + ' base'}` : '');
    setText('ov-mem', fmtPct(memPct(d)));
    setText('ov-mem-m', `${fmtBytes(m.used)} of ${fmtBytes(m.total)} in use`);
    setText('ov-gpu', nz(g.util) ? fmtPct(g.util) : 'N/A');
    setText('ov-gpu-r', nz(g.tempC) ? fmtTemp(g.tempC) : '');
    setText('ov-gpu-m', nz(g.util) ? (g.vramUsedMB ? `${fmtBytes(g.vramUsedMB * 1048576)} VRAM in use` : 'Live load') : 'Live GPU counters unavailable');
    setText('ov-busy', fmtPct(k.busy));
    setText('ov-busy-m', `Read ${fmtRate(k.r)} · Write ${fmtRate(k.w)}`);
    setText('ovRx', fmtRate(d.net?.rx)); setText('ovTx', fmtRate(d.net?.tx));
    setText('ovLat', nz(d.net?.latency) ? d.net.latency + ' ms' : '–');
    setHTML('ovDrives', h`${(d.drives || []).map(x => {
      const p = x.total ? (x.total - x.free) / x.total * 100 : 0;
      return h`<div class="drive"><div class="row sp"><b>${ic('drive')} Local disk ${trimDrive(x.letter)}:</b><span class="sub num">${fmtBytes(x.free)} free</span></div>
        ${meter(p, lvl(p, 80, 90))}<div class="cell-sub num">${fmtBytes(x.total - x.free)} of ${fmtBytes(x.total)} used · ${fmtPct(p)}</div></div>`;
    })}` || empty('drive', 'No drives reported'));
    const recs = hl.recs || [];
    setHTML('ovRecs', recs.length ? h`${recs.map(r => h`<li>${ic('alert')}<span>${r}</span></li>`)}` : h`<li class="ok">${ic('check')}<span>Everything looks healthy. No action needed right now.</span></li>`);
    const top = (d.top?.cpu || []).slice(0, 6);
    setHTML('ovTop', h`<table class="t"><thead><tr><th>Process</th><th class="r">CPU</th><th style="width:28%"></th><th class="r">Memory</th></tr></thead><tbody>${top.map(p => h`<tr>
      <td><span class="cell-main">${p.n}</span> <span class="cell-sub">· ${p.pid}</span></td><td class="n">${p.cpu.toFixed(1)}%</td><td>${meter(p.cpu, 'thin ' + lvl(p.cpu, 40, 70))}</td><td class="n">${fmtBytes(p.ws)}</td></tr>`)}</tbody></table>`);
    charts.forEach(ch => ch.draw());
  }
  return { update: this_update };
});

/* ---------- CPU ---------- */
page('cpu', 'Monitor', 'Processor', 'cpu', 'cpu processor cores threads clock', async (el, ctx) => {
  el.innerHTML = h`${ph('Processor', h`<span id="cpuName">Loading processor details…</span>`)}
    <div class="grid">
      ${card('Utilization', 'gauge', h`<div class="row" style="gap:22px;align-items:center;flex-wrap:nowrap">${ring('cpuRing', 132, 'total load')}
        <div class="stack" style="gap:10px;flex:1"><div><span class="t3">Clock speed</span><div class="mid num" id="cpuClk">–</div></div><div><span class="t3">Peak this session</span><div class="mid num" id="cpuPk">–</div></div></div></div>
        <div class="stats mt">${stats([['Temperature', '–', 'cpuT'], ['Package power', '–', 'cpuW']])}</div>`, { cls: 'c4' })}
      ${card('Load history', 'cpu', h`<canvas class="chart" id="cpuChart"></canvas>`, { cls: 'c8', right: 'last 2 minutes' })}
      ${card('Specifications', 'info', h`<div id="cpuSpecs">${skel(2)}</div>`, { cls: 'c12' })}
      ${card('Per-core load', 'overview', h`<div class="cores" id="cpuCores"></div>`, { cls: 'c12', right: h`<span id="cpuCoreN"></span>` })}
      ${card('Top processes by CPU', 'list', h`<div id="cpuTop"></div>`, { cls: 'c12 pad0' })}
    </div>`;
  $('#cpuTop').closest('.card').querySelector('.ch').style.cssText = 'padding:18px 20px 0';
  const ch = new Chart($('#cpuChart'), { axis: true, series: [{ label: 'CPU', color: '--c-cpu', get: histGet('cpu') }] });
  ctx.onDestroy(() => ch.destroy());
  const c = (await info('cpu').catch(() => null))?.[0];
  if (ctx.dead) return;
  ctx.c = c;
  if (c) {
    setText('cpuName', `${c.name} · ${c.vendor}`);
    setHTML('cpuSpecs', stats([['Cores', c.cores], ['Threads', c.threads], ['Base clock', mhzStr(c.baseMHz)], ['L2 cache', c.l2KB ? fmtBytes(c.l2KB * 1024, 0) : '–'], ['L3 cache', c.l3KB ? fmtBytes(c.l3KB * 1024, 0) : '–'], ['Architecture', c.arch], ['Socket', c.socket], ['Virtualization', c.virtualization ? 'Enabled' : 'Disabled']]));
  } else setHTML('cpuSpecs', errBox('Processor details unavailable'));
  function up(d) {
    if (!d || ctx.dead) return;
    const u = d.cpu || {};
    setRing('cpuRing', u.total, null, lvlVar(lvl(u.total || 0)) || '--c-cpu');
    setText('cpuClk', u.mhz ? mhzStr(u.mhz) : ctx.c ? mhzStr(ctx.c.baseMHz) + ' base' : '–');
    setText('cpuPk', fmtPct(L.peak.cpu));
    setText('cpuT', fmtTemp(u.tempC)); setText('cpuW', nz(u.powerW) ? u.powerW.toFixed(1) + ' W' : '–');
    const cores = u.cores || [];
    setText('cpuCoreN', plural(cores.length, 'logical processor'));
    const box = $('#cpuCores');
    if (box.children.length !== cores.length) box.innerHTML = h`${cores.map((_, i) => h`<div class="core"><span>CPU ${i}</span><b>–</b></div>`)}`;
    cores.forEach((v, i) => { const n = box.children[i]; n.style.setProperty('--h', clamp(v, 0, 100) + '%'); n.querySelector('b').textContent = Math.round(v) + '%'; });
    setHTML('cpuTop', h`<table class="t"><thead><tr><th>Process</th><th class="r">PID</th><th class="r">CPU</th><th style="width:26%"></th><th class="r">Memory</th><th class="r">Disk I/O</th></tr></thead><tbody>${(d.top?.cpu || []).map(p => h`<tr>
      <td class="cell-main">${p.n}</td><td class="n t3">${p.pid}</td><td class="n">${p.cpu.toFixed(1)}%</td><td>${meter(p.cpu, 'thin ' + lvl(p.cpu, 40, 70))}</td><td class="n">${fmtBytes(p.ws)}</td><td class="n">${fmtRate(p.io)}</td></tr>`)}</tbody></table>`);
    ch.draw();
  }
  up(L.d);
  return { update: up };
});

/* ---------- Memory ---------- */
page('memory', 'Monitor', 'Memory', 'memory', 'ram memory dimm modules ddr', async (el, ctx) => {
  el.innerHTML = h`${ph('Memory', h`<span id="memSub">Physical memory and installed modules</span>`)}
    <div class="grid">
      ${card('Usage', 'memory', h`<div class="row" style="gap:22px;flex-wrap:nowrap">${ring('memRing', 132, 'in use', '--c-mem')}
        <div class="stack" style="gap:10px;flex:1"><div><span class="t3">In use</span><div class="mid num" id="memUsed">–</div></div><div><span class="t3">Available</span><div class="mid num" id="memFree">–</div></div></div></div>
        <div class="split mt" id="memSplit"></div>
        <div class="stats mt">${stats([['Total', '–', 'memTot'], ['Committed', '–', 'memCom'], ['Peak', '–', 'memPk']])}</div>`, { cls: 'c4' })}
      ${card('Usage history', 'gauge', h`<canvas class="chart" id="memChart"></canvas>`, { cls: 'c8', right: 'last 2 minutes' })}
      ${card('Modules', 'memory', h`<div id="memMods">${skel(3)}</div>`, { cls: 'c12', right: h`<span id="memSlots"></span>` })}
      ${card('Top processes by memory', 'list', h`<div id="memTop"></div>`, { cls: 'c12 pad0' })}
    </div>`;
  $('#memTop').closest('.card').querySelector('.ch').style.cssText = 'padding:18px 20px 0';
  const ch = new Chart($('#memChart'), { axis: true, series: [{ label: 'Memory', color: '--c-mem', get: histGet('mem') }] });
  ctx.onDestroy(() => ch.destroy());
  info('memory').then(m => {
    if (ctx.dead) return;
    const mods = m.modules || [], slots = Math.max(m.slots || 0, mods.length);
    setText('memSlots', `${mods.length} of ${slots} slots used`);
    setText('memSub', memSummary(m));
    setHTML('memMods', h`<div class="auto" style="--min:240px">${mods.map(x => h`<div class="tile"><div class="ico acc">${ic('memory')}</div><div>
        <b>${fmtBytes(x.bytes, 0)} ${x.type || ''}</b><div class="cell-sub">${x.slot || x.bank} · ${x.configured || x.speed || '–'} MT/s</div>
        <div class="cell-sub mono" title="Part number">${x.part || ''}</div></div></div>`)}
      ${Array.from({ length: slots - mods.length }, () => h`<div class="tile" style="border-style:dashed;opacity:.7"><div class="ico">${ic('plus')}</div><div><b>Empty slot</b><div class="cell-sub">Available for upgrade</div></div></div>`)}</div>`);
  }).catch(e => setHTML('memMods', errBox(e)));
  function up(d) {
    if (!d || ctx.dead || !d.mem) return;
    const m = d.mem, p = memPct(d);
    setRing('memRing', p, null, lvlVar(lvl(p, 80, 90)) || '--c-mem');
    setText('memUsed', fmtBytes(m.used)); setText('memFree', fmtBytes(m.free)); setText('memTot', fmtBytes(m.total));
    setText('memCom', m.commitLimit ? `${fmtBytes(m.commit)} / ${fmtBytes(m.commitLimit)}` : '–'); setText('memPk', fmtPct(L.peak.mem));
    setHTML('memSplit', h`<i style="width:${p}%;background:var(--c-mem)"></i><i style="flex:1;background:var(--s4)"></i>`);
    setHTML('memTop', h`<table class="t"><thead><tr><th>Process</th><th class="r">PID</th><th class="r">Memory</th><th style="width:30%"></th><th class="r">CPU</th></tr></thead><tbody>${(d.top?.mem || []).map(x => h`<tr>
      <td class="cell-main">${x.n}</td><td class="n t3">${x.pid}</td><td class="n">${fmtBytes(x.ws)}</td><td>${meter(x.ws / ((d.top.mem[0] || x).ws || 1) * 100, 'thin', 'var(--c-mem)')}</td><td class="n">${x.cpu.toFixed(1)}%</td></tr>`)}</tbody></table>`);
    ch.draw();
  }
  up(L.d);
  return { update: up };
});

/* ---------- GPU ---------- */
page('gpu', 'Monitor', 'Graphics', 'gpu', 'gpu graphics video card nvidia amd intel vram display', async (el, ctx) => {
  el.innerHTML = h`${ph('Graphics', 'Graphics adapters, drivers and live load')}
    <div class="grid">
      ${card('Live load', 'gauge', h`<div id="gpuLive"></div><canvas class="chart sm mt" id="gpuChart"></canvas>`, { cls: 'c12', right: 'last 2 minutes' })}
      <div class="c12 auto" style="--min:380px" id="gpuList">${card('', '', skel(5))}</div>
    </div>`;
  const ch = new Chart($('#gpuChart'), { axis: true, series: [{ label: 'GPU', color: '--c-gpu', get: histGet('gpu') }] });
  ctx.onDestroy(() => ch.destroy());
  info('gpu').then(list => {
    if (ctx.dead) return;
    const vend = n => /nvidia/i.test(n) ? ['NVIDIA', 'ok'] : /amd|radeon/i.test(n) ? ['AMD', 'bad'] : /intel/i.test(n) ? ['Intel', 'info'] : ['GPU', ''];
    setHTML('gpuList', h`${(list || []).map(g => { const [v, c] = vend(g.name); const dedicated = /nvidia|radeon|arc/i.test(g.name); return card(g.name, 'gpu', h`
      <div class="row" style="margin:-4px 0 14px">${badge(v, c)}${badge(dedicated ? 'Dedicated' : 'Integrated')}${g.w ? badge('Active display', 'acc', 'monitor') : ''}</div>
      ${kv([['Video memory', g.vram ? fmtBytes(g.vram, 0) : 'Shared'], ['Driver version', g.driver, g.driver], ['Driver date', g.driverDate ? h`${fmtDate(g.driverDate)} <span class="t3">· ${ago(g.driverDate)}</span>` : null], ['Display mode', g.w ? `${g.w} × ${g.h} @ ${g.hz} Hz` : 'No display attached'], ['Vendor', g.vendor]])}`); })}` || card('', '', empty('gpu', 'No graphics adapters found')));
  }).catch(e => setHTML('gpuList', card('', '', errBox(e))));
  function up(d) {
    if (!d || ctx.dead) return;
    const g = d.gpu || {};
    setHTML('gpuLive', nz(g.util)
      ? stats([['Load', fmtPct(g.util)], ['Temperature', fmtTemp(g.tempC)], ['VRAM in use', g.vramUsedMB ? fmtBytes(g.vramUsedMB * 1048576) : '–'], ['Clock', g.mhz ? g.mhz + ' MHz' : '–'], ['Power', nz(g.powerW) ? Math.round(g.powerW) + ' W' : '–'], ['Fan', nz(g.fan) ? g.fan + ' RPM' : '–']])
      : h`<div class="note">${ic('info')}<div>Windows isn't reporting live GPU counters right now. They usually appear once a game or GPU-accelerated app is running. Temperatures require a sensor provider such as LibreHardwareMonitor.</div></div>`);
    ch.draw();
  }
  up(L.d);
  return { update: up };
});

/* ---------- Storage ---------- */
page('storage', 'Monitor', 'Storage', 'drive', 'disk drive ssd nvme hdd smart volume partition', async (el, ctx) => {
  el.innerHTML = h`${ph('Storage', 'Physical drives, health and volumes')}
    <div class="grid">
      ${card('Activity', 'gauge', h`<div class="row" style="gap:22px;flex-wrap:nowrap">${ring('stBusy', 120, 'active time', '--c-disk')}
        <div class="stack" style="gap:10px;flex:1"><div><span class="t3">Read</span><div class="mid num" id="stR">–</div></div><div><span class="t3">Write</span><div class="mid num" id="stW">–</div></div></div></div>`, { cls: 'c4' })}
      ${card('Throughput', 'drive', h`<div class="legend" style="margin-bottom:8px"><span><i style="--c:var(--c-disk)"></i>Read</span><span><i style="--c:var(--c-tx)"></i>Write</span></div><canvas class="chart sm" id="stChart"></canvas>`, { cls: 'c8', right: 'last 2 minutes' })}
      <div class="c12 auto" style="--min:420px" id="stDisks">${card('', '', skel(5))}</div>
      ${card('Volumes', 'layers', h`<div id="stVols">${skel(3)}</div>`, { cls: 'c12' })}
    </div>`;
  const ch = new Chart($('#stChart'), { axis: true, max: 'auto', minMax: 1048576, bytes: true, fmt: fmtRate, fmtAxis: v => fmtBytes(v, 0), series: [{ label: 'Read', color: '--c-disk', get: histGet('dr') }, { label: 'Write', color: '--c-tx', get: histGet('dw') }] });
  ctx.onDestroy(() => ch.destroy());
  info('storage').then(s => {
    if (ctx.dead) return;
    setHTML('stDisks', h`${(s.disks || []).map(d => card(d.name, 'drive', h`
      <div class="row" style="margin:-4px 0 14px">${badge(d.health || 'Unknown', d.health === 'Healthy' ? 'ok' : 'bad', d.health === 'Healthy' ? 'check' : 'alert')}${badge(d.bus)}${badge(d.type)}</div>
      ${stats([['Capacity', fmtBytes(d.size, 0)], ['Temperature', fmtTemp(d.temp)], ['Life remaining', nz(d.wear) ? 100 - d.wear + '%' : '–'], ['Power-on', nz(d.hours) ? d.hours.toLocaleString() + ' h' : '–']])}
      <div class="mt">${kv([['Status', d.op], ['Read / write errors', nz(d.readErr) || nz(d.writeErr) ? `${d.readErr ?? 0} / ${d.writeErr ?? 0}` : null], ['Serial number', d.serial ? h`<span class="mono">${d.serial}</span>` : null, d.serial]])}</div>
      ${d.wear == null && d.temp == null ? h`<div class="note mt">${ic('info')}<div>Detailed SMART counters (temperature, wear, hours) need WhatsMyPC to run as administrator.</div></div>` : ''}`))}` || card('', '', empty('drive', 'No physical drives reported')));
    setHTML('stVols', (s.volumes || []).length ? h`<div class="auto" style="--min:280px">${s.volumes.map(v => { const p = v.size ? (v.size - v.free) / v.size * 100 : 0; return h`
      <div class="tile"><div class="ico acc">${ic('drive')}</div><div><div class="row sp"><b>${v.label || 'Local Disk'} (${v.letter}:)</b><span class="cell-sub">${v.fs}</span></div>
        <div style="margin:8px 0 6px">${meter(p, lvl(p, 80, 90))}</div><div class="cell-sub num">${fmtBytes(v.free)} free of ${fmtBytes(v.size)}</div></div></div>`; })}</div>` : empty('layers', 'No volumes'));
  }).catch(e => { setHTML('stDisks', card('', '', errBox(e))); setHTML('stVols', ''); });
  function up(d) {
    if (!d || ctx.dead) return;
    const k = d.disk || {};
    setRing('stBusy', k.busy, null, '--c-disk'); setText('stR', fmtRate(k.r)); setText('stW', fmtRate(k.w));
    ch.draw();
  }
  up(L.d);
  return { update: up };
});

/* ---------- Network ---------- */
page('network', 'Monitor', 'Network', 'network', 'network wifi ethernet ip mac dns speed test internet latency ping', async (el, ctx) => {
  const sh = store.get('speedLog', []);
  el.innerHTML = h`${ph('Network', 'Adapters, live throughput and internet speed')}
    <div class="grid">
      ${card('Throughput', 'network', h`<div class="legend" style="margin-bottom:8px"><span><i style="--c:var(--c-rx)"></i>Download</span><span><i style="--c:var(--c-tx)"></i>Upload</span></div><canvas class="chart" id="netChart"></canvas>`, { cls: 'c8', right: 'last 2 minutes' })}
      ${card('Right now', 'zap', h`<div class="stack" style="gap:14px">
          <div><span class="t3">${ic('down')} Download</span><div class="big num" id="nRx" style="color:var(--c-rx)">–</div></div>
          <div><span class="t3">${ic('up')} Upload</span><div class="big num" id="nTx" style="color:var(--c-tx)">–</div></div></div>
        <div class="stats mt">${stats([['Latency', '–', 'nLat'], ['Session ↓', '–', 'nSr'], ['Session ↑', '–', 'nSt']])}</div>`, { cls: 'c4' })}
      ${card('Internet speed test', 'gauge', h`<div class="row sp" style="gap:20px;align-items:center">
          <div class="row" style="gap:36px" id="spRes">${[['Download', 'spD', 'Mbps'], ['Upload', 'spU', 'Mbps'], ['Ping', 'spP', 'ms']].map(([k, id, u]) => h`<div><span class="t3">${k}</span><div class="big num" id="${id}">${sh[0] ? (id === 'spD' ? sh[0].down : id === 'spU' ? sh[0].up : sh[0].ping) : '–'}<small>${u}</small></div></div>`)}</div>
          <div class="row"><span class="sub" id="spWhen">${sh[0] ? 'Last run ' + ago(sh[0].t) : 'Measures against a nearby CDN edge'}</span><button class="btn pri" id="spGo">${ic('play')}Run test</button></div></div>
        ${sh.length > 1 ? h`<div class="mt"><table class="t"><thead><tr><th>When</th><th class="r">Download</th><th class="r">Upload</th><th class="r">Ping</th></tr></thead><tbody>${sh.slice(0, 6).map(s => h`<tr><td>${fmtDate(s.t, true)}</td><td class="n">${s.down} Mbps</td><td class="n">${s.up} Mbps</td><td class="n">${s.ping} ms</td></tr>`)}</tbody></table></div>` : ''}`, { cls: 'c12' })}
      <div class="c12 auto" style="--min:400px" id="netAd">${card('', '', skel(6))}</div>
    </div>`;
  const ch = new Chart($('#netChart'), { axis: true, max: 'auto', minMax: 64 * 1024, bytes: true, fmt: fmtRate, fmtAxis: v => fmtBytes(v, 0), series: [{ label: 'Down', color: '--c-rx', get: histGet('rx') }, { label: 'Up', color: '--c-tx', get: histGet('tx') }] });
  ctx.onDestroy(() => ch.destroy());
  $('#spGo').onclick = async () => {
    const b = $('#spGo'); b.disabled = true; b.innerHTML = h`<span class="spin"></span>Testing…`;
    setText('spWhen', 'Measuring download, upload and latency…');
    try {
      const r = await post('/api/speedtest');
      if (r.error) throw new Error(r.error);
      const log = store.get('speedLog', []); log.unshift({ t: new Date().toISOString(), down: r.down, up: r.up, ping: r.ping }); store.set('speedLog', log.slice(0, 20));
      if (!ctx.dead) { setHTML('spD', h`${r.down}<small>Mbps</small>`); setHTML('spU', h`${r.up}<small>Mbps</small>`); setHTML('spP', h`${r.ping}<small>ms</small>`); setText('spWhen', 'Just now'); }
      toast('Speed test complete', `${r.down} Mbps down · ${r.up} Mbps up · ${r.ping} ms`, 'ok');
    } catch (e) { toast('Speed test failed', e.message, 'bad'); if (!ctx.dead) setText('spWhen', 'Test failed'); }
    if (!ctx.dead) { b.disabled = false; b.innerHTML = h`${ic('play')}Run again`; }
  };
  if (ctx.args === 'speedtest') $('#spGo').click();
  info('network').then(list => {
    if (ctx.dead) return;
    setHTML('netAd', h`${(list || []).map(a => card(a.name, /wi-?fi|802\.11|wireless/i.test(a.name + a.media) ? 'wifi' : 'ethernet', h`
      <div class="row" style="margin:-4px 0 14px">${badge('Connected', 'ok', 'check')}${a.speed ? badge(a.speed) : ''}</div>
      ${kv([['Adapter', a.desc], ['IPv4 address', (a.ipv4 || []).join(', '), (a.ipv4 || [])[0]], ['IPv6 address', (a.ipv6 || []).length ? h`<span class="mono">${a.ipv6.join(', ')}</span>` : null, (a.ipv6 || [])[0]], ['Gateway', (a.gateway || []).join(', ')], ['DNS servers', (a.dns || []).join(', '), (a.dns || []).join(', ')], ['MAC address', a.mac ? h`<span class="mono">${a.mac}</span>` : null, a.mac], ['Media', a.media]])}`))}` || card('', '', empty('network', 'No connected adapters', 'Connect to Wi-Fi or Ethernet to see details.')));
  }).catch(e => setHTML('netAd', card('', '', errBox(e))));
  function up(d) {
    if (!d || ctx.dead) return;
    setText('nRx', fmtRate(d.net?.rx)); setText('nTx', fmtRate(d.net?.tx));
    setText('nLat', nz(d.net?.latency) ? d.net.latency + ' ms' : '–');
    setText('nSr', fmtBytes(L.sess.rx)); setText('nSt', fmtBytes(L.sess.tx));
    ch.draw();
  }
  up(L.d);
  return { update: up };
});

/* ---------- Battery ---------- */
page('battery', 'Monitor', 'Battery', 'battery', 'battery power charge health laptop cycles', async (el, ctx) => {
  el.innerHTML = h`${ph('Battery', 'Charge, capacity and wear')}<div id="batBox">${card('', '', skel(5))}</div>`;
  const b = await info('battery', true).catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (b.error) return setHTML('batBox', card('', '', errBox(b.error)));
  if (!b.present) return setHTML('batBox', card('', '', empty('power', 'No battery detected', 'This PC runs on AC power.')));
  const health = b.design && b.current ? Math.round(b.current / b.design * 100) : null;
  const state = b.full ? 'Fully charged' : b.charging ? 'Charging' : 'On battery';
  setHTML('batBox', h`<div class="grid">
    ${card('Charge', 'battery', h`<div class="row" style="gap:24px;flex-wrap:nowrap">${ring('batRing', 150, state, b.percent < 20 ? '--bad' : '--ok')}
      <div class="stack" style="gap:10px"><div><span class="t3">Status</span><div class="mid">${state}</div></div><div><span class="t3">Time remaining</span><div class="mid num">${b.minutes ? fmtDur(b.minutes * 60) : b.charging ? 'Plugged in' : '–'}</div></div></div></div>`, { cls: 'c5' })}
    ${card('Battery health', 'shield', h`<div class="row sp"><div><div class="big num">${health != null ? health + '%' : '–'}</div><div class="sub">${health == null ? 'Design capacity not reported by firmware' : health >= 80 ? 'Healthy — holds most of its original charge' : health >= 60 ? 'Noticeable wear' : 'Significant wear — consider a replacement'}</div></div>
      ${health != null ? badge(health >= 80 ? 'Good' : health >= 60 ? 'Fair' : 'Poor', health >= 80 ? 'ok' : health >= 60 ? 'warn' : 'bad') : ''}</div>
      ${health != null ? h`<div class="mt">${meter(health, health >= 80 ? 'ok' : health >= 60 ? 'warn' : 'bad')}</div>` : ''}
      <div class="stats mt">${stats([['Full charge capacity', b.current ? b.current.toLocaleString() + ' mWh' : '–'], ['Design capacity', b.design ? b.design.toLocaleString() + ' mWh' : '–'], ['Cycle count', b.cycles ? b.cycles : '–']])}</div>`, { cls: 'c7' })}
    ${card('Details', 'info', kv([['Battery', b.name], ['Charge level', b.percent + '%'], ['Windows status code', b.status]]), { cls: 'c12' })}</div>`);
  setRing('batRing', b.percent, b.percent + '%');
});

/* ---------- Hardware ---------- */
page('hardware', 'System', 'Hardware', 'board', 'motherboard bios uefi chipset serial model manufacturer', async (el, ctx) => {
  el.innerHTML = h`${ph('Hardware', 'System, motherboard and firmware')}<div class="auto" style="--min:380px" id="hwBox">${card('', '', skel(6))}${card('', '', skel(6))}</div>`;
  const [s, hw, c] = await Promise.all([info('system'), info('hardware'), info('cpu')].map(p => p.catch(() => null)));
  if (ctx.dead) return;
  setHTML('hwBox', h`
    ${card('System', 'devices', kv([['Manufacturer', s?.manufacturer], ['Model', s?.model, s?.model], ['Device name', s?.host, s?.host], ['Signed-in user', s?.user], ['Workgroup / domain', s?.domain], ['Installed memory', s ? fmtBytes(s.ramBytes, 0) : null]]))}
    ${card('Windows', 'overview', kv([['Edition', s?.os], ['Version', s?.version, s?.version], ['Build', s?.build], ['Architecture', s?.arch], ['Installed', s?.installed ? h`${fmtDate(s.installed)} <span class="t3">· ${ago(s.installed)}</span>` : null], ['Last boot', fmtDate(s?.boot, true)]]))}
    ${card('Motherboard', 'board', kv([['Manufacturer', hw?.board?.maker], ['Product', hw?.board?.product, hw?.board?.product], ['Version', hw?.board?.version], ['Serial number', hw?.board?.serial ? h`<span class="mono">${hw.board.serial}</span>` : null, hw?.board?.serial], ['Chipset', hw?.chipset]]))}
    ${card('Firmware (BIOS / UEFI)', 'zap', kv([['Vendor', hw?.bios?.maker], ['Version', hw?.bios?.version, hw?.bios?.version], ['Release date', hw?.bios?.date ? h`${fmtDate(hw.bios.date)} <span class="t3">· ${ago(hw.bios.date)}</span>` : null], ['Serial / service tag', hw?.bios?.serial ? h`<span class="mono">${hw.bios.serial}</span>` : null, hw?.bios?.serial]]))}
    ${card('Processor', 'cpu', kv([['Model', c?.[0]?.name, c?.[0]?.name], ['Vendor', c?.[0]?.vendor], ['Cores / threads', c?.[0] ? `${c[0].cores} / ${c[0].threads}` : null], ['Socket', c?.[0]?.socket]]))}`);
});

/* ---------- Devices ---------- */
page('devices', 'System', 'Devices', 'devices', 'monitor display usb keyboard mouse audio bluetooth camera printer peripherals', async (el, ctx) => {
  el.innerHTML = h`${ph('Devices', 'Displays and connected peripherals')}
    <div class="stack">${card('Displays', 'monitor', h`<div id="dvMon">${skel(2)}</div>`)}<section class="card pad0" id="dvTbl">${skel(6)}</section></div>`;
  const d = await info('devices').catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (d.error) return setHTML('dvMon', errBox(d.error));
  setHTML('dvMon', h`<div class="auto" style="--min:240px">${(d.monitors || []).map((m, i) => h`<div class="tile"><div class="ico acc">${ic('monitor')}</div><div>
    <b>${String(d.monitorNames?.[i] || '').replace(/[\x00-\x1f]/g, '').trim() || (m.primary ? 'Built-in display' : 'Display ' + (i + 1))}</b><div class="cell-sub">${m.w} × ${m.h}${m.hz ? ` · ${m.hz} Hz` : ''}</div><div style="margin-top:6px">${m.primary ? badge('Primary', 'acc') : badge(m.name?.replace(/^\\\\\.\\/, '') || 'Secondary')}</div></div></div>`)}</div>`);
  const devs = d.devices || [];
  const classes = [...new Set(devs.map(x => x.cls))].sort((a, b) => devs.filter(x => x.cls === b).length - devs.filter(x => x.cls === a).length);
  const nice = { AudioEndpoint: 'Audio', USB: 'USB', Keyboard: 'Keyboards', Mouse: 'Mice', Bluetooth: 'Bluetooth', Camera: 'Cameras', Image: 'Imaging', Printer: 'Printers' };
  dataTable($('#dvTbl'), {
    noun: 'device', search: 'Search devices…', exportName: 'whatsmypc-devices', rows: devs, sort: { k: 'name', dir: 1 },
    filters: [{ label: 'All', test: () => true }, ...classes.map(c => ({ label: nice[c] || c, test: x => x.cls === c }))],
    cols: [
      { k: 'name', label: 'Device', cell: x => h`<span class="cell-main">${x.name}</span>` },
      { k: 'cls', label: 'Type', cell: x => badge(nice[x.cls] || x.cls) },
      { k: 'maker', label: 'Manufacturer', cls: 't3' },
      { k: 'status', label: 'Status', cell: x => badge(x.status, x.status === 'OK' ? 'ok' : 'warn') },
    ],
  });
});

/* ---------- Security ---------- */
page('security', 'System', 'Security', 'shield', 'security defender antivirus firewall bitlocker secure boot uac', async (el, ctx) => {
  el.innerHTML = h`${ph('Security', 'Protection status across Windows security features', h`<button class="btn" id="secRe">${ic('refresh')}Re-check</button>`)}<div id="secBox">${card('', '', skel(8))}</div>`;
  $('#secRe').onclick = () => go('security', true);
  const s = await info('security', ctx.force).catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (s.error) return setHTML('secBox', card('', '', errBox(s.error)));
  const D = s.defender || {};
  const sig = D.sigAge;
  const checks = [
    ['Real-time protection', D.realtime ? 'ok' : 'bad', D.realtime ? 'Microsoft Defender is actively scanning files.' : 'Real-time scanning is off. Your PC is exposed to malware.'],
    ['Antivirus', D.antivirus || (s.products || []).some(p => p.on) ? 'ok' : 'bad', (s.products || []).map(p => `${p.name} (${p.on ? 'on' : 'off'})`).join(', ') || 'No antivirus product registered.'],
    ['Tamper protection', D.tamper ? 'ok' : 'warn', D.tamper ? 'Security settings are protected from changes by malicious apps.' : 'Turn on tamper protection in Windows Security.'],
    ['Virus definitions', !nz(sig) ? 'warn' : sig <= 3 ? 'ok' : sig <= 7 ? 'warn' : 'bad', nz(sig) ? `${sig === 0 ? 'Updated today' : `Updated ${plural(sig, 'day')} ago`}${D.sigUpdated ? ' · ' + fmtDate(D.sigUpdated, true) : ''}` : 'Could not determine definition age.'],
    ...(s.firewall || []).map(f => [`Firewall · ${f.name} network`, f.enabled ? 'ok' : 'bad', f.enabled ? 'Inbound connections are filtered.' : 'This firewall profile is turned off.']),
    ['User Account Control', s.uac ? 'ok' : 'bad', s.uac ? 'Apps must ask before making system changes.' : 'UAC is disabled — apps can change your system silently.'],
    ['Secure Boot', s.secureBoot === true ? 'ok' : 'warn', s.secureBoot === true ? 'Only trusted bootloaders can start.' : s.secureBoot === false ? 'Secure Boot is off in firmware.' : 'Status unavailable — run WhatsMyPC as administrator to check.'],
    ...(s.bitlocker || []).map(b => [`BitLocker · drive ${b.drive}`, b.on ? 'ok' : 'warn', b.on ? 'Drive is encrypted.' : 'Drive is not encrypted. Data is readable if the device is lost.']),
  ];
  const wt = { ok: 1, warn: .5, bad: 0 };
  const score = Math.round(checks.reduce((a, c) => a + wt[c[1]], 0) / checks.length * 100);
  const bad = checks.filter(c => c[1] === 'bad').length, warn = checks.filter(c => c[1] === 'warn').length;
  setHTML('secBox', h`<div class="grid">
    ${card('', '', h`<div class="row" style="gap:24px;flex-wrap:nowrap">${ring('secRing', 140, 'protection')}<div><h2 style="margin:0 0 4px;font:600 20px var(--font-d)">${bad ? 'Action needed' : warn ? 'Mostly protected' : 'Fully protected'}</h2>
      <div class="sub">${checks.length - bad - warn} passed · ${warn} to review · ${bad} at risk</div></div></div>`, { cls: 'c12' })}
    ${card('Security checks', 'shield', h`${checks.map(([t, st, m]) => h`<div class="check"><div class="ico ${st}">${ic(st === 'ok' ? 'check' : st === 'warn' ? 'alert' : 'x')}</div><div><b>${t}</b><div class="sub">${m}</div></div>${badge(st === 'ok' ? 'On' : st === 'warn' ? 'Review' : 'At risk', st)}</div>`)}`, { cls: 'c12' })}</div>`);
  setRing('secRing', score, String(score), bad ? '--bad' : warn ? '--warn' : '--ok');
});

/* ---------- Updates ---------- */
page('updates', 'System', 'Windows Update', 'update', 'windows update hotfix patch kb pending', async (el, ctx) => {
  el.innerHTML = h`${ph('Windows Update', 'Pending updates and recently installed patches', h`<button class="btn" id="upRe">${ic('refresh')}Check again</button>`)}
    <div id="upBox">${card('', '', h`<div class="row" style="gap:14px"><span class="spin"></span><div><b>Checking Windows Update…</b><div class="sub">Asking the Windows Update service for available updates. This can take up to a minute.</div></div></div>`)}</div>`;
  $('#upRe').onclick = () => go('updates', true);
  const u = await info('updates', ctx.force).catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (u.error) return setHTML('upBox', card('', '', errBox(u.error)));
  const pend = u.pending || [];
  setBadge('updates', pend.length ? String(pend.length) : '', 'acc');
  setHTML('upBox', h`<div class="grid">
    ${card('Available updates', 'download', pend.length ? h`${pend.map(p => h`<div class="check"><div class="ico ${p.security ? 'bad' : 'warn'}">${ic(p.security ? 'shield' : 'download')}</div><div><b>${p.title}</b><div class="sub">${p.downloaded ? 'Downloaded, ready to install' : 'Not downloaded yet'}${p.severity ? ' · ' + p.severity : ''}</div></div>${p.security ? badge('Security', 'bad') : badge('Optional')}</div>`)}
      <div class="note mt">${ic('info')}<div>Install updates from <b>Settings → Windows Update</b>. WhatsMyPC only reports what's available.</div></div>` : empty('check', "You're up to date", 'No pending updates were found.'), { cls: 'c7', right: plural(pend.length, 'update') })}
    ${card('Recently installed', 'clock', (u.hotfixes || []).length ? h`${u.hotfixes.map(x => h`<div class="check"><div class="ico ok">${ic('check')}</div><div><b class="mono">${x.id}</b><div class="sub">${x.desc}${x.on ? ' · ' + fmtDate(x.on) : ''}</div></div>${x.id ? h`<a class="btn sm ghost" href="https://support.microsoft.com/help/${x.id.replace(/^KB/i, '')}" target="_blank" rel="noopener">Details</a>` : ''}</div>`)}` : empty('clock', 'No hotfix history'), { cls: 'c5' })}</div>`);
});

/* ---------- Drivers ---------- */
page('drivers', 'System', 'Drivers', 'layers', 'drivers device version provider pnp', async (el, ctx) => {
  el.innerHTML = h`${ph('Drivers', 'Signed device drivers installed on this PC')}<section class="card pad0" id="drTbl">${skel(8)}</section>`;
  const list = await info('drivers').catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (list.error) return setHTML('drTbl', errBox(list.error));
  const top = Object.entries(list.reduce((a, d) => (a[d.cls || 'OTHER'] = (a[d.cls || 'OTHER'] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 7).map(e => e[0]);
  const isMs = d => /microsoft|standard|generic/i.test(d.maker || '');
  dataTable($('#drTbl'), {
    noun: 'driver', search: 'Search drivers…', exportName: 'whatsmypc-drivers', rows: list, sort: { k: 'date', dir: -1 },
    filters: [{ label: 'All', test: () => true }, { label: 'Third-party', test: d => !isMs(d) }, ...top.map(c => ({ label: c[0] + c.slice(1).toLowerCase(), test: d => (d.cls || 'OTHER') === c }))],
    cols: [
      { k: 'name', label: 'Device', cell: d => h`<span class="cell-main">${d.name}</span>` },
      { k: 'maker', label: 'Provider', cls: 't3' },
      { k: 'version', label: 'Version', cell: d => h`<span class="mono">${d.version || '–'}</span>` },
      { k: 'cls', label: 'Class', cell: d => d.cls ? badge(d.cls[0] + d.cls.slice(1).toLowerCase()) : '–' },
      { k: 'date', label: 'Date', r: true, s: d => toDate(d.date)?.getTime() ?? null, cell: d => fmtDate(d.date), csv: d => d.date },
    ],
  });
});

/* ---------- Software ---------- */
const swDate = s => { if (!s) return null; if (/^\d{8}$/.test(s)) return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); const d = new Date(s); return isNaN(d) ? null : d; };
page('software', 'System', 'Installed apps', 'package', 'software apps programs installed uninstall', async (el, ctx) => {
  el.innerHTML = h`${ph('Installed apps', 'Desktop applications registered with Windows')}<div id="swStats" style="margin-bottom:16px"></div><section class="card pad0" id="swTbl">${skel(8)}</section>`;
  const list = await info('software').catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (list.error) return setHTML('swTbl', errBox(list.error));
  const total = list.reduce((a, s) => a + (s.sizeKB || 0) * 1024, 0);
  const pubs = new Set(list.map(s => s.publisher).filter(Boolean));
  const recent = list.filter(s => { const d = swDate(s.date); return d && Date.now() - d < 30 * 864e5; });
  setHTML('swStats', stats([['Apps', list.length], ['Disk usage (reported)', fmtBytes(total, 0)], ['Publishers', pubs.size], ['Installed last 30 days', recent.length]]));
  const big = [...list].sort((a, b) => (b.sizeKB || 0) - (a.sizeKB || 0))[Math.min(9, list.length - 1)]?.sizeKB || 0;
  dataTable($('#swTbl'), {
    noun: 'app', search: 'Search apps or publishers…', exportName: 'whatsmypc-apps', rows: list, sort: { k: 'name', dir: 1 },
    filters: [{ label: 'All', test: () => true }, { label: 'Largest', test: s => (s.sizeKB || 0) >= big && big > 0 }, { label: 'Recently installed', test: s => recent.includes(s) }],
    cols: [
      { k: 'name', label: 'Name', cell: s => h`<span class="cell-main">${s.name}</span>` },
      { k: 'publisher', label: 'Publisher', cls: 't3' },
      { k: 'version', label: 'Version', cell: s => h`<span class="mono">${s.version || '–'}</span>` },
      { k: 'sizeKB', label: 'Size', r: true, cell: s => s.sizeKB ? fmtBytes(s.sizeKB * 1024) : '–' },
      { k: 'date', label: 'Installed', r: true, s: s => swDate(s.date)?.getTime() ?? null, cell: s => swDate(s.date) ? fmtDate(swDate(s.date)) : '–' },
    ],
  });
});

/* ---------- Startup ---------- */
page('startup', 'System', 'Startup', 'power', 'startup boot autostart run programs login', async (el, ctx) => {
  el.innerHTML = h`${ph('Startup', 'Programs that launch when you sign in, and boot performance')}<div class="stack"><div id="suBoot"></div><section class="card pad0" id="suTbl">${skel(6)}</section></div>`;
  const s = await info('startup').catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (s.error) return setHTML('suTbl', errBox(s.error));
  const boots = s.boots || [];
  setHTML('suBoot', boots.length ? card('Recent boot times', 'clock', h`<div class="auto" style="--min:170px">${boots.map(b => h`<div class="tile"><div class="ico ${b.bootMs > 60000 ? '' : 'acc'}">${ic('zap')}</div><div><b class="num">${(b.bootMs / 1000).toFixed(1)} s</b><div class="cell-sub">${fmtDate(b.time)}</div><div class="cell-sub">Core ${(b.mainMs / 1000).toFixed(1)} s · after ${(b.postMs / 1000).toFixed(1)} s</div></div></div>`)}</div>`)
    : h`<div class="note">${ic('info')}<div>Boot timing comes from the Windows Diagnostics-Performance log, which is readable only when WhatsMyPC runs as administrator.</div></div>`);
  const where = l => /startup/i.test(l) ? 'Startup folder' : /HKLM/i.test(l) ? 'Registry · all users' : /HKU|HKCU/i.test(l) ? 'Registry · user' : l;
  dataTable($('#suTbl'), {
    noun: 'startup item', search: 'Search startup items…', exportName: 'whatsmypc-startup', rows: s.items || [], sort: { k: 'name', dir: 1 },
    emptyTitle: 'No startup items', emptyMsg: 'Nothing launches automatically when you sign in.',
    cols: [
      { k: 'name', label: 'Program', cell: i => h`<span class="cell-main">${i.name}</span>` },
      { k: 'command', label: 'Command', cls: 'wrap', cell: i => h`<span class="mono t3">${i.command}</span>` },
      { k: 'location', label: 'Source', cell: i => h`<span title="${i.location}">${badge(where(i.location))}</span>`, csv: i => i.location },
      { k: 'user', label: 'User', cls: 't3' },
    ],
  });
});

/* ---------- Events ---------- */
page('events', 'System', 'Reliability', 'alert', 'events crash bsod blue screen hang shutdown reliability log', async (el, ctx) => {
  el.innerHTML = h`${ph('Reliability', 'Crashes, hangs and unexpected shutdowns from the last 60 days')}<div id="evBox">${card('', '', skel(8))}</div>`;
  const list = await info('events').catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (list.error) return setHTML('evBox', card('', '', errBox(list.error)));
  const sev = e => e.id === 1001 ? 'bad' : e.id === 41 || e.id === 6008 ? 'bad' : e.id === 1000 ? 'warn' : 'info';
  const evs = [...list].sort((a, b) => new Date(b.time) - new Date(a.time));
  const within = days => evs.filter(e => Date.now() - new Date(e.time) < days * 864e5).length;
  const kinds = [...new Set(evs.map(e => e.kind))];
  let filt = 'All';
  const app = e => (String(e.msg || '').match(/application name: ([^,]+)/i) || String(e.msg || '').match(/^The program (\S+)/i) || [])[1];
  function draw() {
    const shown = evs.filter(e => filt === 'All' || e.kind === filt);
    const byDay = shown.reduce((a, e) => { const k = fmtDate(e.time); (a[k] = a[k] || []).push(e); return a; }, {});
    setHTML('evList', shown.length ? h`${Object.entries(byDay).map(([day, es]) => h`<div class="cell-sub" style="margin:4px 0 12px;font-weight:600">${day}</div>
      <div class="timeline">${es.map(e => h`<div class="ev" style="--c:var(--${sev(e)})"><div class="pt"></div><div><div class="row" style="gap:8px"><b>${app(e) ? `${e.kind} · ${app(e)}` : e.kind}</b>${badge(new Date(e.time).toLocaleTimeString([], { timeStyle: 'short' }))}<span class="cell-sub">Event ${e.id} · ${e.source}</span></div><div class="msg">${e.msg}</div></div></div>`)}</div>`)}`
      : empty('check', 'No events', 'No crashes or unexpected shutdowns in this period.'));
    $$('#evF .chip').forEach(c => c.classList.toggle('on', c.dataset.k === filt));
  }
  setHTML('evBox', h`<div class="stack">${stats([['Last 24 hours', within(1)], ['Last 7 days', within(7)], ['Last 30 days', within(30)], ['Blue screens', evs.filter(e => e.id === 1001).length], ['App crashes', evs.filter(e => e.id === 1000).length]])}
    ${card('Timeline', 'clock', h`<div class="row" id="evF" style="margin-bottom:18px">${['All', ...kinds].map(k => h`<button class="chip" data-k="${k}">${k}<span class="n"> ${k === 'All' ? evs.length : evs.filter(e => e.kind === k).length}</span></button>`)}</div><div id="evList"></div>`)}</div>`);
  $('#evF').onclick = e => { const c = e.target.closest('.chip'); if (c) { filt = c.dataset.k; draw(); } };
  draw();
});

/* ---------- Processes ---------- */
const CRITICAL = /^(system|smss|csrss|wininit|winlogon|services|lsass|svchost|dwm|fontdrvhost|registry|memcompression|secure system)(\.exe)?$/i;
page('processes', 'Tools', 'Processes', 'list', 'process task manager kill end task running apps', async (el, ctx) => {
  el.innerHTML = h`${ph('Processes', 'Everything running on this PC right now', h`<label class="row sub" style="gap:8px">Auto-refresh <input type="checkbox" class="switch" id="prAuto" checked></label><button class="btn" id="prRe">${ic('refresh')}Refresh</button>`)}
    <div id="prStats" style="margin-bottom:16px"></div><section class="card pad0" id="prTbl">${skel(10)}</section>`;
  const t = dataTable($('#prTbl'), {
    noun: 'process', search: 'Search by name or PID…', exportName: 'whatsmypc-processes', sort: { k: 'cpu', dir: -1 }, max: '66vh',
    filters: [{ label: 'All', test: () => true }, { label: 'Active', test: p => p.cpu > 0.1 || p.io > 0 }, { label: 'Heavy memory', test: p => p.ws > 500 * 1048576 }],
    cols: [
      { k: 'n', label: 'Name', cell: p => h`<span class="cell-main">${p.n}</span>${CRITICAL.test(p.n) ? h` <span class="badge" title="Windows system process">System</span>` : ''}` },
      { k: 'pid', label: 'PID', r: true, cls: 't3' },
      { k: 'cpu', label: 'CPU', r: true, cell: p => h`<div class="row" style="justify-content:flex-end;flex-wrap:nowrap;gap:10px"><span class="mtr" style="width:60px">${meter(p.cpu, 'thin ' + lvl(p.cpu, 40, 70))}</span><span class="num" style="width:44px">${p.cpu.toFixed(1)}%</span></div>`, csv: p => p.cpu.toFixed(2) },
      { k: 'ws', label: 'Memory', r: true, cell: p => fmtBytes(p.ws), csv: p => p.ws },
      { k: 'gpu', label: 'GPU', r: true, cell: p => p.gpu ? p.gpu.toFixed(1) + '%' : h`<span class="t3">–</span>` },
      { k: 'io', label: 'Disk I/O', r: true, cell: p => p.io ? fmtRate(p.io) : h`<span class="t3">–</span>`, csv: p => p.io },
      { k: 'x', label: '', sort: false, cell: p => h`<button class="btn sm ghost" data-kill="${p.pid}" data-name="${p.n}">End task</button>`, csv: () => '' },
    ],
  });
  async function load() {
    try {
      const list = await api('/api/procs');
      if (ctx.dead) return;
      t.set(list);
      const cpu = list.reduce((a, p) => a + p.cpu, 0), ws = list.reduce((a, p) => a + p.ws, 0);
      setHTML('prStats', stats([['Processes', list.length], ['Total CPU', fmtPct(cpu)], ['Total memory', fmtBytes(ws)], ['Heaviest', ([...list].sort((a, b) => b.ws - a.ws)[0] || {}).n || '–']]));
    } catch (e) { if (!ctx.dead) setHTML('prTbl', errBox(e)); }
  }
  $('#prRe').onclick = load;
  const timer = setInterval(() => $('#prAuto')?.checked && !document.hidden && !$('.scrim') && load(), 3000);
  ctx.onDestroy(() => clearInterval(timer));
  $('#prTbl').addEventListener('click', async e => {
    const b = e.target.closest('[data-kill]'); if (!b) return;
    const pid = +b.dataset.kill, name = b.dataset.name, crit = CRITICAL.test(name) || /^explorer(\.exe)?$/i.test(name);
    const ok = await modal({ title: `End ${name}?`, body: crit ? `${name} is a Windows component. Ending it can make Windows unstable, sign you out, or crash the PC. Unsaved work in other apps may be lost.` : `Any unsaved data in ${name} (PID ${pid}) will be lost.`, ok: 'End task', danger: true });
    if (!ok) return;
    try {
      const r = await post('/api/kill', { pid });
      r.ok ? toast('Task ended', `${name} (PID ${pid}) was stopped.`, 'ok') : toast('Could not end task', r.error || 'Access denied — try running as administrator.', 'bad');
      load();
    } catch (err) { toast('Could not end task', err.message, 'bad'); }
  });
  load();
});

/* ---------- Connections ---------- */
page('connections', 'Tools', 'Connections', 'plug', 'ports tcp udp listening established connections netstat sockets firewall', async (el, ctx) => {
  el.innerHTML = h`${ph('Connections', 'Open ports and active network connections', h`<button class="btn" id="cnRe">${ic('refresh')}Refresh</button>`)}<div id="cnStats" style="margin-bottom:16px"></div><section class="card pad0" id="cnTbl">${skel(10)}</section>`;
  $('#cnRe').onclick = () => go('connections', true);
  const p = await info('ports', true).catch(e => ({ error: e }));
  if (ctx.dead) return;
  if (p.error) return setHTML('cnTbl', errBox(p.error));
  const rows = [...(p.tcp || []).map(r => Object.assign({ proto: 'TCP' }, r)), ...(p.udp || []).map(r => Object.assign({ proto: 'UDP' }, r))];
  const local = a => /^(127\.|::1$|0\.0\.0\.0$|::$)/.test(a);
  const listen = rows.filter(r => r.state === 'Listen'), est = rows.filter(r => r.state === 'Established');
  const exposed = listen.filter(r => !/^(127\.|::1$)/.test(r.laddr));
  setHTML('cnStats', stats([['Listening ports', listen.length], ['Reachable from network', exposed.length], ['Established', est.length], ['UDP endpoints', rows.filter(r => r.proto === 'UDP').length], ['Processes', new Set(rows.map(r => r.pid)).size]]));
  const addr = (a, port) => a.includes(':') ? `[${a}]:${port}` : `${a}:${port}`;
  dataTable($('#cnTbl'), {
    noun: 'connection', search: 'Search address, port or process…', exportName: 'whatsmypc-connections', rows, sort: { k: 'state', dir: 1 }, limit: 600,
    filters: [{ label: 'All', test: () => true }, { label: 'Listening', test: r => r.state === 'Listen' }, { label: 'Established', test: r => r.state === 'Established' }, { label: 'Internet', test: r => r.state === 'Established' && !local(r.raddr) && !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fe80)/i.test(r.raddr) }, { label: 'UDP', test: r => r.proto === 'UDP' }],
    cols: [
      { k: 'proc', label: 'Process', cell: r => h`<span class="cell-main">${r.proc || 'System'}</span> <span class="cell-sub">· ${r.pid}</span>` },
      { k: 'state', label: 'State', cell: r => badge(r.state === 'Listen' ? 'Listening' : r.state, r.state === 'Established' ? 'ok' : r.state === 'Listen' ? 'info' : '') },
      { k: 'proto', label: 'Protocol', cls: 't3' },
      { k: 'lport', label: 'Local address', v: r => addr(r.laddr, r.lport), s: r => r.lport, cell: r => h`<span class="mono">${addr(r.laddr, r.lport)}</span>` },
      { k: 'raddr', label: 'Remote address', v: r => r.rport ? addr(r.raddr, r.rport) : '', cell: r => r.rport ? h`<span class="mono">${addr(r.raddr, r.rport)}</span>` : h`<span class="t3">–</span>` },
    ],
  });
});

/* ---------- Benchmark ---------- */
page('benchmark', 'Tools', 'Benchmark', 'gauge', 'benchmark score performance test cpu disk speed stress', async (el, ctx) => {
  const draw = () => {
    const hist = store.get('bench', []), last = hist[0], prev = hist[1];
    const delta = (a, b) => b ? h` <span class="${a >= b ? 'badge ok' : 'badge bad'}">${a >= b ? '+' : ''}${((a / b - 1) * 100).toFixed(1)}%</span>` : '';
    const best = k => Math.max(1, ...hist.map(x => x[k] || 0));
    setHTML('bnBody', last ? h`<div class="grid">
      ${card('Overall score', 'zap', h`<div class="big num" style="font-size:48px">${last.score.toLocaleString()}</div><div class="sub">${fmtDate(last.time, true)}${delta(last.score, prev?.score)}</div>`, { cls: 'c4' })}
      ${card('Results', 'gauge', h`${[['Multi-core CPU', 'multi', v => v.toLocaleString() + ' pts'], ['Disk read', 'diskReadBps', fmtRate], ['Disk write', 'diskWriteBps', fmtRate]].map(([k, f, fmt]) => h`<div class="bench-bar"><span>${k}</span>${meter(last[f] / best(f) * 100, '', 'var(--accent)')}<b>${fmt(last[f])}</b></div>`)}
        <div class="cell-sub" style="margin-top:6px">Bars compare this run against your best result. ${last.threads ? `Ran on ${last.threads} threads.` : ''}</div>`, { cls: 'c8' })}
      ${hist.length > 1 ? card('History', 'clock', h`<table class="t"><thead><tr><th>Date</th><th class="r">Score</th><th class="r">Multi-core</th><th class="r">Disk read</th><th class="r">Disk write</th></tr></thead><tbody>${hist.map(b => h`<tr><td>${fmtDate(b.time, true)}</td><td class="n cell-main">${b.score.toLocaleString()}</td><td class="n">${(b.multi || 0).toLocaleString()}</td><td class="n">${fmtRate(b.diskReadBps)}</td><td class="n">${fmtRate(b.diskWriteBps)}</td></tr>`)}</tbody></table>`, { cls: 'c12', right: h`<button class="btn sm ghost" id="bnClr">${ic('trash')}Clear history</button>` }) : ''}</div>`
      : card('', '', empty('gauge', 'No benchmark results yet', 'Run a benchmark to measure your CPU and storage performance.')));
    $('#bnClr')?.addEventListener('click', async () => { if (await modal({ title: 'Clear benchmark history?', body: 'All saved results on this PC will be removed.', ok: 'Clear', danger: true })) { store.set('bench', []); draw(); } });
  };
  el.innerHTML = h`${ph('Benchmark', 'Measure multi-core CPU and storage throughput', h`<button class="btn pri" id="bnGo">${ic('play')}Run benchmark</button>`)}
    <div class="note warn" style="margin-bottom:16px">${ic('alert')}<div>The test pushes all CPU cores to 100% and writes a temporary file to disk for a few seconds. Close games and heavy apps for consistent results.</div></div><div id="bnBody"></div>`;
  draw();
  $('#bnGo').onclick = async () => {
    const b = $('#bnGo'); b.disabled = true; b.innerHTML = h`<span class="spin"></span>Running…`;
    try {
      const r = await post('/api/bench');
      const hist = store.get('bench', []); hist.unshift(r); store.set('bench', hist.slice(0, 25));
      toast('Benchmark complete', `Score ${r.score.toLocaleString()}`, 'ok');
      if (!ctx.dead) draw();
    } catch (e) { toast('Benchmark failed', e.message, 'bad'); }
    if (!ctx.dead) { b.disabled = false; b.innerHTML = h`${ic('play')}Run again`; }
  };
  if (ctx.args === 'run') $('#bnGo').click();
});

/* ---------- Cleaner ---------- */
page('cleaner', 'Tools', 'Cleanup', 'sparkle', 'clean cleanup temp cache junk free space disk', async (el, ctx) => {
  const draw = () => {
    const log = store.get('cleanLog', []);
    const total = log.reduce((a, x) => a + (x.freed || 0), 0);
    setHTML('clLog', log.length ? h`${stats([['Total freed', fmtBytes(total)], ['Cleanups', log.length], ['Last cleanup', ago(log[0].t)]])}
      <table class="t mt"><thead><tr><th>When</th><th class="r">Space freed</th></tr></thead><tbody>${log.slice(0, 10).map(x => h`<tr><td>${fmtDate(x.t, true)}</td><td class="n">${fmtBytes(x.freed)}</td></tr>`)}</tbody></table>` : empty('sparkle', 'No cleanups yet', 'Your cleanup history will appear here.'));
  };
  el.innerHTML = h`${ph('Cleanup', 'Free up disk space by removing temporary files')}
    <div class="grid">
      ${card('Temporary files', 'sparkle', h`<p class="sub" style="margin:0 0 16px">Windows and apps leave behind temporary files and caches. They're safe to delete — files currently in use are skipped automatically.</p>
        <div class="stack" style="gap:8px;margin-bottom:18px">${[['Windows Temp folder', 'C:\\Windows\\Temp'], ['Your Temp folder', '%LOCALAPPDATA%\\Temp'], ['Web & app caches', 'Cached downloads and thumbnails']].map(([a, b]) => h`<div class="tile" style="padding:10px 12px"><div class="ico">${ic('trash')}</div><div><b>${a}</b><div class="cell-sub mono">${b}</div></div></div>`)}</div>
        <button class="btn pri" id="clGo">${ic('sparkle')}Clean now</button>`, { cls: 'c6' })}
      ${card('Drive space', 'drive', h`<div id="clDr"></div>`, { cls: 'c6' })}
      ${card('Cleanup history', 'clock', h`<div id="clLog"></div>`, { cls: 'c12' })}
    </div>`;
  draw();
  $('#clGo').onclick = async () => {
    const b = $('#clGo'); b.disabled = true; b.innerHTML = h`<span class="spin"></span>Cleaning…`;
    await Actions.clean();
    if (!ctx.dead) { b.disabled = false; b.innerHTML = h`${ic('sparkle')}Clean now`; draw(); }
  };
  function up(d) {
    if (!d || ctx.dead) return;
    setHTML('clDr', h`${(d.drives || []).map(x => { const p = x.total ? (x.total - x.free) / x.total * 100 : 0; return h`<div class="drive"><div class="row sp"><b>${ic('drive')} ${trimDrive(x.letter)}:</b><span class="sub num">${fmtBytes(x.free)} free of ${fmtBytes(x.total)}</span></div>${meter(p, lvl(p, 80, 90))}</div>`; })}`);
  }
  up(L.d);
  return { update: up };
});

/* ---------- Alerts ---------- */
page('alerts', 'Tools', 'Alerts', 'bell', 'alerts notifications threshold warning temperature', async (el, ctx) => {
  const draw = () => {
    const log = store.get('alertLog', []);
    setHTML('alLog', log.length ? h`<div class="timeline">${log.slice(0, 50).map(l => h`<div class="ev"><div class="pt"></div><div><b>${l.text}</b><div class="cell-sub">${fmtDate(l.t, true)} · ${ago(l.t)}</div></div></div>`)}</div>` : empty('bell', 'No alerts yet', 'When a rule is triggered it will show up here.'));
  };
  el.innerHTML = h`${ph('Alerts', 'Get notified when your PC crosses a limit', h`<button class="btn" id="alTest">${ic('bell')}Send test alert</button>`)}
    <div class="grid">
      ${card('Rules', 'settings', h`${Alerts.rules.map((r, i) => h`<div class="setting"><div><b>${r.label}</b><span>${r.secs ? `Sustained for ${r.secs} s` : 'Checked continuously'} · repeats at most every 10 minutes</span></div>
        <label class="row" style="gap:6px"><input type="number" min="1" max="${r.unit === '%' ? 100 : 120}" value="${r.value}" data-i="${i}" data-f="value" aria-label="Threshold"><span class="t3" style="width:22px">${r.unit}</span></label>
        <label class="row" style="gap:6px"><input type="number" min="0" max="600" value="${r.secs}" data-i="${i}" data-f="secs" aria-label="Seconds"><span class="t3">sec</span></label>
        <input type="checkbox" class="switch" data-i="${i}" data-f="on" ${r.on ? 'checked' : ''} aria-label="Enabled"></div>`)}
        <div class="cell-sub" style="margin-top:12px">Alerts are evaluated while WhatsMyPC is open. Temperature rules need a sensor provider such as LibreHardwareMonitor.</div>`, { cls: 'c7' })}
      ${card('Recent alerts', 'clock', h`<div id="alLog"></div>`, { cls: 'c5', right: h`<button class="btn sm ghost" id="alClr">${ic('trash')}Clear</button>` })}
    </div>`;
  draw();
  setBadge('alerts', '');
  el.addEventListener('change', e => {
    const t = e.target; if (t.dataset.i == null) return;
    const r = Alerts.rules[+t.dataset.i];
    r[t.dataset.f] = t.type === 'checkbox' ? t.checked : clamp(+t.value || 0, +t.min, +t.max);
    Alerts.save();
    toast('Alert rule saved', '', 'ok');
  });
  $('#alClr').onclick = () => { store.set('alertLog', []); draw(); };
  $('#alTest').onclick = () => toast('Test alert', 'This is how alerts will look.', 'warn');
});

/* ---------- Report ---------- */
const REPORT_SECTIONS = ['system', 'cpu', 'memory', 'gpu', 'storage', 'network', 'battery', 'hardware', 'devices', 'security', 'startup', 'events', 'software', 'drivers'];
async function gatherReport(onStep) {
  const out = { generated: new Date().toISOString(), app: 'WhatsMyPC 2.0', live: L.d };
  for (const [i, s] of REPORT_SECTIONS.entries()) { onStep?.(i, s); out[s] = await info(s).catch(e => ({ error: String(e.message || e) })); }
  if (infoCache.has('updates')) out.updates = await info('updates').catch(() => null);
  return out;
}
function reportHtml(r) {
  const S = r.system || {}, C = (r.cpu || [])[0] || {}, M = r.memory || {}, ST = r.storage || {}, SEC = r.security || {};
  const row = (k, v) => h`<tr><th>${k}</th><td>${v ?? '–'}</td></tr>`;
  const sec = (t, rows) => h`<h2>${t}</h2><table>${rows}</table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(S.host || 'PC')} — WhatsMyPC report</title><style>
    body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#141720;max-width:880px;margin:40px auto;padding:0 24px}
    h1{font-size:26px;margin:0}h2{font-size:15px;margin:28px 0 8px;padding-bottom:6px;border-bottom:2px solid #ff5a1f}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e4e7ed;vertical-align:top}th{width:34%;color:#666;font-weight:500}
    .m{color:#666}.t th{width:auto;background:#f5f6f8}</style></head><body>${h`
    <h1>${S.manufacturer} ${S.model}</h1><div class="m">${S.host} · Generated ${fmtDate(r.generated, true)} by WhatsMyPC</div>
    ${sec('System', [row('Windows', `${S.os} (build ${S.build}, ${S.arch})`), row('Installed', fmtDate(S.installed)), row('Last boot', fmtDate(S.boot, true)), row('User', S.user)])}
    ${sec('Processor', [row('Model', C.name), row('Cores / threads', `${C.cores} / ${C.threads}`), row('Base clock', mhzStr(C.baseMHz)), row('L3 cache', C.l3KB ? fmtBytes(C.l3KB * 1024, 0) : null)])}
    ${sec('Memory', [row('Installed', memSummary(M, S)), ...(M.modules || []).map(m => row(m.slot, `${fmtBytes(m.bytes, 0)} ${m.type || ''} @ ${m.configured || m.speed} MT/s · ${m.part || ''}`))])}
    ${sec('Graphics', (r.gpu || []).map(g => row(g.name, `${g.vram ? fmtBytes(g.vram, 0) : 'Shared'} · driver ${g.driver} (${fmtDate(g.driverDate)})`)))}
    ${sec('Storage', [...(ST.disks || []).map(d => row(d.name, `${fmtBytes(d.size, 0)} ${d.bus} ${d.type} · ${d.health}`)), ...(ST.volumes || []).map(v => row(`Volume ${v.letter}:`, `${fmtBytes(v.free)} free of ${fmtBytes(v.size)} (${v.fs})`))])}
    ${sec('Network', (r.network || []).map(a => row(a.name, `${a.desc} · ${(a.ipv4 || []).join(', ')} · ${a.speed || ''}`)))}
    ${sec('Motherboard & firmware', [row('Board', `${r.hardware?.board?.maker} ${r.hardware?.board?.product}`), row('BIOS', `${r.hardware?.bios?.maker} ${r.hardware?.bios?.version} (${fmtDate(r.hardware?.bios?.date)})`), row('Chipset', r.hardware?.chipset)])}
    ${sec('Security', [row('Real-time protection', SEC.defender?.realtime ? 'On' : 'Off'), row('Firewall', (SEC.firewall || []).map(f => `${f.name}: ${f.enabled ? 'on' : 'off'}`).join(', ')), row('BitLocker', (SEC.bitlocker || []).map(b => `${b.drive} ${b.on ? 'encrypted' : 'not encrypted'}`).join(', ')), row('UAC', SEC.uac ? 'On' : 'Off')])}
    ${sec('Reliability (60 days)', [row('Crashes & unexpected shutdowns', Array.isArray(r.events) ? r.events.length : null)])}
    ${sec('Installed apps', [row('Count', Array.isArray(r.software) ? r.software.length : null)])}`}</body></html>`;
}
page('report', 'Tools', 'Report & export', 'report', 'report export json html print share specs copy', async (el, ctx) => {
  el.innerHTML = h`${ph('Report & export', 'Share your PC specs or save a full system report')}
    <div class="grid">
      ${card('Quick specs', 'copy', h`<pre class="mono" id="rpSpecs" style="margin:0 0 16px;padding:14px;border-radius:10px;background:var(--s2);border:1px solid var(--line);white-space:pre-wrap;min-height:120px">Loading…</pre>
        <button class="btn pri" data-act="specs">${ic('copy')}Copy to clipboard</button>`, { cls: 'c6' })}
      ${card('Full report', 'report', h`<p class="sub" style="margin:0 0 16px">Collects every section — hardware, drivers, apps, security and reliability — into one file. Takes about 15 seconds.</p>
        <div class="stack" style="gap:10px">
          <button class="btn" id="rpHtml">${ic('report')}Download HTML report</button>
          <button class="btn" id="rpJson">${ic('download')}Download raw data (JSON)</button></div>
        <div class="sub" id="rpProg" style="margin-top:12px"></div>
        <div class="note mt">${ic('info')}<div>Reports include serial numbers and network addresses. Review before sharing publicly.</div></div>`, { cls: 'c6' })}
    </div>`;
  api('/api/specs').then(t => !ctx.dead && setText('rpSpecs', String(t).trim())).catch(e => setText('rpSpecs', 'Could not load specs: ' + e.message));
  const run = async (btn, fmt) => {
    $$('#rpHtml,#rpJson').forEach(b => b.disabled = true);
    const r = await gatherReport((i, s) => !ctx.dead && setText('rpProg', `Collecting ${s} (${i + 1}/${REPORT_SECTIONS.length})…`));
    const name = `whatsmypc-${(r.system?.host || 'pc').toLowerCase()}-${stamp()}`;
    fmt === 'html' ? download(name + '.html', reportHtml(r), 'text/html') : download(name + '.json', JSON.stringify(r, null, 2));
    if (!ctx.dead) { setText('rpProg', 'Report saved to your Downloads folder.'); $$('#rpHtml,#rpJson').forEach(b => b.disabled = false); }
    toast('Report ready', name + (fmt === 'html' ? '.html' : '.json'), 'ok');
  };
  $('#rpHtml').onclick = e => run(e.currentTarget, 'html');
  $('#rpJson').onclick = e => run(e.currentTarget, 'json');
});

/* ---------- Settings ---------- */
page('settings', 'Tools', 'Settings', 'settings', 'settings preferences theme dark light accent color autostart remote units', async (el, ctx) => {
  const ACCENTS = ['#ff5a1f', '#f43f5e', '#8b5cf6', '#3b82f6', '#06b6d4', '#22c55e', '#eab308'];
  const seg = (k, opts) => h`<div class="seg" data-k="${k}">${opts.map(([v, t]) => h`<button data-v="${v}" class="${String(settings[k]) === String(v) ? 'on' : ''}">${t}</button>`)}</div>`;
  el.innerHTML = h`${ph('Settings', 'Personalise WhatsMyPC')}
    <div class="grid">
      ${card('Appearance', 'sun', h`
        <div class="setting"><div><b>Theme</b><span>Follow Windows or pick a theme</span></div>${seg('theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']])}</div>
        <div class="setting"><div><b>Accent colour</b><span>Used for highlights and charts</span></div><div class="swatches">${ACCENTS.map(c => h`<button style="--c:${c}" data-accent="${c}" class="${settings.accent === c ? 'on' : ''}" aria-label="Accent ${c}"></button>`)}</div></div>
        <div class="setting"><div><b>Compact sidebar</b><span>Show icons only (Ctrl+B)</span></div><input type="checkbox" class="switch" id="stCompact" ${settings.compact ? 'checked' : ''}></div>`, { cls: 'c6' })}
      ${card('Monitoring', 'gauge', h`
        <div class="setting"><div><b>Refresh rate</b><span>How often live data updates</span></div>${seg('refresh', [[1000, '1 s'], [2000, '2 s'], [5000, '5 s']])}</div>
        <div class="setting"><div><b>Temperature unit</b><span>Applies to all sensors</span></div>${seg('unit', [['C', '°C'], ['F', '°F']])}</div>
        <div class="setting"><div><b>Alerts</b><span>Thresholds for CPU, memory, disk and temperature</span></div><a class="btn sm" href="#/alerts">Configure ${ic('chev')}</a></div>`, { cls: 'c6' })}
      ${card('System', 'power', h`
        <div class="setting"><div><b>Start with Windows</b><span>Launch WhatsMyPC when you sign in</span></div><input type="checkbox" class="switch" id="stAuto"></div>
        <div class="setting"><div><b>Remote access</b><span>View stats from a phone on your local network</span></div><input type="checkbox" class="switch" id="stRemote"></div>
        <div class="setting" id="stPassRow"><div><b>Remote password</b><span>Required to open the remote dashboard</span></div><input type="password" id="stPass" placeholder="Set a password" style="width:200px"><button class="btn sm" id="stPassSave">Save</button></div>`, { cls: 'c6' })}
      ${card('Keyboard shortcuts', 'command', kv([['Ctrl + K', 'Search pages and actions'], ['Ctrl + C', 'Copy specs (when nothing is selected)'], ['Ctrl + S', 'Save a screenshot'], ['Ctrl + O', 'Open the gaming overlay'], ['Ctrl + B', 'Toggle compact sidebar'], ['Esc', 'Close dialogs']].map(([k, v]) => [h`<kbd>${k}</kbd>`, v])), { cls: 'c6' })}
      ${card('Data & about', 'info', h`
        <div class="setting"><div><b>Local data</b><span>Benchmark, speed test, cleanup and alert history stored on this PC</span></div><button class="btn sm" id="stReset">${ic('trash')}Reset</button></div>
        <div class="setting"><div><b>WhatsMyPC 2.0</b><span>Hardware telemetry for Windows · Rust + WebView2</span></div><a class="btn sm ghost" href="https://github.com/anuzdhk/WhatMyPC" target="_blank" rel="noopener">GitHub</a></div>`, { cls: 'c12' })}
    </div>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('.seg button');
    if (b) { const k = b.parentElement.dataset.k; const v = k === 'refresh' ? +b.dataset.v : b.dataset.v; setSetting(k, v); $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); }
    const a = e.target.closest('[data-accent]');
    if (a) { setSetting('accent', a.dataset.accent); $$('[data-accent]').forEach(x => x.classList.toggle('on', x === a)); }
  });
  $('#stCompact').onchange = e => setSetting('compact', e.target.checked);
  try {
    srv = await api('/api/settings');
    if (ctx.dead) return;
    $('#stAuto').checked = !!srv.autostart; $('#stRemote').checked = !!srv.remote?.enabled; $('#stPass').value = srv.remote?.password || '';
  } catch (e) {}
  const saved = ok => ok ? toast('Settings saved', '', 'ok') : toast('Could not save settings', '', 'bad');
  $('#stAuto').onchange = async e => saved(await saveServer({ autostart: e.target.checked }));
  $('#stRemote').onchange = async e => saved(await saveServer({ remote: Object.assign({}, srv?.remote, { enabled: e.target.checked }) }));
  $('#stPassSave').onclick = async () => saved(await saveServer({ remote: Object.assign({}, srv?.remote, { password: $('#stPass').value }) }));
  $('#stReset').onclick = async () => {
    if (!await modal({ title: 'Reset local data?', body: 'Benchmark, speed test, cleanup and alert history will be deleted. Your preferences are kept.', ok: 'Reset', danger: true })) return;
    ['bench', 'speedLog', 'cleanLog', 'alertLog'].forEach(k => store.set(k, []));
    toast('Local data cleared', '', 'ok');
  };
});

/* ================================================================
   Router & shell
   ================================================================ */
let view = null, viewCtx = null;
function buildNav() {
  $('#nav').innerHTML = h`${GROUPS.map(g => h`<div class="ng"><div>${g}</div>${PAGES.filter(p => p.group === g).map(p => h`<a href="#/${p.id}" data-id="${p.id}" title="${p.title}">${ic(p.icon)}<span>${p.title}</span><i class="badge" data-badge="${p.id}" hidden></i></a>`)}</div>`)}`;
}
function setBadge(id, text, cls = '') {
  const b = $(`[data-badge="${id}"]`); if (!b) return;
  b.hidden = !text; b.textContent = text; b.className = 'badge ' + cls;
}
function go(id, force) {
  if (force && location.hash === '#/' + id) return route(true);
  location.hash = '#/' + id;
}
async function route(force) {
  const [id, args] = location.hash.replace(/^#\/?/, '').split('/');
  const p = PAGES.find(x => x.id === id) || PAGES[0];
  if (p.id !== id) { history.replaceState(null, '', '#/' + p.id); }
  if (viewCtx) { viewCtx.dead = true; viewCtx.cleanup.forEach(f => { try { f(); } catch (e) {} }); }
  view = null;
  const ctx = viewCtx = { dead: false, force: !!force, args, cleanup: [], onDestroy(f) { this.cleanup.push(f); } };
  store.set('page', p.id);
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.id === p.id));
  $('#crumbGroup').textContent = p.group; $('#crumbTitle').textContent = p.title;
  document.title = `${p.title} · WhatsMyPC`;
  const el = document.createElement('div'); el.className = 'pg';
  const host = $('#page'); host.replaceChildren(el); host.scrollTop = 0;
  try {
    const v = await p.render(el, ctx);
    if (!ctx.dead) view = v || null;
  } catch (e) {
    console.error(e);
    if (!ctx.dead) el.innerHTML = h`${ph(p.title)}${card('', '', errBox(e))}`;
  }
}
window.addEventListener('hashchange', () => route());

/* ---------- Command palette ---------- */
const COMMANDS = [
  { t: 'Copy specs to clipboard', i: 'copy', k: 'Ctrl C', run: Actions.specs },
  { t: 'Take a screenshot', i: 'camera', k: 'Ctrl S', run: Actions.shot },
  { t: 'Open gaming overlay', i: 'gamepad', k: 'Ctrl O', run: Actions.overlay },
  { t: 'Toggle light / dark theme', i: 'sun', run: Actions.theme },
  { t: 'Toggle compact sidebar', i: 'sidebar', k: 'Ctrl B', run: Actions.sidebar },
  { t: 'Run internet speed test', i: 'gauge', run: () => go('network/speedtest') },
  { t: 'Run benchmark', i: 'zap', run: () => go('benchmark/run') },
  { t: 'Clean temporary files', i: 'sparkle', run: Actions.clean },
  { t: 'Export system report', i: 'report', run: () => go('report') },
  { t: 'Check for Windows updates', i: 'update', run: () => go('updates', true) },
];
function palette() {
  if ($('.pal')) return;
  const s = document.createElement('div'); s.className = 'scrim';
  s.innerHTML = h`<div class="pal" role="dialog" aria-modal="true" aria-label="Command palette"><div class="in">${ic('search')}<input placeholder="Search pages and actions…" aria-label="Search" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><ul role="listbox"></ul>
    <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span></div></div>`;
  $('#layer').append(s);
  const inp = $('input', s), ul = $('ul', s);
  let items = [], sel = 0;
  const close = () => s.remove();
  function render() {
    const q = inp.value.trim().toLowerCase();
    const score = (title, keys) => { const t = title.toLowerCase(); if (!q) return 1; if (t.startsWith(q)) return 3; if (t.includes(q)) return 2; return (keys || '').includes(q) || q.split(/\s+/).every(w => (t + ' ' + keys).includes(w)) ? 1 : 0; };
    const pages = PAGES.map(p => ({ t: p.title, i: p.icon, k: p.group, sc: score(p.title, p.keys), run: () => go(p.id) })).filter(x => x.sc).sort((a, b) => b.sc - a.sc);
    const acts = COMMANDS.map(c => Object.assign({ sc: score(c.t, '') }, c)).filter(x => x.sc).sort((a, b) => b.sc - a.sc);
    items = q ? [...pages, ...acts].sort((a, b) => b.sc - a.sc) : [...acts, ...pages];
    sel = 0;
    const li = (x, i) => h`<li class="o ${i === sel ? 'on' : ''}" data-i="${i}" role="option">${ic(x.i)}<span>${x.t}</span>${x.k ? h`<em>${x.k}</em>` : ''}</li>`;
    if (!items.length) { ul.innerHTML = h`<li class="h">No results</li>`; return; }
    ul.innerHTML = q ? h`${items.map(li)}` : h`<li class="h">Actions</li>${acts.map(li)}<li class="h">Pages</li>${pages.map((x, j) => li(x, acts.length + j))}`;
  }
  const mark = () => { $$('li.o', ul).forEach(l => l.classList.toggle('on', +l.dataset.i === sel)); $(`li.o[data-i="${sel}"]`, ul)?.scrollIntoView({ block: 'nearest' }); };
  const exec = i => { const x = items[i]; if (!x) return; close(); x.run(); };
  inp.addEventListener('input', render);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(sel); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  ul.addEventListener('mousemove', e => { const l = e.target.closest('li.o'); if (l && +l.dataset.i !== sel) { sel = +l.dataset.i; mark(); } });
  ul.addEventListener('click', e => { const l = e.target.closest('li.o'); if (l) exec(+l.dataset.i); });
  s.addEventListener('mousedown', e => { if (e.target === s) close(); });
  render(); inp.focus();
}

/* ---------- Keyboard ---------- */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const sc = $('.scrim'); if (sc && !$('.modal', sc)) sc.remove(); return; }
  if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (k === 'k') { e.preventDefault(); palette(); }
  else if (k === 'c' && !typing && !String(getSelection())) { e.preventDefault(); Actions.specs(); }
  else if (k === 's') { e.preventDefault(); Actions.shot(); }
  else if (k === 'o') { e.preventDefault(); Actions.overlay(); }
  else if (k === 'b') { e.preventDefault(); Actions.sidebar(); }
});

/* ---------- Boot ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  buildNav();
  $('#bCmd').onclick = palette;
  $('#bSpecs').onclick = Actions.specs;
  $('#bShot').onclick = Actions.shot;
  $('#bOverlay').onclick = Actions.overlay;
  $('#bTheme').onclick = Actions.theme;
  $('#bSide').onclick = Actions.sidebar;
  document.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a && Actions[a.dataset.act]) Actions[a.dataset.act](); });
  // First run: adopt the theme saved by the server
  if (store.get('theme', null) == null) {
    try { srv = await api('/api/settings'); if (srv.theme === 'light' || srv.theme === 'dark') settings.theme = srv.theme; if (srv.compact) settings.compact = true; } catch (e) {}
  }
  applyAppearance();
  const n = store.get('alertLog', []).length; if (n) setBadge('alerts', String(n), 'warn');
  if (!location.hash) history.replaceState(null, '', '#/' + store.get('page', 'overview'));
  await preloadHistory();
  route();
  pollLive();
  ['system', 'cpu', 'memory', 'gpu', 'storage'].forEach(s => info(s).catch(() => {}));
});

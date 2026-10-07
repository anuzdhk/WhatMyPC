// WhatsMyPC Frontend Application Logic - UIcons Rounded Edition
'use strict';

const SECTIONS = [
  { id: 'overview', name: 'Overview', icon: 'fi-rr-apps' },
  { id: 'cpu', name: 'CPU Processor', icon: 'fi-rr-microchip' },
  { id: 'memory', name: 'Memory (RAM)', icon: 'fi-rr-memory' },
  { id: 'gpu', name: 'Graphics (GPU)', icon: 'fi-rr-display-code' },
  { id: 'storage', name: 'Storage & SMART', icon: 'fi-rr-hdd' },
  { id: 'network', name: 'Network & Adapters', icon: 'fi-rr-network' },
  { id: 'battery', name: 'Battery Health', icon: 'fi-rr-battery-bolt' },
  { id: 'hardware', name: 'Hardware & BIOS', icon: 'fi-rr-computer' },
  { id: 'devices', name: 'Peripherals & Displays', icon: 'fi-rr-usb-pendrive' },
  { id: 'processes', name: 'Process Manager', icon: 'fi-rr-list-check' },
  { id: 'security', name: 'Security & Defender', icon: 'fi-rr-shield-check' },
  { id: 'storage-cleanup', name: 'Disk Space & Cleaner', icon: 'fi-rr-broom' },
  { id: 'benchmark', name: 'Hardware Benchmark', icon: 'fi-rr-tachometer-fast' },
  { id: 'alerts', name: 'Monitoring Alerts', icon: 'fi-rr-bell' },
  { id: 'history', name: 'History & Trends', icon: 'fi-rr-chart-histogram' },
  { id: 'software', name: 'Installed Software', icon: 'fi-rr-box-open' },
  { id: 'startup', name: 'Startup Programs', icon: 'fi-rr-stopwatch' },
  { id: 'drivers', name: 'Drivers & Updates', icon: 'fi-rr-settings-sliders' },
  { id: 'events', name: 'Crash & Event Logs', icon: 'fi-rr-triangle-warning' },
  { id: 'settings', name: 'Settings & Remote', icon: 'fi-rr-settings' }
];

let curSection = 'overview';
let liveData = null;
let procsData = [];
let chartHistory = { cpu: [], ram: [], netRx: [], netTx: [] };
const MAX_CHART_POINTS = 30;

function el(tag, cls, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}

function fmtBytes(b, decimals = 1) {
  if (b == null || isNaN(b) || b === 0) return '0 B';
  const k = 1024, dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + ' ' + (sizes[i] || 'B');
}

function fmtRate(b) {
  return fmtBytes(b) + '/s';
}

function fmtUptime(sec) {
  if (!sec) return '0m';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function toast(msg, type = 'info') {
  const t = el('div', 'toast');
  const iconClass = type === 'ok' ? 'fi-rr-check-circle' : type === 'bad' ? 'fi-rr-cross-circle' : 'fi-rr-info';
  t.innerHTML = `<strong><i class="fi ${iconClass}" style="margin-right:6px;"></i>WhatsMyPC</strong><br>${msg}`;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// Build Sidebar Navigation
function initNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  
  let group1 = el('div', 'sep', 'SYSTEM MONITOR');
  nav.appendChild(group1);

  SECTIONS.forEach((s, idx) => {
    if (idx === 9) {
      nav.appendChild(el('div', 'sep', 'TOOLS & PERFORMANCE'));
    } else if (idx === 15) {
      nav.appendChild(el('div', 'sep', 'DETAILS & CONFIG'));
    }
    const a = el('a', '', '');
    a.dataset.id = s.id;
    a.innerHTML = `<i class="fi ${s.icon}" style="font-size:15px; margin-right:8px; display:inline-flex; align-items:center;"></i> <span>${s.name}</span>`;
    a.onclick = () => switchTab(s.id);
    if (s.id === curSection) a.classList.add('on');
    nav.appendChild(a);
  });
}

function switchTab(id) {
  curSection = id;
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('on', a.dataset.id === id);
  });
  renderPage();
}

// Sparkline / Mini Canvas Chart Drawer
function drawMiniChart(canvas, points, color = '#ff5500', maxVal = 100) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const h = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.clearRect(0, 0, w, h);
  if (!points || points.length < 2) return;

  const step = w / (MAX_CHART_POINTS - 1);
  const startIdx = Math.max(0, points.length - MAX_CHART_POINTS);
  const visible = points.slice(startIdx);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * window.devicePixelRatio;

  visible.forEach((val, i) => {
    const x = i * step;
    const norm = Math.min(1, Math.max(0, (val || 0) / maxVal));
    const y = h - (norm * (h - 4) + 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill gradient
  ctx.lineTo((visible.length - 1) * step, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();
}

// Main Polling Loop
async function pollLiveData() {
  try {
    const res = await fetch('/api/live');
    if (res.ok) {
      liveData = await res.json();
      updateHeaderStatus();
      recordHistory(liveData);
      updateActiveView();
    }
  } catch (e) {
    console.error('Failed to poll live data', e);
  }
  setTimeout(pollLiveData, 1000);
}

function recordHistory(d) {
  if (!d) return;
  chartHistory.cpu.push(d.cpu?.total || 0);
  if (chartHistory.cpu.length > MAX_CHART_POINTS) chartHistory.cpu.shift();

  const ramPct = d.mem ? (d.mem.used / d.mem.total) * 100 : 0;
  chartHistory.ram.push(ramPct);
  if (chartHistory.ram.length > MAX_CHART_POINTS) chartHistory.ram.shift();

  chartHistory.netRx.push(d.net?.rx || 0);
  if (chartHistory.netRx.length > MAX_CHART_POINTS) chartHistory.netRx.shift();

  chartHistory.netTx.push(d.net?.tx || 0);
  if (chartHistory.netTx.length > MAX_CHART_POINTS) chartHistory.netTx.shift();
}

function updateHeaderStatus() {
  if (!liveData) return;
  const hpill = document.getElementById('hpill');
  const h = liveData.health || { score: 100, level: 'Good' };
  hpill.textContent = `Health: ${h.level} (${h.score}/100)`;
  hpill.className = `pill ${h.level}`;
}

function updateActiveView() {
  if (!liveData) return;
  if (curSection === 'overview') updateOverviewLive();
  else if (curSection === 'cpu') updateCpuLive();
  else if (curSection === 'memory') updateMemoryLive();
  else if (curSection === 'gpu') updateGpuLive();
  else if (curSection === 'network') updateNetworkLive();
}

// ----------------- PAGE RENDERING -----------------

function renderPage() {
  const page = document.getElementById('page');
  page.innerHTML = '';

  switch (curSection) {
    case 'overview': renderOverview(page); break;
    case 'cpu': renderCpu(page); break;
    case 'memory': renderMemory(page); break;
    case 'gpu': renderGpu(page); break;
    case 'storage': renderStorage(page); break;
    case 'network': renderNetwork(page); break;
    case 'battery': renderBattery(page); break;
    case 'hardware': renderHardware(page); break;
    case 'devices': renderDevices(page); break;
    case 'processes': renderProcesses(page); break;
    case 'security': renderSecurity(page); break;
    case 'storage-cleanup': renderStorageCleanup(page); break;
    case 'benchmark': renderBenchmark(page); break;
    case 'alerts': renderAlerts(page); break;
    case 'history': renderHistory(page); break;
    case 'software': renderSoftware(page); break;
    case 'startup': renderStartup(page); break;
    case 'drivers': renderDrivers(page); break;
    case 'events': renderEvents(page); break;
    case 'settings': renderSettings(page); break;
    default:
      page.innerHTML = `<div class="card"><h3>Unknown Section</h3></div>`;
  }
}

// --- 1. OVERVIEW ---
async function renderOverview(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-apps" style="margin-right:8px;"></i>System Overview</h1>
    <div id="sys-info-banner" class="card" style="margin-bottom:14px;">Loading system details...</div>
    <div class="grid">
      <div class="card" style="grid-column: span 4;">
        <h3><i class="fi fi-rr-microchip"></i> CPU Load</h3>
        <div class="big" id="ov-cpu-val">0%</div>
        <div class="sub" id="ov-cpu-sub">Detecting clock & cores...</div>
        <canvas id="ov-cpu-chart" class="g"></canvas>
      </div>
      <div class="card" style="grid-column: span 4;">
        <h3><i class="fi fi-rr-memory"></i> Memory (RAM)</h3>
        <div class="big" id="ov-ram-val">0%</div>
        <div class="sub" id="ov-ram-sub">Used: -- / Free: --</div>
        <canvas id="ov-ram-chart" class="g"></canvas>
      </div>
      <div class="card" style="grid-column: span 4;">
        <h3><i class="fi fi-rr-display-code"></i> GPU Utilization</h3>
        <div class="big" id="ov-gpu-val">--</div>
        <div class="sub" id="ov-gpu-sub">Checking dedicated / integrated GPU...</div>
        <div class="bar"><i id="ov-gpu-bar" style="width:0%; background:var(--accent);"></i></div>
      </div>
      <div class="card" style="grid-column: span 6;">
        <h3><i class="fi fi-rr-hdd"></i> Active Storage Drives</h3>
        <div id="ov-drives-list">Scanning mounted drives...</div>
      </div>
      <div class="card" style="grid-column: span 6;">
        <h3><i class="fi fi-rr-network"></i> Network Live Traffic</h3>
        <div class="row sp">
          <div><span class="sub"><i class="fi fi-rr-arrow-small-down"></i> Download:</span> <b id="ov-net-rx" style="color:#2ea043;">0 KB/s</b></div>
          <div><span class="sub"><i class="fi fi-rr-arrow-small-up"></i> Upload:</span> <b id="ov-net-tx" style="color:#ff7722;">0 KB/s</b></div>
          <div><span class="sub"><i class="fi fi-rr-dashboard"></i> Ping:</span> <b id="ov-net-lat">-- ms</b></div>
        </div>
        <canvas id="ov-net-chart" class="g"></canvas>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3><i class="fi fi-rr-shield-check"></i> Health Analysis & Recommendations</h3>
        <div id="ov-health-box">Analysing PC diagnostics...</div>
      </div>
    </div>
  `;

  // Fetch static host details
  try {
    const sys = await (await fetch('/api/info/system')).json();
    const box = document.getElementById('sys-info-banner');
    if (box && sys) {
      box.innerHTML = `
        <div class="row sp">
          <div>
            <b>${sys.os || 'Windows'}</b> <span class="tag">${sys.arch || 'x64'}</span> 
            <div class="sub">Build: ${sys.build || ''} | Host: <b>${sys.host}</b> | User: <b>${sys.user}</b></div>
          </div>
          <div style="text-align:right;">
            <div>Hardware: <b>${sys.manufacturer || 'System'} ${sys.model || ''}</b></div>
            <div class="sub">Last Boot: ${sys.boot ? new Date(sys.boot).toLocaleString() : '--'}</div>
          </div>
        </div>
      `;
    }
  } catch (e) {}

  updateOverviewLive();
}

function updateOverviewLive() {
  if (!liveData) return;
  const cpuVal = document.getElementById('ov-cpu-val');
  if (cpuVal) {
    const cpuPct = Math.round(liveData.cpu?.total || 0);
    cpuVal.textContent = cpuPct + '%';
    const tempStr = liveData.cpu?.tempC != null ? ` | Temp: ${Math.round(liveData.cpu.tempC)}°C` : '';
    const mhzStr = liveData.cpu?.mhz ? `Clock: ${(liveData.cpu.mhz / 1000).toFixed(2)} GHz` : 'Cores: ' + (liveData.cpu?.cores?.length || '');
    document.getElementById('ov-cpu-sub').textContent = `${mhzStr}${tempStr}`;
    drawMiniChart(document.getElementById('ov-cpu-chart'), chartHistory.cpu, '#ff5500', 100);
  }

  const ramVal = document.getElementById('ov-ram-val');
  if (ramVal && liveData.mem) {
    const pct = Math.round((liveData.mem.used / liveData.mem.total) * 100);
    ramVal.textContent = pct + '%';
    document.getElementById('ov-ram-sub').textContent = `Used: ${fmtBytes(liveData.mem.used)} / Total: ${fmtBytes(liveData.mem.total)}`;
    drawMiniChart(document.getElementById('ov-ram-chart'), chartHistory.ram, '#a371f7', 100);
  }

  const gpuVal = document.getElementById('ov-gpu-val');
  if (gpuVal) {
    const gPct = liveData.gpu?.util != null ? Math.round(liveData.gpu.util) : null;
    gpuVal.textContent = gPct != null ? `${gPct}%` : 'N/A';
    const gBar = document.getElementById('ov-gpu-bar');
    if (gBar) gBar.style.width = (gPct || 0) + '%';
    const tempGStr = liveData.gpu?.tempC != null ? `Temp: ${Math.round(liveData.gpu.tempC)}°C` : '';
    const vramStr = liveData.gpu?.vramUsedMB ? `VRAM: ${Math.round(liveData.gpu.vramUsedMB)} MB` : '';
    document.getElementById('ov-gpu-sub').textContent = [tempGStr, vramStr].filter(Boolean).join(' | ') || 'GPU Monitoring Active';
  }

  const drvBox = document.getElementById('ov-drives-list');
  if (drvBox && liveData.drives) {
    drvBox.innerHTML = liveData.drives.map(d => {
      const used = d.total - d.free;
      const pct = Math.round((used / d.total) * 100);
      return `
        <div style="margin-bottom:8px;">
          <div class="row sp">
            <b><i class="fi fi-rr-hdd" style="color:var(--accent);margin-right:6px;"></i>Drive ${d.letter}:</b>
            <span class="sub">${fmtBytes(used)} / ${fmtBytes(d.total)} (${pct}%)</span>
          </div>
          <div class="bar"><i style="width:${pct}%; background:${pct > 90 ? 'var(--bad)' : 'var(--accent)'};"></i></div>
        </div>
      `;
    }).join('') || '<div class="sub">No local drives detected.</div>';
  }

  const rxEl = document.getElementById('ov-net-rx');
  if (rxEl && liveData.net) {
    rxEl.textContent = fmtRate(liveData.net.rx);
    document.getElementById('ov-net-tx').textContent = fmtRate(liveData.net.tx);
    document.getElementById('ov-net-lat').textContent = liveData.net.latency != null ? `${liveData.net.latency} ms` : '--';
    drawMiniChart(document.getElementById('ov-net-chart'), chartHistory.netRx, '#2ea043', 1000000);
  }

  const hBox = document.getElementById('ov-health-box');
  if (hBox && liveData.health) {
    const recs = liveData.health.recs || [];
    hBox.innerHTML = `
      <div class="row" style="gap:16px;">
        <span class="pill ${liveData.health.level}" style="font-size:14px; padding:6px 16px;">System Health: ${liveData.health.level} (${liveData.health.score} / 100)</span>
        <span class="sub">Uptime: <b>${fmtUptime(liveData.uptime)}</b></span>
      </div>
      ${recs.length ? `<ul class="recs">${recs.map(r => `<li>${r}</li>`).join('')}</ul>` : `<div style="margin-top:8px; color:var(--ok);">All primary hardware metrics and storage devices report normal health parameters.</div>`}
    `;
  }
}

// --- 2. CPU ---
async function renderCpu(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-microchip" style="margin-right:8px;"></i>CPU Processor Details</h1>
    <div class="grid">
      <div class="card" style="grid-column: span 12;" id="cpu-static-card">Loading CPU specs...</div>
      <div class="card" style="grid-column: span 8;">
        <h3>Per-Core Live Utilization</h3>
        <div id="cpu-cores-grid" class="core">Analyzing cores...</div>
      </div>
      <div class="card" style="grid-column: span 4;">
        <h3>Power & Clock</h3>
        <div class="stat"><span>Base / Current Clock:</span><b id="cpu-clock-stat">--</b></div>
        <div class="stat" style="margin-top:12px;"><span>Package Temperature:</span><b id="cpu-temp-stat">--</b></div>
        <div class="stat" style="margin-top:12px;"><span>Power Draw:</span><b id="cpu-power-stat">--</b></div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3>Top Active Processes by CPU Usage</h3>
        <div class="tablewrap"><table class="t" id="cpu-top-table"><thead><tr><th>PID</th><th>Process</th><th>CPU %</th><th>Memory</th><th>Threads</th></tr></thead><tbody></tbody></table></div>
      </div>
    </div>
  `;

  try {
    const cpus = await (await fetch('/api/info/cpu')).json();
    const c = Array.isArray(cpus) ? cpus[0] : cpus;
    const card = document.getElementById('cpu-static-card');
    if (card && c) {
      card.innerHTML = `
        <div class="row sp">
          <div>
            <b style="font-size:16px;">${c.name}</b>
            <div class="sub">Vendor: ${c.vendor || ''} | Architecture: ${c.arch || 'x64'} | Socket: ${c.socket || 'N/A'}</div>
          </div>
          <div class="stats" style="grid-template-columns: repeat(4, auto);">
            <div class="stat"><span>Cores</span><b>${c.cores}</b></div>
            <div class="stat"><span>Threads</span><b>${c.threads}</b></div>
            <div class="stat"><span>Base Clock</span><b>${(c.baseMHz / 1000).toFixed(2)} GHz</b></div>
            <div class="stat"><span>L3 Cache</span><b>${c.l3KB ? (c.l3KB / 1024).toFixed(0) + ' MB' : 'N/A'}</b></div>
          </div>
        </div>
      `;
    }
  } catch (e) {}

  updateCpuLive();
}

function updateCpuLive() {
  if (!liveData || !liveData.cpu) return;
  const grid = document.getElementById('cpu-cores-grid');
  if (grid && liveData.cpu.cores) {
    grid.innerHTML = liveData.cpu.cores.map((u, i) => {
      const pct = Math.round(u);
      return `<div><b>Core #${i}</b>: ${pct}%<div class="bar"><i style="width:${pct}%; background:${pct > 80 ? 'var(--bad)' : 'var(--accent)'};"></i></div></div>`;
    }).join('');
  }

  const clockEl = document.getElementById('cpu-clock-stat');
  if (clockEl) {
    clockEl.textContent = liveData.cpu.mhz ? `${(liveData.cpu.mhz / 1000).toFixed(2)} GHz` : '--';
    document.getElementById('cpu-temp-stat').textContent = liveData.cpu.tempC != null ? `${Math.round(liveData.cpu.tempC)} °C` : 'N/A';
    document.getElementById('cpu-power-stat').textContent = liveData.cpu.powerW != null ? `${liveData.cpu.powerW.toFixed(1)} W` : 'Sensor unavailable';
  }

  const tbody = document.querySelector('#cpu-top-table tbody');
  if (tbody && liveData.top?.cpu) {
    tbody.innerHTML = liveData.top.cpu.map(p => `
      <tr>
        <td>${p.pid}</td>
        <td><b>${p.n}</b></td>
        <td><span class="tag ${p.cpu > 50 ? 'bad' : 'ok'}">${p.cpu.toFixed(1)}%</span></td>
        <td>${fmtBytes(p.ws)}</td>
        <td>${p.th || '--'}</td>
      </tr>
    `).join('');
  }
}

// --- 3. MEMORY ---
async function renderMemory(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-memory" style="margin-right:8px;"></i>Physical & Virtual Memory</h1>
    <div class="grid">
      <div class="card" style="grid-column: span 6;">
        <h3>RAM Usage Summary</h3>
        <div class="big" id="mem-pct-val">--%</div>
        <div class="sub" id="mem-detail-val">Used: -- / Free: --</div>
        <div class="bar" style="margin:12px 0;"><i id="mem-bar" style="width:0%; background:var(--accent);"></i></div>
        <div class="stats">
          <div class="stat"><span>Cached:</span><b id="mem-cache">--</b></div>
          <div class="stat"><span>Commit Charge:</span><b id="mem-commit">--</b></div>
          <div class="stat"><span>Page File:</span><b id="mem-page">--</b></div>
        </div>
      </div>
      <div class="card" style="grid-column: span 6;">
        <h3>Hardware Modules & Slots</h3>
        <div id="mem-modules-box">Scanning SMBIOS slots...</div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3>Top Processes by Working Set (Memory)</h3>
        <div class="tablewrap"><table class="t" id="mem-top-table"><thead><tr><th>PID</th><th>Process</th><th>Memory (Working Set)</th><th>CPU %</th></tr></thead><tbody></tbody></table></div>
      </div>
    </div>
  `;

  try {
    const memInfo = await (await fetch('/api/info/memory')).json();
    const box = document.getElementById('mem-modules-box');
    if (box && memInfo) {
      const mods = memInfo.modules || [];
      box.innerHTML = `
        <div class="sub" style="margin-bottom:10px;">Installed: <b>${mods.length}</b> module(s) out of <b>${memInfo.slots || mods.length}</b> total motherboard slots.</div>
        ${mods.map(m => `
          <div style="background:var(--panel2); padding:8px 12px; border-radius:8px; margin-bottom:8px;">
            <div class="row sp">
              <b>${m.slot || 'DIMM'}: ${fmtBytes(m.bytes, 0)} ${m.type || 'DDR'}</b>
              <span>${m.speed || m.configured || '--'} MT/s</span>
            </div>
            <div class="sub">Manufacturer: ${m.maker || 'Unknown'} | Part: ${m.part || 'N/A'}</div>
          </div>
        `).join('')}
      `;
    }
  } catch (e) {}

  updateMemoryLive();
}

function updateMemoryLive() {
  if (!liveData || !liveData.mem) return;
  const m = liveData.mem;
  const pct = Math.round((m.used / m.total) * 100);
  const pEl = document.getElementById('mem-pct-val');
  if (pEl) {
    pEl.textContent = pct + '%';
    document.getElementById('mem-detail-val').textContent = `In Use: ${fmtBytes(m.used)} | Available: ${fmtBytes(m.free)}`;
    document.getElementById('mem-bar').style.width = pct + '%';
    document.getElementById('mem-cache').textContent = fmtBytes(m.cached);
    document.getElementById('mem-commit').textContent = `${fmtBytes(m.commit)} / ${fmtBytes(m.commitLimit)}`;
    document.getElementById('mem-page').textContent = m.pageTotalMB ? `${Math.round(m.pageUsedMB)} / ${Math.round(m.pageTotalMB)} MB` : 'Managed';
  }

  const tbody = document.querySelector('#mem-top-table tbody');
  if (tbody && liveData.top?.mem) {
    tbody.innerHTML = liveData.top.mem.map(p => `
      <tr>
        <td>${p.pid}</td>
        <td><b>${p.n}</b></td>
        <td><span class="tag ok">${fmtBytes(p.ws)}</span></td>
        <td>${p.cpu.toFixed(1)}%</td>
      </tr>
    `).join('');
  }
}

// --- 4. GPU ---
async function renderGpu(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-display-code" style="margin-right:8px;"></i>Graphics Processing Units (GPU)</h1>
    <div id="gpu-list" class="grid">Loading graphics adapter telemetry...</div>
  `;

  try {
    const gpus = await (await fetch('/api/info/gpu')).json();
    const gList = Array.isArray(gpus) ? gpus : [gpus];
    const box = document.getElementById('gpu-list');
    if (box) {
      box.innerHTML = gList.map((g, i) => `
        <div class="card" style="grid-column: span 6;">
          <h3>Adapter #${i + 1}: ${g.name}</h3>
          <div class="sub" style="margin-bottom:12px;">Driver: ${g.driver || 'N/A'} (${g.driverDate ? new Date(g.driverDate).toLocaleDateString() : ''})</div>
          <div class="stat"><span>Dedicated VRAM:</span><b>${g.vram ? fmtBytes(g.vram, 1) : 'Shared'}</b></div>
          <div class="stat" style="margin-top:8px;"><span>Display Mode:</span><b>${g.w && g.h ? `${g.w}x${g.h} @ ${g.hz || 60}Hz` : 'No Active Display'}</b></div>
          <div class="stats" style="margin-top:14px;">
            <div class="stat"><span>Load:</span><b id="gpu-${i}-load">--</b></div>
            <div class="stat"><span>Temp:</span><b id="gpu-${i}-temp">--</b></div>
            <div class="stat"><span>Power:</span><b id="gpu-${i}-power">--</b></div>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {}

  updateGpuLive();
}

function updateGpuLive() {
  if (!liveData || !liveData.gpu) return;
  const g0 = document.getElementById('gpu-0-load');
  if (g0) {
    g0.textContent = liveData.gpu.util != null ? `${Math.round(liveData.gpu.util)}%` : '--';
    document.getElementById('gpu-0-temp').textContent = liveData.gpu.tempC != null ? `${Math.round(liveData.gpu.tempC)} °C` : '--';
    document.getElementById('gpu-0-power').textContent = liveData.gpu.powerW != null ? `${Math.round(liveData.gpu.powerW)} W` : '--';
  }
}

// --- 5. STORAGE ---
async function renderStorage(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-hdd" style="margin-right:8px;"></i>Storage & SMART Health</h1>
    <div class="card" style="margin-bottom:14px;">
      <h3><i class="fi fi-rr-hdd"></i> Physical Drives & SMART Status</h3>
      <div id="storage-physical-box">Loading physical disk counters...</div>
    </div>
    <div class="card">
      <h3><i class="fi fi-rr-folder"></i> Mounted Logical Volumes</h3>
      <div id="storage-volumes-box">Loading partitions...</div>
    </div>
  `;

  try {
    const st = await (await fetch('/api/info/storage')).json();
    const pBox = document.getElementById('storage-physical-box');
    if (pBox && st.disks) {
      pBox.innerHTML = `
        <div class="tablewrap"><table class="t">
          <thead><tr><th>Drive Name</th><th>Bus Type</th><th>Media</th><th>Capacity</th><th>SMART Health</th><th>Wear / Life Left</th><th>Temp</th></tr></thead>
          <tbody>
            ${st.disks.map(d => `
              <tr>
                <td><b><i class="fi fi-rr-hdd" style="color:var(--accent);margin-right:6px;"></i>${d.name}</b><div class="sub">S/N: ${d.serial || 'N/A'}</div></td>
                <td><span class="tag">${d.bus || 'SATA'}</span></td>
                <td>${d.type || 'SSD'}</td>
                <td>${fmtBytes(d.size)}</td>
                <td><span class="tag ${d.health === 'Healthy' ? 'ok' : 'bad'}">${d.health || 'OK'}</span></td>
                <td>${d.wear != null ? (100 - d.wear) + '% remaining' : 'N/A'}</td>
                <td>${d.temp != null ? d.temp + ' °C' : '--'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      `;
    }

    const vBox = document.getElementById('storage-volumes-box');
    if (vBox && st.volumes) {
      vBox.innerHTML = `
        <div class="tablewrap"><table class="t">
          <thead><tr><th>Letter</th><th>Label</th><th>Filesystem</th><th>Total</th><th>Used</th><th>Free</th><th>Usage</th></tr></thead>
          <tbody>
            ${st.volumes.map(v => {
              const used = v.size - v.free;
              const pct = Math.round((used / v.size) * 100);
              return `
                <tr>
                  <td><b>${v.letter}:</b></td>
                  <td>${v.label || 'Local Disk'}</td>
                  <td>${v.fs}</td>
                  <td>${fmtBytes(v.size)}</td>
                  <td>${fmtBytes(used)}</td>
                  <td>${fmtBytes(v.free)}</td>
                  <td style="width:160px;">
                    ${pct}%
                    <div class="bar"><i style="width:${pct}%; background:${pct > 90 ? 'var(--bad)' : 'var(--accent)'};"></i></div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table></div>
      `;
    }
  } catch (e) {}
}

// --- 6. NETWORK ---
async function renderNetwork(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-network" style="margin-right:8px;"></i>Network Adapters & Traffic</h1>
    <div class="grid">
      <div class="card" style="grid-column: span 6;">
        <h3>Speed Test & Latency</h3>
        <div class="stat"><span>Ping to 1.1.1.1:</span><b id="net-ping-val">-- ms</b></div>
        <div class="row" style="margin-top:14px;">
          <button id="btn-speedtest" onclick="runSpeedtest()"><i class="fi fi-rr-tachometer-fast" style="margin-right:6px;"></i>Run Built-in Speedtest</button>
          <span id="speedtest-status" class="sub" style="margin-left:8px;"></span>
        </div>
      </div>
      <div class="card" style="grid-column: span 6;">
        <h3>Data Transferred</h3>
        <div id="net-usage-box">Calculating bandwidth counter...</div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3>Active Network Interfaces</h3>
        <div id="net-adapters-box">Querying IP stack...</div>
      </div>
    </div>
  `;

  try {
    const adapters = await (await fetch('/api/info/network')).json();
    const box = document.getElementById('net-adapters-box');
    if (box) {
      box.innerHTML = `
        <div class="tablewrap"><table class="t">
          <thead><tr><th>Interface</th><th>Description</th><th>IPv4 Address</th><th>Gateway</th><th>MAC Address</th><th>Link Speed</th></tr></thead>
          <tbody>
            ${(adapters || []).map(a => `
              <tr>
                <td><b>${a.name}</b></td>
                <td>${a.desc}</td>
                <td>${(a.ipv4 || []).join(', ') || 'N/A'}</td>
                <td>${(a.gateway || []).join(', ') || '--'}</td>
                <td><code>${a.mac || '--'}</code></td>
                <td><span class="tag ok">${a.speed || '--'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      `;
    }

    const u = await (await fetch('/api/usage')).json();
    const uBox = document.getElementById('net-usage-box');
    if (uBox && u) {
      uBox.innerHTML = `
        <div class="stats">
          <div class="stat"><span>Today:</span><b><i class="fi fi-rr-arrow-small-down"></i>${fmtBytes(u.today.rx)} <i class="fi fi-rr-arrow-small-up"></i>${fmtBytes(u.today.tx)}</b></div>
          <div class="stat"><span>This Week:</span><b><i class="fi fi-rr-arrow-small-down"></i>${fmtBytes(u.week.rx)} <i class="fi fi-rr-arrow-small-up"></i>${fmtBytes(u.week.tx)}</b></div>
          <div class="stat"><span>This Month:</span><b><i class="fi fi-rr-arrow-small-down"></i>${fmtBytes(u.month.rx)} <i class="fi fi-rr-arrow-small-up"></i>${fmtBytes(u.month.tx)}</b></div>
        </div>
      `;
    }
  } catch (e) {}

  updateNetworkLive();
}

function updateNetworkLive() {
  if (!liveData || !liveData.net) return;
  const p = document.getElementById('net-ping-val');
  if (p) p.textContent = liveData.net.latency != null ? `${liveData.net.latency} ms` : '-- ms';
}

window.runSpeedtest = async function() {
  const btn = document.getElementById('btn-speedtest');
  const st = document.getElementById('speedtest-status');
  btn.disabled = true;
  st.textContent = 'Running test against edge CDN... (takes ~5s)';
  try {
    const res = await (await fetch('/api/speedtest', { method: 'POST', headers: { 'X-WhatsMyPC': '1' } })).json();
    if (res.error) st.textContent = 'Error: ' + res.error;
    else st.innerHTML = `<b style="color:var(--ok);"><i class="fi fi-rr-arrow-small-down"></i> ${res.downMbps} Mbps | <i class="fi fi-rr-arrow-small-up"></i> ${res.upMbps} Mbps</b>`;
  } catch (e) {
    st.textContent = 'Test failed';
  }
  btn.disabled = false;
};

// --- 7. BATTERY ---
async function renderBattery(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-battery-bolt" style="margin-right:8px;"></i>Battery Health & Power</h1>
    <div class="card" id="battery-main-card">
      <h3><i class="fi fi-rr-battery-bolt"></i> Battery Health & Status</h3>
      <div id="battery-inner-content">Inspecting ACPI Battery subsystems...</div>
    </div>
  `;

  try {
    const b = await (await fetch('/api/info/battery')).json();
    const inner = document.getElementById('battery-inner-content');
    if (inner) {
      if (!b.present) {
        inner.innerHTML = `<div class="sub">Desktop PC or No Battery detected. System is running on continuous AC power.</div>`;
      } else {
        const healthPct = b.design && b.current ? Math.round((b.current / b.design) * 100) : 100;
        inner.innerHTML = `
          <div class="row sp">
            <div>
              <div class="big">${b.percent}% ${b.charging ? 'Charging' : 'Discharging'}</div>
              <div class="sub">Estimated runtime: <b>${b.minutes ? b.minutes + ' minutes' : 'Calculating...'}</b></div>
            </div>
            <div style="text-align:right;">
              <span class="pill ${healthPct >= 80 ? 'Good' : 'Warning'}">Health: ${healthPct}%</span>
            </div>
          </div>
          <div class="bar" style="margin:16px 0;"><i style="width:${b.percent}%; background:var(--accent);"></i></div>
          <div class="stats">
            <div class="stat"><span>Designed Capacity:</span><b>${b.design || '--'} mWh</b></div>
            <div class="stat"><span>Current Full Capacity:</span><b>${b.current || '--'} mWh</b></div>
            <div class="stat"><span>Cycle Count:</span><b>${b.cycles || 'N/A'}</b></div>
          </div>
        `;
      }
    }
  } catch (e) {}
}

// --- 8. HARDWARE ---
async function renderHardware(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-computer" style="margin-right:8px;"></i>Motherboard, BIOS & Chipset</h1>
    <div class="card" id="hw-box">Querying Motherboard SMBIOS tables...</div>
  `;

  try {
    const hw = await (await fetch('/api/info/hardware')).json();
    const box = document.getElementById('hw-box');
    if (box && hw) {
      box.innerHTML = `
        <div class="kvg">
          <div>
            <h3>Motherboard</h3>
            <table class="kv">
              <tr><th>Manufacturer</th><td>${hw.board?.maker || 'N/A'}</td></tr>
              <tr><th>Product Model</th><td><b>${hw.board?.product || 'N/A'}</b></td></tr>
              <tr><th>Version</th><td>${hw.board?.version || 'N/A'}</td></tr>
              <tr><th>Serial Number</th><td>${hw.board?.serial || 'N/A'}</td></tr>
            </table>
          </div>
          <div>
            <h3>BIOS Firmware</h3>
            <table class="kv">
              <tr><th>Vendor</th><td>${hw.bios?.maker || 'N/A'}</td></tr>
              <tr><th>Version</th><td><b>${hw.bios?.version || 'N/A'}</b></td></tr>
              <tr><th>Release Date</th><td>${hw.bios?.date ? new Date(hw.bios.date).toLocaleDateString() : 'N/A'}</td></tr>
            </table>
          </div>
          <div>
            <h3>Chipset / Controller</h3>
            <table class="kv">
              <tr><th>Platform Chipset</th><td>${hw.chipset || 'Standard Host Controller'}</td></tr>
            </table>
          </div>
        </div>
      `;
    }
  } catch (e) {}
}

// --- 9. PERIPHERALS & DEVICES ---
async function renderDevices(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-usb-pendrive" style="margin-right:8px;"></i>Displays & Connected Peripherals</h1>
    <div class="card" style="margin-bottom:14px;">
      <h3>Connected Monitors</h3>
      <div id="dev-monitors-box">Detecting screens...</div>
    </div>
    <div class="card">
      <h3>Plug & Play Devices (USB, Audio, HID, Bluetooth)</h3>
      <div id="dev-pnp-box">Querying PnP Manager...</div>
    </div>
  `;

  try {
    const dev = await (await fetch('/api/info/devices')).json();
    const mBox = document.getElementById('dev-monitors-box');
    if (mBox && dev.monitors) {
      mBox.innerHTML = `
        <div class="row">
          ${dev.monitors.map((m, i) => `
            <div style="background:var(--panel2); padding:10px 14px; border-radius:8px;">
              <b>${dev.monitorNames?.[i] || m.name || ('Display ' + (i+1))}</b>
              ${m.primary ? '<span class="tag ok">Primary</span>' : ''}
              <div class="sub">${m.w} x ${m.h} @ ${m.hz || 60}Hz</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    const pBox = document.getElementById('dev-pnp-box');
    if (pBox && dev.devices) {
      pBox.innerHTML = `
        <div class="tablewrap"><table class="t">
          <thead><tr><th>Device Name</th><th>Class</th><th>Manufacturer</th><th>Status</th></tr></thead>
          <tbody>
            ${dev.devices.map(d => `
              <tr>
                <td><b>${d.name}</b></td>
                <td><span class="tag">${d.cls}</span></td>
                <td>${d.maker || 'Generic'}</td>
                <td><span class="tag ${d.status === 'OK' ? 'ok' : 'warn'}">${d.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      `;
    }
  } catch (e) {}
}

// --- 10. PROCESSES ---
let procFilter = '';
let procSort = 'cpu';

async function renderProcesses(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-list-check" style="margin-right:8px;"></i>Process Manager</h1>
    <div class="row sp" style="margin-bottom:12px;">
      <input type="text" id="proc-search" placeholder="Filter processes..." style="width:260px;" value="${procFilter}">
      <div class="row">
        <span>Sort by:</span>
        <select id="proc-sort-sel">
          <option value="cpu">CPU Usage</option>
          <option value="ws">Memory (RAM)</option>
          <option value="io">Disk I/O</option>
          <option value="gpu">GPU Engine</option>
        </select>
        <button class="ghost sm" onclick="refreshProcesses()"><i class="fi fi-rr-refresh" style="margin-right:4px;"></i>Refresh</button>
      </div>
    </div>
    <div class="tablewrap"><table class="t" id="proc-all-table">
      <thead><tr><th>PID</th><th>Process Name</th><th>CPU %</th><th>Memory</th><th>GPU %</th><th>Disk I/O</th><th>Action</th></tr></thead>
      <tbody>Loading task list...</tbody>
    </table></div>
  `;

  document.getElementById('proc-sort-sel').value = procSort;
  document.getElementById('proc-sort-sel').onchange = (e) => {
    procSort = e.target.value;
    updateProcessesTable();
  };
  document.getElementById('proc-search').oninput = (e) => {
    procFilter = e.target.value.toLowerCase();
    updateProcessesTable();
  };

  refreshProcesses();
}

async function refreshProcesses() {
  try {
    procsData = await (await fetch('/api/procs')).json();
    updateProcessesTable();
  } catch (e) {}
}

function updateProcessesTable() {
  const tbody = document.querySelector('#proc-all-table tbody');
  if (!tbody || !procsData) return;

  let list = procsData.filter(p => !procFilter || p.n.toLowerCase().includes(procFilter) || String(p.pid).includes(procFilter));
  list.sort((a, b) => (b[procSort] || 0) - (a[procSort] || 0));

  tbody.innerHTML = list.slice(0, 100).map(p => `
    <tr>
      <td>${p.pid}</td>
      <td><b>${p.n}</b></td>
      <td><span class="tag ${p.cpu > 25 ? 'bad' : 'ok'}">${p.cpu.toFixed(1)}%</span></td>
      <td>${fmtBytes(p.ws)}</td>
      <td>${p.gpu ? p.gpu.toFixed(1) + '%' : '--'}</td>
      <td>${fmtRate(p.io)}</td>
      <td><button class="danger sm" onclick="killProc(${p.pid})">End Task</button></td>
    </tr>
  `).join('');
}

window.killProc = async function(pid) {
  if (!confirm(`Are you sure you want to terminate process ${pid}?`)) return;
  try {
    const res = await (await fetch('/api/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WhatsMyPC': '1' },
      body: JSON.stringify({ pid })
    })).json();
    if (res.ok) {
      toast(`Process ${pid} terminated`, 'ok');
      refreshProcesses();
    } else {
      toast(`Failed to terminate: ${res.error}`, 'bad');
    }
  } catch (e) {
    toast('Error ending process', 'bad');
  }
};

// --- 11. SECURITY ---
async function renderSecurity(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-shield-check" style="margin-right:8px;"></i>Security & System Protection</h1>
    <div class="card" id="sec-box">Auditing Defender and BitLocker state...</div>
  `;

  try {
    const sec = await (await fetch('/api/info/security')).json();
    const box = document.getElementById('sec-box');
    if (box && sec) {
      box.innerHTML = `
        <div class="kvg">
          <div>
            <h3>Windows Defender Antivirus</h3>
            <div class="stat"><span>Real-Time Protection:</span><b style="color:${sec.defender?.realtime ? 'var(--ok)' : 'var(--bad)'}">${sec.defender?.realtime ? 'Active & Protected' : 'Disabled'}</b></div>
            <div class="sub" style="margin-top:6px;">Tamper Protection: ${sec.defender?.tamper ? 'Enabled' : 'Disabled'} | Signatures: ${sec.defender?.sigAge != null ? sec.defender.sigAge + ' days old' : 'Current'}</div>
          </div>
          <div>
            <h3>Windows Firewall</h3>
            ${(sec.firewall || []).map(f => `
              <div class="row sp" style="margin:4px 0;">
                <span>${f.name} Profile:</span>
                <span class="tag ${f.enabled ? 'ok' : 'bad'}">${f.enabled ? 'Active' : 'Off'}</span>
              </div>
            `).join('')}
          </div>
          <div>
            <h3>BitLocker & Secure Boot</h3>
            <div class="stat"><span>Secure Boot UEFI:</span><b style="color:${sec.secureBoot ? 'var(--ok)' : 'var(--warn)'}">${sec.secureBoot ? 'Enabled' : 'Disabled / Legacy'}</b></div>
            <div class="sub" style="margin-top:8px;">BitLocker Drives:</div>
            ${(sec.bitlocker || []).map(b => `<div class="sub">• Drive ${b.drive}: ${b.on ? 'Encrypted' : 'Not Protected'}</div>`).join('')}
          </div>
        </div>
      `;
    }
  } catch (e) {}
}

// --- 12. DISK SPACE & CLEANER ---
async function renderStorageCleanup(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-broom" style="margin-right:8px;"></i>Disk Breakdown & Cleanup</h1>
    <div class="grid">
      <div class="card" style="grid-column: span 6;">
        <h3>System Temp File Cleaner</h3>
        <div id="cleaner-box">Measuring temporary files...</div>
        <button id="btn-clean" class="danger" style="margin-top:12px;" onclick="runCleanTemp()"><i class="fi fi-rr-trash" style="margin-right:6px;"></i>Clean Temp & Cache Files</button>
      </div>
      <div class="card" style="grid-column: span 6;">
        <h3>Folder & Large File Scanner</h3>
        <div class="row">
          <input type="text" id="scan-path" value="C:\\Users" style="flex:1;">
          <button onclick="startFolderScan()"><i class="fi fi-rr-search" style="margin-right:6px;"></i>Scan Directory</button>
        </div>
        <div id="scan-status" class="sub" style="margin-top:8px;">Ready to scan folder sizes.</div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3>Largest Files Found</h3>
        <div class="tablewrap"><table class="t" id="large-files-table">
          <thead><tr><th>File Path</th><th>Size</th></tr></thead>
          <tbody><tr><td colspan="2" class="sub">Run a folder scan to locate files.</td></tr></tbody>
        </table></div>
      </div>
    </div>
  `;

  try {
    const temps = await (await fetch('/api/cleanup')).json();
    const box = document.getElementById('cleaner-box');
    if (box && Array.isArray(temps)) {
      const tot = temps.reduce((a, b) => a + (b.size || 0), 0);
      box.innerHTML = `
        <div class="big">${fmtBytes(tot)}</div>
        <div class="sub">Found in Windows Temp & Web Cache folders.</div>
      `;
    }
  } catch (e) {}
}

window.runCleanTemp = async function() {
  const btn = document.getElementById('btn-clean');
  btn.disabled = true;
  try {
    const res = await (await fetch('/api/cleanup', { method: 'POST', headers: { 'X-WhatsMyPC': '1' } })).json();
    toast(`Freed ${fmtBytes(res.freed)} of temporary disk space!`, 'ok');
    renderStorageCleanup(document.getElementById('page'));
  } catch (e) {
    toast('Cleanup error', 'bad');
  }
};

let currentScanId = null;
window.startFolderScan = async function() {
  const path = document.getElementById('scan-path').value;
  const statEl = document.getElementById('scan-status');
  statEl.textContent = 'Starting scanner thread...';
  try {
    const res = await (await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WhatsMyPC': '1' },
      body: JSON.stringify({ path })
    })).json();
    currentScanId = res.id;
    pollScanStatus();
  } catch (e) {
    statEl.textContent = 'Failed to start scan';
  }
};

async function pollScanStatus() {
  if (!currentScanId) return;
  try {
    const res = await (await fetch(`/api/scan?id=${currentScanId}`)).json();
    const statEl = document.getElementById('scan-status');
    if (statEl) statEl.textContent = `Scanned ${res.files} files (${fmtBytes(res.total)})... State: ${res.state}`;
    
    if (res.large) {
      const tbody = document.querySelector('#large-files-table tbody');
      if (tbody) {
        tbody.innerHTML = res.large.map(f => `<tr><td><code>${f.path}</code></td><td><b>${fmtBytes(f.size)}</b></td></tr>`).join('');
      }
    }
    if (res.state !== 'done') {
      setTimeout(pollScanStatus, 1500);
    }
  } catch (e) {}
}

// --- 13. BENCHMARK ---
async function renderBenchmark(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-tachometer-fast" style="margin-right:8px;"></i>Hardware Benchmark</h1>
    <div class="card" style="margin-bottom:14px;">
      <div class="row sp">
        <div>
          <h3>System Performance Suite</h3>
          <div class="sub">Runs multi-threaded CPU stress, RAM memory throughput, and direct drive read/write speed.</div>
        </div>
        <button id="btn-bench" onclick="runHardwareBenchmark()"><i class="fi fi-rr-bolt" style="margin-right:6px;"></i>Run Benchmark</button>
      </div>
      <div id="bench-running-msg" style="margin-top:12px; display:none; color:var(--warn);"><i class="fi fi-rr-time-fast" style="margin-right:6px;"></i>Executing benchmarks... please wait (~5 seconds).</div>
    </div>
    <div class="card">
      <h3>Benchmark History</h3>
      <div class="tablewrap"><table class="t" id="bench-hist-table">
        <thead><tr><th>Timestamp</th><th>Score</th><th>CPU Model</th><th>RAM Bandwidth</th><th>Disk Write</th><th>Disk Read</th></tr></thead>
        <tbody>Loading past runs...</tbody>
      </table></div>
    </div>
  `;

  loadBenchHistory();
}

async function loadBenchHistory() {
  try {
    const hist = await (await fetch('/api/bench')).json();
    const tbody = document.querySelector('#bench-hist-table tbody');
    if (tbody) {
      tbody.innerHTML = (hist || []).map(b => `
        <tr>
          <td>${new Date(b.time).toLocaleString()}</td>
          <td><b style="color:var(--accent); font-size:15px;">${b.score}</b></td>
          <td>${b.cpu}</td>
          <td>${fmtRate(b.ramBps)}</td>
          <td>${fmtRate(b.diskWriteBps)}</td>
          <td>${fmtRate(b.diskReadBps)}</td>
        </tr>
      `).join('') || '<tr><td colspan="6" class="sub">No benchmark history yet. Click Run Benchmark!</td></tr>';
    }
  } catch (e) {}
}

window.runHardwareBenchmark = async function() {
  const btn = document.getElementById('btn-bench');
  const msg = document.getElementById('bench-running-msg');
  btn.disabled = true;
  msg.style.display = 'block';
  try {
    const res = await (await fetch('/api/bench', { method: 'POST', headers: { 'X-WhatsMyPC': '1' } })).json();
    toast(`Benchmark finished! Score: ${res.score}`, 'ok');
    loadBenchHistory();
  } catch (e) {
    toast('Benchmark error', 'bad');
  }
  btn.disabled = false;
  msg.style.display = 'none';
};

// --- 14. ALERTS ---
async function renderAlerts(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-bell" style="margin-right:8px;"></i>Monitoring & Custom Alerts</h1>
    <div class="card" style="margin-bottom:14px;">
      <h3>Active Alert Rules</h3>
      <div id="alerts-config-box">Loading rules...</div>
    </div>
    <div class="card">
      <h3>Alert Event Trigger History</h3>
      <div class="tablewrap"><table class="t" id="alerts-log-table">
        <thead><tr><th>Timestamp</th><th>Trigger Message</th></tr></thead>
        <tbody>Loading triggers...</tbody>
      </table></div>
    </div>
  `;

  try {
    const st = await (await fetch('/api/settings')).json();
    const box = document.getElementById('alerts-config-box');
    if (box && st.alerts) {
      box.innerHTML = st.alerts.map(a => `
        <div class="row sp" style="padding:6px 0; border-bottom:1px solid var(--border);">
          <span>Condition: <b>${a.metric} ${a.op} ${a.value}</b></span>
          <span class="tag ${a.enabled ? 'ok' : 'warn'}">${a.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      `).join('');
    }

    const logs = await (await fetch('/api/alerts/log')).json();
    const tbody = document.querySelector('#alerts-log-table tbody');
    if (tbody) {
      tbody.innerHTML = (logs || []).map(l => `
        <tr><td>${new Date(l.t).toLocaleString()}</td><td><b>${l.text}</b></td></tr>
      `).join('') || '<tr><td colspan="2" class="sub">No alerts triggered yet. System operating within thresholds.</td></tr>';
    }
  } catch (e) {}
}

// --- 15. HISTORY ---
async function renderHistory(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-chart-histogram" style="margin-right:8px;"></i>Historical Telemetry Trends</h1>
    <div class="row" style="margin-bottom:14px;">
      <span>Range:</span>
      <button class="ghost sm" onclick="loadHistoryRange('hour')">Last Hour</button>
      <button class="ghost sm" onclick="loadHistoryRange('day')">24 Hours</button>
      <button class="ghost sm" onclick="loadHistoryRange('week')">7 Days</button>
      <button class="ghost sm" onclick="loadHistoryRange('month')">30 Days</button>
    </div>
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <h3>CPU & RAM Trends (%)</h3>
        <canvas id="hist-canvas-cpu" class="gl"></canvas>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3>Thermal Trends (°C)</h3>
        <canvas id="hist-canvas-temp" class="gl"></canvas>
      </div>
    </div>
  `;

  loadHistoryRange('hour');
}

window.loadHistoryRange = async function(range) {
  try {
    const rows = await (await fetch(`/api/history?range=${range}`)).json();
    const cCpu = document.getElementById('hist-canvas-cpu');
    if (cCpu && rows.length) {
      const cpuVals = rows.map(r => r[1]);
      drawMiniChart(cCpu, cpuVals, '#388bfd', 100);
    }
    const cTemp = document.getElementById('hist-canvas-temp');
    if (cTemp && rows.length) {
      const tempVals = rows.map(r => r[4]);
      drawMiniChart(cTemp, tempVals, '#f85149', 105);
    }
  } catch (e) {}
};

// --- 16. SOFTWARE ---
async function renderSoftware(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-box-open" style="margin-right:8px;"></i>Installed Software Applications</h1>
    <div class="tablewrap"><table class="t" id="software-table">
      <thead><tr><th>Application Name</th><th>Version</th><th>Publisher</th><th>Size</th></tr></thead>
      <tbody>Querying registry uninstall database...</tbody>
    </table></div>
  `;

  try {
    const list = await (await fetch('/api/info/software')).json();
    const tbody = document.querySelector('#software-table tbody');
    if (tbody) {
      tbody.innerHTML = (list || []).map(s => `
        <tr>
          <td><b>${s.name}</b></td>
          <td>${s.version || '--'}</td>
          <td>${s.publisher || '--'}</td>
          <td>${s.sizeKB ? fmtBytes(s.sizeKB * 1024) : '--'}</td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}

// --- 17. STARTUP PROGRAMS ---
async function renderStartup(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-stopwatch" style="margin-right:8px;"></i>Startup Programs & Boot Impact</h1>
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <h3>Startup Items (Run Keys & Folders)</h3>
        <div class="tablewrap"><table class="t" id="startup-items-table">
          <thead><tr><th>Program</th><th>Command</th><th>Location</th><th>User</th></tr></thead>
          <tbody>Loading startup items...</tbody>
        </table></div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3>Recent Boot Times & Diagnostics</h3>
        <div id="startup-boots-box">Loading Windows Diagnostics-Performance logs...</div>
      </div>
    </div>
  `;

  try {
    const st = await (await fetch('/api/info/startup')).json();
    const tbody = document.querySelector('#startup-items-table tbody');
    if (tbody && st.items) {
      tbody.innerHTML = st.items.map(i => `
        <tr><td><b>${i.name}</b></td><td><code>${i.command}</code></td><td>${i.location}</td><td>${i.user || 'All Users'}</td></tr>
      `).join('');
    }

    const bBox = document.getElementById('startup-boots-box');
    if (bBox && st.boots) {
      bBox.innerHTML = `
        <div class="row">
          ${st.boots.map(b => `
            <div style="background:var(--panel2); padding:10px 14px; border-radius:8px;">
              <b>Boot: ${(b.bootMs / 1000).toFixed(1)}s</b>
              <div class="sub">${new Date(b.time).toLocaleDateString()}</div>
              <div class="sub">Core: ${(b.mainMs / 1000).toFixed(1)}s | Post: ${(b.postMs / 1000).toFixed(1)}s</div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (e) {}
}

// --- 18. DRIVERS ---
async function renderDrivers(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-settings-sliders" style="margin-right:8px;"></i>Device Drivers & OS Updates</h1>
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <h3>Installed Signed Drivers</h3>
        <div class="tablewrap"><table class="t" id="drivers-table">
          <thead><tr><th>Device</th><th>Driver Version</th><th>Provider</th><th>Class</th><th>Date</th></tr></thead>
          <tbody>Scanning PnP drivers...</tbody>
        </table></div>
      </div>
    </div>
  `;

  try {
    const drvs = await (await fetch('/api/info/drivers')).json();
    const tbody = document.querySelector('#drivers-table tbody');
    if (tbody) {
      tbody.innerHTML = (drvs || []).slice(0, 200).map(d => `
        <tr>
          <td><b>${d.name}</b></td>
          <td>${d.version}</td>
          <td>${d.maker || 'Microsoft'}</td>
          <td><span class="tag">${d.cls || 'Device'}</span></td>
          <td>${d.date ? new Date(d.date).toLocaleDateString() : '--'}</td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}

// --- 19. EVENTS & CRASH LOGS ---
async function renderEvents(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-triangle-warning" style="margin-right:8px;"></i>System Crashes & Event Log</h1>
    <div class="tablewrap"><table class="t" id="events-table">
      <thead><tr><th>Time</th><th>Severity / Type</th><th>Source</th><th>Description</th></tr></thead>
      <tbody>Querying Windows System & Application event channels...</tbody>
    </table></div>
  `;

  try {
    const evs = await (await fetch('/api/info/events')).json();
    const tbody = document.querySelector('#events-table tbody');
    if (tbody) {
      tbody.innerHTML = (evs || []).map(e => `
        <tr>
          <td>${new Date(e.time).toLocaleString()}</td>
          <td><span class="tag ${e.id === 1001 || e.id === 41 ? 'bad' : 'warn'}">${e.kind} (Event ${e.id})</span></td>
          <td><b>${e.source}</b></td>
          <td>${e.msg}</td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="sub">No system crashes or critical faults recorded in the last 60 days.</td></tr>';
    }
  } catch (e) {}
}

// --- 20. SETTINGS & REMOTE ---
async function renderSettings(container) {
  container.innerHTML = `
    <h1><i class="fi fi-rr-settings" style="margin-right:8px;"></i>Settings & Remote Monitoring</h1>
    <div class="grid">
      <div class="card" style="grid-column: span 6;">
        <h3>Theme & Personalization</h3>
        <div class="row sp" style="margin:10px 0;">
          <span>Color Scheme:</span>
          <select id="set-theme-sel">
            <option value="dark">Dark Theme</option>
            <option value="light">Light Theme</option>
          </select>
        </div>
        <div class="row sp" style="margin:10px 0;">
          <span>Start with Windows (Auto-start):</span>
          <input type="checkbox" id="set-autostart-chk">
        </div>
        <div class="row sp" style="margin:10px 0;">
          <span>Compact Mode (Secondary Display):</span>
          <input type="checkbox" id="set-compact-chk">
        </div>
      </div>
      <div class="card" style="grid-column: span 6;">
        <h3>Remote Phone Monitoring</h3>
        <div class="sub" style="margin-bottom:10px;">Monitor your PC's real-time stats from any phone or browser on your local Wi-Fi.</div>
        <div class="row sp" style="margin:10px 0;">
          <span>Enable Remote Access:</span>
          <input type="checkbox" id="set-remote-chk">
        </div>
        <div class="row sp" style="margin:10px 0;">
          <span>Access Password:</span>
          <input type="password" id="set-remote-pass" placeholder="Set remote password">
        </div>
        <div id="remote-urls-box" style="margin-top:10px;" class="sub"></div>
        <button onclick="saveAppSettings()" style="margin-top:12px;"><i class="fi fi-rr-disk" style="margin-right:6px;"></i>Save Settings</button>
      </div>
      <div class="card" style="grid-column: span 12;">
        <h3>Export & Reports</h3>
        <div class="row" style="gap:12px;">
          <a href="/api/report.html" target="_blank"><button class="ghost"><i class="fi fi-rr-document" style="margin-right:6px;"></i>Export HTML Report</button></a>
          <a href="/api/report.json" download><button class="ghost"><i class="fi fi-rr-download" style="margin-right:6px;"></i>Export JSON Raw Data</button></a>
          <a href="/api/report.html?print=1" target="_blank"><button class="ghost"><i class="fi fi-rr-print" style="margin-right:6px;"></i>Print / Save as PDF</button></a>
        </div>
      </div>
    </div>
  `;

  try {
    const s = await (await fetch('/api/settings')).json();
    document.getElementById('set-theme-sel').value = s.theme || 'dark';
    document.getElementById('set-compact-chk').checked = !!s.compact;
    document.getElementById('set-autostart-chk').checked = !!s.autostart;
    document.getElementById('set-remote-chk').checked = !!s.remote?.enabled;
    document.getElementById('set-remote-pass').value = s.remote?.password || '';

    const uBox = document.getElementById('remote-urls-box');
    if (uBox && s.remoteUrls) {
      uBox.innerHTML = `Your PC URLs: <br>${s.remoteUrls.map(u => `<code><b>${u}</b></code>`).join('<br>')}`;
    }
  } catch (e) {}
}

window.saveAppSettings = async function() {
  const theme = document.getElementById('set-theme-sel').value;
  const compact = document.getElementById('set-compact-chk').checked;
  const autostart = document.getElementById('set-autostart-chk').checked;
  const remote = {
    enabled: document.getElementById('set-remote-chk').checked,
    password: document.getElementById('set-remote-pass').value
  };

  document.body.setAttribute('data-theme', theme);
  document.body.classList.toggle('compact', compact);

  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WhatsMyPC': '1' },
    body: JSON.stringify({ theme, compact, remote })
  });

  await fetch('/api/autostart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WhatsMyPC': '1' },
    body: JSON.stringify({ enabled: autostart })
  });

  toast('Settings saved successfully', 'ok');
};

// --- Top Toolbar Actions ---
function initToolbar() {
  document.getElementById('bSpecs').onclick = async () => {
    try {
      const res = await (await fetch('/api/specs')).text();
      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(res);
          copied = true;
        } catch (_) {}
      }
      if (!copied) {
        const ta = document.createElement('textarea');
        ta.value = res;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast('Hardware specs copied (CPU, RAM, Windows, Storage, GPU)!', 'ok');
    } catch (e) {
      toast('Failed to copy specs: ' + e.message, 'bad');
    }
  };

  document.getElementById('bShot').onclick = async () => {
    try {
      const res = await (await fetch('/api/screenshot', { method: 'POST', headers: { 'X-WhatsMyPC': '1' } })).json();
      if (res.file) toast(`Screenshot saved to Pictures: ${res.file}`, 'ok');
      else toast('Screenshot error', 'bad');
    } catch (e) {
      toast('Failed to screenshot', 'bad');
    }
  };

  document.getElementById('bOverlay').onclick = async () => {
    fetch('/api/overlay', { method: 'POST', headers: { 'X-WhatsMyPC': '1' } });
    toast('Gaming overlay HUD launched!', 'ok');
  };

  document.getElementById('bCompact').onclick = () => {
    document.body.classList.toggle('compact');
  };

  document.getElementById('bTheme').onclick = () => {
    const cur = document.body.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
  };

  // Search Bar Jump Navigation
  const q = document.getElementById('q');
  const res = document.getElementById('results');
  q.oninput = () => {
    const term = q.value.toLowerCase().trim();
    if (!term) { res.style.display = 'none'; return; }
    const matches = SECTIONS.filter(s => s.name.toLowerCase().includes(term) || s.id.includes(term));
    if (!matches.length) { res.style.display = 'none'; return; }
    res.style.display = 'block';
    res.innerHTML = matches.map(m => `<div onclick="switchTab('${m.id}'); document.getElementById('results').style.display='none'; document.getElementById('q').value='';"><i class="fi ${m.icon}" style="margin-right:6px;"></i> ${m.name}</div>`).join('');
  };
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  initNav();
  initToolbar();
  renderPage();
  pollLiveData();
});


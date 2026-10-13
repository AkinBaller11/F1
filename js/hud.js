// In-race HUD styled after the modern F1 broadcast / game overlay
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export function fmtTime(t, showMin = true) {
  if (!isFinite(t) || t < 0) return '-:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  const ss = s.toFixed(3).padStart(6, '0');
  return m > 0 || showMin ? `${m}:${ss}` : s.toFixed(3);
}

export class HUD {
  constructor(root, laps) {
    this.root = root;
    this.laps = laps;
    root.innerHTML = `
      <div class="tower">
        <div class="tower-head"><span class="logo"><i></i><i></i><i></i></span><span class="race">RACE</span></div>
        <div class="tower-lap">RUNDE <b id="h-lap">1</b> / ${laps}</div>
        <div class="tower-rows" id="h-rows"></div>
      </div>
      <div class="posbox">
        <div class="sectors"><i id="h-s1"></i><i id="h-s2"></i><i id="h-s3"></i></div>
        <div class="posrow"><span class="pos"><b id="h-pos">-</b> / <span id="h-tot">20</span></span><span class="laptime" id="h-time">0.000</span></div>
        <div class="best">BESTE <span id="h-best">-:--.---</span></div>
        <div class="wx" id="h-wx"></div>
      </div>
      <div class="dash">
        <div class="revs" id="h-revs">${'<i></i>'.repeat(15)}</div>
        <div class="dial ers">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="trk"/><circle cx="50" cy="50" r="42" class="val" id="h-ersring"/></svg>
          <div class="lbl">BAT</div><div class="num" id="h-ers">100%</div><div class="mode" id="h-ersmode">MITTEL</div>
        </div>
        <div class="gear" id="h-gear">N</div>
        <div class="dial spd">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="trk"/><circle cx="50" cy="50" r="42" class="val" id="h-rpmring"/></svg>
          <div class="lbl" id="h-unit">KM/H</div><div class="num" id="h-speed">0</div><div class="rpm" id="h-rpm">4000</div>
        </div>
        <div class="flags"><span id="h-drs" class="drs">DRS</span><span id="h-ot" class="ot">OVERTAKE</span></div>
        <div class="pedals"><i id="h-thr"></i><i id="h-brk"></i></div>
      </div>
      <div class="msg" id="h-msg"></div>
      <div class="warn" id="h-warn"></div>
      <div class="startlights" id="h-lights">${'<div class="pod"><i></i><i></i></div>'.repeat(5)}</div>
      <div class="camhint" id="h-cam"></div>
      <canvas class="minimap" id="h-map" width="220" height="220"></canvas>
      <div class="pill" id="h-pill"><b id="pl-gear">N</b><span id="pl-speed">0</span><small id="pl-unit">km/h</small></div>
      <div class="onboard" id="h-onb">
        <div class="ob-id"><span class="ob-bar" id="ob-bar"></span><span class="ob-num" id="ob-num">44</span><span class="ob-drv"><b id="ob-drv">HAMILTON</b><small id="ob-team">FERRARI</small></span><span class="ob-pos" id="ob-pos">P8</span></div>
        <div class="ob-data">
          <div class="ob-speed"><b id="ob-speed">0</b><small id="ob-unit">KM/H</small></div>
          <div class="ob-gear" id="ob-gear">N</div>
          <div class="ob-meters">
            <div class="ob-rpm"><i id="ob-rpm"></i></div>
            <div class="ob-pedal"><span>GAS</span><div><i id="ob-thr"></i></div></div>
            <div class="ob-pedal brk"><span>BREMSE</span><div><i id="ob-brk"></i></div></div>
          </div>
          <div class="ob-flags"><span id="ob-drs">DRS</span><span id="ob-ers">ERS <b id="ob-ersv">100</b>%</span></div>
        </div>
      </div>
    `;
    this.$ = (id) => root.querySelector('#' + id);
    this.el = {};
    for (const id of ['h-lap', 'h-rows', 'h-pos', 'h-tot', 'h-time', 'h-best', 'h-ers', 'h-ersring', 'h-ersmode', 'h-gear', 'h-speed', 'h-rpm', 'h-rpmring', 'h-drs', 'h-ot', 'h-msg', 'h-warn', 'h-lights', 'h-s1', 'h-s2', 'h-s3', 'h-thr', 'h-brk', 'h-cam', 'h-revs', 'h-wx', 'h-map', 'h-unit', 'ob-speed', 'ob-unit', 'ob-gear', 'ob-rpm', 'ob-thr', 'ob-brk', 'ob-drs', 'ob-ers', 'ob-ersv', 'ob-pos', 'pl-gear', 'pl-speed', 'pl-unit'])
      this.el[id] = this.$(id);
    this.revs = [...this.el['h-revs'].children];
    this.msgTimer = 0; this.warnTimer = 0; this.lastRows = 0;
    this.C = 2 * Math.PI * 42;
    for (const r of ['h-ersring', 'h-rpmring']) this.el[r].style.strokeDasharray = `${this.C} ${this.C}`;
  }

  message(text, dur = 2.5, cls = '') {
    const m = this.el['h-msg'];
    m.innerHTML = text; m.className = 'msg show ' + cls;
    this.msgTimer = dur;
  }
  warn(text, dur = 2.5) {
    const w = this.el['h-warn'];
    w.textContent = text; w.classList.add('show');
    this.warnTimer = dur;
  }
  camHint(text) {
    const c = this.el['h-cam'];
    c.textContent = text; c.classList.add('show');
    clearTimeout(this.camT); this.camT = setTimeout(() => c.classList.remove('show'), 1400);
  }

  setLights(n, visible) {
    const l = this.el['h-lights'];
    l.classList.toggle('show', visible);
    [...l.children].forEach((pod, i) => pod.classList.toggle('on', i < n));
  }

  setSectors(states) {
    ['h-s1', 'h-s2', 'h-s3'].forEach((id, i) => { this.el[id].className = states[i] || ''; });
  }

  // DOM writes only when a value changes (avoids style/layout work every frame)
  t(id, v) { const el = this.el[id]; v = String(v); if (el._t !== v) { el._t = v; el.textContent = v; } }
  cl(id, v) { const el = this.el[id]; if (el._c !== v) { el._c = v; el.className = v; } }
  st(id, prop, v) {
    const el = this.el[id];
    if (typeof v === 'number') v = String(Math.round(v * 10) / 10);
    else if (v.endsWith('%')) v = Math.round(parseFloat(v) * 10) / 10 + '%';
    const k = '_s' + prop; if (el[k] === v) return; el[k] = v;
    if (prop[0] === '-') el.style.setProperty(prop, v); else el.style[prop] = v;
  }
  html(id, v) { const el = this.el[id]; if (el._h !== v) { el._h = v; el.innerHTML = v; } }

  update(dt, car, race) {
    const e = this.el;
    // dash
    const g = car.gear;
    this.t('h-gear', g <= 0 ? (car.v < -0.5 ? 'R' : 'N') : g);
    this.t('h-speed', Math.round(race.mph ? car.speedKmh * 0.621371 : car.speedKmh));
    this.t('h-unit', race.mph ? 'MPH' : 'KM/H');
    this.t('h-rpm', Math.round(car.rpm));
    this.t('h-ers', Math.round(car.ers * 100) + '%');
    this.st('h-ersring', 'strokeDashoffset', this.C * (1 - car.ers));
    this.st('h-rpmring', 'strokeDashoffset', this.C * (1 - Math.min(1, car.speedKmh / 340)));
    this.t('h-ersmode', car.overtake ? 'OVERTAKE' : 'MITTEL');
    if (e['h-ot']._on !== car.overtake) { e['h-ot']._on = car.overtake; e['h-ot'].classList.toggle('on', car.overtake); }
    this.cl('h-drs', 'drs' + (car.drsOpen ? ' open' : car.drsAvailable ? ' avail' : ''));
    this.st('h-thr', '--h', car.throttle * 100 + '%');
    this.st('h-brk', '--h', car.brake * 100 + '%');
    const lit = Math.max(0, Math.min(15, Math.round(((car.rpm - 9000) / 3300) * 15)));
    const flash = car.rpm > 12100 && (performance.now() / 70 | 0) % 2;
    this.revs.forEach((r, i) => { const c = i < lit ? (flash ? 'f' : i < 5 ? 'g' : i < 10 ? 'r' : 'p') : ''; if (r._c !== c) { r._c = c; r.className = c; } });

    // clean pill (minimal HUD)
    if (document.body.classList.contains('hud-minimal')) {
      this.t('pl-gear', g <= 0 ? (car.v < -0.5 ? 'R' : 'N') : g);
      this.t('pl-speed', Math.round(race.mph ? car.speedKmh * 0.621371 : car.speedKmh));
      this.t('pl-unit', race.mph ? 'mph' : 'km/h');
    }
    // broadcast-style onboard graphic (T-cam)
    if (document.body.classList.contains('cam-tcam')) {
      const sp = Math.round(race.mph ? car.speedKmh * 0.621371 : car.speedKmh);
      this.t('ob-speed', sp); this.t('ob-unit', race.mph ? 'MPH' : 'KM/H');
      this.t('ob-gear', g <= 0 ? (car.v < -0.5 ? 'R' : 'N') : g);
      this.st('ob-rpm', 'width', Math.max(0, Math.min(100, ((car.rpm - 4000) / 8500) * 100)) + '%');
      this.st('ob-thr', 'width', car.throttle * 100 + '%');
      this.st('ob-brk', 'width', car.brake * 100 + '%');
      this.cl('ob-drs', car.drsOpen ? 'on' : car.drsAvailable ? 'avail' : '');
      this.cl('ob-ers', car.overtake ? 'on' : '');
      this.t('ob-ersv', Math.round(car.ers * 100));
      this.t('ob-pos', 'P' + race.playerPos);
    }
    // timing
    this.t('h-lap', Math.min(this.laps, Math.max(1, race.playerLap)));
    this.t('h-time', fmtTime(race.curLapTime, false));
    this.t('h-best', fmtTime(race.bestLap));
    this.t('h-pos', race.playerPos);
    this.t('h-tot', race.total);

    this.lastRows -= dt;
    if (this.lastRows <= 0) { this.lastRows = 0.25; this.renderRows(race); this.renderWeather(race); }
    this.mapT = (this.mapT || 0) - dt;
    if (this.mapT <= 0) { this.mapT = 0.1; this.renderMap(race); }

    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) e['h-msg'].classList.remove('show'); }
    if (this.warnTimer > 0) { this.warnTimer -= dt; if (this.warnTimer <= 0) e['h-warn'].classList.remove('show'); }
  }

  setDriver(name, number, team) {
    this.$('ob-drv').textContent = name; this.$('ob-num').textContent = number; this.$('ob-team').textContent = team.name.toUpperCase();
    this.$('ob-bar').style.background = hex(team.body === 0xf0f0f0 || team.body === 0x161616 ? team.accent : team.body);
  }

  // circuit outline for the minimap (world -> canvas transform, rotated so the map is roughly landscape)
  setMap(tr) {
    const pts = [];
    for (let i = 0; i < tr.N; i += 6) pts.push([tr.px[i], tr.pz[i]]);
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const c = this.el['h-map'], W = c.width, H = c.height, pad = 14;
    const s = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxZ - minZ) * s) / 2;
    this.map = { pts, f: (x, z) => [ox + (x - minX) * s, oy + (z - minZ) * s], start: [tr.posAt(tr.startS, 0)] };
    c.style.aspectRatio = '1';
  }

  renderMap(race) {
    if (!this.map) return;
    const c = this.el['h-map'], g = c.getContext('2d'), M = this.map;
    g.clearRect(0, 0, c.width, c.height);
    g.lineJoin = 'round';
    g.beginPath();
    M.pts.forEach(([x, z], i) => { const [a, b] = M.f(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
    g.closePath();
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.stroke();
    const [sx, sz] = M.start[0];
    const [a0, b0] = M.f(sx, sz); g.fillStyle = '#e10600'; g.fillRect(a0 - 3, b0 - 3, 6, 6);
    const order = race.order || [];
    for (let k = order.length - 1; k >= 0; k--) {
      const car = order[k];
      if (car.gone) continue;
      const [x, y] = M.f(car.obj.x, car.obj.z);
      g.beginPath(); g.arc(x, y, car.isPlayer ? 6 : 4.2, 0, 7);
      g.fillStyle = hex(car.team.body === 0xf0f0f0 || car.team.body === 0x161616 ? car.team.accent : car.team.body); g.fill();
      g.lineWidth = car.isPlayer ? 2.5 : 1.2; g.strokeStyle = car.isPlayer ? '#fff' : 'rgba(0,0,0,.7)'; g.stroke();
    }
  }

  renderWeather(race) {
    const W = race.weather;
    if (!W) return;
    const icon = (r) => {
      const cloud = '<path d="M7 17h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.4A3.3 3.3 0 0 0 7 17z" fill="currentColor"/>';
      if (r < 0.05) return '<svg viewBox="0 0 24 24" class="sun"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></g></svg>';
      const drops = r < 0.4 ? '<path d="M12 19l-1 3" />' : '<path d="M8 19l-1 3M12 19l-1 3M16 19l-1 3" />';
      return `<svg viewBox="0 0 24 24" class="rain"><g transform="translate(0,-3)">${cloud}</g><g stroke="#5fb4ff" stroke-width="2" stroke-linecap="round">${drops}</g></svg>`;
    };
    const labels = ['JETZT', '+1\'', '+3\'', '+5\''];
    const slots = W.forecast(race.time || 0).map((f, i) => `<div class="slot"><span>${labels[i]}</span>${icon(f.rain)}<b>${Math.round(f.rain * 100)}%</b></div>`).join('');
    const w = W.wetness;
    const state = w < 0.15 ? ['TROCKEN', 'dry'] : w < 0.5 ? ['FEUCHT', 'damp'] : ['NASS', 'wet'];
    this.html('h-wx', `<div class="slots">${slots}</div><div class="surf ${state[1]}">STRECKE <b>${state[0]}</b></div>`);
  }

  renderRows(race) {
    const order = race.order;
    const pi = order.findIndex((c) => c.isPlayer);
    let from = Math.max(0, pi - 2);
    let to = Math.min(order.length, from + 5);
    from = Math.max(0, to - 5);
    let html = '';
    for (let i = from; i < to; i++) {
      const c = order[i];
      let gap = '';
      if (c.isPlayer) gap = race.playerLap <= 1 && race.time < 3 ? '' : '<span class="me">—</span>';
      else {
        const gt = race.gapTo(c);
        if (gt !== null) gap = (gt < 0 ? '-' : '+') + Math.abs(gt).toFixed(3);
        if (c.finished) gap = '<span class="fin">ZIEL</span>';
      }
      html += `<div class="row${c.isPlayer ? ' me' : ''}"><span class="p">${i + 1}</span><span class="bar" style="background:${hex(c.team.body === 0xf0f0f0 || c.team.body === 0x161616 ? c.team.accent : c.team.body)}"></span><span class="n">${c.name}</span><span class="tyre ${race.wet ? 'i' : 's'}">${race.wet ? 'I' : 'S'}</span><span class="gap">${gap}</span></div>`;
    }
    this.html('h-rows', html);
  }
}

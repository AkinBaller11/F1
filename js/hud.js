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
          <div class="lbl">KM/H</div><div class="num" id="h-speed">0</div><div class="rpm" id="h-rpm">4000</div>
        </div>
        <div class="flags"><span id="h-drs" class="drs">DRS</span><span id="h-ot" class="ot">OVERTAKE</span></div>
        <div class="pedals"><i id="h-thr"></i><i id="h-brk"></i></div>
      </div>
      <div class="msg" id="h-msg"></div>
      <div class="warn" id="h-warn"></div>
      <div class="startlights" id="h-lights">${'<div class="pod"><i></i><i></i></div>'.repeat(5)}</div>
      <div class="camhint" id="h-cam"></div>
    `;
    this.$ = (id) => root.querySelector('#' + id);
    this.el = {};
    for (const id of ['h-lap', 'h-rows', 'h-pos', 'h-tot', 'h-time', 'h-best', 'h-ers', 'h-ersring', 'h-ersmode', 'h-gear', 'h-speed', 'h-rpm', 'h-rpmring', 'h-drs', 'h-ot', 'h-msg', 'h-warn', 'h-lights', 'h-s1', 'h-s2', 'h-s3', 'h-thr', 'h-brk', 'h-cam', 'h-revs', 'h-wx'])
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

  update(dt, car, race) {
    const e = this.el;
    // dash
    const g = car.gear;
    e['h-gear'].textContent = g <= 0 ? (car.v < -0.5 ? 'R' : 'N') : g;
    e['h-speed'].textContent = Math.round(car.speedKmh);
    e['h-rpm'].textContent = Math.round(car.rpm);
    e['h-ers'].textContent = Math.round(car.ers * 100) + '%';
    e['h-ersring'].style.strokeDashoffset = this.C * (1 - car.ers);
    e['h-rpmring'].style.strokeDashoffset = this.C * (1 - Math.min(1, car.speedKmh / 340));
    e['h-ersmode'].textContent = car.overtake ? 'OVERTAKE' : 'MITTEL';
    e['h-ot'].classList.toggle('on', car.overtake);
    e['h-drs'].className = 'drs' + (car.drsOpen ? ' open' : car.drsAvailable ? ' avail' : '');
    e['h-thr'].style.setProperty('--h', car.throttle * 100 + '%');
    e['h-brk'].style.setProperty('--h', car.brake * 100 + '%');
    const lit = Math.max(0, Math.min(15, Math.round(((car.rpm - 9000) / 3300) * 15)));
    const flash = car.rpm > 12100 && (performance.now() / 70 | 0) % 2;
    this.revs.forEach((r, i) => { r.className = i < lit ? (flash ? 'f' : i < 5 ? 'g' : i < 10 ? 'r' : 'p') : ''; });

    // timing
    e['h-lap'].textContent = Math.min(this.laps, Math.max(1, race.playerLap));
    e['h-time'].textContent = fmtTime(race.curLapTime, false);
    e['h-best'].textContent = fmtTime(race.bestLap);
    e['h-pos'].textContent = race.playerPos;
    e['h-tot'].textContent = race.total;

    this.lastRows -= dt;
    if (this.lastRows <= 0) { this.lastRows = 0.25; this.renderRows(race); this.renderWeather(race); }

    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) e['h-msg'].classList.remove('show'); }
    if (this.warnTimer > 0) { this.warnTimer -= dt; if (this.warnTimer <= 0) e['h-warn'].classList.remove('show'); }
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
    this.el['h-wx'].innerHTML = `<div class="slots">${slots}</div><div class="surf ${state[1]}">STRECKE <b>${state[0]}</b></div>`;
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
    this.el['h-rows'].innerHTML = html;
  }
}

// Rain streaks around the camera, tyre spray behind cars and droplets on the "lens"
import * as THREE from 'three';
import * as TX from './textures.js';

export class Weather {
  constructor(scene, wet) {
    this.wet = wet;
    this.scene = scene;
    if (!wet) return;
    // rain streaks
    const n = 4000;
    this.rainN = n;
    const pos = new Float32Array(n * 6);
    this.rainOff = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.rainOff[i * 3] = (Math.random() - 0.5) * 80;
      this.rainOff[i * 3 + 1] = Math.random() * 30;
      this.rainOff[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d0d8, transparent: true, opacity: 0.22, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // spray particles
    const m = 2600;
    this.sprayN = m;
    this.sp = new Float32Array(m * 3);
    this.sv = new Float32Array(m * 3);
    this.life = new Float32Array(m);
    this.next = 0;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sp, 3));
    this.spray = new THREE.Points(sg, new THREE.PointsMaterial({
      map: TX.particle(), size: 2.6, transparent: true, opacity: 0.22, depthWrite: false, color: 0xdfe4e8, sizeAttenuation: true,
    }));
    this.spray.frustumCulled = false;
    scene.add(this.spray);
    for (let i = 0; i < m; i++) this.sp[i * 3 + 1] = -100;

    // lens droplets overlay
    this.canvas = document.getElementById('droplets');
    this.ctx2d = this.canvas.getContext('2d');
    this.drops = [];
  }

  emitSpray(car, dt) {
    if (!this.wet || car.v < 12) return;
    const rate = Math.min(1, (car.v - 12) / 40) * 260 * dt;
    let k = rate | 0; if (Math.random() < rate - k) k++;
    const sx = -Math.sin(car.yaw), sz = -Math.cos(car.yaw);
    for (let j = 0; j < k; j++) {
      const i = this.next; this.next = (this.next + 1) % this.sprayN;
      const side = Math.random() < 0.5 ? -0.8 : 0.8;
      this.sp[i * 3] = car.x - sx * 2.2 + sz * side * -1 + (Math.random() - 0.5) * 0.6;
      this.sp[i * 3 + 1] = 0.3 + Math.random() * 0.4;
      this.sp[i * 3 + 2] = car.z - sz * 2.2 - sx * side * -1 + (Math.random() - 0.5) * 0.6;
      const back = car.v * (0.25 + Math.random() * 0.25);
      this.sv[i * 3] = sx * back + (Math.random() - 0.5) * 3;
      this.sv[i * 3 + 1] = 1.2 + Math.random() * 2.5;
      this.sv[i * 3 + 2] = sz * back + (Math.random() - 0.5) * 3;
      this.life[i] = 0.8 + Math.random() * 0.9;
    }
  }

  update(dt, cam, playerSpeed, cars, inCockpit) {
    if (!this.wet) return;
    // rain follows camera
    const p = this.rain.geometry.attributes.position.array;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const fall = 22 * dt;
    for (let i = 0; i < this.rainN; i++) {
      let y = this.rainOff[i * 3 + 1] - fall;
      if (y < -2) y += 30;
      this.rainOff[i * 3 + 1] = y;
      let x = ((this.rainOff[i * 3] - cx) % 80 + 120) % 80 - 40 + cx;
      let z = ((this.rainOff[i * 3 + 2] - cz) % 80 + 120) % 80 - 40 + cz;
      const o = i * 6;
      p[o] = x; p[o + 1] = y + cy - 6; p[o + 2] = z;
      p[o + 3] = x + 0.05; p[o + 4] = y + cy - 6 + 0.9; p[o + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;

    for (const c of cars) this.emitSpray(c, dt);
    for (let i = 0; i < this.sprayN; i++) {
      if (this.life[i] <= 0) { this.sp[i * 3 + 1] = -100; continue; }
      this.life[i] -= dt;
      const drag = Math.exp(-dt * 2.2);
      this.sv[i * 3] *= drag; this.sv[i * 3 + 2] *= drag;
      this.sv[i * 3 + 1] = this.sv[i * 3 + 1] * drag - 1.5 * dt;
      this.sp[i * 3] += this.sv[i * 3] * dt;
      this.sp[i * 3 + 1] = Math.max(0.1, this.sp[i * 3 + 1] + this.sv[i * 3 + 1] * dt);
      this.sp[i * 3 + 2] += this.sv[i * 3 + 2] * dt;
    }
    this.spray.geometry.attributes.position.needsUpdate = true;

    this.updateDroplets(dt, playerSpeed, inCockpit);
  }

  updateDroplets(dt, speed, inCockpit) {
    const c = this.canvas, g = this.ctx2d;
    if (c.width !== c.clientWidth || c.height !== c.clientHeight) { c.width = c.clientWidth; c.height = c.clientHeight; }
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (!inCockpit) { this.drops.length = 0; return; }
    const spawn = (3 + speed * 0.06) * dt * 10;
    let k = spawn | 0; if (Math.random() < spawn - k) k++;
    for (let i = 0; i < k && this.drops.length < 140; i++) {
      this.drops.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: 2 + Math.random() * 6 * (W / 1400), life: 0.6 + Math.random() * 1.6, t: 0 });
    }
    // at speed droplets get blown outward / upward from centre
    const cx = W / 2, cy = H * 0.45;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      if (d.t > d.life) { this.drops.splice(i, 1); continue; }
      const push = speed * 0.04;
      d.x += (d.x - cx) / W * push * 60 * dt;
      d.y += ((d.y - cy) / H * push * 40 - (speed > 20 ? 30 : -8)) * dt;
      const a = Math.min(1, (d.life - d.t) * 2) * 0.55;
      const grd = g.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
      grd.addColorStop(0, `rgba(255,255,255,${a * 0.8})`);
      grd.addColorStop(0.5, `rgba(200,210,220,${a * 0.25})`);
      grd.addColorStop(1, `rgba(40,50,60,${a * 0.35})`);
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(d.x, d.y, d.r, d.r * (1 + speed * 0.004), 0, 0, Math.PI * 2); g.fill();
    }
  }

  dispose() {
    if (!this.wet) return;
    this.scene.remove(this.rain, this.spray);
    this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

// Podium ceremony: top three on the steps, trophies, champagne spray and confetti
import * as THREE from 'three';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const teamCol = (t) => (t.body === 0xf0f0f0 || t.body === 0x161616 ? t.accent : t.body);

function textTex(text, w, h, font, fg, bg) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  // shrink to fit the width
  const m = g.measureText(text).width, max = w * 0.9;
  if (m > max) { const px = parseFloat(font.match(/(\d+)px/)[1]) * (max / m); g.font = font.replace(/\d+px/, Math.floor(px) + 'px'); }
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// a driver in race overalls: team colour suit, helmet, arms up (one hand holds the bottle)
function driverFigure(team) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: teamCol(team), roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.7 });
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.75, 4, 12), suit); legs.position.y = 0.55; legs.scale.x = 1.5; g.add(legs);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.45, 4, 14), suit); torso.position.y = 1.32; g.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16), dark); belt.position.y = 1.02; g.add(belt);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshPhysicalMaterial({ color: team.accent, clearcoat: 1, roughness: 0.25 }));
  helmet.position.y = 1.86; g.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 8, -0.9, 1.8, 1.25, 0.45), new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.1 }));
  visor.position.y = 1.86; visor.rotation.y = Math.PI; g.add(visor);
  const arm = (side, up) => {
    const a = new THREE.Group(); a.position.set(side * 0.3, 1.55, 0);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 8), suit); m.position.y = 0.33; a.add(m);
    a.rotation.z = -side * up; g.add(a); return a;
  };
  g.userData.armL = arm(-1, 0.5); g.userData.armR = arm(1, 0.35);
  // champagne bottle in the right hand
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.34, 12), new THREE.MeshStandardMaterial({ color: 0x0f3b1e, roughness: 0.2, metalness: 0.3 }));
  bottle.position.set(0, 0.72, 0); g.userData.armR.add(bottle);
  const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.9, roughness: 0.3 }));
  foil.position.y = 0.2; bottle.add(foil);
  g.userData.bottle = bottle;
  return g;
}

function trophy(scale = 1) {
  const pts = [[0, 0], [0.16, 0], [0.16, 0.04], [0.06, 0.08], [0.05, 0.25], [0.1, 0.3], [0.2, 0.42], [0.24, 0.6], [0.23, 0.62], [0.0, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshPhysicalMaterial({ color: 0xf2c84b, metalness: 0.6, roughness: 0.25, clearcoat: 1, emissive: 0x6a4a00, emissiveIntensity: 0.6 }));
  m.scale.setScalar(scale);
  return m;
}

export function buildPodium(top3, title) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080d);
  scene.fog = new THREE.Fog(0x07080d, 18, 40);
  scene.add(new THREE.HemisphereLight(0xb8c6ff, 0x20140c, 0.8));
  const key = new THREE.SpotLight(0xffffff, 260, 40, 0.55, 0.5, 1.4); key.position.set(0, 12, 8); key.target.position.set(0, 1.5, 0); key.castShadow = true; scene.add(key, key.target);
  for (const [x, col] of [[-7, 0xe10600], [7, 0x2e7dff]]) { const s = new THREE.SpotLight(col, 140, 30, 0.45, 0.6, 1.5); s.position.set(x, 9, 3); s.target.position.set(x * 0.2, 1, 0); scene.add(s, s.target); }
  // floor + back wall with the event banner
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x101218, roughness: 0.35, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshStandardMaterial({ map: textTex(title, 2048, 512, 'italic 900 170px Arial', '#ffffff', '#b00500'), roughness: 0.6 }));
  wall.position.set(0, 6.2, -4); scene.add(wall);
  const wall2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.6), new THREE.MeshStandardMaterial({ color: 0x151821, roughness: 0.8 }));
  wall2.position.set(0, 1.8, -4); scene.add(wall2);
  // steps: 2 - 1 - 3
  const stepMat = new THREE.MeshStandardMaterial({ color: 0xe9ecf2, roughness: 0.4 });
  const steps = [{ x: 0, h: 1.4, n: 1 }, { x: -2.3, h: 0.95, n: 2 }, { x: 2.3, h: 0.6, n: 3 }];
  const figures = [];
  steps.forEach((st, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, st.h, 1.8), stepMat); b.position.set(st.x, st.h / 2, 0); b.castShadow = b.receiveShadow = true; scene.add(b);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9 * Math.min(1, st.h / 0.9)), new THREE.MeshBasicMaterial({ map: textTex(String(st.n), 256, 256, '900 200px Arial', '#e10600', null), transparent: true }));
    num.position.set(st.x, st.h / 2, 0.91); scene.add(num);
    const d = top3[i];
    if (!d) return;
    const f = driverFigure(d.team); f.position.set(st.x, st.h, 0); f.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(f);
    const cup = trophy(i === 0 ? 1.15 : 0.85); f.userData.armL.add(cup); cup.position.set(0, 0.64, 0);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.42), new THREE.MeshBasicMaterial({ map: textTex(d.name, 512, 100, 'italic 900 64px Arial', '#ffffff', hex(teamCol(d.team))) }));
    name.position.set(st.x, st.h + 2.55, 0.2); scene.add(name);
    figures.push(f);
  });
  // champagne: spray particles from each bottle
  const N = 900, pos = new Float32Array(N * 3).fill(-50), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const spray = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff1c4, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  spray.frustumCulled = false; scene.add(spray);
  // confetti
  const C = 420, cg = new THREE.PlaneGeometry(0.09, 0.05);
  const conf = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), C);
  const cs = [];
  const cols = [0xe10600, 0xf5c400, 0xffffff, 0x2e7dff, 0x19d65b];
  for (let i = 0; i < C; i++) {
    cs.push({ x: (Math.random() - 0.5) * 14, y: 6 + Math.random() * 10, z: (Math.random() - 0.5) * 6, r: Math.random() * 6, s: 0.6 + Math.random() * 0.8 });
    conf.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  }
  scene.add(conf);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
  const dummy = new THREE.Object3D(), bp = new THREE.Vector3();
  let next = 0, t = 0;
  const update = (dt) => {
    t += dt;
    // camera: slow push-in with a gentle orbit
    const a = Math.sin(t * 0.18) * 0.35, dist = 10.5 - Math.min(2.5, t * 0.25);
    camera.position.set(Math.sin(a) * dist, 2.6 + Math.sin(t * 0.3) * 0.2, Math.cos(a) * dist);
    camera.lookAt(0, 2.2, 0);
    // arms pump, bottles spray after a moment
    figures.forEach((f, i) => {
      const k = Math.sin(t * 3 + i) * 0.12;
      f.userData.armL.rotation.z = 0.5 + 2.1 * Math.min(1, t / 1.5) + k;
      f.userData.armR.rotation.z = -0.35 - 1.6 * Math.min(1, Math.max(0, t - 1.2) / 1.2) - k;
      f.rotation.y = Math.sin(t * 0.7 + i * 2) * 0.35;
      if (t > 2.2) for (let e = 0; e < 7; e++) {
        const b = f.userData.bottle; b.getWorldPosition(bp);
        const q = next = (next + 1) % N;
        pos[q * 3] = bp.x; pos[q * 3 + 1] = bp.y + 0.15; pos[q * 3 + 2] = bp.z;
        const ang = (i === 1 ? 0.6 : i === 2 ? -0.6 : Math.sin(t * 1.3) * 0.8) + (Math.random() - 0.5) * 0.5;
        const sp = 4 + Math.random() * 3;
        vel[q * 3] = Math.sin(ang) * sp * 0.8; vel[q * 3 + 1] = 3 + Math.random() * 3; vel[q * 3 + 2] = Math.cos(ang) * sp * 0.6;
        life[q] = 1.4;
      }
    });
    for (let q = 0; q < N; q++) {
      if (life[q] <= 0) continue;
      life[q] -= dt;
      vel[q * 3 + 1] -= 9.8 * dt;
      pos[q * 3] += vel[q * 3] * dt; pos[q * 3 + 1] += vel[q * 3 + 1] * dt; pos[q * 3 + 2] += vel[q * 3 + 2] * dt;
      if (life[q] <= 0 || pos[q * 3 + 1] < 0) { life[q] = 0; pos[q * 3 + 1] = -50; }
    }
    pg.attributes.position.needsUpdate = true;
    cs.forEach((c, i) => {
      c.y -= dt * c.s; if (c.y < 0) c.y = 10 + Math.random() * 4;
      c.r += dt * 4;
      dummy.position.set(c.x + Math.sin(t + i) * 0.3, c.y, c.z); dummy.rotation.set(c.r, c.r * 0.7, 0); dummy.updateMatrix();
      conf.setMatrixAt(i, dummy.matrix);
    });
    conf.instanceMatrix.needsUpdate = true;
  };
  const dispose = () => scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  update(0);
  return { scene, camera, update, dispose };
}

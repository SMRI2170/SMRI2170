import * as THREE from "/node_modules/three/build/three.module.js";

const W = 900;
const H = 300;
const TAU = Math.PI * 2;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x040806, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040806);
scene.fog = new THREE.FogExp2(0x06100a, 0.047);

const camera = new THREE.PerspectiveCamera(39, W / H, 0.1, 90);

let profileData = { activity: 18, pushes: 8, pullRequests: 2 };

let rand = 2170;
const random = () => {
  rand = (rand * 16807) % 2147483647;
  return (rand - 1) / 2147483646;
};

function smoothNoise(x, z) {
  return (
    Math.sin(x * 0.51 + z * 0.19) * 0.36 +
    Math.sin(x * 1.07 - z * 0.13 + 1.7) * 0.16 +
    Math.cos(x * 0.23 + z * 0.43 - 0.9) * 0.19
  );
}

function riverX(depth, t) {
  return (
    Math.sin(depth * 0.16 + Math.sin(t) * 0.22) * 1.15 +
    Math.sin(depth * 0.055 - 0.7) * 0.7
  );
}

function heightAt(x, depth, t) {
  const activity = Math.min(profileData.activity, 100) / 100;
  const pushes = Math.min(profileData.pushes, 60) / 60;
  const center = riverX(depth, t);
  const dx = x - center;

  const valley = -1.55 * Math.exp(-(dx * dx) / 4.9);
  const leftBank = 1.55 * Math.exp(-((x + 5.2) ** 2) / 7.2);
  const rightBank = 1.72 * Math.exp(-((x - 5.0) ** 2) / 7.0);
  const farRidge = 0.48 * Math.exp(-((depth + 8.0) ** 2) / 32);
  const detail = smoothNoise(x, depth) * (0.28 + activity * 0.08);
  const breathing =
    Math.sin(depth * 0.12 + t) * 0.055 +
    Math.cos(x * 0.7 - t) * (0.035 + pushes * 0.02);

  return valley + leftBank + rightBank + farRidge + detail + breathing - 0.15;
}

// terrain
const terrain = new THREE.PlaneGeometry(20, 30, 116, 92);
const position = terrain.attributes.position;
const base = new Float32Array(position.array.length);
base.set(position.array);

const terrainColors = new Float32Array(position.count * 3);
terrain.setAttribute("color", new THREE.BufferAttribute(terrainColors, 3));

const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.98,
  metalness: 0.0,
  side: THREE.DoubleSide
});

const ground = new THREE.Mesh(terrain, terrainMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -4.2;
scene.add(ground);

// subtle contour layer: not a full wireframe, only faint topology
const contourCount = 13;
const contours = [];
for (let j = 0; j < contourCount; j++) {
  const geometry = new THREE.BufferGeometry();
  const pts = new Float32Array(150 * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: j % 4 === 0 ? 0x93b67c : 0x496d4e,
      transparent: true,
      opacity: j % 4 === 0 ? 0.18 : 0.095,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  scene.add(line);
  contours.push(line);
}

// luminous streams on the valley floor
const streamCount = 8;
const streams = [];
for (let j = 0; j < streamCount; j++) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(180 * 3), 3));
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: j === 3 || j === 4 ? 0xd9efad : 0x9fca7c,
      transparent: true,
      opacity: j === 3 || j === 4 ? 0.68 : 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  scene.add(line);
  streams.push(line);
}

// floating spores / firefly-like particles
const particleCount = 1150;
const particlePos = new Float32Array(particleCount * 3);
const particleSeed = new Float32Array(particleCount * 5);
for (let i = 0; i < particleCount; i++) {
  particleSeed[i * 5] = (random() - 0.5) * 18.5;
  particleSeed[i * 5 + 1] = (random() - 0.5) * 29;
  particleSeed[i * 5 + 2] = 0.08 + random() * 1.75;
  particleSeed[i * 5 + 3] = random() * TAU;
  particleSeed[i * 5 + 4] = 0.25 + random() * 0.95;
}
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
const particles = new THREE.Points(
  particleGeometry,
  new THREE.PointsMaterial({
    color: 0xd8ecb1,
    size: 0.031,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
scene.add(particles);

// moss speckles attached to the terrain
const mossCount = 1350;
const mossPos = new Float32Array(mossCount * 3);
const mossSeed = new Float32Array(mossCount * 3);
for (let i = 0; i < mossCount; i++) {
  mossSeed[i * 3] = (random() - 0.5) * 19;
  mossSeed[i * 3 + 1] = (random() - 0.5) * 29;
  mossSeed[i * 3 + 2] = random();
}
const mossGeometry = new THREE.BufferGeometry();
mossGeometry.setAttribute("position", new THREE.BufferAttribute(mossPos, 3));
const moss = new THREE.Points(
  mossGeometry,
  new THREE.PointsMaterial({
    color: 0x769a61,
    size: 0.018,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.34,
    depthWrite: false
  })
);
scene.add(moss);

// mist sprites
function radialTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.28, "rgba(156,190,132,0.12)");
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const mistTexture = radialTexture("rgba(210,235,190,0.23)", "rgba(7,15,10,0)");
const mist = [];
[
  [-4.6, 1.5, -6.5, 9.0, 3.6],
  [3.8, 1.1, -12.0, 10.0, 4.1],
  [0.0, 0.65, -18.0, 12.0, 4.8]
].forEach(([x, y, z, sx, sy], idx) => {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: mistTexture,
      color: idx === 1 ? 0x9ebd88 : 0x7fa06f,
      transparent: true,
      opacity: idx === 2 ? 0.13 : 0.17,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  s.position.set(x, y, z);
  s.scale.set(sx, sy, 1);
  scene.add(s);
  mist.push(s);
});

// lighting
scene.add(new THREE.HemisphereLight(0xb6cda6, 0x010302, 0.75));
const moon = new THREE.DirectionalLight(0xcfe5b2, 1.6);
moon.position.set(-3.5, 7, 2);
scene.add(moon);

const valleyGlow = new THREE.PointLight(0xc8e89f, 10.0, 24, 1.9);
valleyGlow.position.set(0, 1.05, -8.5);
scene.add(valleyGlow);

const mossGlow = new THREE.PointLight(0x5b8f58, 6.0, 23, 2.0);
mossGlow.position.set(5.5, 2.2, -11.5);
scene.add(mossGlow);

function updateTerrain(t) {
  const colors = terrain.attributes.color;
  const dark = new THREE.Color(0x08110b);
  const mossA = new THREE.Color(0x17301d);
  const mossB = new THREE.Color(0x294c2c);
  const sage = new THREE.Color(0x67865b);
  const c = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const x = base[i * 3];
    const depth = base[i * 3 + 1];
    const h = heightAt(x, depth, t);
    position.setZ(i, h);

    const riverDistance = Math.abs(x - riverX(depth, t));
    const ridge = THREE.MathUtils.smoothstep(h, 0.15, 1.5);
    const damp = 1 - THREE.MathUtils.smoothstep(riverDistance, 0.0, 5.7);
    c.copy(dark).lerp(mossA, 0.45 + damp * 0.28);
    c.lerp(mossB, ridge * 0.62);
    if (ridge > 0.58) c.lerp(sage, (ridge - 0.58) * 0.18);

    colors.setXYZ(i, c.r, c.g, c.b);
  }

  position.needsUpdate = true;
  colors.needsUpdate = true;
  terrain.computeVertexNormals();
}

function updateContours(t) {
  contours.forEach((line, idx) => {
    const p = line.geometry.attributes.position;
    const normalized = idx / (contourCount - 1);
    const xBase = -8.4 + normalized * 16.8;

    for (let i = 0; i < p.count; i++) {
      const q = i / (p.count - 1);
      const depth = 14.5 - q * 29;
      const x = xBase + Math.sin(depth * 0.12 + idx * 0.7) * 0.16;
      p.setXYZ(i, x, heightAt(x, depth, t) + 0.022, -4.2 - depth);
    }
    p.needsUpdate = true;
  });
}

function updateStreams(t) {
  const activity = Math.min(profileData.activity, 100) / 100;

  streams.forEach((line, idx) => {
    const p = line.geometry.attributes.position;
    const spread = (idx - (streamCount - 1) / 2) * 0.19;

    line.material.opacity =
      idx === 3 || idx === 4
        ? 0.55 + activity * 0.15
        : 0.18 + activity * 0.11;

    for (let i = 0; i < p.count; i++) {
      const q = i / (p.count - 1);
      const depth = 14.5 - q * 29;
      const pulse = Math.sin(q * 11 + t * 2.0 + idx * 0.8) * 0.035;
      const x = riverX(depth, t) + spread + Math.sin(depth * 0.42 + idx) * 0.07;
      p.setXYZ(i, x, heightAt(x, depth, t) + 0.05 + pulse, -4.2 - depth);
    }
    p.needsUpdate = true;
  });
}

function updateParticles(t) {
  const visible = Math.min(
    particleCount,
    300 + profileData.activity * 6 + profileData.pullRequests * 9
  );
  particleGeometry.setDrawRange(0, visible);

  const p = particleGeometry.attributes.position;
  for (let i = 0; i < particleCount; i++) {
    const x0 = particleSeed[i * 5];
    const d0 = particleSeed[i * 5 + 1];
    const lift = particleSeed[i * 5 + 2];
    const phase = particleSeed[i * 5 + 3];
    const drift = particleSeed[i * 5 + 4];

    const x = x0 + Math.sin(t + phase) * 0.12 * drift;
    const depth = d0 + Math.cos(t * 0.7 + phase) * 0.08;
    p.setXYZ(
      i,
      x,
      heightAt(x, depth, t) + lift + Math.sin(t * 1.6 + phase) * 0.055,
      -4.2 - depth
    );
  }
  p.needsUpdate = true;
}

function updateMoss(t) {
  const p = mossGeometry.attributes.position;

  for (let i = 0; i < mossCount; i++) {
    const x = mossSeed[i * 3];
    const depth = mossSeed[i * 3 + 1];
    const bias = mossSeed[i * 3 + 2];
    const h = heightAt(x, depth, t);
    const riverDistance = Math.abs(x - riverX(depth, t));

    // keep moss mostly on slopes/banks, not in the bright stream
    const hidden = riverDistance < 1.0 && bias < 0.8;
    p.setXYZ(
      i,
      hidden ? 1000 : x,
      h + 0.018 + bias * 0.025,
      -4.2 - depth
    );
  }
  p.needsUpdate = true;
}

function renderAt(progress) {
  const t = progress * TAU;

  updateTerrain(t);
  updateContours(t);
  updateStreams(t);
  updateParticles(t);
  updateMoss(t);

  camera.position.set(
    0.48 * Math.sin(t),
    3.25 + 0.09 * Math.cos(t * 2),
    9.2 + 0.23 * Math.sin(t)
  );
  camera.lookAt(
    0.28 * Math.sin(t + 0.8),
    -0.40,
    -7.4
  );

  valleyGlow.position.x = riverX(4, t);
  valleyGlow.intensity = 9.0 + Math.sin(t * 2) * 0.65;
  mossGlow.position.x = 5.2 + Math.cos(t) * 0.6;

  mist[0].position.x = -4.6 + Math.sin(t) * 0.35;
  mist[1].position.x = 3.8 + Math.cos(t * 0.8) * 0.42;
  mist[2].position.x = Math.sin(t * 0.55) * 0.55;

  renderer.render(scene, camera);
}

window.setProfileData = (data) => {
  profileData = { ...profileData, ...data };
};

window.setFrame = (progress) => {
  renderAt(progress);
};

renderAt(0);
window.__ready = true;

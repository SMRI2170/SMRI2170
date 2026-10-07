import * as THREE from "/node_modules/three/build/three.module.js";

const W = 900;
const H = 300;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x050a07, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050a07);
scene.fog = new THREE.FogExp2(0x050a07, 0.055);

const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 80);

const terrain = new THREE.PlaneGeometry(19, 26, 92, 68);
const position = terrain.attributes.position;
const base = new Float32Array(position.array.length);
base.set(position.array);

const fillMaterial = new THREE.MeshStandardMaterial({
  color: 0x102016,
  roughness: 0.96,
  metalness: 0.02,
  transparent: true,
  opacity: 0.58,
  side: THREE.DoubleSide
});
const wireMaterial = new THREE.MeshBasicMaterial({
  color: 0x8eae7c,
  wireframe: true,
  transparent: true,
  opacity: 0.32,
  blending: THREE.AdditiveBlending
});

const fill = new THREE.Mesh(terrain, fillMaterial);
const wire = new THREE.Mesh(terrain, wireMaterial);
fill.rotation.x = wire.rotation.x = -Math.PI / 2;
fill.position.z = wire.position.z = -3.2;
scene.add(fill, wire);

scene.add(new THREE.HemisphereLight(0xbcd7a6, 0x020604, 1.1));
const key = new THREE.PointLight(0xd8efb8, 9.5, 24, 1.7);
key.position.set(-4, 5.5, 2);
scene.add(key);
const rim = new THREE.PointLight(0x6a9e68, 7.5, 28, 1.8);
rim.position.set(5, 3, -9);
scene.add(rim);

const particleCount = 680;
const particlePos = new Float32Array(particleCount * 3);
const particleSeed = new Float32Array(particleCount * 4);
let rand = 2170;
const random = () => {
  rand = (rand * 16807) % 2147483647;
  return (rand - 1) / 2147483646;
};
for (let i = 0; i < particleCount; i++) {
  particleSeed[i * 4] = (random() - 0.5) * 18;
  particleSeed[i * 4 + 1] = (random() - 0.5) * 24;
  particleSeed[i * 4 + 2] = 0.08 + random() * 1.25;
  particleSeed[i * 4 + 3] = random() * Math.PI * 2;
}
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
const particles = new THREE.Points(
  particleGeometry,
  new THREE.PointsMaterial({
    color: 0xd2e8b4,
    size: 0.034,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
scene.add(particles);

const curves = [];
for (let j = 0; j < 5; j++) {
  const g = new THREE.BufferGeometry();
  const pts = new Float32Array(120 * 3);
  g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const line = new THREE.Line(
    g,
    new THREE.LineBasicMaterial({
      color: j === 2 ? 0xd1e8ad : 0x9cbd87,
      transparent: true,
      opacity: j === 2 ? 0.76 : 0.42,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(line);
  curves.push(line);
}

let profileData = { activity: 18, pushes: 8, pullRequests: 2 };

function heightAt(x, depth, t) {
  const activityBoost = Math.min(profileData.activity, 40) / 40;
  const pushBoost = Math.min(profileData.pushes, 20) / 20;
  const a = Math.sin(x * 0.62 + depth * 0.31 + Math.sin(t) * 0.8) * (0.34 + activityBoost * 0.10);
  const b = Math.sin(x * 1.14 - depth * 0.19 + t) * (0.16 + pushBoost * 0.06);
  const ridge1 = 0.92 * Math.exp(-((x + 2.2 * Math.sin(t)) ** 2 + (depth - 4.5) ** 2) / 30);
  const ridge2 = 0.62 * Math.exp(-((x - 3.2 * Math.cos(t)) ** 2 + (depth + 3.5) ** 2) / 22);
  return a + b + ridge1 + ridge2 - 0.42;
}

function updateTerrain(t) {
  for (let i = 0; i < position.count; i++) {
    const x = base[i * 3];
    const depth = base[i * 3 + 1];
    position.setZ(i, heightAt(x, depth, t));
  }
  position.needsUpdate = true;
  terrain.computeVertexNormals();
}

function updateParticles(t) {
  const visible = Math.min(
    particleCount,
    190 + profileData.activity * 10 + profileData.pullRequests * 18
  );
  particleGeometry.setDrawRange(0, visible);
  const p = particleGeometry.attributes.position;
  for (let i = 0; i < particleCount; i++) {
    const x = particleSeed[i * 4];
    const d = particleSeed[i * 4 + 1];
    const lift = particleSeed[i * 4 + 2];
    const phase = particleSeed[i * 4 + 3];
    p.setXYZ(
      i,
      x + Math.sin(t + phase) * 0.08,
      heightAt(x, d, t) + lift + Math.sin(t * 2 + phase) * 0.05,
      -3.2 - d
    );
  }
  p.needsUpdate = true;
}

function updateCurves(t) {
  const offsets = [-4.2, -2.1, 0, 2.2, 4.3];
  curves.forEach((line, idx) => {
    const p = line.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const q = i / (p.count - 1);
      const depth = 12 - q * 24;
      const x = offsets[idx] + Math.sin(q * 6.2 + t + idx) * 0.58;
      const y = heightAt(x, depth, t) + 0.035;
      p.setXYZ(i, x, y, -3.2 - depth);
    }
    p.needsUpdate = true;
  });
}

function renderAt(progress) {
  const t = progress * Math.PI * 2;
  updateTerrain(t);
  updateParticles(t);
  updateCurves(t);

  camera.position.set(
    0.72 * Math.sin(t),
    4.55 + 0.14 * Math.cos(t * 2),
    8.4 + 0.34 * Math.sin(t)
  );
  camera.lookAt(
    0.24 * Math.sin(t + 0.5),
    -0.12,
    -5.0
  );

  key.position.x = -4 + Math.sin(t) * 1.2;
  rim.position.x = 5 + Math.cos(t) * 1.0;
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

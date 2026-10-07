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
scene.fog = new THREE.FogExp2(0x06100a, 0.039);

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


// recognizable low-poly trees: larger silhouettes, clear trunks, clustered foliage
const trees = [];
const foregroundRocks = [];
const grassTufts = [];
const shrubs = [];

const trunkMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a342b,
  roughness: 0.96,
  metalness: 0.0
});

const branchMaterial = new THREE.MeshStandardMaterial({
  color: 0x344437,
  roughness: 0.98,
  metalness: 0.0
});

const foliageMaterial = new THREE.MeshStandardMaterial({
  color: 0x789a62,
  emissive: 0x2a4124,
  emissiveIntensity: 0.72,
  roughness: 0.9,
  flatShading: true,
  transparent: true,
  opacity: 0.9
});

const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x4f6052,
  emissive: 0x141d16,
  emissiveIntensity: 0.12,
  roughness: 1.0,
  metalness: 0.0,
  flatShading: true
});

const grassMaterial = new THREE.MeshStandardMaterial({
  color: 0x76985f,
  emissive: 0x21301e,
  emissiveIntensity: 0.18,
  roughness: 1.0,
  metalness: 0.0,
  side: THREE.DoubleSide
});

const shrubMaterial = new THREE.MeshStandardMaterial({
  color: 0x648653,
  emissive: 0x22351f,
  emissiveIntensity: 0.28,
  roughness: 0.94,
  flatShading: true,
  transparent: true,
  opacity: 0.86
});

function cylinderBetween(a, b, radiusA, radiusB, material) {
  const midpoint = a.clone().add(b).multiplyScalar(0.5);
  const length = a.distanceTo(b);
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, length, 7, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(midpoint);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize()
  );
  return mesh;
}

function createTree({ x, depth, scale = 1, lean = 0, phase = 0 }) {
  const group = new THREE.Group();
  const trunkHeight = 2.15 * scale;
  const trunkSegments = 6;
  const trunkPoints = [];
  const trunkMeshes = [];
  const branchMeshes = [];

  for (let i = 0; i <= trunkSegments; i++) {
    const p = i / trunkSegments;
    trunkPoints.push(
      new THREE.Vector3(
        p * lean * 0.22 + Math.sin(p * 2.0 + phase) * 0.035 * scale,
        p * trunkHeight,
        0
      )
    );
  }

  for (let i = 0; i < trunkSegments; i++) {
    const taper = 1 - i / trunkSegments;
    const trunk = cylinderBetween(
      trunkPoints[i],
      trunkPoints[i + 1],
      (0.082 * taper + 0.022) * scale,
      (0.066 * taper + 0.014) * scale,
      trunkMaterial
    );
    trunk.userData.baseScale = trunk.scale.clone();
    trunk.scale.y = 0.001;
    trunk.visible = false;
    group.add(trunk);
    trunkMeshes.push(trunk);
  }

  const branchTips = [];
  const branchCount = 7;

  for (let i = 0; i < branchCount; i++) {
    const anchorP = 0.38 + i * 0.075;
    const anchorIndex = Math.min(
      trunkSegments - 1,
      Math.max(2, Math.round(anchorP * trunkSegments))
    );
    const anchor = trunkPoints[anchorIndex];
    const direction = i % 2 === 0 ? 1 : -1;
    const length = (0.42 + random() * 0.28) * scale;
    const rise = (0.28 + random() * 0.28) * scale;
    const z = (random() - 0.5) * 0.34 * scale;

    const joint = new THREE.Vector3(
      anchor.x + direction * length * 0.48,
      anchor.y + rise * 0.48,
      z * 0.48
    );
    const tip = new THREE.Vector3(
      anchor.x + direction * length,
      anchor.y + rise,
      z
    );

    const branchA = cylinderBetween(anchor, joint, 0.032 * scale, 0.020 * scale, branchMaterial);
    const branchB = cylinderBetween(joint, tip, 0.020 * scale, 0.009 * scale, branchMaterial);
    branchA.userData.baseScale = branchA.scale.clone();
    branchB.userData.baseScale = branchB.scale.clone();
    branchA.scale.y = 0.001;
    branchB.scale.y = 0.001;
    branchA.visible = false;
    branchB.visible = false;
    group.add(branchA);
    group.add(branchB);
    branchMeshes.push(branchA, branchB);
    branchTips.push(tip);
  }

  const foliage = new THREE.Group();
  const clumpCount = 11;

  for (let i = 0; i < clumpCount; i++) {
    const tip = branchTips[i % branchTips.length];
    const geometry = new THREE.IcosahedronGeometry(
      (0.22 + random() * 0.18) * scale,
      1
    );
    const clump = new THREE.Mesh(geometry, foliageMaterial.clone());
    clump.position.set(
      tip.x + (random() - 0.5) * 0.30 * scale,
      tip.y + (random() - 0.25) * 0.34 * scale,
      tip.z + (random() - 0.5) * 0.30 * scale
    );
    clump.scale.set(
      1.0 + random() * 0.35,
      0.78 + random() * 0.42,
      0.9 + random() * 0.3
    );
    clump.rotation.set(random(), random(), random());
    clump.userData.basePosition = clump.position.clone();
    clump.userData.baseScale = clump.scale.clone();
    clump.userData.phase = random() * TAU;
    clump.scale.setScalar(0.001);
    clump.material.opacity = 0;
    clump.visible = false;
    foliage.add(clump);
  }

  group.add(foliage);
  group.userData = {
    baseX: x,
    baseDepth: depth,
    scale,
    phase,
    foliage,
    trunkHeight,
    trunkMeshes,
    branchMeshes
  };

  scene.add(group);
  trees.push(group);
}

function createRock({ x, depth, scale = 1, rotY = 0 }) {
  const group = new THREE.Group();
  const geometry = new THREE.IcosahedronGeometry(0.42 * scale, 1);
  const rock = new THREE.Mesh(geometry, rockMaterial.clone());

  rock.scale.set(
    1.15 + random() * 0.38,
    0.72 + random() * 0.20,
    0.92 + random() * 0.28
  );
  rock.rotation.set(
    (random() - 0.5) * 0.22,
    rotY,
    (random() - 0.5) * 0.18
  );

  rock.userData.baseScale = rock.scale.clone();
  group.scale.setScalar(0.001);
  group.visible = false;
  group.add(rock);
  group.userData = { baseX: x, baseDepth: depth, scale, rock };
  scene.add(group);
  foregroundRocks.push(group);
}

function createGrassTuft({ x, depth, scale = 1, phase = 0 }) {
  const group = new THREE.Group();
  const blades = [];
  const bladeCount = 6 + Math.floor(random() * 3);

  for (let i = 0; i < bladeCount; i++) {
    const h = (0.28 + random() * 0.18) * scale;
    const w = (0.026 + random() * 0.014) * scale;
    const geometry = new THREE.PlaneGeometry(w, h, 1, 3);
    geometry.translate(0, h / 2, 0);

    const blade = new THREE.Mesh(geometry, grassMaterial);
    blade.position.set(
      (random() - 0.5) * 0.11 * scale,
      0,
      (random() - 0.5) * 0.11 * scale
    );
    blade.rotation.y = random() * Math.PI;
    blade.rotation.z = (random() - 0.5) * 0.20;
    blade.userData.baseRotZ = blade.rotation.z;
    blade.userData.baseScale = blade.scale.clone();
    blade.userData.phase = phase + i * 0.43;

    group.add(blade);
    blades.push(blade);
  }

  group.userData = { baseX: x, baseDepth: depth, scale, phase, blades };
  group.scale.set(1, 0.001, 1);
  group.visible = false;
  scene.add(group);
  grassTufts.push(group);
}

function createShrub({ x, depth, scale = 1, phase = 0 }) {
  const group = new THREE.Group();
  const clumps = [];
  const clumpCount = 5 + Math.floor(random() * 3);

  for (let i = 0; i < clumpCount; i++) {
    const geometry = new THREE.IcosahedronGeometry(
      (0.16 + random() * 0.12) * scale,
      1
    );
    const clump = new THREE.Mesh(geometry, shrubMaterial.clone());
    clump.position.set(
      (random() - 0.5) * 0.52 * scale,
      (0.10 + random() * 0.22) * scale,
      (random() - 0.5) * 0.30 * scale
    );
    clump.scale.set(
      1.0 + random() * 0.35,
      0.70 + random() * 0.35,
      0.90 + random() * 0.25
    );
    clump.userData.basePosition = clump.position.clone();
    clump.userData.phase = phase + random() * TAU;
    clumps.push(clump);
    group.add(clump);
  }

  group.scale.setScalar(0.001);
  group.visible = false;
  group.userData = { baseX: x, baseDepth: depth, scale, phase, clumps };
  scene.add(group);
  shrubs.push(group);
}

// stronger foreground silhouette + denser supporting trees
createTree({ x: -4.35, depth: -0.6, scale: 1.42, lean: -0.34, phase: 0.1 });
createTree({ x: 5.2, depth: 4.0, scale: 0.96, lean: 0.24, phase: 1.5 });
createTree({ x: -6.25, depth: 8.8, scale: 0.72, lean: -0.18, phase: 2.6 });
createTree({ x: 6.35, depth: 8.0, scale: 0.68, lean: 0.20, phase: 3.4 });
createTree({ x: 7.05, depth: 12.0, scale: 0.48, lean: 0.12, phase: 4.1 });

// low-poly rocks around the foreground tree
createRock({ x: -3.95, depth: 0.35, scale: 0.78, rotY: 0.4 });
createRock({ x: -4.95, depth: 0.05, scale: 0.58, rotY: -0.35 });
createRock({ x: 4.15, depth: 0.70, scale: 0.55, rotY: 0.22 });
createRock({ x: 5.05, depth: 1.35, scale: 0.44, rotY: -0.28 });

// sparse grass clusters; enough to read as vegetation without becoming noisy
createGrassTuft({ x: -4.15, depth: 0.80, scale: 1.00, phase: 0.4 });
createGrassTuft({ x: -4.80, depth: 0.90, scale: 0.92, phase: 1.1 });
createGrassTuft({ x: -3.70, depth: 0.25, scale: 0.85, phase: 2.0 });
createGrassTuft({ x: -5.25, depth: 0.55, scale: 0.82, phase: 2.8 });
createGrassTuft({ x: -4.45, depth: -0.10, scale: 0.76, phase: 3.2 });
createGrassTuft({ x: -3.55, depth: 1.10, scale: 0.72, phase: 4.0 });
createGrassTuft({ x: -5.10, depth: 1.20, scale: 0.68, phase: 4.7 });
createGrassTuft({ x: 3.75, depth: 0.65, scale: 0.92, phase: 5.1 });
createGrassTuft({ x: 4.35, depth: 0.95, scale: 0.84, phase: 5.5 });
createGrassTuft({ x: 4.95, depth: 1.45, scale: 0.78, phase: 5.9 });
createGrassTuft({ x: 5.55, depth: 1.95, scale: 0.72, phase: 6.3 });
createGrassTuft({ x: 6.00, depth: 3.10, scale: 0.64, phase: 6.7 });
createGrassTuft({ x: -6.10, depth: 3.60, scale: 0.62, phase: 7.0 });
createGrassTuft({ x: -5.65, depth: 5.20, scale: 0.56, phase: 7.4 });
createGrassTuft({ x: 5.80, depth: 5.60, scale: 0.54, phase: 7.8 });

// low shrubs fill the banks while leaving the luminous valley open
createShrub({ x: -5.45, depth: 2.15, scale: 0.86, phase: 0.8 });
createShrub({ x: 4.55, depth: 1.55, scale: 0.95, phase: 1.8 });
createShrub({ x: 5.75, depth: 3.75, scale: 0.78, phase: 2.8 });
createShrub({ x: -6.15, depth: 5.75, scale: 0.66, phase: 3.8 });

// lighting
scene.add(new THREE.HemisphereLight(0xb6cda6, 0x010302, 0.75));
const moon = new THREE.DirectionalLight(0xcfe5b2, 1.95);
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


function updateForegroundProps(t, progress) {
  foregroundRocks.forEach((rockGroup, index) => {
    const { baseX, baseDepth } = rockGroup.userData;
    const reveal = growthEnvelope(progress, 0.02 + index * 0.025);
    const groundY = heightAt(baseX, baseDepth, t) + 0.03;

    rockGroup.visible = reveal > 0.001;
    rockGroup.position.set(
      baseX,
      groundY - (1 - reveal) * 0.20,
      -4.2 - baseDepth
    );

    const s = 0.38 + reveal * 0.62;
    rockGroup.scale.set(s, Math.max(0.001, reveal), s);
    rockGroup.rotation.y = (index % 2 === 0 ? 0.05 : -0.04) * (1 - reveal);
  });

  grassTufts.forEach((tuft, index) => {
    const { baseX, baseDepth, scale, blades } = tuft.userData;
    const reveal = growthEnvelope(progress, 0.07 + index * 0.009);

    tuft.visible = reveal > 0.001;
    tuft.position.set(
      baseX,
      heightAt(baseX, baseDepth, t) + 0.015,
      -4.2 - baseDepth
    );
    tuft.scale.set(1, Math.max(0.001, reveal), 1);

    blades.forEach((blade, i) => {
      const sway =
        Math.sin(t * 1.35 + blade.userData.phase + i * 0.18) *
        0.085 *
        scale *
        reveal;
      blade.rotation.z = blade.userData.baseRotZ + sway;
    });
  });

  shrubs.forEach((shrub, index) => {
    const { baseX, baseDepth, scale, phase, clumps } = shrub.userData;
    const reveal = growthEnvelope(progress, 0.10 + index * 0.035);

    shrub.visible = reveal > 0.001;
    shrub.position.set(
      baseX,
      heightAt(baseX, baseDepth, t) + 0.02,
      -4.2 - baseDepth
    );
    shrub.scale.set(
      Math.max(0.001, reveal),
      Math.max(0.001, reveal),
      Math.max(0.001, reveal)
    );

    clumps.forEach((clump, i) => {
      const base = clump.userData.basePosition;
      const p = clump.userData.phase;
      clump.position.set(
        base.x + Math.sin(t * 1.05 + p + i) * 0.012 * scale * reveal,
        base.y + Math.cos(t * 0.85 + p) * 0.008 * scale * reveal,
        base.z
      );
      clump.material.emissiveIntensity = 0.20 + reveal * 0.18;
    });
  });
}

function ease01(x) {
  const v = THREE.MathUtils.clamp(x, 0, 1);
  return v * v * (3 - 2 * v);
}

function growthEnvelope(progress, start) {
  const growEnd = start + 0.22;
  const holdEnd = 0.82;
  const fadeEnd = 0.98;

  if (progress < start) return 0;
  if (progress < growEnd) return ease01((progress - start) / (growEnd - start));
  if (progress < holdEnd) return 1;
  if (progress < fadeEnd) return 1 - ease01((progress - holdEnd) / (fadeEnd - holdEnd));
  return 0;
}

function segmentedReveal(value, index, total) {
  const local = value * total - index;
  return ease01(local);
}

function updateTrees(t, progress) {
  const activityBoost = Math.min(profileData.activity, 100) / 100;
  const prBoost = Math.min(profileData.pullRequests, 30) / 30;
  const starts = [0.04, 0.16, 0.30, 0.38, 0.46];

  trees.forEach((tree, treeIndex) => {
    const {
      baseX,
      baseDepth,
      scale,
      phase,
      foliage,
      trunkMeshes,
      branchMeshes
    } = tree.userData;

    tree.position.set(
      baseX,
      heightAt(baseX, baseDepth, t) + 0.015,
      -4.2 - baseDepth
    );

    const start = starts[treeIndex] ?? 0.08;
    const trunkGrow = growthEnvelope(progress, start);
    const branchGrow = growthEnvelope(progress, start + 0.07);
    const leafGrow = growthEnvelope(progress, start + 0.13);

    const sway = leafGrow > 0.92 ? 1 : leafGrow * 0.35;
    tree.rotation.z =
      (Math.sin(t + phase) * 0.034 + Math.sin(t * 2 + treeIndex) * 0.010) * sway;
    tree.rotation.y = Math.sin(t * 0.55 + phase) * 0.050 * sway;

    trunkMeshes.forEach((mesh, i) => {
      const s = segmentedReveal(trunkGrow, i, trunkMeshes.length);
      mesh.visible = s > 0.001;
      mesh.scale.set(
        mesh.userData.baseScale.x,
        Math.max(0.001, mesh.userData.baseScale.y * s),
        mesh.userData.baseScale.z
      );
    });

    branchMeshes.forEach((mesh, i) => {
      const branchSegment = Math.floor(i / 2);
      const branchTotal = Math.ceil(branchMeshes.length / 2);
      const s = segmentedReveal(branchGrow, branchSegment, branchTotal);
      mesh.visible = s > 0.001;
      mesh.scale.set(
        mesh.userData.baseScale.x,
        Math.max(0.001, mesh.userData.baseScale.y * s),
        mesh.userData.baseScale.z
      );
    });

    const visibleRatio = 0.72 + activityBoost * 0.18 + prBoost * 0.10;
    const visibleCount = Math.max(
      5,
      Math.min(foliage.children.length, Math.round(foliage.children.length * visibleRatio))
    );

    foliage.children.forEach((clump, i) => {
      const base = clump.userData.basePosition;
      const baseScale = clump.userData.baseScale;
      const p = clump.userData.phase;
      const reveal = segmentedReveal(leafGrow, i * 0.65, foliage.children.length * 0.65);

      clump.visible = i < visibleCount && reveal > 0.001;
      clump.position.set(
        base.x + Math.sin(t * 1.25 + p) * 0.018 * scale * reveal,
        base.y + Math.cos(t * 1.05 + p) * 0.014 * scale * reveal,
        base.z + Math.sin(t * 0.85 + p) * 0.010 * scale * reveal
      );
      clump.scale.set(
        Math.max(0.001, baseScale.x * reveal),
        Math.max(0.001, baseScale.y * reveal),
        Math.max(0.001, baseScale.z * reveal)
      );
      clump.rotation.y = t * 0.06 + p * 0.1;
      clump.material.opacity = 0.90 * reveal;
      clump.material.emissiveIntensity = (0.62 + activityBoost * 0.22) * reveal;
    });
  });
}

function renderAt(progress) {
  const t = progress * TAU;

  updateTerrain(t);
  updateContours(t);
  updateStreams(t);
  updateParticles(t);
  updateMoss(t);
  updateForegroundProps(t, progress);
  updateTrees(t, progress);

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

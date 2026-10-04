// A faceted crystal block that stands in for the pointer inside the hero:
// a low-poly gem rendered with three.js transmission, tumbling as it follows.
import * as THREE from "https://esm.sh/three@0.160.0";

const SIZE = 56;

export function initCrystalCursor(host) {
  if (host.__crystalCursor) host.__crystalCursor();

  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;left:0;top:0;width:" + SIZE + "px;height:" + SIZE +
    "px;pointer-events:none;z-index:60;opacity:0;transition:opacity 200ms ease;will-change:transform";
  document.body.appendChild(el);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearAlpha(0);
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.set(0, 0, 5.6);

  // studio environment: bright sky with a hard band, so the facets throw
  // crisp specular streaks instead of a flat wash
  const gc = document.createElement("canvas");
  gc.width = 32;
  gc.height = 256;
  const g = gc.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, "#ffffff");
  grd.addColorStop(0.20, "#ffffff");
  grd.addColorStop(0.27, "#efeade");
  grd.addColorStop(0.36, "#ffffff");
  grd.addColorStop(0.58, "#f2eee5");
  grd.addColorStop(0.78, "#d3ccbc");
  grd.addColorStop(1.00, "#a89f8d");
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 256);
  const envTex = new THREE.CanvasTexture(gc);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(envTex).texture;
  scene.environment = env;

  // poured-glass disc: round in plan, flattened, with a thick rolled rim and
  // an irregular rippled face — the shape of molten crystal that has set
  const flat = new THREE.IcosahedronGeometry(1.6, 72);
  const pos = flat.attributes.position;
  const base = pos.array.slice();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    const n = v.clone().normalize();

    // flatten into a disc, then swell the rim back out into a rolled edge
    const radial = Math.hypot(n.x, n.y);
    const rim = Math.pow(radial, 5.0);
    let r = 1 + 0.16 * rim;

    // large soft undulations across the face, plus finer creases near the rim
    r += 0.085 * Math.sin(n.x * 3.1 + n.y * 2.2) * Math.cos(n.y * 2.6);
    r += 0.05 * Math.sin(n.y * 4.3 - n.x * 3.4);
    r += 0.045 * rim * Math.sin(Math.atan2(n.y, n.x) * 5.0);

    v.multiplyScalar(r);
    v.z *= 0.42 + 0.22 * rim;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  flat.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    transmission: 1,
    thickness: 0.65,
    roughness: 0,
    metalness: 0,
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0,
    reflectivity: 1,
    specularIntensity: 1.5,
    envMapIntensity: 3.2,
    iridescence: 0.22,
    iridescenceIOR: 1.35,
    attenuationColor: new THREE.Color("#fbf9f3"),
    attenuationDistance: 8.0,
    transparent: true,
  });

  const crystal = new THREE.Mesh(flat, mat);
  scene.add(crystal);

  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-2.6, 3.4, 2.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff4e4, 1.2);
  rim.position.set(2.8, -2.0, 1.2);
  scene.add(rim);

  const state = { x: -999, y: -999, tx: -999, ty: -999, vis: 0, spin: 0 };

  function onMove(e) {
    const px = e.clientX, py = e.clientY;
    if (state.x > -900) state.spin += Math.hypot(px - state.tx, py - state.ty) * 0.004;
    state.tx = px;
    state.ty = py;
    if (state.x < -900) { state.x = px; state.y = py; }
    if (!state.vis) { state.vis = 1; el.style.opacity = "1"; }
  }
  function onLeave() { state.vis = 0; el.style.opacity = "0"; }

  host.addEventListener("mousemove", onMove);
  host.addEventListener("mouseenter", onMove);
  host.addEventListener("mouseleave", onLeave);

  let raf = 0;
  const t0 = performance.now();
  function frame() {
    raf = requestAnimationFrame(frame);
    const t = (performance.now() - t0) / 1000;

    state.x += (state.tx - state.x) * 0.24;
    state.y += (state.ty - state.y) * 0.24;
    state.spin *= 0.94;
    el.style.transform =
      "translate3d(" + (state.x - SIZE / 2) + "px," + (state.y - SIZE / 2) + "px,0)";

    if (state.vis) {
      // idles with a slow tumble; movement adds extra spin so it catches light
      crystal.rotation.y = t * 0.26 + state.spin * 0.6;
      crystal.rotation.x = -0.42 + Math.sin(t * 0.29) * 0.18;
      crystal.rotation.z = t * 0.14 + Math.sin(t * 0.2) * 0.12;
      renderer.render(scene, camera);
    }
  }
  frame();

  const destroy = () => {
    cancelAnimationFrame(raf);
    host.removeEventListener("mousemove", onMove);
    host.removeEventListener("mouseenter", onMove);
    host.removeEventListener("mouseleave", onLeave);
    flat.dispose();
    mat.dispose();
    env.dispose();
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    el.remove();
    if (host.__crystalCursor === destroy) host.__crystalCursor = null;
  };
  host.__crystalCursor = destroy;
  return destroy;
}

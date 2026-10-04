// Underwater hero: the headline sits below a rippling water surface.
// A procedural caustics field lights the page, and the pointer pushes ripples
// through the surface that refract the letters.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform sampler2D uText;
uniform float uHasText;
uniform float uCalm;
uniform float uIntro;         // 0 = dry paper, 1 = full water
uniform float uRise;          // 0 = under the water, 1 = resting on the surface
uniform vec3  uMouse;         // xy in px, z = presence 0..1
uniform vec3  uMouseDir;      // xy = direction of travel, z = speed 0..1
uniform int   uRippleCount;
uniform vec4  uRipples[12];   // xy px, z = birth time, w = strength
uniform vec4  uRipShape[12];  // x = width, y = speed, z = depth, w = life

const vec3 PAPER_INK = vec3(0.957, 0.945, 0.918);   // the paper tone the ink fades toward
const float RIPPLE_SPEED = 300.0;
const float RIPPLE_LIFE  = 1.5;

vec3 spectrum(float x) {
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.00, 0.33, 0.67) + x));
}

float swell(vec2 p) {
  float t = uTime;
  vec2 q = p;
  q += 0.58 * vec2(sin(p.y * 2.3 + t * 0.31), cos(p.x * 2.0 - t * 0.27));
  q += 0.10 * vec2(sin(p.y * 3.6 - t * 0.40), cos(p.x * 3.3 + t * 0.35));

  float h = 0.0;
  h += 0.58 * sin(q.x * 2.6 + t * 0.40);
  h += 0.50 * sin(q.y * 3.0 - t * 0.35);
  h += 0.34 * sin((q.x + q.y) * 4.4 + t * 0.52);
  h += 0.27 * sin((q.x - q.y) * 6.1 - t * 0.45);

  return h;
}

float ripples(vec2 px) {
  float h = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uRippleCount) break;
    vec4 r = uRipples[i];
    vec4 sh = uRipShape[i];
    float life = sh.w;
    float age = uTime - r.z;
    if (age < 0.0 || age > life) continue;
    float d = distance(px, r.xy);
    float u = age / life;
    float band = d - age * sh.y;

    // one broad crest with its trough behind it — a single swell, never a stack
    float w = sh.x * (0.62 + 1.05 * u);
    if (abs(band) > w * 1.5) continue;
    float x = band / w;
    float crest = x * exp(-x * x * 1.7) * 3.9;
    float breath = pow(sin(clamp(u * 1.35, 0.0, 1.0) * 3.14159), 0.55) * (1.0 + 0.30 * sin(u * (4.2 + sh.z * 2.4))) * pow(1.0 - u, 0.45);
    float dist = 1.0 / (1.0 + d / (240.0 + sh.x));
    h += crest * breath * dist * r.w * sh.z;
  }
  float dm = distance(px, uMouse.xy);
  vec2 q = px - uMouse.xy;
  vec2 dir = length(uMouseDir.xy) > 0.001 ? normalize(uMouseDir.xy) : vec2(1.0, 0.0);
  float along = dot(q, dir);
  float perp = length(q - along * dir);
  float stretch = 1.0 + 1.9 * uMouseDir.z;
  float rw = 150.0;
  float md = (along * along) / (rw * rw * stretch * stretch) + (perp * perp) / (rw * rw * 0.62);
  float dome = exp(-md);
  float rim = exp(-pow(sqrt(md) - 0.95, 2.0) * 7.0) * 0.72;   // tight trough hugging the dome
  h += (dome * 2.05 - rim) * uMouse.z;
  return h;
}

float height(vec2 px) {
  vec2 p = px / uRes.y * 3.0;
  // uIntro 0 = churned water, 1 = settled: the swell starts oversized and calms
  return swell(p) * uCalm * (1.0 + 5.5 * (1.0 - uIntro)) + ripples(px) * 1.6;
}

void main() {
  vec2 px = vUv * uRes;
  vec2 e = vec2(2.2, 0.0);

  // how much of the local surface comes from pointer ripples (vs ambient swell)
  float rE = clamp(abs(ripples(px)) * 1.5, 0.0, 1.0);

  float hC = height(px);
  float hR = height(px + e.xy);
  float hL = height(px - e.xy);
  float hT = height(px + e.yx);
  float hB = height(px - e.yx);

  vec2 grad = vec2(hR - hL, hT - hB) / (2.0 * e.x);
  float lap = (hR + hL + hT + hB - 4.0 * hC);

  // bright veins where the surface focuses light, soft shadow in the pockets
  float veins = pow(clamp(1.0 - abs(lap) * 1150.0, 0.0, 1.0), 2.6);
  float pools = clamp(0.5 + hC * 0.30, 0.0, 1.0);
  float water = clamp(mix(0.872, 0.988, pools) + veins * 0.40, 0.0, 1.0);

  vec2 disp = grad * 420.0;
  float chroma = clamp(length(disp) * 0.012, 0.0, 1.0);
  float hue = atan(grad.y, grad.x) * 0.1592 + hC * 0.18 + uTime * 0.02;
  vec3 rainbow = spectrum(hue);

  // halftone screen: the water tone becomes a 45-degree dot grid whose dots
  // grow in the darker pockets, like a printed gradient
  // the pointer's disturbance reads through the same screen: dots swell inside
  // the wake and under the cursor, and fade again as the water settles
  float mNear = exp(-pow(distance(px, uMouse.xy) / 260.0, 2.0)) * uMouse.z;
  float screenGain = 1.0 + 1.15 * rE + 0.55 * mNear;
  float ink = clamp((0.995 - water) * 5.2 * screenGain, 0.0, 1.0);
  float ca = 0.7071;
  vec2 rp = vec2(px.x * ca - px.y * ca, px.x * ca + px.y * ca);
  float cell = 7.6;
  vec2 gcell = fract(rp / cell) - 0.5;
  float dotR = sqrt(ink) * 0.62;
  float dotD = length(gcell);
  float cover = 1.0 - smoothstep(dotR - 0.10, dotR + 0.10, dotD);
  float screened = mix(0.995, 0.995 - ink * (0.25 + 0.09 * rE), cover);
  water = mix(water, screened, 1.0);

  // dots sit in the background's own warm hue instead of going grey-muddy
  float dotAmt = cover * clamp(ink, 0.0, 1.0);
  vec3 baseTint = vec3(0.957, 0.945, 0.918);              // #F4F1EA
  vec3 color = vec3(water) * mix(baseTint, baseTint * vec3(1.022, 0.998, 0.958), dotAmt);
  // prismatic edge only where a pointer ripple is bending the surface
  float fringe = pow(veins, 1.4) * smoothstep(0.02, 0.65, chroma) * rE;
  color += (rainbow - 0.5) * fringe * 0.45;
  color += (spectrum(hue + 0.5) - 0.5) * chroma * 0.16 * rE;

  // --- refracted headline ---
  if (uHasText > 0.5) {
    float bend = 1.0 + clamp(abs(lap) * 1800.0, 0.0, 1.9);
    // submerged, the water drags the letters; once floated up they are untouched
    float dep = 1.0 - uIntro;
    float sub = 1.0 - uRise;
    vec2 refr = grad * (430.0 * sub + 2100.0 * dep) * bend;
    vec2 uv   = vUv + refr / uRes;
    // rising also brings the type a little closer, so it grows as it surfaces
    uv = (uv - 0.5) / (1.0 + 0.09 * uRise) + 0.5;
    uv.y += 0.05 * sub * uIntro;
    uv.y = 1.0 - uv.y;

    // channels split only under a pointer ripple; the ambient swell refracts
    // the letters without colouring them
    float split = (0.03 + 0.16 * chroma) * rE;
    // haze radius in px: heavy at entrance, mild while waiting, none surfaced
    float hz = 6.5 * dep + 3.4 * sub;
    vec2 hx = vec2(hz, 0.0) / uRes;
    vec2 hy = vec2(0.0, hz) / uRes;
    #define TAP(o) texture2D(uText, (o)).a
    float aR = TAP(uv + refr * (-split) / uRes * vec2(1.0, -1.0));
    float aB = TAP(uv + refr * ( split) / uRes * vec2(1.0, -1.0));
    float aG = TAP(uv);
    if (hz > 0.01) {
      float sum = aG * 0.44
        + (TAP(uv + hx) + TAP(uv - hx) + TAP(uv + hy) + TAP(uv - hy)) * 0.09
        + (TAP(uv + hx + hy) + TAP(uv - hx + hy) + TAP(uv + hx - hy) + TAP(uv - hx - hy)) * 0.05;
      // the solid interior survives; only the contour picks up the haze
      sum = max(aG * 0.82, sum);
      aG = sum;
      aR = mix(aR, sum, 0.6);
      aB = mix(aB, sum, 0.6);
    }

    // the same 45-degree screen that textures the water also cuts the glyph
    // edge, so its contour breaks into dot-sized bites
    float bias = (cover - 0.5) * 0.20 + (ink - 0.5) * 0.10;
    float e0 = clamp(0.44 + bias + dep * 0.13 + sub * 0.04, 0.02, 0.96);
    // haze eases off through the entrance, keeps a trace while waiting, and
    // vanishes completely once the type rests on the surface
    float soft = 0.012 + 0.20 * dep + 0.07 * sub;
    vec3 cov = vec3(
      smoothstep(e0 - soft, e0 + soft, aR),
      smoothstep(e0 - soft, e0 + soft, aG),
      smoothstep(e0 - soft, e0 + soft, aB)
    );
    float a = max(cov.r, max(cov.g, cov.b)) * smoothstep(0.05, 0.55, uIntro);

    if (a > 0.001) {
      float shade = 0.02 + 0.06 * clamp(0.5 + hC * 0.42, 0.0, 1.0);
      vec3 ink = mix(vec3(shade), PAPER_INK, 0.10 * sub + 0.18 * dep);

      // a caustic vein sweeping the letter lights it; colour only with a ripple
      float sweep = smoothstep(0.55, 0.98, veins);
      vec3 glow = mix(vec3(0.92, 0.94, 0.97), rainbow, 0.65 * rE);
      ink = mix(ink, glow, sweep * 0.60);

      vec3 fringeCol = vec3(cov.r - cov.g, cov.g - cov.b, cov.b - cov.r);
      ink += fringeCol * (0.6 + sweep * 0.9) * rE;

      color = mix(color, ink, clamp(a, 0.0, 1.0));
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

const MAX_RIPPLES = 12;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader: " + log);
  }
  return sh;
}

export function initWaterText({ container, canvas, textElement, calm = 1 }) {
  // tear down any previous run on this canvas, and reuse its context: hot
  // reloads would otherwise exhaust the browser's WebGL context pool
  if (canvas.__waterDestroy) { try { canvas.__waterDestroy(); } catch (e) {} }
  canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());

  const gl = canvas.__waterGL || canvas.getContext("webgl", {
    alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true,
  });
  if (!gl || gl.isContextLost()) return null;
  canvas.__waterGL = gl;

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(program));
    }
  } catch (err) {
    console.error("Water hero shader failed:", err);
    return null;
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = {
    mouseDir: gl.getUniformLocation(program, "uMouseDir"),
    res: gl.getUniformLocation(program, "uRes"),
    time: gl.getUniformLocation(program, "uTime"),
    text: gl.getUniformLocation(program, "uText"),
    hasText: gl.getUniformLocation(program, "uHasText"),
    calm: gl.getUniformLocation(program, "uCalm"),
    rise: gl.getUniformLocation(program, "uRise"),
    intro: gl.getUniformLocation(program, "uIntro"),
    mouse: gl.getUniformLocation(program, "uMouse"),
    count: gl.getUniformLocation(program, "uRippleCount"),
    ripples: gl.getUniformLocation(program, "uRipples"),
    ripShape: gl.getUniformLocation(program, "uRipShape"),
  };

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(U.text, 0);

  let W = 0, H = 0, dpr = 1, hasText = 0;
  const textCanvas = document.createElement("canvas");

  // sibling copy that should be refracted along with the headline
  function extraTextEls() {
    const host = textElement && textElement.parentElement;
    if (!host) return [];
    return Array.from(host.querySelectorAll("p"));
  }

  // Paint the headline into a texture, matching its DOM position and metrics.
  function buildTextTexture() {
    const h1 = textElement && textElement.querySelector("h1");
    if (!h1 || !canvas.width || !canvas.height) { hasText = 0; return; }

    textCanvas.width = canvas.width;
    textCanvas.height = canvas.height;
    const c = textCanvas.getContext("2d");
    c.clearRect(0, 0, textCanvas.width, textCanvas.height);

    const cr = container.getBoundingClientRect();
    const tr = h1.getBoundingClientRect();
    const st = getComputedStyle(h1);

    const fs = parseFloat(st.fontSize) * dpr;
    const lh = (parseFloat(st.lineHeight) || parseFloat(st.fontSize)) * dpr;
    const ls = (parseFloat(st.letterSpacing) || 0) * dpr;

    c.font = `${st.fontWeight} ${fs}px ${st.fontFamily}`;
    c.fillStyle = "#000";
    c.textBaseline = "top";

    // measure against the h1's own box, not the wrapper, so wrapping and
    // centering match what the DOM is styled to do
    const hr = h1.getBoundingClientRect();
    const x0 = (hr.left - cr.left) * dpr;
    const y0 = (hr.top - cr.top) * dpr;
    const maxW = hr.width * dpr;

    const ws = parseFloat(st.wordSpacing) || 0;
    const wsPx = ws * dpr;
    const upper = st.textTransform === "uppercase";
    const align = st.textAlign;

    const measure = (str) => {
      const spaces = (str.match(/ /g) || []).length;
      return c.measureText(str).width + ls * Math.max(0, str.length - 1) + wsPx * spaces;
    };

    // honour the DOM's own hard breaks, then wrap only inside each segment
    const blocks = Array.from(h1.children).filter(
      (el) => getComputedStyle(el).display === "block"
    );
    const rawSource = blocks.length
      ? blocks.map((el) => el.textContent).join("<br>")
      : (h1.innerHTML || "");
    const segments = rawSource
      .split(/<br\b[^>]*>/i)
      .map((seg) => seg.replace(/<[^>]*>/g, "").replace(/&amp;nbsp;/g, " ").replace(/&amp;amp;/g, "&").trim())
      .filter((seg) => seg.length);

    // if the DOM's own line count already equals the hard-break count, paint one
    // segment per line: canvas measurement drifts and would re-wrap a fitting line
    const domLines = Math.max(1, Math.round(hr.height / (lh / dpr)));
    const lines = [];
    // lines with their own font size: paint each block at its own size and box
    const perBlock = blocks.length && blocks.some((b) => getComputedStyle(b).fontSize !== st.fontSize);
    if (perBlock) {
      for (const b of blocks) {
        const bs = getComputedStyle(b);
        const bfs = parseFloat(bs.fontSize) * dpr;
        const bls = (parseFloat(bs.letterSpacing) || 0) * dpr;
        const bws = (parseFloat(bs.wordSpacing) || 0) * dpr;
        c.font = `${bs.fontWeight} ${bfs}px ${bs.fontFamily}`;
        const txt = (upper ? b.textContent.toUpperCase() : b.textContent).trim();
        const spaces = (txt.match(/ /g) || []).length;
        const w = c.measureText(txt).width + bls * Math.max(0, txt.length - 1) + bws * spaces;
        const br = b.getBoundingClientRect();
        const by = (br.top - cr.top) * dpr;
        const slack = maxW - w;
        let x = align === "center" ? x0 + slack / 2 : align === "right" ? x0 + slack : x0;
        for (const ch of txt) {
          c.fillText(ch, x, by);
          x += c.measureText(ch).width + bls + (ch === " " ? bws : 0);
        }
      }
      c.font = `${st.fontWeight} ${fs}px ${st.fontFamily}`;
    } else if (domLines === segments.length) {
      for (const seg of segments) lines.push(upper ? seg.toUpperCase() : seg);
    } else {
      for (const seg of segments) {
        const src = upper ? seg.toUpperCase() : seg;
        let line = "";
        for (const word of src.split(/\s+/)) {
          const test = line ? line + " " + word : word;
          if (measure(test) > maxW + 1 && line) { lines.push(line); line = word; }
          else line = test;
        }
        if (line) lines.push(line);
      }
    }

    lines.forEach((ln, i) => {
      const y = y0 + i * lh;
      const slack = maxW - measure(ln);
      const xStart = align === "center" ? x0 + slack / 2 : align === "right" ? x0 + slack : x0;
      let x = xStart;
      for (const ch of ln) {
        c.fillText(ch, x, y);
        x += c.measureText(ch).width + ls + (ch === " " ? wsPx : 0);
      }
    });

    // the paragraphs below the headline ride in the same texture
    for (const el of extraTextEls()) {
      const er = el.getBoundingClientRect();
      if (!er.width) continue;
      const es = getComputedStyle(el);
      const efs = parseFloat(es.fontSize) * dpr;
      c.font = `${es.fontStyle} ${es.fontWeight} ${efs}px ${es.fontFamily}`;
      c.textBaseline = "top";
      const els2 = (parseFloat(es.letterSpacing) || 0) * dpr;
      const txt = el.textContent.trim();
      const w = c.measureText(txt).width + els2 * Math.max(0, txt.length - 1);
      const boxW = er.width * dpr;
      const ex = (er.left - cr.left) * dpr + (es.textAlign === "center" ? (boxW - w) / 2 : 0);
      const elh = parseFloat(es.lineHeight) || efs / dpr * 1.2;
      const ey = (er.top - cr.top) * dpr + (elh * dpr - efs) / 2;
      let cx = ex;
      for (const ch of txt) { c.fillText(ch, cx, ey); cx += c.measureText(ch).width + els2; }
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    hasText = 1;
  }

  function resize() {
    const r = container.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = r.width + "px";
    canvas.style.height = r.height + "px";
    gl.viewport(0, 0, W, H);
    buildTextTexture();
  }

  const ripples = [];
  const mouse = { x: -9999, y: -9999, presence: 0, target: 0, dx: 1, dy: 0, speed: 0 };
  let lastX = 0, lastY = 0, lastT = -1, t = 0;

  function toLocal(clientX, clientY) {
    const r = container.getBoundingClientRect();
    return { x: (clientX - r.left) * dpr, y: (r.bottom - clientY) * dpr };
  }

  function spawn(x, y, strength) {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    const r = Math.random();
    ripples.push({
      x, y, t0: t,
      strength: strength * (0.30 + 0.40 * Math.random()),
      width: 40 + 95 * Math.pow(Math.random(), 1.3),       // small, with a little variety
      speed: 190 + 260 * Math.random(),                    // some race out, some crawl
      depth: 1.3 + 1.7 * Math.pow(r, 1.6),                 // shallower than the cursor
      life: 0.95 + 1.15 * Math.random(),
    });
  }

  function onMove(ev) {
    const p = toLocal(ev.clientX, ev.clientY);
    const vx = p.x - mouse.x, vy = p.y - mouse.y;
    const v = Math.hypot(vx, vy);
    if (v > 0.5 && mouse.x > -9000) {
      mouse.dx = vx / v; mouse.dy = vy / v;
      mouse.speed += (Math.min(1, v / (90 * dpr)) - mouse.speed) * 0.7;
    } else {
      mouse.speed *= 0.9;
    }
    mouse.x = p.x; mouse.y = p.y; mouse.target = 1;
    needsRender = true;

    // only a few large swells, so rings never pile up
    const moved = Math.hypot(p.x - lastX, p.y - lastY);
    if (moved > (26 + Math.random() * 34) * dpr && t - lastT > 0.05 + Math.random() * 0.06) {
      lastX = p.x; lastY = p.y; lastT = t;
      if (ripples.length >= 3) ripples.shift();
      spawn(p.x, p.y, Math.min(1.2, 0.62 + moved / (520 * dpr)));
    }
  }
  function onLeave() { mouse.target = 0; mouse.speed = 0; }
  function onDown(ev) { const p = toLocal(ev.clientX, ev.clientY); spawn(p.x, p.y, 2.6); }
  function onTouch(ev) {
    const tp = ev.targetTouches[0];
    if (!tp) return;
    const p = toLocal(tp.clientX, tp.clientY);
    mouse.x = p.x; mouse.y = p.y; mouse.target = 1;
    spawn(p.x, p.y, 1.0);
  }
  function onTouchEnd() { mouse.target = 0; }

  container.addEventListener("mousemove", onMove);
  container.addEventListener("mouseleave", onLeave);
  container.addEventListener("mousedown", onDown);
  container.addEventListener("touchstart", onTouch, { passive: true });
  container.addEventListener("touchmove", onTouch, { passive: true });
  container.addEventListener("touchend", onTouchEnd);

  let needsRender = false;
  const data = new Float32Array(MAX_RIPPLES * 4);
  const shape = new Float32Array(MAX_RIPPLES * 4);
  const start = performance.now();
  let raf = 0, timer = 0, frames = 0;

  function render() {
    needsRender = false;
    t = (performance.now() - start) / 1000;
    mouse.presence += (mouse.target - mouse.presence) * (mouse.target > mouse.presence ? 0.55 : 0.12);

    for (let i = ripples.length - 1; i >= 0; i--) {
      if (t - ripples[i].t0 > ripples[i].life) ripples.splice(i, 1);
    }

    data.fill(0);
    shape.fill(0);
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      data[i * 4] = r.x; data[i * 4 + 1] = r.y;
      data[i * 4 + 2] = r.t0; data[i * 4 + 3] = r.strength;
      shape[i * 4] = r.width; shape[i * 4 + 1] = r.speed;
      shape[i * 4 + 2] = r.depth; shape[i * 4 + 3] = r.life;
    }
    gl.uniform2f(U.res, W, H);
    gl.uniform1f(U.time, t);
    gl.uniform1f(U.hasText, hasText);
    gl.uniform1f(U.calm, calm);
    // 1.8s entrance: churned water converging into a still, legible surface
    const el = performance.now() - start;
    const iRaw = Math.min(1, el / 1100);
    gl.uniform1f(U.intro, 1 - Math.pow(1 - iRaw, 3));
    // 3s of playtime underwater, then a 2s float to the surface
    const rRaw = Math.min(1, Math.max(0, (el - 3000) / 2000));
    gl.uniform1f(U.rise, rRaw * rRaw * (3 - 2 * rRaw));
    gl.uniform3f(U.mouse, mouse.x, mouse.y, mouse.presence);
    gl.uniform3f(U.mouseDir, mouse.dx, mouse.dy, mouse.speed);
    mouse.speed *= 0.94;
    gl.uniform1i(U.count, ripples.length);
    gl.uniform4fv(U.ripples, data);
    gl.uniform4fv(U.ripShape, shape);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frames++;
  }

  function frame() {
    if (document.visibilityState === "visible") render();
    raf = requestAnimationFrame(frame);
  }

  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildTextTexture);

  let rt;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(resize, 120); });
  ro.observe(container);

  const mo = new MutationObserver(() => { clearTimeout(rt); rt = setTimeout(buildTextTexture, 60); });
  if (textElement) mo.observe(textElement, { characterData: true, childList: true, subtree: true });

  raf = requestAnimationFrame(frame);
  render();

  // some embedded previews throttle rAF to nothing — fall back to a timer
  const watchdog = setTimeout(() => {
    if (frames < 3) timer = setInterval(render, 1000 / 30);
  }, 700);

  const destroy = function destroy() {
    if (canvas.__waterDestroy === destroy) canvas.__waterDestroy = null;
    cancelAnimationFrame(raf);
    clearTimeout(watchdog);
    clearInterval(timer);
    clearTimeout(rt);
    ro.disconnect();
    mo.disconnect();
    container.removeEventListener("mousemove", onMove);
    container.removeEventListener("mouseleave", onLeave);
    container.removeEventListener("mousedown", onDown);
    container.removeEventListener("touchstart", onTouch);
    container.removeEventListener("touchmove", onTouch);
    container.removeEventListener("touchend", onTouchEnd);
    gl.deleteTexture(tex);
    gl.deleteBuffer(buf);
    gl.deleteProgram(program);
  };

  canvas.__waterDestroy = destroy;
  return destroy;
}

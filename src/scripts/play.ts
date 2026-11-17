/**
 * "Cairo, Unbranded" : the game behind /play.
 * A grey voxel Cairo. Every place the player discovers gets its colour back.
 * Content comes from the JSON island in play.astro (which reads src/data), never hard-coded here.
 */
import * as THREE from 'three';
import { createAudio } from './play-audio';

type ProjectD = { slug: string; title: string; track: number; kind: string; tagline: string; image: string; bg: string; ink: string; accent: string; href: string };
type TypeD = { slug: string; title: string; kind: string; text: string; image: string };
type FilmD = { id: string; title: string; kind: string; text: string; src: string; poster: string };
type Data = {
  site: { email: string; whatsapp: string; behance: string; linkedin: string };
  projects: ProjectD[];
  type: TypeD[];
  films: FilmD[];
  process: { n: string; head: string; text: string }[];
  services: { id: string; name: string; from: string; delivery: string; summary: string }[];
  experience: { years: string; role: string; where: string }[];
  chain: string[];
  practice: { head: string; items: string[] }[];
  logos: { name: string; rtl: boolean; image: string }[];
};

type Spot = {
  id: string;
  label: string;
  toast: string;
  x: number;
  z: number;
  r: number;
  group: string;
  found: boolean;
  marker: THREE.Mesh;
  onFound?: () => void;
  open: () => void;
};
type Brand = { n: string; s: number; p: number };
type Part = [w: number, h: number, d: number, hex: number, x: number, y: number, z: number];
type Talker = { x: number; z: number; lines: [string, string][]; li: number };
type ScoreRow = { name: string; ms: number; chips: number; secrets: number };
type SaveData = { f?: string[]; c?: number[]; done?: boolean; t?: number; ft?: number; s?: string[]; b?: Brand | null; sub?: number; name?: string };

/** Sign palettes for the empty shop: background, ink, accent. */
const PALS: [string, string, string][] = [
  ['#0b090e', '#ece8df', '#d7ff00'],
  ['#f3ecd8', '#17140f', '#d94f30'],
  ['#12355b', '#f3ecd8', '#f5b800'],
  ['#1e4d3a', '#efe6da', '#e9a23b'],
  ['#b5412f', '#f6e9d5', '#1b1b1e'],
  ['#f4c9d0', '#2a1c14', '#e0218a'],
];
const STYLES = ['Classic', 'Bold', 'Mono'];
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
};

const ACID = 0xd7ff00;
const SAVE_KEY = 'cairo-unbranded-v1';

export function boot() {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  const raw = document.getElementById('play-data')?.textContent;
  if (!canvas || !raw) return;
  const data = JSON.parse(raw) as Data;
  const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

  const startBtn = $<HTMLButtonElement>('[data-start]');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    startBtn.textContent = 'This browser cannot run the game';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const skyGrey = new THREE.Color(0x8f8f92);
  const skyWarm = new THREE.Color(0xf0dcb6);
  scene.background = skyGrey.clone();

  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
  const CAM_OFF = new THREE.Vector3(60, 60, 60);
  let viewSize = 24;
  let zoom = 1;
  let zoomTarget = 1;
  let zoomHold = 0;
  let zoomFocus: [number, number] = [-18, -14];

  const hemi = new THREE.HemisphereLight(0xffffff, 0x77736c, 1.15);
  scene.add(hemi);
  const audio = createAudio();
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  const SH = 46;
  sun.shadow.camera.left = -SH;
  sun.shadow.camera.right = SH;
  sun.shadow.camera.top = SH;
  sun.shadow.camera.bottom = -SH;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  /* ------------------------------------------------------------------ colour groups */
  type MatRec = { m: THREE.MeshLambertMaterial; grey: THREE.Color; col: THREE.Color; group: string };
  const mats: MatRec[] = [];
  const matCache = new Map<string, THREE.MeshLambertMaterial>();
  const groups: Record<string, { t: number; target: number }> = { world: { t: 0, target: 0 }, always: { t: 1, target: 1 } };

  const greyOf = (hex: number) => {
    const c = new THREE.Color(hex);
    const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    const g = 0.2 + 0.62 * Math.sqrt(l);
    return new THREE.Color(g, g, g * 1.01);
  };
  const mat = (hex: number, group = 'world') => {
    const key = group + '|' + hex;
    let m = matCache.get(key);
    if (!m) {
      if (!groups[group]) groups[group] = { t: 0, target: 0 };
      const grey = greyOf(hex);
      m = new THREE.MeshLambertMaterial({ color: group === 'always' ? hex : grey });
      mats.push({ m, grey, col: new THREE.Color(hex), group });
      matCache.set(key, m);
    }
    return m;
  };

  /* ------------------------------------------------------------------ batched voxels */
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map<THREE.Material, THREE.Matrix4[]>();
  const colliders: [number, number, number, number][] = [];
  const solid = (x1: number, z1: number, x2: number, z2: number) => colliders.push([Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2)]);

  /** x, z = centre. y = bottom. */
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, hex: number, group = 'world') => {
    const m = mat(hex, group);
    const mx = new THREE.Matrix4().compose(new THREE.Vector3(x, y + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    let list = batches.get(m);
    if (!list) batches.set(m, (list = []));
    list.push(mx);
  };
  const flush = () => {
    batches.forEach((list, m) => {
      const im = new THREE.InstancedMesh(unit, m, list.length);
      list.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      scene.add(im);
    });
    batches.clear();
  };

  /* ------------------------------------------------------------------ textures */
  const loader = new THREE.TextureLoader();
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const blank = new THREE.Color(0x8b8b8d);
  /** A flat sign. Faces +z (south) by default; rotY = Math.PI / 2 faces east. */
  const plane = (w: number, h: number, x: number, y: number, z: number, rotY = 0) => {
    const m = new THREE.Mesh(planeGeo, new THREE.MeshLambertMaterial({ color: blank.clone() }));
    m.scale.set(w, h, 1);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.userData.aspect = w / h;
    scene.add(m);
    return m;
  };
  const setTex = (mesh: THREE.Mesh, tex: THREE.Texture, imgAspect?: number) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (imgAspect) {
      const a = mesh.userData.aspect as number;
      if (imgAspect > a) {
        tex.repeat.set(a / imgAspect, 1);
        tex.offset.set((1 - a / imgAspect) / 2, 0);
      } else {
        tex.repeat.set(1, imgAspect / a);
        tex.offset.set(0, (1 - imgAspect / a) / 2);
      }
    }
    const m = mesh.material as THREE.MeshLambertMaterial;
    m.map = tex;
    m.color.set(0xffffff);
    m.needsUpdate = true;
  };
  const loadCover = (mesh: THREE.Mesh, url: string) => {
    loader.load(url, (tex) => {
      const im = tex.image as { width: number; height: number };
      setTex(mesh, tex, im.width / im.height);
    });
  };
  /**
   * Shows the whole image, never cropped, with clear space around it. The margin takes the image's own corner colour.
   * trim = true first finds the artwork inside the image (anything that differs from the corner colour), so a small mark
   * on a big background fills the tile and still keeps the same safe area on every side.
   */
  const loadContain = (mesh: THREE.Mesh, url: string, pad = 0.1, trim = false) => {
    const im = new Image();
    im.onload = () => {
      let sx = 0;
      let sy = 0;
      let sw = im.width;
      let sh = im.height;
      if (trim) {
        const t = document.createElement('canvas');
        t.width = im.width;
        t.height = im.height;
        const tg = t.getContext('2d', { willReadFrequently: true })!;
        tg.drawImage(im, 0, 0);
        const d = tg.getImageData(0, 0, t.width, t.height).data;
        let x1 = t.width;
        let y1 = t.height;
        let x2 = 0;
        let y2 = 0;
        for (let y = 0; y < t.height; y += 2) {
          for (let x = 0; x < t.width; x += 2) {
            const k = (y * t.width + x) * 4;
            if (Math.abs(d[k] - d[0]) + Math.abs(d[k + 1] - d[1]) + Math.abs(d[k + 2] - d[2]) > 90) {
              if (x < x1) x1 = x;
              if (x > x2) x2 = x;
              if (y < y1) y1 = y;
              if (y > y2) y2 = y;
            }
          }
        }
        if (x2 > x1 && y2 > y1) {
          sx = x1;
          sy = y1;
          sw = x2 - x1 + 2;
          sh = y2 - y1 + 2;
        }
      }
      const a = mesh.userData.aspect as number;
      const c = document.createElement('canvas');
      c.height = 512;
      c.width = Math.round(512 * a);
      const g = c.getContext('2d')!;
      g.drawImage(im, 0, 0, 1, 1, 0, 0, c.width, c.height); // the corner colour over the whole tile
      const k = Math.min((c.width * (1 - pad * 2)) / sw, (c.height * (1 - pad * 2)) / sh);
      g.drawImage(im, sx, sy, sw, sh, (c.width - sw * k) / 2, (c.height - sh * k) / 2, sw * k, sh * k);
      setTex(mesh, new THREE.CanvasTexture(c));
    };
    im.src = url;
  };
  const textTex = (lines: string[], bg: string, fg: string, w = 512, h = 128, font = 'Albertus', sub?: string) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.length;
    let size = Math.floor((h * (sub ? 0.56 : 0.7)) / n);
    const fam = `"${font}", "Alexandria", serif`;
    g.font = `500 ${size}px ${fam}`;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    if (widest > w * 0.88) {
      size = Math.floor((size * w * 0.88) / widest);
      g.font = `500 ${size}px ${fam}`;
    }
    const block = sub ? h * 0.74 : h;
    lines.forEach((l, i) => g.fillText(l, w / 2, (block / n) * (i + 0.5) + (sub ? h * 0.04 : 0)));
    if (sub) {
      g.font = `500 ${Math.floor(h * 0.13)}px "Plex Mono", monospace`;
      g.fillText(sub.toUpperCase(), w / 2, h * 0.86);
    }
    return new THREE.CanvasTexture(c);
  };

  /* ------------------------------------------------------------------ world pieces */
  const CREAM = 0xe7d6ad;
  const building = (cx: number, cz: number, w: number, d: number, h: number, hex: number, group = 'world', shutter = 0x4f7a5a) => {
    box(cx, 0, cz, w, h, d, hex, group);
    box(cx, h, cz, w + 0.5, 0.35, d + 0.5, 0xd9c79c, group); // cornice
    const front = cz + d / 2;
    const cols = Math.max(1, Math.floor(w / 2.6));
    const step = w / cols;
    for (let fy = 4.2; fy < h - 1.2; fy += 3) {
      for (let i = 0; i < cols; i++) {
        const wx = cx - w / 2 + step * (i + 0.5);
        box(wx, fy, front + 0.06, 1.1, 1.7, 0.12, shutter, group);
        box(wx, fy - 0.25, front + 0.3, 1.5, 0.12, 0.6, 0xbdb39a, group); // balcony
      }
    }
    const side = cx + w / 2;
    const rows = Math.max(1, Math.floor(d / 2.8));
    for (let fy = 4.2; fy < h - 1.2; fy += 3) {
      for (let i = 0; i < rows; i++) box(side + 0.06, fy, cz - d / 2 + (d / rows) * (i + 0.5), 0.12, 1.7, 1.1, shutter, group);
    }
    solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  };
  const tree = (x: number, z: number) => {
    box(x, 0, z, 0.5, 2, 0.5, 0x7a5a3c);
    box(x, 2, z, 2.4, 1.2, 2.4, 0x4f8f4a);
    box(x, 3.2, z, 1.6, 1, 1.6, 0x5fa457);
    solid(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
  };
  const palm = (x: number, z: number, h = 5) => {
    box(x, 0, z, 0.5, h, 0.5, 0x8a6a45);
    box(x, h, z, 3.6, 0.3, 0.8, 0x4f9a52);
    box(x, h, z, 0.8, 0.3, 3.6, 0x4f9a52);
    box(x, h + 0.3, z, 1.6, 0.3, 1.6, 0x63b062);
    solid(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
  };
  const lampAt: [number, number][] = [];
  const lamp = (x: number, z: number) => {
    lampAt.push([x, z + 1]);
    box(x, 0, z, 0.22, 4, 0.22, 0x3b3b40);
    box(x, 4, z + 0.5, 0.3, 0.2, 1.2, 0x3b3b40);
    box(x, 3.7, z + 1, 0.5, 0.3, 0.5, 0xffe9a3);
  };
  const person = (x: number, z: number, shirt: number, group = 'world') => {
    box(x - 0.2, 0, z, 0.3, 0.9, 0.35, 0x2a2a30, group);
    box(x + 0.2, 0, z, 0.3, 0.9, 0.35, 0x2a2a30, group);
    box(x, 0.9, z, 0.85, 0.95, 0.5, shirt, group);
    box(x, 1.85, z, 0.6, 0.6, 0.55, 0xc08a5c, group);
    box(x, 2.38, z, 0.64, 0.16, 0.59, 0x1d1a18, group);
    solid(x - 0.5, z - 0.4, x + 0.5, z + 0.4);
  };
  const paper = (x: number, z: number, r = 0) => box(x, 0.02, z, 0.9 + r, 0.04, 0.6, 0xf2efe6);
  /** Moving things are plain meshes (not batched) that share the colour-group materials. y = bottom. */
  const partsTo = <T extends THREE.Object3D>(parent: T, parts: Part[], group = 'world') => {
    for (const [w, h, d, hex, x, y, z] of parts) {
      const m = new THREE.Mesh(unit, mat(hex, group));
      m.scale.set(w, h, d);
      m.position.set(x, y + h / 2, z);
      m.castShadow = true;
      parent.add(m);
    }
    return parent;
  };

  /* ------------------------------------------------------------------ the empty shop: brand it yourself */
  let myBrand: Brand | null = null;
  let paintShop: (b: Brand) => void = () => undefined;
  const fit = (g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number) => {
    g.font = font(px);
    const w = g.measureText(text).width;
    if (w > maxW) {
      px = Math.floor((px * maxW) / w);
      g.font = font(px);
    }
    return px;
  };
  const drawSign = (c: HTMLCanvasElement, name: string, style: number, pal: [string, string, string]) => {
    const g = c.getContext('2d')!;
    const { width: w, height: h } = c;
    const [bg, ink, accent] = pal;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.textBaseline = 'middle';
    if (style === 1) {
      const t = name.toUpperCase();
      g.fillStyle = accent;
      g.fillRect(0, 0, h, h);
      g.fillStyle = bg;
      g.textAlign = 'center';
      g.font = `800 ${Math.floor(h * 0.62)}px "Archivo", "Alexandria", sans-serif`;
      g.fillText([...t][0] || '', h / 2, h * 0.54);
      g.fillStyle = ink;
      g.textAlign = 'left';
      fit(g, t, (px) => `800 ${px}px "Archivo", "Alexandria", sans-serif`, Math.floor(h * 0.56), w - h * 1.5);
      g.fillText(t, h * 1.25, h * 0.54);
    } else if (style === 2) {
      const t = `[ ${name.toUpperCase()} ]`;
      g.fillStyle = ink;
      g.textAlign = 'center';
      fit(g, t, (px) => `500 ${px}px "Plex Mono", "Alexandria", monospace`, Math.floor(h * 0.4), w * 0.86);
      g.fillText(t, w / 2, h * 0.47);
      const tw = Math.min(w * 0.86, g.measureText(t).width);
      g.fillStyle = accent;
      g.fillRect(w / 2 - tw / 2, h * 0.76, tw, h * 0.05);
    } else {
      g.fillStyle = ink;
      g.textAlign = 'center';
      fit(g, name, (px) => `500 ${px}px "Albertus", "Alexandria", serif`, Math.floor(h * 0.6), w * 0.74);
      g.fillText(name, w / 2, h * 0.54);
      const tw = g.measureText(name).width;
      g.fillStyle = accent;
      for (const sx of [-1, 1]) {
        g.save();
        g.translate(w / 2 + sx * (tw / 2 + h * 0.3), h / 2);
        g.rotate(Math.PI / 4);
        g.fillRect(-h * 0.08, -h * 0.08, h * 0.16, h * 0.16);
        g.restore();
      }
    }
    return c;
  };
  const drawWindow = (c: HTMLCanvasElement, name: string, style: number, pal: [string, string, string]) => {
    const g = c.getContext('2d')!;
    const { width: w, height: h } = c;
    g.fillStyle = pal[2];
    g.fillRect(0, 0, w, h);
    g.fillStyle = pal[0];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fam = style === 1 ? '800 {}px "Archivo", "Alexandria", sans-serif' : style === 2 ? '500 {}px "Plex Mono", "Alexandria", monospace' : '500 {}px "Albertus", "Alexandria", serif';
    g.font = fam.replace('{}', String(Math.floor(h * 0.8)));
    g.fillText(([...name.trim()][0] || '?').toUpperCase(), w / 2, h * 0.56);
    return c;
  };
  const canvasOf = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  /* ------------------------------------------------------------------ spots */
  const spots: Spot[] = [];
  const markerGeo = new THREE.OctahedronGeometry(0.55, 0);
  const markerMat = new THREE.MeshBasicMaterial({ color: ACID });
  const spot = (s: Omit<Spot, 'found' | 'marker'> & { my?: number }) => {
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(s.x, s.my ?? 4.2, s.z);
    scene.add(marker);
    if (!groups[s.group]) groups[s.group] = { t: 0, target: 0 };
    const full: Spot = { ...s, found: false, marker };
    spots.push(full);
    return full;
  };

  /* ------------------------------------------------------------------ panels (DOM) */
  const scrim = $<HTMLDivElement>('[data-scrim]');
  const panelEl = $<HTMLDivElement>('[data-panel]');
  let panelOpen = false;
  const el = (tag: string, cls?: string, text?: string) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const link = (text: string, href: string, ghost = false, newTab = true) => {
    const a = el('a', ghost ? 'btn ghost' : 'btn', text) as HTMLAnchorElement;
    a.href = href;
    if (newTab) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    return a;
  };
  const closePanel = () => {
    panelEl.querySelectorAll('video').forEach((v) => v.pause());
    scrim.classList.remove('on');
    panelOpen = false;
    canvas.focus();
  };
  const openPanel = (meta: string, build: (body: HTMLElement) => void, opts: { media?: HTMLElement; paper?: boolean } = {}) => {
    panelEl.textContent = '';
    panelEl.className = opts.paper ? 'panel paper' : 'panel';
    const top = el('div', 'top mono');
    top.append(el('span', '', meta));
    const x = el('button', 'mono', 'Close ×') as HTMLButtonElement;
    x.type = 'button';
    x.addEventListener('click', closePanel);
    top.append(x);
    panelEl.append(top);
    if (opts.media) panelEl.append(opts.media);
    const body = el('div', 'body');
    build(body);
    panelEl.append(body);
    scrim.classList.add('on');
    panelOpen = true;
    panelEl.scrollTop = 0;
    x.focus();
  };
  scrim.addEventListener('pointerdown', (e) => {
    if (e.target === scrim) closePanel();
  });
  const image = (src: string, alt: string) => {
    const i = el('img', 'media') as HTMLImageElement;
    i.decoding = 'async';
    i.src = src;
    i.alt = alt;
    i.loading = 'lazy';
    return i;
  };
  const acts = (...nodes: HTMLElement[]) => {
    const d = el('div', 'acts');
    d.append(...nodes);
    return d;
  };

  /* ================================================================== BUILD THE CITY */
  const build = () => {
    /* ground */
    box(-25, -1, -8, 150, 1, 130, 0xcfc4ad); // pavement
    box(-75, -0.98, 16, 50, 1, 78, 0xe3c487); // desert
    box(-4, -0.97, -7, 96, 1, 6, 0x55555c); // main street
    box(0, -0.97, -17, 8, 1, 14, 0x55555c); // avenue to the bridge
    for (let x = -50; x < 44; x += 4) box(x, -0.96, -7, 1.6, 1, 0.18, 0xe9e4d6);
    box(0, -0.96, 5, 44, 1, 14, 0xdccfb3); // plaza
    box(39.5, -0.96, 9, 6, 1, 26, 0xc9b28a); // alley floor

    /* the Nile and Gezira island */
    box(-25, -0.95, -47, 150, 1, 46, 0x2f86c2);
    box(0, -0.9, -49, 44, 1, 26, 0x86b86b); // island
    box(0, -0.88, -49, 6, 1, 26, 0xcfc4ad); // island path
    box(0, -0.86, -30, 6, 1, 14, 0xb9b2a4); // bridge deck
    for (const sx of [-3.2, 3.2]) {
      box(sx, 0.14, -30, 0.3, 0.9, 13, 0x7d7a74);
      for (let z = -36; z <= -24; z += 3) box(sx, 0.14, z, 0.5, 1.6, 0.5, 0x6a6862);
    }
    for (let x = -48; x <= 46; x += 4) if (Math.abs(x) > 4) box(x, 0, -24.2, 0.3, 1, 0.3, 0x6a6862); // corniche rail
    box(-26, 0.75, -24.2, 44, 0.16, 0.2, 0x6a6862);
    box(25, 0.75, -24.2, 42, 0.16, 0.2, 0x6a6862);
    solid(-100, -36, -3.2, -24);
    solid(3.2, -36, 50, -24);
    solid(-100, -70, -22, -36);
    solid(22, -70, 50, -36);
    solid(-22, -70, 22, -62);
    // feluccas
    for (const [fx, fz] of [[-34, -30], [26, -31], [-40, -52], [34, -50]] as const) {
      box(fx, 0.05, fz, 6, 0.6, 1.6, 0x7b5234);
      box(fx + 0.6, 0.65, fz, 0.2, 4.6, 0.2, 0x5e4630);
      box(fx - 0.6, 1.4, fz, 2.4, 3.2, 0.12, 0xf3ecd8);
    }

    /* DOWNTOWN : five shops, one per brand identity */
    const brand = data.projects.filter((p) => p.track === 1);
    const xs = [-30, -19, -8, 8, 19];
    brand.slice(0, 5).forEach((p, i) => {
      const cx = xs[i];
      const g = 'shop-' + p.slug;
      const accent = parseInt(p.accent.slice(1), 16);
      const h = 9 + (i % 3) * 3;
      building(cx, -16, 9.6, 8, h, [CREAM, 0xe2c9a0, 0xd9cdb0, 0xe9d2a6, 0xdcc7a2][i], g);
      box(cx, 0.9, -11.86, 8.2, 2.4, 0.3, 0x2b2622, g); // shopfront
      box(cx - 2.3, 0, -11.8, 1.5, 2.3, 0.34, 0x5a4636, g); // door
      box(cx, 3.2, -11.2, 9, 0.24, 1.5, accent, g); // awning
      for (let s = -4; s <= 4; s += 2) box(cx + s, 3.22, -11.2, 0.9, 0.25, 1.52, 0xf3ecd8, g);
      const sign = plane(8.4, 1.5, cx, 4.35, -11.72);
      const win = plane(4.4, 2.1, cx + 1.3, 1.95, -11.68);
      spot({
        id: g,
        label: p.title,
        toast: `${p.title} has its identity back`,
        x: cx,
        z: -9.6,
        r: 3.4,
        group: g,
        my: h + 2,
        onFound: () => {
          setTex(sign, textTex([p.title], p.bg, p.ink, 1024, 180));
          loadCover(win, p.image);
        },
        open: () =>
          openPanel(`Downtown / ${p.kind}`, (b) => {
            b.append(el('h2', '', p.title), el('p', '', p.tagline));
            b.append(el('p', 'q', 'A brand identity built from the strategy up. The full case study has the challenge, the thinking and the system.'));
            b.append(acts(link('Open the case study', p.href)));
          }, { media: image(p.image, p.title) }),
      });
    });
    // filler blocks, kept to the north and west so they never hide the street
    /* THE EMPTY SHOP : the visitor names it, picks a voice and a palette */
    {
      const g = 'shop-yours';
      building(30, -16, 9.6, 8, 12, 0xd8cdb4, g);
      box(30, 0.9, -11.86, 8.2, 2.4, 0.3, 0x2b2622, g);
      box(27.7, 0, -11.8, 1.5, 2.3, 0.34, 0x5a4636, g);
      const awn = new THREE.Mesh(unit, new THREE.MeshLambertMaterial({ color: 0x9c9c9e }));
      awn.scale.set(9, 0.24, 1.5);
      awn.position.set(30, 3.32, -11.2);
      awn.castShadow = true;
      scene.add(awn);
      for (let s = -4; s <= 4; s += 2) box(30 + s, 3.22, -11.2, 0.9, 0.25, 1.52, 0xf3ecd8, g);
      const sign = plane(8.4, 1.5, 30, 4.35, -11.72);
      const win = plane(4.4, 2.1, 31.3, 1.95, -11.68);
      const swap = (mesh: THREE.Mesh, c: HTMLCanvasElement) => {
        (mesh.material as THREE.MeshLambertMaterial).map?.dispose();
        setTex(mesh, new THREE.CanvasTexture(c));
      };
      paintShop = (b) => {
        const pal = PALS[b.p] || PALS[0];
        swap(sign, drawSign(canvasOf(1024, 183), b.n, b.s, pal));
        swap(win, drawWindow(canvasOf(528, 252), b.n, b.s, pal));
        (awn.material as THREE.MeshLambertMaterial).color.set(pal[2]);
      };
      spot({
        id: g,
        label: 'The empty shop',
        toast: 'An empty shop. It needs a name',
        x: 30,
        z: -9.6,
        r: 3.4,
        group: g,
        my: 14,
        onFound: () => paintShop(myBrand || { n: 'Your name here', s: 2, p: 0 }),
        open: () =>
          openPanel('Downtown / the empty shop', (b) => {
            const cur: Brand = myBrand ? { ...myBrand } : { n: '', s: 0, p: 0 };
            b.append(el('h2', '', 'Your turn. Brand this shop.'), el('p', '', 'Give it a name, a voice and a palette. It goes up on the street.'));
            const pv = canvasOf(1024, 183);
            pv.className = 'signpv';
            const redraw = () => drawSign(pv, cur.n.trim() || 'Your name here', cur.s, PALS[cur.p]);
            const inp = el('input', 'field') as HTMLInputElement;
            inp.type = 'text';
            inp.maxLength = 18;
            inp.placeholder = 'Shop name';
            inp.setAttribute('aria-label', 'Shop name');
            inp.value = cur.n;
            inp.addEventListener('input', () => {
              cur.n = inp.value;
              redraw();
            });
            const row = (label: string) => {
              const r = el('div', 'optrow');
              r.append(el('span', 'mono', label));
              return r;
            };
            const voice = row('Voice');
            STYLES.forEach((name, i) => {
              const bt = el('button', 'opt' + (i === cur.s ? ' on' : ''), name) as HTMLButtonElement;
              bt.type = 'button';
              bt.addEventListener('click', () => {
                cur.s = i;
                voice.querySelectorAll('.opt').forEach((o, j) => o.classList.toggle('on', j === i));
                redraw();
              });
              voice.append(bt);
            });
            const palette = row('Palette');
            PALS.forEach((pl, i) => {
              const bt = el('button', 'sw' + (i === cur.p ? ' on' : '')) as HTMLButtonElement;
              bt.type = 'button';
              bt.setAttribute('aria-label', 'Palette ' + (i + 1));
              bt.style.background = `linear-gradient(135deg, ${pl[0]} 0 60%, ${pl[2]} 60% 100%)`;
              bt.addEventListener('click', () => {
                cur.p = i;
                palette.querySelectorAll('.sw').forEach((o, j) => o.classList.toggle('on', j === i));
                redraw();
              });
              palette.append(bt);
            });
            const go = el('button', 'btn', 'Put it on the shop') as HTMLButtonElement;
            go.type = 'button';
            go.addEventListener('click', () => {
              const n = cur.n.trim();
              if (!n) {
                inp.focus();
                return;
              }
              myBrand = { n, s: cur.s, p: cur.p };
              paintShop(myBrand);
              save();
              closePanel();
              burst(30, 4, -10.5, parseInt(PALS[cur.p][2].slice(1), 16), 26);
              audio.chime();
              toast(`${n} is open for business`);
            });
            redraw();
            b.append(pv, inp, voice, palette);
            b.append(el('p', 'q', 'A sign takes a minute. A brand people remember takes strategy first. That part is my job.'));
            b.append(acts(go, link('Book a session', '/services', true)));
          }),
      });
    }
    building(42, -17, 9, 6, 9, 0xe2d3ad);
    building(-52, -17, 8, 6, 12, 0xdccfae);
    for (const x of [-25, -13, 13, 25, 36]) lamp(x, -3.4);
    for (const x of [-22, -4, 4, 22]) tree(x, -1.2);

    /* PLAZA : signpost */
    box(3.2, 0, 0.6, 0.25, 3.6, 0.25, 0x3b3b40, 'always');
    const post = (text: string, y: number) => {
      const s = plane(4.4, 0.7, 3.2, y, 0.76);
      setTex(s, textTex([text], '#0b090e', '#d7ff00', 640, 100, 'Plex Mono'));
    };
    post('↑  DOWNTOWN / TOWER', 3.3);
    post('←  PYRAMIDS / PRINT', 2.5);
    post('→  CALLIGRAPHY ALLEY', 1.7);
    box(0, 0, 9.5, 5, 0.5, 5, 0xbdb39a);
    box(0, 0.5, 9.5, 2.2, 2.6, 2.2, 0xcfc4ad);
    box(0, 3.1, 9.5, 1, 2.2, 0.7, 0x6f7a6a); // the statue
    box(0, 5.3, 9.5, 0.7, 0.7, 0.7, 0x6f7a6a);
    solid(-2.5, 7, 2.5, 12);
    for (const [px, pz, r] of [[5, 2, 0], [6.4, 3.1, 0.3], [-3, 1, 0.2], [14, -3, 0], [-18, -3.2, 0.4], [20, 8, 0.1]] as const) paper(px, pz, r);

    /* NEWSPAPER KIOSK : the CV */
    {
      const g = 'kiosk';
      box(10, 0, 4, 3.4, 2.5, 2.2, 0x2f6b4f, g);
      box(10, 2.5, 4.2, 4, 0.2, 3, 0xd94f30, g);
      box(10, 0.9, 5.3, 3.2, 0.2, 0.9, 0x8a6a45, g);
      for (const sx of [-1, 0, 1]) box(10 + sx, 1.1, 5.3, 0.8, 0.22, 0.6, 0xf2efe6, g);
      solid(8.3, 2.9, 11.7, 5.8);
      person(12.6, 5.2, 0xc7b08a, g);
      const sign = plane(3.2, 0.7, 10, 2.1, 5.12);
      spot({
        id: g,
        label: 'Newspaper kiosk',
        toast: 'Today’s paper is in',
        x: 10,
        z: 7.2,
        r: 2.8,
        group: g,
        onFound: () => setTex(sign, textTex(['THE CAIRO BRIEF'], '#e9e2cf', '#17140f', 640, 140)),
        open: () =>
          openPanel('Newspaper kiosk / the record', (b) => {
            b.append(el('div', 'mast', 'The Cairo Brief'));
            const dl = el('div', 'dateline mono');
            dl.append(el('span', '', 'Cairo edition'), el('span', '', 'Est. 2013'));
            b.append(dl, el('h2', '', 'Designer packs 13 years of work into one box'));
            b.append(el('p', '', 'Ahmed Ibrahim is a strategic brand designer with 13+ years in design and print production. For the past 3 years his full focus has been strategic brand identity.'));
            const ul = el('ul', 'list');
            data.experience.forEach((e) => {
              const li = el('li');
              const l = el('span');
              l.append(el('b', '', e.role), document.createTextNode(' / ' + e.where));
              li.append(l, el('span', 'mono', e.years));
              ul.append(li);
            });
            b.append(ul, acts(link('LinkedIn', data.site.linkedin), link('Behance', data.site.behance, true), link('Portfolio', '/', true)));
          }, { paper: true }),
      });
    }

    /* AHWA : services and contact */
    {
      const g = 'cafe';
      box(-14, 0, 4, 7, 3.2, 3, 0xcdb48a, g);
      box(-14, 3.2, 5.6, 7.6, 0.2, 2.4, 0xb5412f, g);
      for (let s = -3; s <= 3; s += 1.5) box(-14 + s, 3.22, 5.6, 0.7, 0.21, 2.42, 0xf3ecd8, g);
      solid(-17.5, 2.5, -10.5, 5.5);
      for (const [tx, tz] of [[-16.4, 8.2], [-11.8, 9.2], [-14.2, 11]] as const) {
        box(tx, 0, tz, 0.2, 0.9, 0.2, 0x3b3b40, g);
        box(tx, 0.9, tz, 1.3, 0.12, 1.3, 0xb98c5a, g);
        box(tx, 1.02, tz, 0.3, 0.4, 0.3, 0xe9e2cf, g);
        box(tx - 1.1, 0, tz, 0.6, 0.6, 0.6, 0x8a6a45, g);
        box(tx + 1.1, 0, tz, 0.6, 0.6, 0.6, 0x8a6a45, g);
        solid(tx - 0.7, tz - 0.7, tx + 0.7, tz + 0.7);
      }
      // the shisha next to the seat the player can take
      box(-15.9, 0, 12, 0.42, 0.5, 0.42, 0x2f6fb5, g);
      box(-15.9, 0.5, 12, 0.12, 1.0, 0.12, 0xc9a45a, g);
      box(-15.9, 1.5, 12, 0.3, 0.2, 0.3, 0xb5412f, g);
      box(-15.9, 1.7, 12, 0.2, 0.08, 0.2, 0xff6a3d, 'always');
      solid(-16.1, 11.8, -15.7, 12.2);
      const sign = plane(5, 0.9, -14, 2.5, 5.52);
      spot({
        id: g,
        label: 'The ahwa',
        toast: 'The ahwa is open. Tea is on',
        x: -14,
        z: 7,
        r: 3,
        group: g,
        onFound: () => setTex(sign, textTex(['قهوة الهوية'], '#2a1c14', '#efe6da', 640, 120, 'Alexandria')),
        open: () =>
          openPanel('The ahwa / work with me', (b) => {
            b.append(el('h2', '', 'Sit down. Let’s talk about your brand.'));
            const ul = el('ul', 'list');
            data.services.forEach((s) => {
              const li = el('li');
              const l = el('span');
              l.append(el('b', '', s.name), el('br'), document.createTextNode(s.delivery));
              li.append(l, el('span', 'mono', 'From ' + s.from));
              ul.append(li);
            });
            b.append(ul, acts(link('Book a session', '/services'), link('WhatsApp', data.site.whatsapp, true), link('Email', 'mailto:' + data.site.email, true, false)));
          }),
      });
    }

    /* PRINT HOUSE : where it started */
    {
      const g = 'print';
      building(-42, -16, 10, 8, 6, 0xb8a98c, g, 0x5b6b7a);
      box(-42, 0.9, -11.86, 8.6, 2.4, 0.3, 0x2b2622, g);
      box(-39, 0, -9.6, 2.6, 1.3, 1.4, 0x3f4650, g); // press
      box(-39, 1.3, -9.6, 1.8, 0.5, 1.0, 0x59616d, g);
      box(-36.6, 0.5, -9.6, 1.6, 0.1, 1.1, 0xf2efe6, g);
      for (const [c, o] of [[0x00a0dc, 0], [0xe0218a, 0.7], [0xf5d800, 1.4], [0x1b1b1e, 2.1]] as const) box(-45 + o, 0, -9.4, 0.55, 1.1, 0.55, c, g);
      for (let i = 0; i < 4; i++) box(-42.6, i * 0.16, -9.3, 1.2, 0.14, 0.9, 0xf2efe6, g);
      solid(-40.4, -10.4, -35.8, -8.9);
      solid(-45.4, -9.8, -42, -8.8);
      const sign = plane(8.6, 1.4, -42, 4.3, -11.72);
      spot({
        id: g,
        label: 'The print house',
        toast: 'The press is running again',
        x: -41,
        z: -7.4,
        r: 3.6,
        group: g,
        my: 8,
        onFound: () => setTex(sign, textTex(['PRINT HOUSE / مطبعة'], '#1b1b1e', '#f5d800', 1024, 170)),
        open: () =>
          openPanel('The print house / 2013 to today', (b) => {
            b.append(el('h2', '', 'It started with ink on paper.'));
            b.append(el('p', '', '13+ years in design and print production. Years of files that had to survive a real press taught me what a logo has to do outside a screen: hold at any size, in one colour, on any material.'));
            b.append(el('p', 'q', 'That is why every identity I build ships with guidelines a team can use.'));
            b.append(acts(link('Read the profile', '/#profile')));
          }),
      });
    }

    /* two cameras somebody left rolling: one on Gezira, one in Giza */
    const camProp = (x: number, z: number, g: string) => {
      box(x, 0, z, 1.5, 0.9, 0.9, 0x1d1d21, g);
      box(x + 1, 0.15, z, 0.7, 0.6, 0.6, 0x34343a, g);
      box(x + 1.4, 0.2, z, 0.2, 0.5, 0.5, 0x7fb6d9, g);
      box(x - 0.3, 0.9, z, 0.5, 0.3, 0.4, 0x34343a, g);
      box(x - 0.6, 0.9, z + 0.25, 0.16, 0.16, 0.16, 0xe8322a, g);
      solid(x - 0.9, z - 0.6, x + 1.6, z + 0.6);
    };
    data.films.forEach((f, i) => {
      const g = 'film-' + f.id;
      const [x, z] = f.id === 'mini-showreel' ? [5, -38.8] : [-56, 9]; // both sit where no building can hide them
      camProp(x, z, g);
      spot({
        id: g,
        label: `A camera: ${f.title}`,
        toast: 'Someone left a camera rolling',
        x,
        z: z + 1.4,
        r: 2.6,
        group: g,
        my: 3,
        open: () => {
          const v = el('video', 'media') as HTMLVideoElement;
          v.src = f.src;
          v.poster = f.poster;
          v.controls = true;
          v.playsInline = true;
          v.preload = 'metadata';
          openPanel(`Found footage / ${f.kind}`, (b) => {
            b.append(el('h2', '', f.title), el('p', '', f.text), acts(link('More films', '/#visual-rd')));
          }, { media: v });
          v.play().catch(() => undefined);
        },
      });
      void i;
    });

    /* GEZIRA : Cairo Tower and the campaign billboards */
    {
      const g = 'tower';
      box(0, 0, -50, 7, 1.2, 7, 0xbdb39a, g);
      for (let y = 1.2; y < 34; y += 2) {
        box(0, y, -50, 3.4, 1.6, 3.4, 0xe2d2a8, g);
        box(0, y + 1.6, -50, 3.0, 0.4, 3.0, 0xb9a577, g);
      }
      box(0, 34, -50, 5, 1, 5, 0xd8c592, g);
      box(0, 35, -50, 6.4, 2.2, 6.4, 0x8fb3c9, g);
      box(0, 37.2, -50, 5.4, 1, 5.4, 0xd8c592, g);
      box(0, 38.2, -50, 1.2, 5, 1.2, 0xe2d2a8, g);
      box(0, 43.2, -50, 0.3, 4, 0.3, 0xb5412f, g);
      solid(-3.6, -53.6, 3.6, -46.4);
      for (const [px, pz] of [[-8, -40], [8, -40], [-18, -48], [18, -56], [-8, -58], [18, -44]] as const) palm(px, pz, 5.5);
      spot({
        id: g,
        label: 'Cairo Tower',
        toast: 'The tower is lit',
        x: 0,
        z: -45,
        r: 3.2,
        group: g,
        my: 49,
        open: () =>
          openPanel('Cairo Tower / art direction', (b) => {
            b.append(el('h2', '', 'Step back. See the whole thing.'));
            b.append(el('p', '', 'Art direction is the view from up here: one idea, carried through every image, headline and frame of a campaign so it reads as one voice.'));
            const up = el('button', 'btn', 'Go up and look at the city') as HTMLButtonElement;
            up.type = 'button';
            up.addEventListener('click', () => {
              closePanel();
              zoomFocus = [-18, -14];
              zoomTarget = 4.2;
              zoomHold = 7;
            });
            b.append(acts(up, link('Art direction work', '/#art-direction', true)));
          }),
      });
      const art = data.projects.filter((p) => p.track === 3);
      const at = [[-13, -41], [13, -41], [13, -54]] as const;
      art.slice(0, 3).forEach((p, i) => {
        const [bx, bz] = at[i];
        const bg = 'bill-' + p.slug;
        box(bx - 3, 0, bz, 0.4, 3, 0.4, 0x3b3b40, bg);
        box(bx + 3, 0, bz, 0.4, 3, 0.4, 0x3b3b40, bg);
        box(bx, 3, bz, 9, 5.2, 0.4, 0x1d1d21, bg);
        box(bx, 8.2, bz, 9.2, 0.25, 0.9, parseInt(p.accent.slice(1), 16), bg);
        solid(bx - 3.3, bz - 0.4, bx + 3.3, bz + 0.4);
        const face = plane(8.6, 4.8, bx, 5.6, bz + 0.22);
        spot({
          id: bg,
          label: `${p.title} billboard`,
          toast: `${p.title} campaign is up`,
          x: bx,
          z: bz + 2.6,
          r: 3.2,
          group: bg,
          my: 10,
          onFound: () => loadCover(face, p.image),
          open: () =>
            openPanel(`Billboard / ${p.kind}`, (b) => {
              const h = el('h2', '', p.title);
              b.append(h);
              const t = el('p', '', p.tagline);
              if (/[؀-ۿ]/.test(p.tagline)) {
                t.dir = 'rtl';
                t.style.fontFamily = 'var(--arabic)';
              }
              b.append(t, el('p', 'q', 'A self-initiated campaign: concept, copy, art direction and key visuals.'), acts(link('Open the campaign', p.href)));
            }, { media: image(p.image, p.title) }),
        });
      });
    }

    /* CALLIGRAPHY ALLEY : eight Arabic type posters */
    {
      box(36, 0, 9.5, 1, 5.2, 25, 0xc9b592);
      box(36, 5.2, 9.5, 1.4, 0.3, 25.4, 0xa9956f);
      solid(35.5, -3, 36.5, 22);
      for (let z = -1; z <= 21; z += 5.5) {
        box(39.5, 5.6, z, 7, 0.08, 0.08, 0x3b3b40);
        for (const [o, c] of [[-2, 0xe8322a], [0, 0xf5b800], [2, 0x1e9e75]] as const) box(39.5 + o, 4.9, z, 0.5, 0.7, 0.5, c); // lanterns
      }
      box(43.4, 0, 9.5, 0.3, 1, 25, 0x8a6a45);
      solid(43.2, -3, 43.6, 22);
      data.type.slice(0, 8).forEach((t, i) => {
        const z = -0.6 + i * 2.95;
        const g = 'type-' + t.slug;
        box(36.52, 1.1, z, 0.08, 3.5, 2.5, 0x2b2622, g);
        const face = plane(2.3, 3.3, 36.58, 2.85, z, Math.PI / 2);
        const arabic = /[؀-ۿ]/.test(t.title);
        spot({
          id: g,
          label: t.title,
          toast: 'A poster goes up',
          x: 38.2,
          z,
          r: 1.5,
          group: g,
          my: 6.6,
          onFound: () => loadCover(face, t.image),
          open: () =>
            openPanel(`Calligraphy alley / ${t.kind}`, (b) => {
              const h = el('h2', '', t.title);
              if (arabic) h.dir = 'rtl';
              h.style.fontSize = 'clamp(1.6rem, 5.6vw, 2.4rem)';
              b.append(h, el('p', '', t.text), acts(link('See the type and poster work', '/#typography-posters')));
            }, { media: image(t.image, t.title) }),
        });
      });
    }

    /* GIZA : three pyramids, the three steps of the process */
    {
      const pyr = (cx: number, cz: number, base: number, g: string) => {
        let y = 0;
        for (let s = base; s >= 1; s -= 2) {
          box(cx, y, cz, s, 1, s, y % 2 ? 0xdcb46a : 0xe6c07a, g);
          y += 1;
        }
        solid(cx - base / 2, cz - base / 2, cx + base / 2, cz + base / 2);
        return y;
      };
      const at = [[-74, 26, 21], [-90, 42, 15], [-62, 44, 11]] as const;
      data.process.slice(0, 3).forEach((p, i) => {
        const [cx, cz, base] = at[i];
        const g = 'pyr-' + i;
        const top = pyr(cx, cz, base, g);
        box(cx + base / 2 + 1.2, 0, cz + base / 2 + 1.2, 0.2, 2.2, 0.2, 0x3b3b40, 'always');
        const sign = plane(3.6, 1, cx + base / 2 + 1.2, 2.3, cz + base / 2 + 1.34);
        setTex(sign, textTex([`${p.n} / ${p.head.toUpperCase()}`], '#0b090e', '#d7ff00', 512, 140, 'Plex Mono'));
        spot({
          id: g,
          label: `Pyramid ${p.n}: ${p.head}`,
          toast: `${p.head} is in place`,
          x: cx + base / 2 + 1.2,
          z: cz + base / 2 + 3,
          r: 3.4,
          group: g,
          my: top + 3,
          open: () =>
            openPanel(`Giza / step ${p.n} of 03`, (b) => {
              b.append(el('h2', '', p.head), el('p', '', p.text));
              b.append(el('p', 'q', 'Nothing here stands without the layer under it. A brand works the same way: strategy at the base, identity on top of it, then everything people see.'));
              b.append(acts(link('How I work', '/services')));
            }),
        });
      });
      for (const [px, pz] of [[-54, 4], [-60, 22], [-80, 8], [-96, 20], [-52, 34], [-70, 50]] as const) palm(px, pz);
      // a camel
      const cg = 'world';
      box(-58, 0.9, 16, 2.4, 1, 0.9, 0xc79a5d, cg);
      box(-58.2, 1.9, 16, 0.9, 0.5, 0.7, 0xc79a5d, cg);
      box(-56.6, 1.5, 16, 0.5, 1.5, 0.5, 0xc79a5d, cg);
      box(-56.2, 2.8, 16, 0.9, 0.5, 0.5, 0xc79a5d, cg);
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.3, 0.3]) box(-58 + sx, 0, 16 + sz, 0.25, 0.9, 0.25, 0xb58a50, cg);
      solid(-59.4, 15.4, -55.8, 16.6);
    }

    /* ================= UPPER EGYPT : Luxor and Aswan, south of the plaza ================= */
    const SAND = 0xe8cf9a;
    const STONE = 0xd9b77a;
    box(0, -0.955, 46, 100, 1, 44, SAND);
    box(-75, -0.975, 61.5, 50, 1, 13, 0xe3c487);
    // the sleeper train line
    for (let z = 3.5; z <= 60; z += 1.5) box(-40, 0.02, z, 2.6, 0.08, 0.34, 0x5a4636);
    box(-40.8, 0.1, 31.5, 0.14, 0.12, 58, 0x55555c);
    box(-39.2, 0.1, 31.5, 0.14, 0.12, 58, 0x55555c);
    box(-37.4, 0.02, 11, 2.2, 0.06, 12, 0xbdb39a); // Cairo platform
    box(-37.4, 0.02, 52, 2.2, 0.06, 12, 0xcdb48a); // Luxor platform
    const stationSign = (z: number, text: string) => {
      box(-36.6, 0, z, 0.2, 2.6, 0.2, 0x3b3b40, 'always');
      setTex(plane(4.6, 0.8, -36.6, 2.7, z + 0.14), textTex([text], '#0b090e', '#d7ff00', 720, 120, 'Plex Mono'));
    };
    stationSign(17.6, 'SLEEPER TRAIN / LUXOR + ASWAN');
    stationSign(58.6, 'SLEEPER TRAIN / CAIRO');

    /* KARNAK : five columns, the order of the work */
    {
      const g = 'karnak';
      const bands = [0xb5412f, 0x2f6fb5, 0x1e9e75, 0xe9a23b, 0x7f77dd];
      const plaques: THREE.Mesh[] = [];
      data.chain.slice(0, 5).forEach((_, i) => {
        const x = -28 + i * 4;
        box(x, 0, 31, 1.9, 0.4, 1.9, STONE, g);
        box(x, 0.4, 31, 1.2, 7.2, 1.2, i % 2 ? 0xe2c488 : STONE, g);
        box(x, 2.2, 31, 1.26, 0.5, 1.26, bands[i], g);
        box(x, 6.2, 31, 1.26, 0.5, 1.26, bands[i], g);
        box(x, 7.6, 31, 2, 0.8, 2, 0xe6cf9e, g);
        box(x, 0, 33.2, 0.16, 0.7, 0.16, 0x3b3b40, 'always');
        plaques.push(plane(3.2, 0.62, x, 0.95, 33.3));
      });
      box(-20, 8.4, 31, 19.4, 0.9, 1.7, STONE, g);
      solid(-29, 30, -11, 32);
      spot({
        id: g,
        label: 'Karnak: the five columns',
        toast: 'Karnak stands in colour again',
        x: -20,
        z: 35.4,
        r: 4.4,
        group: g,
        my: 11.5,
        onFound: () => plaques.forEach((pl, i) => setTex(pl, textTex([`0${i + 1} ${data.chain[i]}`], '#0b090e', '#d7ff00', 512, 100, 'Plex Mono'))),
        open: () =>
          openPanel('Karnak / the system', (b) => {
            b.append(el('h2', '', 'Five columns hold the roof up.'));
            b.append(el('p', '', `${data.chain.map((c) => c[0] + c.slice(1).toLowerCase()).join(', ')}. In that order. Take one column away and the roof comes down.`));
            const ul = el('ul', 'list');
            data.practice.forEach((pr) => {
              const li = el('li');
              li.append(el('b', '', pr.head[0] + pr.head.slice(1).toLowerCase()), el('span', '', pr.items.join(' / ')));
              ul.append(li);
            });
            b.append(ul, acts(link('How I work', '/services'), link('Read the profile', '/#profile', true)));
          }),
      });
      // an avenue of small sphinxes leading east from the station
      for (let x = -32; x <= -8; x += 4) {
        for (const z of [40.4, 44.6]) {
          box(x, 0, z, 1.7, 0.6, 0.8, STONE);
          box(x + 0.75, 0.6, z, 0.6, 0.7, 0.6, 0xe2c488);
          solid(x - 0.9, z - 0.45, x + 1.1, z + 0.45);
        }
      }
    }

    /* ABU SIMBEL : the wall of marks */
    {
      const g = 'abu';
      const ROCK = 0xcf9f6a;
      box(10, 0, 33, 18, 9, 5, ROCK, g);
      box(10, 9, 32.6, 14, 1.2, 4, 0xc4935f, g);
      box(10, 0, 35.56, 1.7, 3.2, 0.2, 0x3a2a20, g);
      for (const x of [3.4, 7.2, 12.8, 16.6]) {
        box(x, 0, 36.5, 1.6, 1.4, 1.5, 0xd8ab75, g);
        box(x, 1.4, 36.2, 1.5, 2.5, 1.0, 0xd8ab75, g);
        box(x, 3.9, 36.2, 1.0, 1.0, 0.9, 0xe0b684, g);
        box(x, 4.9, 36.2, 1.15, 0.7, 1.0, 0xc4935f, g);
      }
      solid(1, 30.5, 19, 37.3);
      const tiles = data.logos.slice(0, 9).map((_, i) => plane(1.7, 1.7, 2 + i * 2, 7.7, 35.53));
      spot({
        id: g,
        label: 'Abu Simbel: the wall of marks',
        toast: 'Nine marks are carved back in',
        x: 10,
        z: 39.4,
        r: 4.2,
        group: g,
        my: 12.5,
        onFound: () => tiles.forEach((t, i) => loadContain(t, data.logos[i].image, 0.16, true)),
        open: () =>
          openPanel('Abu Simbel / logo design', (b) => {
            b.append(el('h2', '', 'Marks made to last.'));
            b.append(el('p', '', 'A mark has to hold up in stone, on a shop sign and at sixteen pixels. Nine from the archive.'));
            const grid = el('div', 'logogrid');
            data.logos.slice(0, 9).forEach((l) => {
              const f = el('figure');
              const cap = el('figcaption', 'mono', l.name);
              if (l.rtl) cap.dir = 'rtl';
              f.append(image(l.image, l.name), cap);
              grid.append(f);
            });
            b.append(grid, acts(link('See the marks', '/#logo-design'), link('Behance', data.site.behance, true)));
          }),
      });
    }

    /* THE NUBIAN VILLAGE : Behance and the people who stop by */
    {
      const g = 'nubia';
      const house = (x: number, z: number, wall: number, door: number, trim: number) => {
        box(x, 0, z, 4.4, 2.7, 3.6, wall, g);
        box(x, 2.7, z, 4.7, 0.25, 3.9, 0xf6f1e4, g);
        box(x - 0.8, 2.95, z, 2.2, 0.8, 2.2, 0xf6f1e4, g);
        box(x - 0.8, 3.75, z, 1.3, 0.5, 1.3, 0xf6f1e4, g);
        box(x + 0.9, 0, z + 1.82, 1, 1.8, 0.1, door, g);
        for (let i = 0; i < 6; i++) box(x - 1.9 + i * 0.72, 2.1 + (i % 2) * 0.22, z + 1.82, 0.4, 0.3, 0.08, i % 2 ? trim : 0xf6f1e4, g);
        box(x - 1.1, 0.9, z + 1.82, 0.8, 0.8, 0.08, trim, g);
        solid(x - 2.2, z - 1.8, x + 2.2, z + 1.9);
      };
      house(20, 43, 0x2f8fd0, 0xf2c230, 0xe8693a);
      house(25.6, 42, 0xf2c230, 0x2f8fd0, 0xb5412f);
      house(31.2, 43.6, 0xe8693a, 0x1e9e75, 0x2f8fd0);
      palm(17, 47, 4.6);
      palm(33.6, 48.4, 5.2);
      // comments left on the SHAFAQ project page on Behance, quoted as written
      const words: [string, string][] = [
        ['Cool work!', 'Olga L.'],
        ['impressive design', 'Sayed A.'],
        ['تسلم ايدك ي فنان', 'Mohamed A.'],
      ];
      spot({
        id: g,
        label: 'The Nubian village',
        toast: 'The village has its colours back',
        x: 25.6,
        z: 47,
        r: 4,
        group: g,
        my: 7,
        open: () =>
          openPanel('Nubian village / Behance', (b) => {
            b.append(el('h2', '', 'The door is always open.'));
            b.append(el('p', '', 'New work goes up on Behance first: case studies, logofolios and experiments. People stop by and leave a word.'));
            const ul = el('ul', 'list');
            words.forEach(([q, who]) => {
              const li = el('li');
              const t = el('span', '', `“${q}”`);
              if (/[؀-ۿ]/.test(q)) {
                t.dir = 'rtl';
                t.style.fontFamily = 'var(--arabic)';
              }
              li.append(t, el('span', 'mono', who));
              ul.append(li);
            });
            b.append(ul, acts(link('Visit Behance', data.site.behance), link('LinkedIn', data.site.linkedin, true)));
          }),
      });
    }

    /* THE OBELISK : contact */
    {
      const g = 'obelisk';
      box(2, 0, 54, 2.4, 0.6, 2.4, STONE, g);
      box(2, 0.6, 54, 1.4, 4, 1.4, 0xe2c488, g);
      box(2, 4.6, 54, 1.15, 4, 1.15, STONE, g);
      box(2, 8.6, 54, 0.9, 3, 0.9, 0xe2c488, g);
      box(2, 11.6, 54, 0.6, 0.6, 0.6, 0xe9a23b, g);
      box(2, 12.2, 54, 0.3, 0.4, 0.3, ACID, 'always');
      solid(0.8, 52.8, 3.2, 55.2);
      spot({
        id: g,
        label: 'The obelisk',
        toast: 'The obelisk catches the sun',
        x: 2,
        z: 57,
        r: 3,
        group: g,
        my: 15,
        open: () =>
          openPanel('The obelisk / contact', (b) => {
            b.append(el('h2', '', 'Leave your mark.'));
            b.append(el('p', '', 'An obelisk was how you told everyone something important. Today an email does it.'));
            b.append(acts(link('Email', 'mailto:' + data.site.email, false, false), link('WhatsApp', data.site.whatsapp, true), link('LinkedIn', data.site.linkedin, true), link('Book a session', '/services', true)));
          }),
      });
    }

    /* THE BALLOON : the big picture */
    {
      const g = 'balloon';
      box(36, 0, 60, 1.5, 0.9, 1.5, 0x8a6a45, g);
      for (const [sx, sz] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]] as const) box(36 + sx, 0.9, 60 + sz, 0.08, 2.7, 0.08, 0x3b3b40, g);
      const env: [number, number, number, number][] = [[3, 1, 3.6, 0xe8322a], [4.4, 1.5, 4.6, 0xf5b800], [5.2, 2, 6.1, 0x2f6fb5], [4.4, 1.4, 8.1, 0xf5b800], [3, 0.9, 9.5, 0xe8322a]];
      for (const [w, h, y, c] of env) box(36, y, 60, w, h, w, c, g);
      solid(35.2, 59.2, 36.8, 60.8);
      spot({
        id: g,
        label: 'The Luxor balloon',
        toast: 'The balloon is ready to fly',
        x: 36,
        z: 63,
        r: 3,
        group: g,
        my: 12.5,
        open: () =>
          openPanel('Luxor balloon / the big picture', (b) => {
            b.append(el('h2', '', 'Go up. Look at all of it.'));
            b.append(el('p', '', 'From up here it is one country, not a list of places. A brand should read the same way: one thing, from every distance.'));
            const up = el('button', 'btn', 'Take off') as HTMLButtonElement;
            up.type = 'button';
            up.addEventListener('click', () => {
              closePanel();
              zoomFocus = [-10, 22];
              zoomTarget = 5;
              zoomHold = 7;
            });
            b.append(acts(up, link('See the portfolio', '/', true)));
          }),
      });
    }
    for (const [px, pz] of [[-6, 50], [14, 50], [-24, 56], [10, 62], [26, 56], [-10, 27]] as const) palm(px, pz, 4.8);

    /* three quiet secrets, off the main route */
    box(-16, 0, -58, 2.4, 0.5, 0.8, 0x8a6a45); // a bench at the quiet end of Gezira
    box(-16, 0.5, -58.35, 2.4, 0.7, 0.15, 0x8a6a45);
    box(-16.4, 0.5, -57.9, 0.6, 0.08, 0.45, ACID, 'always'); // the first sketchbook
    solid(-17.3, -58.5, -14.7, -57.5);
    box(-80, 0, 50, 5, 1, 5, 0xe6c07a); // an unfinished pyramid
    box(-80, 1, 50, 3, 1, 3, 0xdcb46a);
    solid(-82.5, 47.5, -77.5, 52.5);
    setTex(plane(4.6, 0.8, -80, 0.5, 52.56), textTex(['RESERVED / YOUR BRAND'], '#0b090e', '#d7ff00', 640, 110, 'Plex Mono'));
    box(41.6, 0, 21, 0.9, 0.8, 0.9, 0x8a6a45); // a crate at the end of the alley
    box(41.6, 0.8, 21, 0.26, 0.55, 0.26, ACID, 'always'); // and a lime spray can
    solid(41.1, 20.5, 42.1, 21.5);

    flush();
  };

  /* ------------------------------------------------------------------ swatches to collect */
  const chipGeo = new THREE.BoxGeometry(0.8, 1.1, 0.12);
  const chipGroup = new THREE.Group();
  scene.add(chipGroup);
  const chipCols = [0xe8322a, 0xff6a3d, 0xf5b800, 0xd7ff00, 0x1ed760, 0x1e9e75, 0x5aa8ff, 0x3b4cff, 0x7f77dd, 0xe0218a, 0xc9a97f, 0xff5a1f];
  const chipAt = [[-24, -7], [14, -7], [30, -7], [0, -16], [-20, 42.5], [0, -30], [8, -47], [40, 12], [-47, -6], [-58, 20], [-80, 36], [5, 12]] as const;
  const chips = chipAt.map(([x, z], i) => {
    const m = new THREE.Mesh(chipGeo, new THREE.MeshBasicMaterial({ color: chipCols[i] }));
    m.position.set(x, 1.3, z);
    chipGroup.add(m);
    return { m, x, z, got: false };
  });

  /* ------------------------------------------------------------------ city life: people, traffic, a cat, pigeons */
  const talkers: Talker[] = [];
  const talker = (x: number, z: number, lines: [string, string][]) => {
    const t: Talker = { x, z, lines, li: 0 };
    talkers.push(t);
    return t;
  };
  type BodyOpts = { hair?: number; skin?: number; scale?: number; hat?: number; group?: string };
  const body = (shirt: number, o: BodyOpts = {}) => {
    const grp = o.group || 'world';
    const g = new THREE.Group();
    const l = new THREE.Group();
    const r = new THREE.Group();
    l.position.set(-0.2, 0.9, 0);
    r.position.set(0.2, 0.9, 0);
    partsTo(l, [[0.3, 0.9, 0.35, 0x2a2a30, 0, -0.9, 0]], grp);
    partsTo(r, [[0.3, 0.9, 0.35, 0x2a2a30, 0, -0.9, 0]], grp);
    g.add(l, r);
    partsTo(g, [
      [0.85, 0.95, 0.5, shirt, 0, 0.9, 0],
      [0.24, 0.8, 0.28, shirt, -0.55, 1.0, 0],
      [0.24, 0.8, 0.28, shirt, 0.55, 1.0, 0],
      [0.6, 0.6, 0.55, o.skin ?? 0xc08a5c, 0, 1.85, 0],
      [0.64, 0.16, 0.59, o.hair ?? 0x1d1a18, 0, 2.38, 0],
      [0.09, 0.09, 0.04, 0x15120f, -0.14, 2.1, 0.28],
      [0.09, 0.09, 0.04, 0x15120f, 0.14, 2.1, 0.28],
    ], grp);
    if (o.hat !== undefined) partsTo(g, [[0.9, 0.1, 0.9, o.hat, 0, 2.5, 0], [0.5, 0.22, 0.5, o.hat, 0, 2.6, 0]], grp);
    g.scale.setScalar(o.scale ?? 1);
    scene.add(g);
    return { g, l, r };
  };
  /** rect = [x1, z1, x2, z2]: the walker strolls to random points inside it instead of following a path. */
  type Walker = { g: THREE.Group; l: THREE.Group; r: THREE.Group; path: [number, number][]; i: number; sp: number; talk: Talker; ph: number; rect?: [number, number, number, number]; wait: number };
  const walkers: Walker[] = [];
  const walker = (path: [number, number][], shirt: number, lines: [string, string][], sp = 2, o: BodyOpts = {}, rect?: [number, number, number, number]) => {
    const b = body(shirt, o);
    b.g.position.set(path[0][0], 0, path[0][1]);
    const w: Walker = { ...b, path: [...path], i: 1 % path.length, sp, talk: talker(path[0][0], path[0][1], lines), ph: Math.random() * 6, rect, wait: 0 };
    walkers.push(w);
    return w;
  };
  const stander = (x: number, z: number, rotY: number, shirt: number, lines: [string, string][], o: BodyOpts = {}) => {
    const b = body(shirt, o);
    b.g.position.set(x, 0, z);
    b.g.rotation.y = rotY;
    solid(x - 0.5, z - 0.4, x + 0.5, z + 0.4);
    talker(x, z, lines);
    return b.g;
  };
  type Car = { g: THREE.Group; x: number; z: number; dir: 1 | -1; v: number; max: number; honkT: number };
  const cars: Car[] = [];
  const LANE_W = -54;
  const LANE_E = 46;
  const carParts = (bodyHex: number, trim: number): Part[] => [
    [4.2, 0.9, 1.9, bodyHex, 0, 0.35, 0],
    [2.3, 0.8, 1.7, bodyHex, -0.2, 1.25, 0],
    [2.34, 0.55, 1.74, 0x2c3440, -0.2, 1.3, 0],
    [0.72, 0.92, 1.94, trim, 1.75, 0.35, 0],
    [0.72, 0.92, 1.94, trim, -1.75, 0.35, 0],
    [0.8, 0.7, 0.3, 0x1c1c1f, -1.3, 0, -0.95],
    [0.8, 0.7, 0.3, 0x1c1c1f, -1.3, 0, 0.95],
    [0.8, 0.7, 0.3, 0x1c1c1f, 1.3, 0, -0.95],
    [0.8, 0.7, 0.3, 0x1c1c1f, 1.3, 0, 0.95],
  ];
  const busParts: Part[] = [
    [4.8, 1.9, 1.9, 0xf2f2ee, 0, 0.35, 0],
    [4.84, 0.3, 1.94, 0x2f6fb5, 0, 0.8, 0],
    [3.6, 0.6, 1.94, 0x2c3440, -0.3, 1.45, 0],
    [0.1, 0.7, 1.6, 0x2c3440, 2.4, 1.35, 0],
    [0.8, 0.7, 0.3, 0x1c1c1f, -1.5, 0, -0.95],
    [0.8, 0.7, 0.3, 0x1c1c1f, -1.5, 0, 0.95],
    [0.8, 0.7, 0.3, 0x1c1c1f, 1.5, 0, -0.95],
    [0.8, 0.7, 0.3, 0x1c1c1f, 1.5, 0, 0.95],
  ];
  const addCar = (x: number, dir: 1 | -1, parts: Part[], max: number) => {
    const g = partsTo(new THREE.Group(), parts);
    const nose = parts === busParts ? 2.45 : 2.12;
    partsTo(g, [[0.08, 0.25, 0.4, 0xfff3b0, nose, 0.62, -0.6], [0.08, 0.25, 0.4, 0xfff3b0, nose, 0.62, 0.6], [0.08, 0.2, 0.4, 0xd9382c, -nose, 0.66, -0.6], [0.08, 0.2, 0.4, 0xd9382c, -nose, 0.66, 0.6]], 'always');
    g.rotation.y = dir === 1 ? 0 : Math.PI;
    scene.add(g);
    cars.push({ g, x, z: dir === 1 ? -5.6 : -8.4, dir, v: max, max, honkT: 0 });
  };
  let waiter: Walker | null = null;
  const train = new THREE.Group();
  const TRAIN_N = 11;
  const TRAIN_S = 52;
  let trainZ = TRAIN_N;
  let riding = false;
  let canBoard = false;
  const tea = new THREE.Mesh(unit, new THREE.MeshLambertMaterial({ color: 0xc8752a }));
  const cat = { g: new THREE.Group(), x: 6, z: 13, tx: 6, tz: 13, wait: 1, follow: 0, cool: 0, met: false, ph: 0 };
  const pigeons: THREE.Mesh[] = [];
  const boat = new THREE.Group();
  let boatDir = 1;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0b8 });
  const nightOnly: THREE.Object3D[] = [];
  const beacon = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0xff3b30 }));

  const life = () => {
    // Every exchange is [what they say, what Ahmed answers]. Short, in English, free to edit here.
    walker([[-44, -2.9], [32, -2.9]], 0xd94f30, [
      ['It is you. The one with the box. The prophecy said grey blazer.', 'I only came for the coffee.'],
      ['A logo is not a brand. My cousin learned that the expensive way.', 'Send him to me. Strategy first.'],
    ], 2.1);
    walker([[34, -10.7], [-33, -10.7]], 0x3b6ea5, [
      ['Five shops on this street. All grey until you walked past.', 'Each one had a problem before it had a logo.'],
      ['The empty shop at the east end still needs a name.', 'Not mine. The next client’s.'],
    ], 1.8, { hair: 0x6b4a2f });
    walker([[6, 13.2], [-6, 13.2], [-6, 15.6], [6, 15.6]], 0xf5b800, [
      ['Are you the chosen one? You look shorter than the legend.', 'It is the camera angle.'],
      ['Did you find all twelve swatches? I found two.', 'Keep looking. Colour hides.'],
    ], 2.6, { scale: 0.72 });
    walker([[-57.5, 25], [-53.5, 36]], 0xf4f1ea, [
      ['Three pyramids, three steps. Strategy sits at the bottom.', 'Nothing stands without the layer under it.'],
      ['I came for the pyramids. I stayed for the kerning.', 'Everyone does.'],
    ], 1.5, { hat: 0xd9c79c, skin: 0xe0b08a });
    walker([[-6, -43.5], [-6, -56]], 0x1e9e75, [
      ['They say one designer will bring the colour back. No pressure.', 'Thirteen years of practice. I am fine.'],
      ['Go up the tower. Everything makes sense from far away.', 'That is art direction.'],
    ], 1.7, { hair: 0x3a2a20 });
    stander(2.3, -31, Math.PI / 2, 0x55606e, [
      ['The tower looks grey from here. Go wake it up.', 'On my way.'],
      ['Nothing is biting. Even the fish want better branding.', 'Start with how the bait is positioned.'],
    ], { hat: 0x8a6a45 });
    stander(42.2, 10, -Math.PI / 2, 0x2a1c14, [
      ['Arabic letters are drawn, not typed. That is the whole secret.', 'Eight posters down this alley agree.'],
      ['You design in Arabic and Latin? Both?', 'Both. One idea, two scripts.'],
    ]);
    waiter = walker([[-9.4, 6.8]], 0xf4f1ea, [
      ['Sit down, ya basha. The chosen one drinks free.', 'Then a shisha too.'],
      ['Tea is ready. So is the price list.', 'Good. Clients like both.'],
    ], 3.4, { group: 'cafe' });
    talker(12.6, 5.2, [
      ['Fresh off the press. Thirteen years of headlines.', 'One page is enough.'],
      ['Print, identity, campaigns, film. Is there anything you do not do?', 'Bad kerning.'],
    ]);
    // people with nowhere particular to be
    const crowd: [string, string][] = [
      ['You are the one. Ahmed Ibrahim. We kept the street grey for you.', 'Thoughtful. I will fix that.'],
      ['Is it true you build the strategy before the logo?', 'Always. The logo is the last step.'],
      ['My shop needs a brand, not just a sign.', 'Meet me at the ahwa.'],
      ['Nice box. What is in it?', 'Thirteen years of work. And a ruler.'],
    ];
    const stroll = (x: number, z: number, shirt: number, rect: [number, number, number, number], k: number, o: BodyOpts = {}) =>
      walker([[x, z]], shirt, [crowd[k % 4], crowd[(k + 1) % 4]], 1.5 + (k % 3) * 0.35, o, rect);
    stroll(16, 12, 0x7f77dd, [3, 0.5, 33, 20], 0);
    stroll(-4, 3, 0xe0218a, [-9, 0.5, 8, 6], 1, { hair: 0x4a2f1f });
    stroll(24, 4, 0x1b1b1e, [13, 0.5, 33, 14], 2, { skin: 0x9c6b47 });
    stroll(-28, 6, 0x5aa8ff, [-34, 0.5, -19, 18], 3);
    stroll(-30, 14, 0xc9a97f, [-34, 6, -20, 20], 0, { hat: 0xf2efe6 });
    walker([[-27, 36.2], [-13, 36.2]], 0xe9a23b, [
      ['Five columns. Take one out and the roof comes down.', 'That is why strategy goes in first.'],
      ['They knew what they stood for before they cut a single stone.', 'Positioning. It is older than it sounds.'],
    ], 1.6, { hat: 0xf6f1e4 });
    walker([[4, 40.6], [16, 40.6]], 0x7f77dd, [
      ['Three thousand years and the mark still reads.', 'That is the brief for every logo.'],
      ['Which mark is your favourite?', 'The next one.'],
    ], 1.5, { skin: 0xe0b08a, hat: 0xd9c79c });
    walker([[22, 50]], 0x1e9e75, [
      ['We paint every house a different colour.', 'And it still reads as one village. That is a system.'],
      crowd[2],
    ], 1.7, { skin: 0x7a5236 }, [16, 46.4, 34, 54]);
    walker([[-30, 50]], 0xf4f1ea, [
      ['The sleeper train takes nine hours. Bring a book.', 'I brought a brand book.'],
      crowd[0],
    ], 1.4, { skin: 0x9c6b47, hat: 0xb5412f }, [-35, 46.5, -22, 58]);

    partsTo(train, [
      [2.2, 2.4, 5, 0x2f5d50, 0, 0.3, 3.2],
      [2.26, 0.3, 5, 0xe9e2cf, 0, 1.0, 3.2],
      [2.26, 0.7, 1.3, 0x2c3440, 0, 1.75, 4.6],
      [1.2, 0.5, 0.6, 0xd94f30, 0, 0.3, 5.9],
      [2.2, 2.3, 6.4, 0x2f5d50, 0, 0.3, -3],
      [2.26, 0.3, 6.4, 0xe9e2cf, 0, 1.0, -3],
      [2.26, 0.7, 5.6, 0x2c3440, 0, 1.6, -3],
      [2.4, 0.3, 12, 0x1c1c1f, 0, 0, 0],
    ]);
    train.position.set(-40, 0, trainZ);
    scene.add(train);
    stroll(-64, 6, 0xff6a3d, [-70, 2, -50, 12], 1, { skin: 0xe0b08a });

    addCar(-40, 1, carParts(0xf2f2ee, 0x1b1b1e), 7);
    addCar(8, 1, carParts(0x9aa7b5, 0x9aa7b5), 7);
    addCar(30, -1, carParts(0xf2f2ee, 0x1b1b1e), 6);
    addCar(-18, -1, busParts, 6);

    tea.scale.set(0.16, 0.24, 0.16);
    tea.position.set(-14.55, 1.14, 11.2);
    tea.visible = false;
    scene.add(tea);

    partsTo(cat.g, [
      [0.3, 0.3, 0.75, 0xe08a3a, 0, 0.2, 0],
      [0.36, 0.3, 0.3, 0xe08a3a, 0, 0.36, 0.45],
      [0.1, 0.12, 0.08, 0xe08a3a, -0.11, 0.66, 0.45],
      [0.1, 0.12, 0.08, 0xe08a3a, 0.11, 0.66, 0.45],
      [0.1, 0.45, 0.1, 0xf3d9b8, 0, 0.4, -0.42],
      [0.1, 0.2, 0.1, 0xf3d9b8, -0.1, 0, 0.28],
      [0.1, 0.2, 0.1, 0xf3d9b8, 0.1, 0, 0.28],
      [0.1, 0.2, 0.1, 0xf3d9b8, -0.1, 0, -0.28],
      [0.1, 0.2, 0.1, 0xf3d9b8, 0.1, 0, -0.28],
    ], 'always');
    scene.add(cat.g);

    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(unit, mat(0x8d8f96));
      m.scale.set(0.5, 0.14, 0.26);
      scene.add(m);
      pigeons.push(m);
    }
    partsTo(boat, [[6, 0.6, 1.6, 0x7b5234, 0, 0.05, 0], [0.2, 4.6, 0.2, 0x5e4630, 0.6, 0.65, 0], [2.4, 3.2, 0.12, 0xf3ecd8, -0.6, 1.4, 0]]);
    boat.position.set(-60, 0, -46);
    scene.add(boat);

    const pool = new THREE.CircleGeometry(3.4, 20);
    for (const [x, z] of lampAt) {
      const bulb = new THREE.Mesh(unit, bulbMat);
      bulb.scale.set(0.56, 0.36, 0.56);
      bulb.position.set(x, 3.85, z);
      const glow = new THREE.Mesh(pool, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(x, 0.07, z);
      scene.add(bulb, glow);
      nightOnly.push(bulb, glow);
    }
    beacon.scale.setScalar(0.6);
    beacon.position.set(0, 47.5, -50);
    scene.add(beacon);
    nightOnly.push(beacon);
    nightOnly.forEach((o) => (o.visible = false));
  };

  const sayEl = $('[data-say]');
  const meEl = $('[data-say-me]');
  let sayT = 0;
  let seated = false;
  let puffIn = 0;
  let bumpT = 0;
  const kick = new THREE.Vector3();
  const puffs: { m: THREE.Mesh; life: number; vx: number }[] = [];
  const SEAT: [number, number] = [-15.3, 11];
  const sit = () => {
    seated = true;
    target = null;
    pos.set(SEAT[0], 0, SEAT[1]);
    facing = Math.PI / 2;
    puffIn = 1.2;
    const cafe = spots.find((sp) => sp.id === 'cafe');
    if (cafe) find(cafe);
    if (waiter) {
      waiter.path = [[-9.4, 6.8], [-14.2, 9.6], [-9.4, 6.8]];
      waiter.i = 1;
    }
  };
  const fadeEl = $('[data-fade]');
  const board = () => {
    const south = trainZ === TRAIN_N;
    riding = true;
    target = null;
    fadeEl.textContent = south ? 'The sleeper train to Luxor. Nine hours, one glass of tea.' : 'Back to Cairo. You slept through Minya.';
    fadeEl.classList.add('on');
    audio.honk(0.09, true);
    setTimeout(() => {
      trainZ = south ? TRAIN_S : TRAIN_N;
      train.position.z = trainZ;
      pos.set(-37.3, 0, trainZ + 1);
      facing = Math.PI / 2;
    }, 900);
    setTimeout(() => {
      fadeEl.classList.remove('on');
      riding = false;
      audio.honk(0.07);
    }, 3300);
  };
  const stand = () => {
    seated = false;
    tea.visible = false;
    pos.set(SEAT[0] - 1.1, 0, SEAT[1]);
  };
  let sayFor: Talker | null = null;
  const v3 = new THREE.Vector3();
  const updateLife = (dt: number, night: number, active: boolean) => {
    for (const w of walkers) {
      const near = active && !(w === waiter && w.path.length > 1) && Math.hypot(w.talk.x - pos.x, w.talk.z - pos.z) < 3;
      const p = w.g.position;
      if (near) {
        w.g.rotation.y = Math.atan2(pos.x - p.x, pos.z - p.z);
        w.l.rotation.x = w.r.rotation.x = 0;
        continue;
      }
      const [tx, tz] = w.path[w.i];
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      const repick = () => {
        const [x1, z1, x2, z2] = w.rect!;
        w.path[0] = [x1 + Math.random() * (x2 - x1), z1 + Math.random() * (z2 - z1)];
      };
      if (d < 0.15) {
        w.l.rotation.x = w.r.rotation.x = 0;
        if (w.rect) {
          if ((w.wait -= dt) <= 0) {
            w.wait = 1 + Math.random() * 4;
            repick();
          }
        } else if (w === waiter) {
          if (w.path.length > 1) {
            // arrived at the table: serve, then walk back
            if (w.i === 1 && !tea.visible && seated) {
              tea.visible = true;
              audio.blip();
              toast('Tea is served. The shisha is lit');
            }
            if (w.i === 2) {
              w.path.length = 1;
              w.i = 0;
              w.g.rotation.y = 0;
            } else w.i = 2;
          }
        } else w.i = (w.i + 1) % w.path.length;
      } else if (w.rect && hits(p.x + (dx / d) * 0.7, p.z + (dz / d) * 0.7)) repick();
      else {
        p.x += (dx / d) * w.sp * dt;
        p.z += (dz / d) * w.sp * dt;
        w.g.rotation.y = Math.atan2(dx, dz);
        w.ph += dt * w.sp * 4.6;
        w.l.rotation.x = Math.sin(w.ph) * 0.6;
        w.r.rotation.x = -Math.sin(w.ph) * 0.6;
      }
      w.talk.x = p.x;
      w.talk.z = p.z;
    }
    for (const c of cars) {
      const ahead = (pos.x - c.x) * c.dir;
      const inLane = Math.abs(pos.z - c.z) < 1.7;
      const brake = inLane && ahead > -2.5 && ahead < 4.2;
      c.honkT -= dt;
      if (brake && active && c.honkT <= 0) {
        // Cairo rules: lean on the horn until the pedestrian moves
        audio.honk(0.08, c.v < 1);
        c.honkT = c.v < 1 ? 1.1 : 0.5;
      }
      if (inLane && active && ahead > 0 && ahead < 3 && c.v > 3.2 && bumpT <= 0) {
        bumpT = 1.4;
        kick.set(c.dir * 11, 0, (pos.z >= c.z ? 1 : -1) * 6);
        hop = 0.9;
        audio.pop();
        audio.honk(0.1, true);
        toast('Watch the road, ya basha');
      }
      c.v += ((brake ? 0 : c.max) - c.v) * Math.min(1, dt * (brake ? 7 : 1.6));
      c.x += c.v * c.dir * dt;
      if (c.x > LANE_E) c.x = LANE_W;
      if (c.x < LANE_W) c.x = LANE_E;
      c.g.position.set(c.x, 0, c.z);
      c.g.scale.setScalar(THREE.MathUtils.clamp(Math.min(c.x - LANE_W, LANE_E - c.x) / 3, 0.001, 1));
    }
    /* the cat */
    {
      const dp = Math.hypot(pos.x - cat.x, pos.z - cat.z);
      cat.cool -= dt;
      if (active && dp < 3.2 && cat.follow <= 0 && cat.cool <= 0) {
        cat.follow = 22;
        audio.meow();
        if (!cat.met) {
          cat.met = true;
          toast('A street cat has decided you are its person');
        }
      }
      let sp = 2.6;
      if (cat.follow > 0) {
        cat.follow -= dt;
        if (dp > 14 || cat.follow <= 0) {
          cat.follow = 0;
          cat.cool = 12;
        }
        cat.tx = THREE.MathUtils.clamp(pos.x - Math.sin(facing) * 1.4, -45, 34);
        cat.tz = Math.max(-2.6, pos.z - Math.cos(facing) * 1.4);
        sp = 8.5;
      } else if ((cat.wait -= dt) <= 0) {
        cat.tx = -8 + Math.random() * 26;
        cat.tz = 0.5 + Math.random() * 14;
        cat.wait = 3 + Math.random() * 5;
      }
      const dx = cat.tx - cat.x;
      const dz = cat.tz - cat.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.35) {
        const nx = cat.x + (dx / d) * Math.min(sp, d * 4) * dt;
        const nz = cat.z + (dz / d) * Math.min(sp, d * 4) * dt;
        if (!hits(nx, nz)) {
          cat.x = nx;
          cat.z = nz;
          cat.ph += dt * 16;
        } else cat.wait = 0;
        cat.g.rotation.y = Math.atan2(dx, dz);
      }
      cat.g.position.set(cat.x, d > 0.35 ? Math.abs(Math.sin(cat.ph)) * 0.08 : 0, cat.z);
    }
    pigeons.forEach((m, i) => {
      const a = clock * (0.5 + i * 0.03) + i * 0.9;
      const r = 4 + i * 0.55;
      m.position.set(Math.cos(a) * r, 7 + Math.sin(clock * 1.3 + i) * 0.8 + i * 0.2, 9.5 + Math.sin(a) * r);
      m.rotation.y = -a;
      m.scale.y = 0.1 + Math.abs(Math.sin(clock * 9 + i)) * 0.16;
    });
    boat.position.x += boatDir * 1.1 * dt;
    if (boat.position.x > -28) boatDir = -1;
    if (boat.position.x < -62) boatDir = 1;
    boat.position.y = Math.sin(clock * 1.4) * 0.06;

    const lit = night > 0.04;
    if (nightOnly[0] && nightOnly[0].visible !== lit) nightOnly.forEach((o) => (o.visible = lit));
    glowMat.opacity = night * 0.34;
    if (lit) beacon.visible = Math.sin(clock * 3.2) > 0;

    /* who is talking */
    let who: Talker | null = null;
    let best = 2.9;
    if (active) {
      for (const t of talkers) {
        const d = Math.hypot(t.x - pos.x, t.z - pos.z);
        if (d < best) {
          best = d;
          who = t;
        }
      }
    }
    if (who !== sayFor) {
      if (sayFor) sayFor.li = (sayFor.li + 1) % sayFor.lines.length;
      sayFor = who;
      meEl.classList.remove('on');
      if (who) {
        sayEl.textContent = who.lines[who.li][0];
        sayEl.classList.add('on');
        audio.blip();
        sayT = 2.3;
      } else sayEl.classList.remove('on');
    }
    if (sayFor && sayT > 0 && (sayT -= dt) <= 0) {
      meEl.textContent = sayFor.lines[sayFor.li][1];
      meEl.classList.add('on');
      audio.blip();
    }
    if (meEl.classList.contains('on')) {
      v3.set(pos.x, -0.4, pos.z).project(camera);
      meEl.style.left = `${(v3.x * 0.5 + 0.5) * window.innerWidth}px`;
      meEl.style.top = `${(-v3.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
    /* shisha smoke */
    if (seated && (puffIn -= dt) <= 0) {
      puffIn = 2.6;
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
        m.position.set(pos.x + 0.5, 2.3, pos.z + (Math.random() - 0.5) * 0.3);
        m.scale.setScalar(0.22);
        scene.add(m);
        puffs.push({ m, life: 1, vx: 0.5 + Math.random() * 0.5 });
      }
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const pf = puffs[i];
      pf.life -= dt * 0.45;
      pf.m.position.x += pf.vx * dt;
      pf.m.position.y += dt * 0.9;
      pf.m.scale.setScalar(0.22 + (1 - pf.life) * 0.9);
      (pf.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, pf.life * 0.6);
      if (pf.life <= 0) {
        scene.remove(pf.m);
        (pf.m.material as THREE.Material).dispose();
        puffs.splice(i, 1);
      }
    }
    if (sayFor) {
      v3.set(sayFor.x, 3.5, sayFor.z).project(camera);
      sayEl.style.left = `${(v3.x * 0.5 + 0.5) * window.innerWidth}px`;
      sayEl.style.top = `${(-v3.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
  };

  /* ------------------------------------------------------------------ the player: Ahmed, packed and ready */
  const player = new THREE.Group();
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  {
    const part = (w: number, h: number, d: number, hex: number, x: number, y: number, z: number, parent: THREE.Object3D = player) => {
      const m = new THREE.Mesh(unit, new THREE.MeshLambertMaterial({ color: hex }));
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    legL.position.set(-0.22, 0.95, 0);
    legR.position.set(0.22, 0.95, 0);
    part(0.34, 0.95, 0.38, 0x17171a, 0, -0.475, 0, legL);
    part(0.34, 0.95, 0.38, 0x17171a, 0, -0.475, 0, legR);
    part(0.36, 0.16, 0.5, 0x0c0c0e, 0, -0.9, 0.08, legL);
    part(0.36, 0.16, 0.5, 0x0c0c0e, 0, -0.9, 0.08, legR);
    player.add(legL, legR);
    part(0.95, 1.0, 0.55, 0x6f7175, 0, 1.45, 0); // grey blazer
    part(0.3, 0.9, 0.06, 0xf4f1ea, 0, 1.5, 0.28); // shirt
    part(0.12, 0.7, 0.07, 0x1b2233, 0, 1.45, 0.3); // tie
    part(0.26, 0.85, 0.3, 0x6f7175, 0.6, 1.5, 0); // right arm
    part(0.26, 0.5, 0.5, 0x6f7175, -0.6, 1.6, 0.2); // left arm, holding the box
    part(0.62, 0.62, 0.58, 0xb98562, 0, 2.28, 0); // head
    part(0.66, 0.2, 0.62, 0x15120f, 0, 2.62, -0.01); // hair
    part(0.66, 0.34, 0.2, 0x15120f, 0, 2.42, -0.24);
    part(0.1, 0.1, 0.04, 0x15120f, -0.15, 2.32, 0.3); // eyes
    part(0.1, 0.1, 0.04, 0x15120f, 0.15, 2.32, 0.3);
    part(0.8, 0.55, 0.6, 0xc49a6c, -0.62, 1.32, 0.55); // the box
    part(0.16, 0.7, 0.16, ACID, -0.8, 1.75, 0.55); // lime tube
    part(0.14, 0.55, 0.14, 0xf4f1ea, -0.5, 1.7, 0.45); // rolled proof
    part(0.3, 0.3, 0.05, 0xe8322a, -0.46, 1.62, 0.72); // swatch fan
    part(0.2, 0.3, 0.2, 0xe9e2cf, 0.62, 1.05, 0.22); // coffee
    part(0.22, 0.06, 0.22, 0x15120f, 0.62, 1.22, 0.22);
  }
  scene.add(player);
  const pos = new THREE.Vector3(0, 0, 2.5);
  let facing = Math.PI;
  let walkT = 0;

  /* ------------------------------------------------------------------ particles */
  const partGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  const burst = (x: number, y: number, z: number, hex = ACID, n = 18) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? hex : 0xffffff }));
      m.position.set(x, y, z);
      scene.add(m);
      sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 7, 5 + Math.random() * 6, (Math.random() - 0.5) * 7), life: 1 });
    }
  };

  /* ------------------------------------------------------------------ HUD */
  const pctEl = $('[data-pct]');
  const barEl = $('[data-bar]');
  const chipEl = $('[data-chips]');
  const promptEl = $<HTMLButtonElement>('[data-prompt]');
  const toastEl = $('[data-toast]');
  const hintEl = $('[data-hint]');
  const outro = $('[data-outro]');
  const timeEl = $('[data-time]');
  const secEl = $('[data-secrets]');
  const soundBtn = $<HTMLButtonElement>('[data-sound]');
  let playMs = 0;
  let finalMs = 0;
  let untimed = false;
  let submitted = 0;
  let savedName = '';
  let shownSec = -1;
  const secrets = [
    { id: 'sketch', x: -16, z: -57, r: 2.2, toast: 'Secret found: the first sketchbook, 2013' },
    { id: 'plot', x: -80, z: 50, r: 4.4, toast: 'Secret found: this plot is reserved for your brand' },
    { id: 'can', x: 41.6, z: 20, r: 1.9, toast: 'Secret found: somebody left a lime spray can' },
  ];
  const secretsGot = new Set<string>();
  let toastT = 0;
  /** Stays up long enough to read: at least 3.2 s, longer for longer lines, or the time given. */
  const toast = (t: string, secs = 0) => {
    toastEl.textContent = t;
    toastEl.classList.add('on');
    toastT = secs || Math.max(3.2, t.length * 0.085);
  };
  let outroShown = false;
  const save = () => {
    try {
      const sv: SaveData = {
        f: spots.filter((s) => s.found).map((s) => s.id),
        c: chips.map((c, i) => (c.got ? i : -1)).filter((i) => i >= 0),
        done: outroShown,
        t: untimed ? undefined : Math.round(playMs),
        ft: finalMs || undefined,
        s: [...secretsGot],
        b: myBrand,
        sub: submitted || undefined,
        name: savedName || undefined,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(sv));
    } catch {
      /* private mode: progress simply is not kept */
    }
  };
  const refresh = () => {
    const n = spots.filter((s) => s.found).length;
    const got = chips.filter((c) => c.got).length;
    const pct = Math.round((n / spots.length) * 100);
    pctEl.textContent = pct + '%';
    barEl.style.width = pct + '%';
    chipEl.textContent = `${got}/${chips.length}`;
    secEl.textContent = `${secretsGot.size}/${secrets.length}`;
    groups.world.target = Math.min(1, (n + got * 0.5) / (spots.length + chips.length * 0.5));
    if (n === spots.length && !outroShown && running) {
      outroShown = true;
      if (!untimed && !finalMs) finalMs = Math.round(playMs);
      save();
      setTimeout(() => audio.fanfare(), 500);
      setTimeout(showOutro, 1900);
    }
  };
  const find = (s: Spot, quiet = false) => {
    if (s.found) return;
    s.found = true;
    groups[s.group].target = 1;
    if (quiet) groups[s.group].t = 1;
    s.marker.visible = false;
    s.onFound?.();
    if (!quiet) {
      burst(s.x, 2, s.z);
      toast(s.toast);
      audio.chime();
      save();
    }
    refresh();
  };
  $('[data-outro-close]').addEventListener('click', () => outro.classList.remove('on'));

  /* ------------------------------------------------------------------ leaderboard and the end screen */
  const boardOl = $<HTMLOListElement>('[data-board]');
  const postForm = $<HTMLFormElement>('[data-post]');
  const postMsg = $('[data-post-msg]');
  const renderBoard = (ol: HTMLElement, rows: ScoreRow[], me = '') => {
    ol.textContent = '';
    if (!rows.length) {
      ol.append(el('li', 'empty', 'Nobody is on the board yet. Be the first.'));
      return;
    }
    rows.forEach((r, i) => {
      const li = el('li', me && r.name.toLowerCase() === me.toLowerCase() ? 'me' : '');
      li.append(el('span', 'rk', String(i + 1).padStart(2, '0')), el('span', 'nm', r.name), el('span', 'sw2', `${r.chips}/12`), el('span', 'tm', fmt(r.ms)));
      ol.append(li);
    });
  };
  const loadBoard = async (ol: HTMLElement, me = '') => {
    ol.textContent = '';
    ol.append(el('li', 'empty', 'Loading the board'));
    try {
      const res = await fetch('/api/scores', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { top: ScoreRow[] };
      renderBoard(ol, j.top.slice(0, 10), me);
    } catch {
      ol.textContent = '';
      ol.append(el('li', 'empty', 'The board is offline right now. Your walk still counts.'));
    }
  };
  const showOutro = () => {
    $('[data-o-time]').textContent = finalMs ? fmt(finalMs) : 'untimed';
    $('[data-o-chips]').textContent = `${chips.filter((c) => c.got).length}/${chips.length}`;
    $('[data-o-secrets]').textContent = `${secretsGot.size}/${secrets.length}`;
    const can = !!finalMs && !submitted;
    postForm.hidden = !can;
    postMsg.textContent = submitted ? `Your time is on the board. Rank ${submitted}.` : !finalMs ? 'This walk started before the timer existed. Play again for a timed run.' : '';
    outro.classList.add('on');
    outro.scrollTop = 0;
    void loadBoard(boardOl, savedName);
  };
  const ERR: Record<string, string> = {
    name: 'Pick another name: 2 to 16 letters or numbers.',
    time: 'That time does not look right. Play again for a fresh run.',
    slow_down: 'Too many posts from here. Try again in an hour.',
  };
  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(postForm);
    const name = String(fd.get('name') || '').trim();
    const email = String(fd.get('email') || '').trim();
    const consent = fd.get('consent') === 'on';
    if (name.length < 2) {
      postMsg.textContent = ERR.name;
      return;
    }
    if (email && !consent) {
      postMsg.textContent = 'Tick the box so Ahmed is allowed to email you, or clear the email field.';
      return;
    }
    const bt = postForm.querySelector('button[type=submit]') as HTMLButtonElement;
    bt.disabled = true;
    postMsg.textContent = 'Posting';
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, ms: finalMs, chips: chips.filter((c) => c.got).length, secrets: secretsGot.size, email: email || undefined, consent }),
      });
      const j = (await res.json()) as { ok?: boolean; rank?: number; top?: ScoreRow[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || 'server');
      submitted = j.rank || 1;
      savedName = name;
      save();
      postForm.hidden = true;
      postMsg.textContent = `You are on the board. Rank ${submitted}.`;
      renderBoard(boardOl, (j.top || []).slice(0, 10), name);
      audio.chime();
    } catch (err) {
      postMsg.textContent = ERR[(err as Error).message] || 'Could not reach the board. Try again in a moment.';
      bt.disabled = false;
    }
  });
  $('[data-share]').addEventListener('click', async (e) => {
    const url = location.origin + '/play';
    const text = finalMs ? `I gave Cairo its colour back in ${fmt(finalMs)}. A playable design portfolio by Ahmed Ibrahim. Beat my time:` : 'Cairo, Unbranded: a playable design portfolio by Ahmed Ibrahim.';
    const bt = e.currentTarget as HTMLButtonElement;
    try {
      if (navigator.share) await navigator.share({ title: 'Cairo, Unbranded', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        bt.textContent = 'Copied to clipboard';
        setTimeout(() => (bt.textContent = 'Share my result'), 2200);
      }
    } catch {
      /* share sheet closed */
    }
  });
  $('[data-again]').addEventListener('click', () => {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* nothing saved */
    }
    location.reload();
  });
  $('[data-board-btn]').addEventListener('click', () =>
    openPanel('Leaderboard / fastest to 100%', (b) => {
      b.append(el('h2', '', 'Fastest walks'));
      b.append(el('p', 'q', outroShown && finalMs ? `Your time: ${fmt(finalMs)}.` : 'Bring the whole city back to 100% and your time can go on the board.'));
      const ol = el('ol', 'board');
      b.append(ol);
      void loadBoard(ol, savedName);
      if (outroShown) {
        const again = el('button', 'btn ghost', 'See my result') as HTMLButtonElement;
        again.type = 'button';
        again.addEventListener('click', () => {
          closePanel();
          showOutro();
        });
        b.append(acts(again));
      }
    }),
  );
  let muted = false;
  try {
    muted = localStorage.getItem('cairo-mute') === '1';
  } catch {
    /* default: sound on */
  }
  audio.setMuted(muted);
  const soundLabel = () => (soundBtn.textContent = muted ? 'Sound off' : 'Sound on');
  soundLabel();
  soundBtn.addEventListener('click', () => {
    muted = !muted;
    audio.setMuted(muted);
    soundLabel();
    try {
      localStorage.setItem('cairo-mute', muted ? '1' : '0');
    } catch {
      /* not kept */
    }
  });

  /* ------------------------------------------------------------------ the opening: a very serious trailer */
  const cineEl = $('[data-cine]');
  const cardEl = $('[data-cine-card]');
  const cine = { on: false, t: 0, step: -1, twist: false };
  const TWIST = 19.4;
  const CINE_END = 24.4;
  const CARDS: [number, string, string][] = [
    [0.8, 'In a city that lost its colour.', ''],
    [5.4, 'Where every sign says nothing.', ''],
    [10.0, 'One man.', ''],
    [12.8, 'One box.', ''],
    [15.6, 'Cairo, unbranded.', 'title'],
    [TWIST, 'Okay. He is quite small. And he brought coffee.', 'funny'],
  ];
  let hop = 0;
  const startCine = () => {
    cine.on = true;
    cine.t = 0;
    cine.step = -1;
    cine.twist = false;
    player.visible = false;
    chipGroup.visible = false;
    cineEl.classList.add('on');
    document.body.classList.add('cine-on', 'cine-dark');
    audio.drone(true);
  };
  const twist = () => {
    cine.twist = true;
    player.visible = true;
    chipGroup.visible = true;
    facing = Math.PI / 4;
    hop = 1.8;
    audio.drone(false);
    audio.scratch();
    setTimeout(() => audio.pop(), 380);
    setTimeout(() => audio.pop(), 620);
    document.body.classList.remove('cine-dark');
    cineEl.classList.add('light');
  };
  const endCine = () => {
    if (!cine.on) return;
    if (!cine.twist) twist();
    cine.on = false;
    cineEl.classList.remove('on', 'light');
    document.body.classList.remove('cine-on', 'cine-dark');
    cardEl.className = 'cine-card';
    zoomTarget = 1;
    running = true;
    canvas.focus();
  };
  $('[data-cine-skip]').addEventListener('click', endCine);
  const stepCine = (dt: number) => {
    cine.t += dt;
    const next = CARDS[cine.step + 1];
    if (next && cine.t >= next[0]) {
      cine.step++;
      cardEl.className = 'cine-card ' + next[2];
      cardEl.textContent = next[1];
      const after = CARDS[cine.step + 1];
      cardEl.style.animationDuration = next[2] ? '' : `${(after ? after[0] : CINE_END) - next[0] - 0.15}s`;
      void cardEl.offsetWidth;
      cardEl.classList.add('in');
      if (next[2] === 'funny') twist();
      else audio.braam(next[2] === 'title');
    }
    if (cine.t >= CINE_END) endCine();
  };
  /** Where the trailer camera looks: [x, z, zoom]. */
  const cineCam = (): [number, number, number] => {
    const t = cine.t;
    if (t < 10) return [-30 + t * 3.6, -7, 1.12];
    if (t < 15.6) return [-66, 30, 1.75 - (t - 10) * 0.05];
    if (t < TWIST) return [-14, 2, 5 - (t - 15.6) * 0.08];
    return [pos.x, pos.z, 0.5];
  };

  /* metro map: fast travel */
  const stops: [string, string, number, number][] = [
    ['Talaat Harb plaza', 'Start, kiosk and the ahwa', 0, 2.5],
    ['Downtown', 'Five brand identities', 0, -7],
    ['Qasr El Nil bridge', 'The Nile and a fisherman', 0, -27],
    ['Gezira', 'Cairo Tower, the billboards and a camera', 0, -42],
    ['Calligraphy alley', 'Eight Arabic type posters', 39.5, -4],
    ['Print house', 'Where it started', -41, -7],
    ['Giza', 'Three pyramids, three steps', -56, 16],
    ['Luxor and Aswan', 'Karnak, Abu Simbel, the Nubian village', -30, 49],
  ];
  $('[data-metro]').addEventListener('click', () =>
    openPanel('Cairo metro / fast travel', (b) => {
      b.append(el('h2', '', 'Where to?'));
      const ul = el('ul', 'list');
      stops.forEach(([name, note, x, z]) => {
        const li = el('li');
        const bt = el('button') as HTMLButtonElement;
        bt.type = 'button';
        bt.append(el('b', '', name), el('span', '', note));
        bt.addEventListener('click', () => {
          pos.set(x, 0, z);
          target = null;
          closePanel();
        });
        li.append(bt);
        ul.append(li);
      });
      b.append(ul);
      const again = el('button', 'btn ghost', 'Start over') as HTMLButtonElement;
      again.type = 'button';
      let sure = false;
      again.addEventListener('click', () => {
        if (!sure) {
          sure = true;
          again.textContent = 'Tap again to erase all progress';
          return;
        }
        try {
          localStorage.removeItem(SAVE_KEY);
        } catch {
          /* nothing saved */
        }
        location.reload();
      });
      b.append(el('p', 'q', 'Finished, or want a clean timed run? This wipes your progress, your shop sign and your time on this device.'), acts(again));
    }),
  );

  /* ------------------------------------------------------------------ input */
  const keys = new Set<string>();
  let target: THREE.Vector3 | null = null;
  let near: Spot | null = null;
  const stick = { on: false, id: -1, x0: 0, y0: 0, dx: 0, dy: 0, t0: 0, moved: false };
  const act = () => {
    if (panelOpen) return;
    if (seated) stand();
    else if (canSit) sit();
    else if (canBoard && !riding) board();
    else if (near) near.open();
  };
  let canSit = false;
  window.addEventListener('keydown', (e) => {
    if (cine.on) {
      if (cine.t > 0.7 && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        endCine();
      }
      return;
    }
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
    if (panelOpen) {
      if (e.key === 'Escape') closePanel();
      return;
    }
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (k === 'e' || k === 'enter' || k === ' ') act();
    keys.add(k);
    target = null;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  promptEl.addEventListener('click', act);

  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pickGround = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(groundPlane, hit) ? hit : null;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (panelOpen || cine.on) return;
    canvas.setPointerCapture(e.pointerId);
    Object.assign(stick, { on: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, t0: performance.now(), moved: false });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!stick.on || e.pointerId !== stick.id) return;
    stick.dx = e.clientX - stick.x0;
    stick.dy = e.clientY - stick.y0;
    if (Math.hypot(stick.dx, stick.dy) > 12) {
      stick.moved = true;
      target = null;
    }
  });
  const up = (e: PointerEvent) => {
    if (!stick.on || e.pointerId !== stick.id) return;
    if (!stick.moved && performance.now() - stick.t0 < 450) target = pickGround(e.clientX, e.clientY);
    stick.on = false;
    stick.dx = stick.dy = 0;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  /* ------------------------------------------------------------------ movement */
  const R = 0.45;
  const hits = (x: number, z: number) => {
    if (x < -98 || x > 48 || z < -61.5 || z > 66) return true;
    if (Math.abs(x + 40) < 1.2 + R && z > trainZ - 6.4 - R && z < trainZ + 6.3 + R) return true;
    for (const c of colliders) if (x > c[0] - R && x < c[2] + R && z > c[1] - R && z < c[3] + R) return true;
    return false;
  };
  const inCar = (c: Car, x: number, z: number) => Math.abs(x - c.x) < 2.3 + R && Math.abs(z - c.z) < 1 + R;
  const blocked = (x: number, z: number) => {
    if (hits(x, z)) return true;
    for (const c of cars) if (inCar(c, x, z) && !inCar(c, pos.x, pos.z)) return true;
    return false;
  };
  const SQ = Math.SQRT1_2;

  const fitCam = () => {
    const aspect = window.innerWidth / window.innerHeight;
    const v = viewSize * zoom;
    camera.left = (-v * aspect) / 2;
    camera.right = (v * aspect) / 2;
    camera.top = v / 2;
    camera.bottom = -v / 2;
    camera.updateProjectionMatrix();
  };
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    viewSize = Math.max(24, 21 / (w / h));
    fitCam();
  };
  window.addEventListener('resize', resize);

  let running = false;
  let last = performance.now();
  let clock = 0;
  let dayT = 0;
  let lastStep = 0;
  const tmp = new THREE.Color();
  const WHITE = new THREE.Color(0xffffff);
  const skyNight = new THREE.Color(0x0d1330);
  const skyDusk = new THREE.Color(0xf0935a);
  const moon = new THREE.Color(0x9fb2ff);
  const duskSun = new THREE.Color(0xffa05a);
  const nightAt = (t: number) => {
    const p = (t % 260) / 260;
    return THREE.MathUtils.smoothstep(p, 0.56, 0.66) - THREE.MathUtils.smoothstep(p, 0.9, 1);
  };
  const frame = (now: number) => {
    const last0 = last;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    if (cine.on) stepCine(Math.min(0.25, (now - last0) / 1000));
    const active = running && !panelOpen && !riding;
    if (active) {
      dayT += dt;
      if (!outroShown && !untimed) playMs += dt * 1000;
      const sec = Math.floor(playMs / 1000);
      if (sec !== shownSec) {
        shownSec = sec;
        timeEl.textContent = untimed ? 'untimed' : fmt(finalMs || playMs).slice(0, -2);
      }
    }
    const night = cine.on ? (cine.twist ? 0 : 0.74) : nightAt(dayT);

    /* input to world direction (the camera looks from the south-east) */
    let ix = 0;
    let iy = 0;
    if (running && !panelOpen && !riding) {
      if (keys.has('w') || keys.has('arrowup')) iy += 1;
      if (keys.has('s') || keys.has('arrowdown')) iy -= 1;
      if (keys.has('d') || keys.has('arrowright')) ix += 1;
      if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
      if (stick.on && stick.moved) {
        ix = THREE.MathUtils.clamp(stick.dx / 60, -1, 1);
        iy = THREE.MathUtils.clamp(-stick.dy / 60, -1, 1);
      }
    }
    let vx = (ix - iy) * SQ;
    let vz = (-ix - iy) * SQ;
    if (!ix && !iy && target && running && !panelOpen) {
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) target = null;
      else {
        vx = dx / d;
        vz = dz / d;
      }
    }
    if (seated && (ix || iy || target)) {
      stand();
      target = null;
      vx = vz = 0;
    }
    bumpT -= dt;
    if (kick.lengthSq() > 0.05) {
      const kx = pos.x + kick.x * dt;
      const kz = pos.z + kick.z * dt;
      if (!hits(kx, pos.z)) pos.x = kx;
      if (!hits(pos.x, kz)) pos.z = kz;
      kick.multiplyScalar(Math.max(0, 1 - dt * 6));
      target = null;
    }
    const len = Math.hypot(vx, vz);
    const moving = len > 0.05;
    if (moving) {
      const sp = (keys.has('shift') ? 13 : 8) * Math.min(1, len);
      const nx = pos.x + (vx / len) * sp * dt;
      const nz = pos.z + (vz / len) * sp * dt;
      let stuck = true;
      if (!blocked(nx, pos.z)) {
        pos.x = nx;
        stuck = false;
      }
      if (!blocked(pos.x, nz)) {
        pos.z = nz;
        stuck = false;
      }
      if (stuck) target = null;
      const want = Math.atan2(vx, vz);
      let diff = want - facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      facing += diff * Math.min(1, dt * 14);
      walkT += dt * (keys.has('shift') ? 16 : 11);
      const stepN = Math.floor(walkT / Math.PI);
      if (stepN !== lastStep) {
        lastStep = stepN;
        audio.step();
      }
      if (hintEl.style.opacity !== '0' && clock > 6) hintEl.style.opacity = '0';
    }
    const sw = moving ? Math.sin(walkT) * 0.7 : 0;
    legL.rotation.x = seated ? -Math.PI / 2 : sw;
    legR.rotation.x = seated ? -Math.PI / 2 : -sw;
    player.position.set(pos.x, moving ? Math.abs(Math.sin(walkT)) * 0.12 : 0, pos.z);
    if (hop > 0) {
      hop -= dt;
      player.position.y = Math.abs(Math.sin(hop * 9)) * 0.8 * Math.min(1, hop);
      player.rotation.y = facing + (1.8 - hop) * 7;
    } else player.rotation.y = facing;
    if (seated) player.position.y = -0.32;

    /* discovery */
    near = null;
    let best = 1e9;
    for (const s of spots) {
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < s.r) {
        if (running) find(s);
        if (d < best) {
          best = d;
          near = s;
        }
      }
      if (s.marker.visible) {
        s.marker.rotation.y = clock * 1.6;
        s.marker.position.y += Math.sin(clock * 2.4 + s.x) * 0.004;
      }
    }
    for (const c of chips) {
      if (c.got) continue;
      c.m.rotation.y = clock * 2;
      c.m.position.y = 1.3 + Math.sin(clock * 3 + c.x) * 0.18;
      if (running && Math.hypot(c.x - pos.x, c.z - pos.z) < 1.3) {
        c.got = true;
        c.m.visible = false;
        burst(c.x, 1.4, c.z, (c.m.material as THREE.MeshBasicMaterial).color.getHex(), 10);
        toast('Swatch collected');
        audio.blip();
        save();
        refresh();
      }
    }
    if (running) {
      for (const sc of secrets) {
        if (!secretsGot.has(sc.id) && Math.hypot(sc.x - pos.x, sc.z - pos.z) < sc.r) {
          secretsGot.add(sc.id);
          burst(sc.x, 1.5, sc.z, ACID, 24);
          toast(sc.toast, 7);
          audio.chime();
          save();
          refresh();
        }
      }
    }
    updateLife(dt, night, active);
    if (!cine.on) audio.update(pos.x, pos.z, dt, night);
    canSit = !seated && Math.hypot(SEAT[0] - pos.x, SEAT[1] - pos.z) < 1.9;
    canBoard = !seated && !canSit && Math.abs(pos.x + 37.4) < 1.6 && Math.abs(pos.z - trainZ) < 5.5;
    if ((near || canSit || seated || canBoard) && running && !panelOpen && !riding) {
      const label = seated ? 'Stand up' : canSit ? 'Sit down for tea and shisha' : canBoard ? (trainZ === TRAIN_N ? 'Board the sleeper train to Luxor' : 'Board the sleeper train to Cairo') : `Open: ${near!.label}`;
      if (promptEl.dataset.l !== label) {
        promptEl.dataset.l = label;
        promptEl.textContent = '';
        promptEl.append(el('kbd', '', 'E'), document.createTextNode(label));
      }
      promptEl.classList.add('on');
    } else promptEl.classList.remove('on');

    /* colour coming back */
    for (const k in groups) {
      const g = groups[k];
      if (g.t !== g.target) g.t += Math.sign(g.target - g.t) * Math.min(Math.abs(g.target - g.t), dt * (k === 'world' ? 0.5 : 1.1));
    }
    for (const r of mats) {
      if (r.group === 'always') continue;
      const local = groups[r.group].t;
      const t = r.group === 'world' ? local : Math.max(local, groups.world.t * 0.35);
      r.m.color.copy(tmp.copy(r.grey).lerp(r.col, t));
    }
    const dusk = 4 * night * (1 - night) * (0.3 + 0.7 * groups.world.t);
    (scene.background as THREE.Color).copy(skyGrey).lerp(skyWarm, groups.world.t).lerp(skyDusk, dusk * 0.55).lerp(skyNight, night * 0.92);
    hemi.intensity = 1.15 - 0.6 * night;
    hemi.color.copy(WHITE).lerp(moon, night);
    sun.intensity = 1.5 - 1.2 * night;
    sun.color.copy(WHITE).lerp(duskSun, dusk * 0.7).lerp(moon, night);

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt * 1.1;
      s.v.y -= 22 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += dt * 6;
      s.m.rotation.y += dt * 5;
      s.m.scale.setScalar(Math.max(0.01, s.life));
      if (s.life <= 0 || s.m.position.y < 0) {
        scene.remove(s.m);
        sparks.splice(i, 1);
      }
    }
    if (toastT > 0 && (toastT -= dt) <= 0) toastEl.classList.remove('on');

    /* camera */
    if (zoomHold > 0 && (zoomHold -= dt) <= 0) zoomTarget = 1;
    if (moving && zoomHold > 0 && zoomHold < 6) {
      zoomHold = 0;
      zoomTarget = 1;
    }
    let fx: number;
    let fz: number;
    if (cine.on) {
      [fx, fz, zoom] = cineCam();
      fitCam();
    } else {
      if (Math.abs(zoom - zoomTarget) > 0.001) {
        zoom += (zoomTarget - zoom) * Math.min(1, dt * 2.2);
        fitCam();
      }
      fx = zoom > 1.05 ? THREE.MathUtils.lerp(pos.x, zoomFocus[0], Math.min(1, (zoom - 1) / 3)) : pos.x;
      fz = zoom > 1.05 ? THREE.MathUtils.lerp(pos.z, zoomFocus[1], Math.min(1, (zoom - 1) / 3)) : pos.z;
    }
    camera.position.set(fx + CAM_OFF.x, CAM_OFF.y, fz + CAM_OFF.z);
    camera.lookAt(fx, 0, fz);
    sun.position.set(fx - 26, 52, fz + 18);
    sun.target.position.set(fx, 0, fz);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };

  /* ------------------------------------------------------------------ go */
  const begin = () => {
    build();
    life();
    try {
      const sv = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as SaveData | null;
      if (sv) {
        myBrand = sv.b || null;
        (sv.s || []).forEach((id) => secretsGot.add(id));
        untimed = typeof sv.t !== 'number' && (sv.f || []).length > 0;
        playMs = sv.t || 0;
        finalMs = sv.ft || 0;
        submitted = sv.sub || 0;
        savedName = sv.name || '';
        (sv.c || []).forEach((i) => {
          if (chips[i]) {
            chips[i].got = true;
            chips[i].m.visible = false;
          }
        });
        spots.forEach((s) => {
          if ((sv.f || []).includes(s.id)) find(s, true);
        });
        groups.world.t = 0;
        outroShown = spots.every((s) => s.found);
      }
    } catch {
      /* no saved progress */
    }
    refresh();
    resize();
    startBtn.disabled = false;
    startBtn.textContent = spots.some((s) => s.found) ? 'Continue the walk' : 'Start walking';
    startBtn.addEventListener('click', () => {
      $('[data-intro]').classList.add('off');
      audio.start();
      canvas.focus();
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (spots.some((s) => s.found) || calm) running = true;
      else startCine();
    });
    requestAnimationFrame(frame);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cairo = { pos, spots, find, chips, cine, endCine, sit, board, cars, secrets, state: () => ({ playMs, finalMs, seated, outroShown, running }), tp: (x: number, z: number) => pos.set(x, 0, z) };
  };
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts) {
    Promise.all([fonts.load('500 40px "Albertus"'), fonts.load('500 20px "Plex Mono"'), fonts.load('800 40px "Archivo"'), fonts.load('700 40px "Alexandria"', 'قهوة')])
      .catch(() => undefined)
      .then(begin);
  } else begin();
}

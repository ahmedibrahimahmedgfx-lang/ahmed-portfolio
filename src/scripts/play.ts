/**
 * "Cairo, Unbranded" : the game behind /play.
 * A grey voxel Cairo. Every place the player discovers gets its colour back.
 * Content comes from the JSON island in play.astro (which reads src/data), never hard-coded here.
 */
import * as THREE from 'three';

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

  scene.add(new THREE.HemisphereLight(0xffffff, 0x77736c, 1.15));
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
  const lamp = (x: number, z: number) => {
    box(x, 0, z, 0.22, 4, 0.22, 0x3b3b40);
    box(x, 4, z + 0.5, 0.3, 0.2, 1.2, 0x3b3b40);
    box(x, 3.7, z + 1, 0.5, 0.3, 0.5, 0xffe9a3);
  };
  const car = (x: number, z: number, body: number, trim: number) => {
    box(x, 0.35, z, 4.2, 0.9, 1.9, body);
    box(x - 0.2, 1.25, z, 2.3, 0.8, 1.7, body);
    box(x - 0.2, 1.3, z, 2.34, 0.55, 1.74, 0x2c3440);
    box(x + 1.75, 0.35, z, 0.72, 0.92, 1.94, trim);
    box(x - 1.75, 0.35, z, 0.72, 0.92, 1.94, trim);
    for (const sx of [-1.3, 1.3]) for (const sz of [-0.95, 0.95]) box(x + sx, 0, z + sz, 0.8, 0.7, 0.3, 0x1c1c1f);
    solid(x - 2.2, z - 1, x + 2.2, z + 1);
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
    building(30, -16, 10, 8, 15, 0xd8cdb4);
    building(42, -17, 9, 6, 9, 0xe2d3ad);
    building(-52, -17, 8, 6, 12, 0xdccfae);
    for (const x of [-25, -13, 13, 25, 36]) lamp(x, -3.4);
    for (const x of [-22, -4, 4, 22]) tree(x, -1.2);
    car(-13, -8.4, 0xf2f2ee, 0x1b1b1e); // Cairo taxi
    car(27, -5.6, 0xf2f2ee, 0x1b1b1e);
    car(-36, -5.6, 0x9aa7b5, 0x9aa7b5);

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

    /* CORNICHE : camera one */
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
      const [x, z] = f.id === 'mini-showreel' ? [11, -22.4] : [-56, 9];
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

    flush();
  };

  /* ------------------------------------------------------------------ swatches to collect */
  const chipGeo = new THREE.BoxGeometry(0.8, 1.1, 0.12);
  const chipCols = [0xe8322a, 0xff6a3d, 0xf5b800, 0xd7ff00, 0x1ed760, 0x1e9e75, 0x5aa8ff, 0x3b4cff, 0x7f77dd, 0xe0218a, 0xc9a97f, 0xff5a1f];
  const chipAt = [[-24, -7], [14, -7], [30, -7], [0, -16], [-10, -22.4], [0, -30], [8, -47], [40, 12], [-47, -6], [-58, 20], [-80, 36], [5, 12]] as const;
  const chips = chipAt.map(([x, z], i) => {
    const m = new THREE.Mesh(chipGeo, new THREE.MeshBasicMaterial({ color: chipCols[i] }));
    m.position.set(x, 1.3, z);
    scene.add(m);
    return { m, x, z, got: false };
  });

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
  let toastT = 0;
  const toast = (t: string) => {
    toastEl.textContent = t;
    toastEl.classList.add('on');
    toastT = 2.6;
  };
  let outroShown = false;
  const save = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ f: spots.filter((s) => s.found).map((s) => s.id), c: chips.map((c, i) => (c.got ? i : -1)).filter((i) => i >= 0), done: outroShown }));
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
    groups.world.target = Math.min(1, (n + got * 0.5) / (spots.length + chips.length * 0.5));
    if (n === spots.length && !outroShown) {
      outroShown = true;
      setTimeout(() => outro.classList.add('on'), 1400);
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
      save();
    }
    refresh();
  };
  $('[data-outro-close]').addEventListener('click', () => outro.classList.remove('on'));

  /* metro map: fast travel */
  const stops: [string, string, number, number][] = [
    ['Talaat Harb plaza', 'Start, kiosk and the ahwa', 0, 2.5],
    ['Downtown', 'Five brand identities', 0, -7],
    ['Corniche', 'The Nile and a camera', 0, -22.5],
    ['Gezira', 'Cairo Tower and the billboards', 0, -42],
    ['Calligraphy alley', 'Eight Arabic type posters', 39.5, -4],
    ['Print house', 'Where it started', -41, -7],
    ['Giza', 'Three pyramids, three steps', -56, 16],
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
    }),
  );

  /* ------------------------------------------------------------------ input */
  const keys = new Set<string>();
  let target: THREE.Vector3 | null = null;
  let near: Spot | null = null;
  const stick = { on: false, id: -1, x0: 0, y0: 0, dx: 0, dy: 0, t0: 0, moved: false };
  const act = () => {
    if (near && !panelOpen) near.open();
  };
  window.addEventListener('keydown', (e) => {
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
    if (panelOpen) return;
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
  const blocked = (x: number, z: number) => {
    if (x < -98 || x > 48 || z < -61.5 || z > 53) return true;
    for (const c of colliders) if (x > c[0] - R && x < c[2] + R && z > c[1] - R && z < c[3] + R) return true;
    return false;
  };
  const SQ = Math.SQRT1_2;

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    viewSize = Math.max(24, 21 / aspect);
    const v = viewSize * zoom;
    camera.left = (-v * aspect) / 2;
    camera.right = (v * aspect) / 2;
    camera.top = v / 2;
    camera.bottom = -v / 2;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  let running = false;
  let last = performance.now();
  let clock = 0;
  const tmp = new THREE.Color();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    /* input to world direction (the camera looks from the south-east) */
    let ix = 0;
    let iy = 0;
    if (running && !panelOpen) {
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
      if (hintEl.style.opacity !== '0' && clock > 6) hintEl.style.opacity = '0';
    }
    const sw = moving ? Math.sin(walkT) * 0.7 : 0;
    legL.rotation.x = sw;
    legR.rotation.x = -sw;
    player.position.set(pos.x, moving ? Math.abs(Math.sin(walkT)) * 0.12 : 0, pos.z);
    player.rotation.y = facing;

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
        save();
        refresh();
      }
    }
    if (near && running && !panelOpen) {
      const label = `Open: ${near.label}`;
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
    (scene.background as THREE.Color).copy(skyGrey).lerp(skyWarm, groups.world.t);

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
    if (Math.abs(zoom - zoomTarget) > 0.001) {
      zoom += (zoomTarget - zoom) * Math.min(1, dt * 2.2);
      resize();
    }
    const fx = zoom > 1.05 ? THREE.MathUtils.lerp(pos.x, -18, Math.min(1, (zoom - 1) / 3)) : pos.x;
    const fz = zoom > 1.05 ? THREE.MathUtils.lerp(pos.z, -14, Math.min(1, (zoom - 1) / 3)) : pos.z;
    camera.position.set(fx + CAM_OFF.x, CAM_OFF.y, fz + CAM_OFF.z);
    camera.lookAt(fx, 0, fz);
    sun.position.set(pos.x - 26, 52, pos.z + 18);
    sun.target.position.set(pos.x, 0, pos.z);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };

  /* ------------------------------------------------------------------ go */
  const begin = () => {
    build();
    try {
      const sv = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as { f?: string[]; c?: number[]; done?: boolean } | null;
      if (sv) {
        outroShown = !!sv.done;
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
      running = true;
      canvas.focus();
    });
    requestAnimationFrame(frame);
  };
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts) {
    Promise.all([fonts.load('500 40px "Albertus"'), fonts.load('500 20px "Plex Mono"'), fonts.load('700 40px "Alexandria"', 'قهوة')])
      .catch(() => undefined)
      .then(begin);
  } else begin();
}

// Retro-Pixel-Büroszenen: kleine Figuren an Schreibtischen, gezeichnet auf ein 80×48-Canvas
// und ganzzahlig hochskaliert. Animiert mit 8 Bildern/s – bewusst ruckelig für den Retro-Look.
export const W = 80;
export const H = 48;
const TICK_MS = 125;

export const SKINS = ['#f6d5bd', '#eab894', '#cf9670', '#a8704b', '#7d4e30', '#5b3722'];
export const HAIR_COLORS = ['#2a1c15', '#5c3a1f', '#9c5b2a', '#e2c06e', '#dcdce6', '#d2493a', '#4a7be0', '#9b59d0'];
export const HAIR_STYLES = ['Kurz', 'Lang', 'Stachelig', 'Glatze', 'Dutt'];
export const ACCESSORIES = ['Keins', 'Brille', 'Kopfhörer', 'Mütze', 'Sonnenbrille', 'Krawatte'];
const ARCHETYPE_ACCESSORY = { coder: 2, researcher: 1, analyst: 1, math: 1, critic: 1, designer: 3, guardian: 4, marketer: 5, planner: 5 };

const C = {
  wall: '#222a52', wallLine: '#283162', base: '#1a2044', floor: '#3a2e48', floorLine: '#30263d',
  wood: '#9a6436', woodLight: '#b97c46', woodDark: '#6c4325', chair: '#3d4466', chairDark: '#2b3150',
  metal: '#59607f', frame: '#161a2e', pants: '#2e3a68', shoe: '#1a1a26', eye: '#1a1a2e', mug: '#eef1f6',
  window: '#3a4478', sky: '#101a3c', bubble: '#e8ecff',
};

// ---------------------------------------------------------------- Helfer
let g = null; // aktueller 2D-Kontext
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const P = (x, y, c) => R(x, y, 1, 1, c);

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function noise(n) {
  let x = Math.imul((n >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function shade(hex, f) {
  const n = parseInt(String(hex).slice(1, 7), 16) || 0;
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f))));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const tri = (n, m) => m - Math.abs((n % (2 * m)) - m); // 0..m..0 Pendel

const clampIdx = (v, len, fallback) => (Number.isInteger(v) && v >= 0 && v < len ? v : fallback);

// Aussehen: gespeicherte Wahl des Nutzers, sonst aus der Agent-ID abgeleitet.
export function lookFor(agent) {
  const h = hash(agent.id || agent.name || 'agent');
  const l = agent.look || {};
  return {
    hair: clampIdx(l.hair, HAIR_STYLES.length, h % HAIR_STYLES.length),
    hairColor: clampIdx(l.hairColor, HAIR_COLORS.length, (h >>> 5) % 5),
    skin: clampIdx(l.skin, SKINS.length, (h >>> 9) % SKINS.length),
    acc: clampIdx(l.acc, ACCESSORIES.length, ARCHETYPE_ACCESSORY[agent.archetype] ?? 0),
  };
}

export function randomLook() {
  const r = (n) => Math.floor(Math.random() * n);
  return { hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), skin: r(SKINS.length), acc: r(ACCESSORIES.length) };
}

// ---------------------------------------------------------------- Verhalten (Modus je Zustand)
// Leerlauf-Beschäftigungen: [Modus, Gewicht, min. Sekunden, max. Sekunden]
const IDLE = [['doze', 3, 9, 15], ['coffee', 2, 6, 9], ['read', 2, 7, 11], ['stretch', 1, 3, 4], ['look', 2, 4, 7]];
const idleState = new Map();

function idleMode(id, now, upgrades = []) {
  let s = idleState.get(id);
  if (!s || now >= s.until) {
    const options = IDLE.filter(([m]) => m !== s?.mode)
      .map((o) => (o[0] === 'coffee' && upgrades.includes('coffee') ? [o[0], 5, o[2], o[3]] : o));
    let r = Math.random() * options.reduce((n, o) => n + o[1], 0);
    let pick = options[0];
    for (const o of options) { if ((r -= o[1]) < 0) { pick = o; break; } }
    s = { mode: pick[0], since: now, until: now + (pick[2] + Math.random() * (pick[3] - pick[2])) * 1000 };
    idleState.set(id, s);
  }
  return s;
}

const PHASE_MODE = { working: 'type', thinking: 'think', feedback: 'wave', error: 'panic', waiting: 'wait' };

function modeFor(input, now) {
  if (input.mode) return { mode: input.mode, since: 0 };
  const m = PHASE_MODE[input.phase];
  return m ? { mode: m, since: 0 } : idleMode(input.id, now, input.upgrades);
}

// ---------------------------------------------------------------- Kulisse
const isNight = (now) => { const h = new Date(now || Date.now()).getHours(); return h >= 20 || h < 7; };

function background(t, now, up = [], nextShift = null) {
  const night = isNight(now);
  R(0, 0, W, 42, C.wall);
  for (let x = 6; x < W; x += 12) R(x, 0, 1, 32, C.wallLine);
  R(0, 32, W, 1, C.wallLine);
  R(0, 41, W, 1, C.base);
  R(0, 42, W, 6, C.floor);
  R(0, 44, W, 1, C.floorLine);
  R(0, 46, W, 1, C.floorLine);
  for (const [x, y] of [[9, 42], [27, 43], [48, 42], [66, 43], [17, 45], [40, 45], [58, 45], [74, 46]]) P(x, y, C.floorLine);

  if (up.includes('rug')) { // Teppich
    R(12, 43, 52, 3, '#6b2d4f');
    R(12, 43, 52, 1, '#8a3c66');
    for (let x = 14; x < 62; x += 4) P(x, 44, '#c46a8f');
  }

  // Fenster: tagsüber Himmel mit Sonne und Wolke, nachts Sterne und Mond
  R(3, 3, 14, 11, C.window);
  if (night) {
    R(4, 4, 12, 9, C.sky);
    [[5, 5], [7, 10], [14, 11], [6, 7], [15, 6], [11, 11]].forEach(([x, y], i) => {
      P(x, y, noise(i * 31 + (t >> 2)) > 0.35 ? '#e8ecff' : '#4a5590');
    });
    R(12, 5, 2, 2, '#f3e3a2');
  } else {
    R(4, 4, 12, 9, '#8fd0ff');
    R(4, 10, 12, 3, '#b5e2ff');
    R(12, 5, 3, 3, '#ffd75e');
    P(11, 6, '#ffe9a3');
    const cx = 4 + ((t >> 4) % 12);
    R(cx, 7, 3, 1, '#ffffff');
    R(cx + 1, 6, 2, 1, '#ffffff');
  }
  R(9, 4, 1, 9, C.window);
  R(4, 8, 12, 1, C.window);
  R(2, 14, 16, 1, '#4a5590');
  if (up.includes('plants')) { // Kaktus auf der Fensterbank + Hängepflanze
    R(14, 11, 2, 3, '#3cc46d'); P(13, 12, '#3cc46d'); R(13, 13, 4, 1, '#b5651d');
    R(19, 0, 1, 3, '#59607f'); R(18, 3, 3, 2, '#b5651d');
    const s2 = (t >> 3) % 2;
    P(17, 5 + s2, '#3cc46d'); P(17, 6, '#2f9e57'); P(21, 5, '#3cc46d'); P(21 - s2, 6, '#2f9e57'); P(19, 5, '#3cc46d'); P(19, 6 + s2, '#3cc46d');
  }
  if (up.includes('poster')) { // Poster mit Bergmotiv
    R(38, 2, 9, 7, '#e6e8f4');
    R(39, 3, 7, 5, '#2b3a78');
    P(43, 4, '#ffd75e');
    R(40, 6, 2, 1, '#6ee7b7'); R(41, 5, 1, 1, '#6ee7b7'); R(42, 6, 3, 1, '#34d399'); R(43, 5, 1, 1, '#34d399');
    R(39, 7, 7, 1, '#1f8a5c');
  }
  if (up.includes('shelf')) { // Bücherregal über dem Monitor
    const bx = up.includes('bigmonitor') ? 49 : 51;
    R(bx, 4, 18, 1, C.woodDark);
    const books = ['#e74c3c', '#f39c12', '#3498db', '#9b59b6', '#2ecc71', '#e67e22', '#1abc9c'];
    let x = bx + 1;
    books.forEach((c, i) => { const h = 3 + (i % 2); R(x, 4 - h, 2, h, c); x += 2 + (i === 3 ? 2 : 0); });
  }
  if (up.includes('lights')) { // Lichterkette
    R(0, 1, W, 1, '#2b3150');
    const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#f472b6'];
    for (let x = 2, i = 0; x < W; x += 5, i++) P(x, 2, ((t >> 2) + i) % 3 === 0 ? '#3a3f5c' : colors[i % colors.length]);
  }

  // Wanduhr mit echter Uhrzeit
  const cx = 75, cy = 5;
  R(74, 2, 3, 1, '#e6e8f4'); R(73, 3, 5, 1, '#e6e8f4'); R(72, 4, 7, 3, '#e6e8f4'); R(73, 7, 5, 1, '#e6e8f4'); R(74, 8, 3, 1, '#e6e8f4');
  const d = new Date(now || Date.now());
  const am = (d.getMinutes() / 60) * Math.PI * 2;
  const ah = ((d.getHours() % 12) / 12 + d.getMinutes() / 720) * Math.PI * 2;
  for (let k = 1; k <= 3; k++) P(cx + Math.round(Math.sin(am) * k), cy - Math.round(Math.cos(am) * k), '#2b2f4a');
  for (let k = 1; k <= 2; k++) P(cx + Math.round(Math.sin(ah) * k), cy - Math.round(Math.cos(ah) * k), '#c0392b');
  P(cx, cy, C.eye);
  if (nextShift?.at) { // Markierung der nächsten Schicht am Zifferblatt
    const nd = new Date(nextShift.at);
    const an = ((nd.getHours() % 12) / 12 + nd.getMinutes() / 720) * Math.PI * 2;
    P(cx + Math.round(Math.sin(an) * 3), cy - Math.round(Math.cos(an) * 3), t % 8 < 5 ? '#fbbf24' : '#e6e8f4');
  }

  // Topfpflanze, wiegt sich leicht
  const sway = (t >> 3) % 2;
  R(4, 36, 7, 5, '#b5651d');
  R(3, 35, 9, 1, '#c97a32');
  R(6, 29, 2, 6, '#2f9e57');
  R(4, 31, 2, 4, '#3cc46d');
  R(9, 30, 2, 5, '#3cc46d');
  P(3 + sway, 30, '#3cc46d');
  P(10 + sway, 28, '#3cc46d');
  P(6 + sway, 28, '#2f9e57');
}

function nightShade() {
  g.globalAlpha = 0.32;
  R(0, 0, W, H, '#05071a');
  g.globalAlpha = 1;
}

function chair() {
  R(18, 12, 4, 2, C.chair);
  R(19, 14, 2, 17, C.chairDark);
  R(19, 31, 14, 2, C.chair);
  R(19, 33, 14, 1, C.chairDark);
  R(25, 34, 2, 6, C.metal);
  R(21, 40, 10, 1, C.metal);
  for (const x of [21, 25, 30]) P(x, 41, '#111522');
}

function legs(tap) {
  R(23, 28, 14, 3, C.pants);
  R(34, 31, 3, 9 - (tap ? 1 : 0), C.pants);
  R(34, 40 - (tap ? 1 : 0), 5, 2, C.shoe);
}

function torso(dy, shirt, shirtD, skinD, acc) {
  R(25, 16 + dy, 3, 1, skinD);
  R(22, 17 + dy, 8, 11, shirt);
  R(22, 17 + dy, 2, 11, shirtD);
  R(22, 27 + dy, 8, 1, shirtD);
  P(28, 17 + dy, shade(shirt, 1.3));
  if (acc === 5) { // Krawatte
    R(28, 18 + dy, 2, 1, '#a93226');
    R(28, 19 + dy, 2, 5, '#e74c3c');
    P(28, 24 + dy, '#a93226');
  }
}

function hair(x, y, style, c) {
  const d = shade(c, 0.75);
  const hl = shade(c, 1.25);
  switch (style) {
    case 1: // Lang
      R(x - 1, y - 1, 9, 3, c); R(x - 1, y + 2, 4, 8, c); R(x - 1, y + 9, 3, 1, d); R(x + 1, y - 1, 4, 1, hl);
      break;
    case 2: // Stachelig
      R(x, y, 8, 2, c); R(x, y + 2, 2, 3, c);
      for (const [sx, sy] of [[0, -1], [2, -2], [2, -1], [4, -2], [4, -1], [6, -1], [7, -2]]) P(x + sx, y + sy, c);
      P(x + 3, y, hl);
      break;
    case 3: // Glatze (nur seitlich etwas Haar)
      R(x, y + 2, 2, 3, d); P(x + 4, y + 1, 'rgba(255,255,255,.45)');
      break;
    case 4: // Dutt
      R(x, y - 1, 8, 3, c); R(x - 2, y - 3, 3, 3, c); R(x, y + 2, 3, 2, c); P(x - 1, y - 3, hl);
      break;
    default: // Kurz
      R(x, y - 1, 8, 3, c); R(x, y + 2, 3, 3, c); P(x + 7, y + 2, c); R(x + 2, y - 1, 3, 1, hl);
  }
}

function head(x, y, look, skin, skinD, hairC, eyes, mouth, flip) {
  g.save();
  if (flip) { g.translate(2 * x + 8, 0); g.scale(-1, 1); }
  R(x, y, 8, 8, skin);
  R(x, y + 7, 8, 1, skinD);
  P(x + 8, y + 4, skin);
  R(x + 3, y + 4, 1, 2, skinD);
  if (look.acc === 1) { // Brille: heller Rahmen, Glas, Pupille darin
    const F = '#5b6182';
    R(x + 5, y + 2, 3, 4, F);
    R(x + 6, y + 3, 1, 2, '#d8ecff');
    R(x + 2, y + 3, 3, 1, F);
    if (eyes === 'up' || eyes === 'happy') P(x + 6, y + 3, C.eye);
    else if (eyes === 'wide') R(x + 6, y + 3, 1, 2, C.eye);
    else if (eyes !== 'closed') P(x + 6, y + 4, C.eye);
  } else switch (eyes) {
    case 'closed': R(x + 5, y + 4, 2, 1, C.eye); break;
    case 'up': R(x + 6, y + 2, 1, 2, C.eye); break;
    case 'down': R(x + 6, y + 4, 1, 2, C.eye); break;
    case 'happy': P(x + 5, y + 4, C.eye); P(x + 6, y + 3, C.eye); P(x + 7, y + 4, C.eye); break;
    case 'wide': R(x + 5, y + 2, 2, 3, '#ffffff'); R(x + 6, y + 3, 1, 2, C.eye); break;
    default: R(x + 6, y + 3, 1, 2, C.eye);
  }
  if (mouth === 'open') R(x + 6, y + 5, 2, 2, '#5a1f2a');
  else if (mouth === 'smile') { P(x + 6, y + 6, '#7a2f3a'); P(x + 7, y + 5, '#7a2f3a'); }
  else P(x + 6, y + 6, '#9a4a4a');

  if (look.acc === 3) { // Mütze statt Frisur oben
    hair(x, y, look.hair === 1 ? 1 : 3, hairC);
    R(x - 1, y - 2, 10, 4, '#e67e22'); R(x - 1, y + 1, 10, 1, '#b85f15'); P(x + 3, y - 3, '#f5c27a');
  } else {
    hair(x, y, look.hair, hairC);
  }
  if (look.acc === 2) { // Kopfhörer
    R(x + 1, y - 2, 6, 1, '#2b2b38'); R(x + 1, y - 1, 1, 3, '#2b2b38');
    R(x + 2, y + 2, 3, 4, '#2b2b38'); R(x + 3, y + 3, 1, 2, '#ff5d73');
  }
  if (look.acc === 4) { // Sonnenbrille
    R(x + 4, y + 3, 4, 2, '#111'); P(x + 5, y + 3, '#555'); R(x + 2, y + 3, 2, 1, '#111');
  }
  g.restore();
}

function desk() {
  R(31, 24, 48, 2, C.wood);
  R(31, 24, 48, 1, C.woodLight);
  R(31, 26, 48, 1, C.woodDark);
  R(64, 27, 13, 15, C.wood);
  R(64, 27, 13, 1, C.woodDark);
  R(65, 28, 11, 6, shade(C.wood, 1.08));
  R(65, 35, 11, 6, shade(C.wood, 1.08));
  P(70, 31, '#e2c06e');
  P(70, 38, '#e2c06e');
  // Tastatur
  R(37, 23, 9, 1, '#8a93b8');
  for (let x = 38; x <= 44; x += 2) P(x, 23, '#c3c9e0');
}

function mugOnDesk(t, steam) {
  R(71, 20, 3, 4, C.mug);
  R(71, 20, 3, 1, '#6b4226');
  P(74, 21, C.mug);
  P(74, 22, C.mug);
  if (steam) {
    g.globalAlpha = 0.55;
    for (let k = 0; k < 3; k++) P(72 + ((t + k) >> 2) % 2, 17 + k, C.bubble);
    g.globalAlpha = 1;
  }
}

function monitor(screen, t, big = false) {
  if (big) R(47, 6, 24, 16, C.frame);
  else R(50, 8, 19, 14, C.frame);
  R(58, 22, 3, 1, C.frame);
  R(55, 23, 9, 1, C.frame);
  const [sx, sy, sw, sh] = big ? [49, 8, 20, 12] : [52, 10, 15, 10];
  let led = '#34d399';
  switch (screen) {
    case 'code': {
      R(sx, sy, sw, sh, '#0b1a2b');
      const colors = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24'];
      const row = Math.floor(t / 8);
      const rows = Math.floor((sh - 1) / 2);
      for (let i = 0; i < rows; i++) {
        const n = row - rows + 1 + i;
        const indent = Math.floor(noise(n * 7) * 3) * 2;
        const full = 3 + Math.floor(noise(n * 13) * 8);
        const len = i === rows - 1 ? Math.min(full, (t % 8) + 1) : full;
        R(sx + 1 + indent, sy + 1 + i * 2, Math.min(len, sw - 2 - indent), 1, colors[(n >>> 0) % 4]);
        if (i === rows - 1 && t % 4 < 2) P(sx + 1 + indent + Math.min(len, sw - 2 - indent), sy + 1 + i * 2, '#ffffff');
      }
      break;
    }
    case 'dots':
      R(sx, sy, sw, sh, '#141836');
      for (let i = 0; i < 3; i++) R(sx + Math.floor(sw / 2) - 5 + i * 4, sy + Math.floor(sh / 2) - 1, 2, 2, ((t >> 1) % 4) > i ? '#a78bfa' : '#2c3363');
      break;
    case 'check':
      R(sx, sy, sw, sh, '#0f2a1f');
      for (const [x, y] of [[4, 5], [5, 6], [6, 7], [7, 6], [8, 5], [9, 4], [10, 3]]) R(sx + x + Math.floor((sw - 15) / 2), sy + y + Math.floor((sh - 10) / 2), 2, 1, '#34d399');
      break;
    case 'error':
      led = '#f87171';
      R(sx, sy, sw, sh, t % 4 < 2 ? '#3a1015' : '#2a0c10');
      const ox = Math.floor((sw - 15) / 2), oy = Math.floor((sh - 10) / 2);
      for (let k = 0; k < 6; k++) { P(sx + 4 + ox + k, sy + 2 + oy + k, '#f87171'); P(sx + 9 + ox - k, sy + 2 + oy + k, '#f87171'); }
      break;
    case 'hourglass': {
      led = '#fbbf24';
      R(sx, sy, sw, sh, '#161a33');
      const hx = sx + Math.floor(sw / 2) - 2;
      R(hx, sy + 1, 5, 1, '#fbbf24'); R(hx, sy + 8, 5, 1, '#fbbf24');
      R(hx + 1, sy + 2, 3, 1, '#7a6a3a'); P(hx + 2, sy + 3, '#7a6a3a'); P(hx + 2, sy + 5, '#7a6a3a'); R(hx + 1, sy + 6, 3, 1, '#7a6a3a'); R(hx + 1, sy + 7, 3, 1, '#7a6a3a');
      const fill = (t >> 2) % 4;
      if (fill < 3) P(hx + 2, sy + 4, '#fbbf24');
      R(hx + 1, sy + 7 - Math.min(fill, 2), 3, 1 + Math.min(fill, 2), '#fbbf24');
      break;
    }
    case 'off':
      led = '#f59e0b';
      R(sx, sy, sw, sh, '#0a0d1a');
      P(sx + 1, sy + 1, '#1a2038');
      P(sx + 2, sy + 1, '#1a2038');
      break;
    default: { // Bildschirmschoner
      R(sx, sy, sw, sh, '#0c1020');
      const colors = ['#22d3ee', '#f472b6', '#fbbf24', '#34d399'];
      P(sx + tri(t, sw - 1), sy + tri(Math.floor(t * 0.7), sh - 1), colors[(t >> 4) % 4]);
    }
  }
  P(big ? 68 : 66, big ? 20 : 20, led);
}

// Upgrades auf und unter dem Schreibtisch
function deskUpgrades(t, up, night) {
  if (up.includes('lamp')) { // Schreibtischlampe, nachts mit Lichtkegel
    if (night) {
      g.globalAlpha = 0.16;
      R(42, 17, 12, 7, '#ffd27a');
      R(44, 15, 8, 2, '#ffd27a');
      g.globalAlpha = 1;
    }
    R(46, 23, 4, 1, '#2b2f4a');
    R(47, 18, 1, 5, '#59607f');
    R(45, 16, 4, 2, '#fbbf24');
    P(46, 18, night ? '#fff3c4' : '#c99a2e');
  }
  if (up.includes('coffee')) { // Kaffeemaschine
    R(75, 14, 4, 10, '#3a3f55');
    R(75, 14, 4, 2, '#22263a');
    P(76, 17, t % 8 < 4 ? '#f87171' : '#7a2f3a');
    R(76, 19, 2, 1, '#22263a');
    R(76, 21, 2, 2, C.mug);
  }
}

function cat(t) { // schlafende Katze unter dem Tisch
  const tail = (t >> 2) % 4;
  R(50, 39, 7, 2, '#e8964a');
  R(51, 38, 5, 1, '#e8964a');
  R(56, 37, 3, 3, '#e8964a');
  P(56, 36, '#e8964a');
  P(58, 36, '#e8964a');
  P(57, 38, '#5a3a20');
  R(52, 39, 1, 1, '#c97a32');
  R(54, 39, 1, 1, '#c97a32');
  R(47, 40 - (tail === 1 ? 1 : 0), 3, 1, '#e8964a');
  P(47, 39 - (tail === 2 ? 1 : 0), '#e8964a');
  if ((t >> 4) % 3 === 0) { g.globalAlpha = 0.7; P(60, 35 - ((t >> 2) % 3), '#cdd6ff'); g.globalAlpha = 1; }
}

function zzz(x, y, lt) {
  for (let k = 0; k < 3; k++) {
    const p = (lt + k * 8) % 24;
    const zx = x + Math.floor(p / 6);
    const zy = y - Math.floor(p / 3);
    g.globalAlpha = Math.max(0, 1 - p / 24);
    R(zx, zy, 3, 1, '#cdd6ff'); P(zx + 1, zy + 1, '#cdd6ff'); R(zx, zy + 2, 3, 1, '#cdd6ff');
  }
  g.globalAlpha = 1;
}

function thoughtBubble(hx, hy, lt) {
  P(hx + 8, hy - 1, C.bubble);
  R(hx + 9, hy - 3, 2, 2, C.bubble);
  const x = hx + 11;
  R(x + 1, 0, 11, 6, C.bubble);
  R(x, 1, 13, 4, C.bubble);
  for (let i = 0; i < 3; i++) R(x + 2 + i * 4, 2, 2, 2, ((lt >> 1) % 4) > i ? '#5b6aa8' : '#c3cbef');
}

function alertBubble(x, y, bg, fg) {
  R(x + 1, y, 6, 7, bg);
  R(x, y + 1, 8, 5, bg);
  P(x, y + 7, bg);
  P(x + 1, y + 6, bg);
  R(x + 3, y + 1, 2, 3, fg);
  R(x + 3, y + 5, 2, 1, fg);
}

// ---------------------------------------------------------------- Szene zeichnen
export function drawScene(ctx, input, now = Date.now()) {
  g = ctx;
  ctx.imageSmoothingEnabled = false;
  const t = Math.floor(now / TICK_MS);
  const up = input.upgrades || [];
  const night = isNight(now);
  if (input.empty) { // freier Platz: leeres Büro mit unbesetztem Stuhl
    background(t, now, up);
    if (night) nightShade();
    R(32, 27, 2, 15, shade(C.woodDark, 0.8));
    chair();
    desk();
    monitor('off', t, up.includes('bigmonitor'));
    deskUpgrades(t, up, night);
    return;
  }
  const look = input.look;
  const skin = SKINS[look.skin];
  const skinD = shade(skin, 0.8);
  const hairC = HAIR_COLORS[look.hairColor];
  const shirt = input.color || '#7dd3fc';
  const shirtD = shade(shirt, 0.68);
  const armC = shade(shirt, 0.86);
  const st = modeFor(input, now);
  const mode = st.mode;
  const lt = Math.max(0, Math.floor((now - (st.since || 0)) / TICK_MS));
  const blink = t % 30 < 2 ? 'closed' : 'open';

  let dy = 0, hdx = 0, hdy = 0, eyes = blink, mouth = 'n', flip = false, tap = false;
  switch (mode) {
    case 'doze': dy = (t >> 3) % 2; hdx = 1; hdy = 2; eyes = 'closed'; break;
    case 'think': eyes = 'up'; break;
    case 'read': hdy = 1; eyes = 'down'; break;
    case 'stretch': eyes = 'closed'; mouth = 'open'; break;
    case 'look': flip = Math.floor(lt / 12) % 2 === 1; break;
    case 'wait': eyes = 'up'; tap = t % 4 < 2; break;
    case 'wave': eyes = 'happy'; mouth = 'smile'; break;
    case 'panic': eyes = 'wide'; mouth = 'open'; break;
    default: break;
  }
  const hx = 23 + hdx;
  const hy = 8 + dy + hdy;
  const screen = { working: 'code', thinking: 'dots', feedback: 'check', error: 'error', waiting: 'hourglass' }[input.phase] || (mode === 'doze' ? 'off' : 'saver');

  background(t, now, up, input.nextShift);
  if (night) nightShade();
  if (screen === 'code' || screen === 'check') { // Monitorschein
    g.globalAlpha = 0.1;
    R(44, 4, 32, 22, screen === 'code' ? '#22d3ee' : '#34d399');
    g.globalAlpha = 1;
  }
  R(32, 27, 2, 15, shade(C.woodDark, 0.8)); // hinteres Tischbein
  chair();
  if (up.includes('cat')) cat(t);
  legs(tap);

  // Arme hinter Körper bzw. Kopf
  if (mode === 'type') {
    const far = noise(t * 3 + 1) > 0.5 ? 1 : 0;
    R(30, 21, 8, 2, skinD);
    R(38, 21 + far, 3, 2, skinD);
  } else if (mode === 'stretch') {
    R(24, 2, 2, 14, skinD);
    R(27, 1, 2, 15, skin);
  } else if (mode === 'panic') {
    R(22, 6, 2, 11, skinD);
    R(27, 6, 2, 11, skin);
  }

  torso(dy, shirt, shirtD, skinD, look.acc);
  head(hx, hy, look, skin, skinD, hairC, eyes, mouth, flip);
  desk();
  monitor(screen, t, up.includes('bigmonitor'));
  deskUpgrades(t, up, night);
  if (mode !== 'coffee') mugOnDesk(t, input.phase === 'idle' && mode !== 'doze');

  // Vorderer Arm
  switch (mode) {
    case 'type': {
      const hd = noise(t * 3) > 0.5 ? 1 : 0;
      R(25, 18 + dy, 3, 4, armC);
      R(27, 21, 9, 2, skin);
      R(36, 21 + hd, 3, 2, skin);
      break;
    }
    case 'coffee': {
      const cyc = lt % 32;
      const sip = cyc >= 20 && cyc < 30;
      const lift = sip ? 0 : 4;
      R(25, 18 + dy, 3, 3, armC);
      R(26, 21, 3, 2, armC);
      R(28, 15 + lift, 2, 8 - lift, skin);
      R(30, 11 + lift, 3, 4, C.mug);
      R(30, 11 + lift, 3, 1, '#6b4226');
      R(28, 12 + lift, 2, 2, skin);
      if (!sip) {
        g.globalAlpha = 0.55;
        for (let k = 0; k < 3; k++) P(31 + ((t + k) >> 2) % 2, 8 + lift - k, C.bubble);
        g.globalAlpha = 1;
      }
      break;
    }
    case 'think':
      R(25, 18 + dy, 3, 3, armC);
      R(26, 21, 3, 2, armC);
      R(28, 16, 2, 6, skin);
      R(28, 15, 3, 2, skin);
      break;
    case 'read':
      R(25, 18 + dy, 3, 4, armC);
      R(27, 21, 4, 2, skin);
      R(30, 12, 7, 9, '#f2efe6');
      R(31, 14, 4, 1, '#9aa2c0');
      R(31, 16, 5, 1, '#9aa2c0');
      R(31, 18, 3, 1, '#9aa2c0');
      R(30, 19, 2, 2, skin);
      break;
    case 'wave': {
      const w = (t >> 1) % 2;
      R(25, 17 + dy, 3, 3, armC);
      R(27, 15, 4, 2, armC);
      R(31 + w, 7, 2, 8, skin);
      R(31 + w, 5, 3, 2, skin);
      break;
    }
    case 'panic':
      R(25, 6, 4, 2, skin);
      break;
    case 'stretch':
      break;
    default: // Hände auf dem Bauch (dösen, umschauen, warten)
      R(25, 18 + dy, 3, 6, armC);
      R(26, 24, 7, 2, skin);
      R(32, 24, 2, 2, skin);
  }

  // Effekte
  if (mode === 'doze') zzz(hx + 9, hy - 1, lt);
  else if (mode === 'think') thoughtBubble(hx, hy, lt);
  else if (mode === 'wave') alertBubble(hx + 13, (t >> 2) % 2, '#fbbf24', '#3b2600');
  else if (mode === 'panic') {
    alertBubble(hx + 13, (t >> 1) % 2, '#f87171', '#ffffff');
    R(hx - 1, hy + 2 + (t % 6 > 2 ? 1 : 0), 1, 2, '#8fd8ff');
  }
}

// ---------------------------------------------------------------- Animations-Schleife
const scenes = new Map(); // canvas -> { get, crop, ctx, off, offCtx, born }
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
let rafId = 0;
let lastTick = -1;

function renderEntry(canvas, e, now) {
  const input = e.get();
  if (!input) return;
  if (e.crop) {
    drawScene(e.offCtx, input, now);
    e.ctx.clearRect(0, 0, canvas.width, canvas.height);
    e.ctx.drawImage(e.off, e.crop.x, e.crop.y, e.crop.w, e.crop.h, 0, 0, e.crop.w, e.crop.h);
  } else {
    drawScene(e.ctx, input, now);
  }
}

function loop() {
  rafId = 0;
  const now = Date.now();
  const tick = Math.floor(now / (reduceMotion?.matches ? 2000 : TICK_MS));
  if (tick !== lastTick) {
    lastTick = tick;
    for (const [canvas, e] of scenes) {
      if (!canvas.isConnected) {
        if (now - e.born > 3000) scenes.delete(canvas);
        continue;
      }
      renderEntry(canvas, e, now);
    }
  }
  if (scenes.size) rafId = requestAnimationFrame(loop);
}

/**
 * Meldet ein Canvas für die Animation an. `get` liefert pro Bild
 * { id, look, color, phase, mode? } oder null. Mit `crop` wird nur ein Ausschnitt gezeigt (Porträt).
 */
export function registerScene(canvas, get, { crop } = {}) {
  const e = { get, crop, ctx: canvas.getContext('2d'), born: Date.now() };
  if (crop) {
    canvas.width = crop.w;
    canvas.height = crop.h;
    e.off = document.createElement('canvas');
    e.off.width = W;
    e.off.height = H;
    e.offCtx = e.off.getContext('2d');
  } else {
    canvas.width = W;
    canvas.height = H;
  }
  scenes.set(canvas, e);
  renderEntry(canvas, e, Date.now());
  if (!rafId) rafId = requestAnimationFrame(loop);
}

export const PORTRAIT = { x: 16, y: 2, w: 24, h: 24 };

// Ganzzahlige Skalierung, damit jeder Pixel gleich groß bleibt.
const resizer = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => {
    for (const en of entries) {
      const canvas = en.target.querySelector('canvas');
      if (!canvas) continue;
      const s = Math.max(1, Math.floor(en.contentRect.width / canvas.width));
      canvas.style.width = `${canvas.width * s}px`;
      canvas.style.height = `${canvas.height * s}px`;
    }
  })
  : null;

export function autoScale(wrap) {
  resizer?.observe(wrap);
}

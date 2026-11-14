// ============================================================================
// TŁA 360° (panoramy równoprostokątne 2:1) — wspólne dla gogli i PC
// Wbudowane tła są RYSOWANE przez program (bez pobierania), dwa zdjęcia leżą w repozytorium (tla/),
// lista gotowych panoram z internetu (Poly Haven, licencja CC0) jest pobierana dopiero po wyborze.
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const TLA = [
  { id: 'szary',   nazwa: 'Bez tła',        typ: 'kolor' },
  { id: 'gory',    nazwa: 'Szczyt góry',    typ: 'gen' },
  { id: 'kosmos',  nazwa: 'Kosmos',         typ: 'gen' },
  { id: 'niebo',   nazwa: 'Niebo',          typ: 'gen' },
  { id: 'zachod',  nazwa: 'Zachód słońca',  typ: 'gen' },
  { id: 'studio',  nazwa: 'Studio',         typ: 'gen' },
  { id: 'laka',    nazwa: 'Łąka o świcie',  typ: 'plik', plik: 'laka_wschod.jpg' },
  { id: 'planeta', nazwa: 'Planeta',        typ: 'plik', plik: 'kosmos_planeta.jpg' },
];

// Poly Haven (polyhaven.com, CC0): nazwa pliku → opis. Pobierane przez gogle z internetu.
export const TLA_NET = [
  { id: 'kloofendal_48d_partly_cloudy_puresky', nazwa: 'Niebo z chmurami' },
  { id: 'venice_sunset',                        nazwa: 'Wenecja o zachodzie' },
  { id: 'san_giuseppe_bridge',                  nazwa: 'Most nad rzeką' },
  { id: 'quarry_01',                            nazwa: 'Kamieniołom' },
  { id: 'royal_esplanade',                      nazwa: 'Bulwar' },
  { id: 'blouberg_sunrise_2',                   nazwa: 'Plaża o świcie' },
  { id: 'pedestrian_overpass',                  nazwa: 'Miasto' },
  { id: 'moonless_golf',                        nazwa: 'Noc pod gwiazdami' },
  { id: 'spruit_sunrise',                       nazwa: 'Łąka (wersja HDR)' },
];
export const POLYHAVEN_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/';

export const urlPliku = (t) => new URL('./tla/' + t.plik, import.meta.url).href;
export const urlNet = (id, rozdz = '2k') => `${POLYHAVEN_URL}${rozdz}/${id}_${rozdz}.hdr`;

// ---------------------------------------------------------------------------
// RYSOWANIE (W = szerokość płótna; wysokość = W / 2; środek wysokości = horyzont)
// ---------------------------------------------------------------------------
export function generujTlo(id, W = 4096) {
  const H = Math.round(W / 2);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const R = losowe(RYSUNKI_ZIARNO[id] || 1);
  const k = W / 4096;                           // skala szczegółów (miniatury = te same tła)
  (RYSUNKI[id] || RYSUNKI.studio)(ctx, W, H, R, k);
  return c;
}

const RYSUNKI_ZIARNO = { gory: 7, kosmos: 11, niebo: 5, zachod: 3, studio: 1 };

function losowe(ziarno) {                       // powtarzalne liczby losowe (mulberry32)
  let a = ziarno >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function pionowo(ctx, W, y0, y1, stopy) {       // pasek z pionowym gradientem
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stopy.forEach(([t, kol]) => g.addColorStop(t, kol));
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, y1 - y0);
}

// Miękka plama (chmura, mgławica, poświata) — także po drugiej stronie szwu panoramy
function plama(ctx, W, x, y, rx, ry, kolor, alfa) {
  for (const dx of [0, -W, W]) {
    const cx = x + dx;
    if (cx + rx < 0 || cx - rx > W) continue;
    ctx.save();
    ctx.translate(cx, y); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(kolor, alfa)); g.addColorStop(0.55, rgba(kolor, alfa * 0.45)); g.addColorStop(1, rgba(kolor, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Grzbiet gór: suma sinusów o całkowitych częstotliwościach → panorama bez szwu
function grzbiet(R, skladniki) {
  const t = skladniki.map(([czest, amp]) => ({ k: czest, a: amp * (0.6 + 0.8 * R()), f: R() * Math.PI * 2 }));
  return (u) => t.reduce((s, x) => s + x.a * Math.sin(x.k * u * Math.PI * 2 + x.f), 0);
}

function warstwaGor(ctx, W, H, y0, amp, R, skladniki, stopy, ostre = 0) {
  const h = grzbiet(R, skladniki);
  const krok = Math.max(2, Math.round(W / 1024));
  let min = H;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += krok) {
    const u = x / W;
    let v = h(u);
    if (ostre) v += ostre * Math.abs(Math.sin(u * Math.PI * 2 * 23 + 1.3)) * Math.abs(Math.sin(u * Math.PI * 2 * 7));   // poszarpane szczyty
    const y = y0 - v * amp;
    min = Math.min(min, y);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H); ctx.closePath();
  const g = ctx.createLinearGradient(0, min, 0, Math.min(H, y0 + amp * 1.5));
  stopy.forEach(([t, kol]) => g.addColorStop(t, kol));
  ctx.fillStyle = g;
  ctx.fill();
}

// Gwiazda: na biegunach panoramy rozciągnięta w poziomie, żeby w goglach była okrągła
function gwiazda(ctx, W, H, x, y, r, kolor, alfa) {
  const szer = Math.max(0.08, Math.cos((0.5 - y / H) * Math.PI));
  ctx.fillStyle = rgba(kolor, alfa);
  ctx.beginPath(); ctx.ellipse(x, y, r / szer, r, 0, 0, Math.PI * 2); ctx.fill();
}

const RYSUNKI = {
  // Stoisz na szczycie: niebo, słońce, morze chmur i pasma gór w dole
  gory(ctx, W, H, R, k) {
    pionowo(ctx, W, 0, H / 2, [[0, '#0d2b5e'], [0.35, '#2a63ad'], [0.8, '#8dbbe4'], [1, '#e3f0fb']]);
    pionowo(ctx, W, H / 2, H, [[0, '#d7e6f3'], [0.3, '#a9c0d6'], [1, '#6e7f8e']]);
    const sx = W * 0.32, sy = H * 0.34;
    plama(ctx, W, sx, sy, H * 0.22, H * 0.22, '#fff6d8', 0.55);
    plama(ctx, W, sx, sy, H * 0.05, H * 0.05, '#ffffff', 1);
    for (let i = 0; i < 26; i++) {               // smugi wysokich chmur
      const y = H * (0.12 + 0.3 * R()), rx = H * (0.08 + 0.18 * R());
      plama(ctx, W, R() * W, y, rx, rx * (0.08 + 0.1 * R()), '#ffffff', 0.18 + 0.2 * R());
    }
    warstwaGor(ctx, W, H, H * 0.515, H * 0.03, R, [[3, 1], [7, 0.6], [13, 0.35], [29, 0.15]],
               [[0, '#f4f8fc'], [0.25, '#c9d8e7'], [1, '#9cb1c7']], 0.6);
    warstwaGor(ctx, W, H, H * 0.54, H * 0.032, R, [[2, 1], [5, 0.7], [11, 0.4], [23, 0.2]],
               [[0, '#eef3f8'], [0.2, '#b3c5d8'], [1, '#7890a8']], 0.8);
    for (let i = 0; i < 160; i++) {              // morze chmur w dolinach
      const rx = H * (0.03 + 0.07 * R());
      plama(ctx, W, R() * W, H * (0.575 + 0.05 * R()), rx, rx * 0.35, '#ffffff', 0.35 + 0.35 * R());
    }
    warstwaGor(ctx, W, H, H * 0.6, H * 0.045, R, [[2, 1], [4, 0.8], [9, 0.45], [19, 0.25]],
               [[0, '#e6edf4'], [0.15, '#9fb2c4'], [0.6, '#5f7387'], [1, '#43505d']], 1);
    for (let i = 0; i < 90; i++) {
      const rx = H * (0.02 + 0.05 * R());
      plama(ctx, W, R() * W, H * (0.64 + 0.04 * R()), rx, rx * 0.3, '#f4f7fb', 0.3 + 0.3 * R());
    }
    // skała pod stopami (szczyt) z płatami śniegu
    warstwaGor(ctx, W, H, H * 0.72, H * 0.035, R, [[1, 1], [3, 0.7], [8, 0.4], [21, 0.2]],
               [[0, '#7d7770'], [0.3, '#5d5852'], [1, '#2b2826']], 0.5);
    for (let i = 0; i < 900; i++) {              // faktura skały: jaśniejsze i ciemniejsze smugi
      const y = H * (0.74 + 0.26 * R()), d = 0.3 + (y / H - 0.74) * 3;
      plama(ctx, W, R() * W, y, H * 0.012 * d * (1 + 2 * R()), H * 0.002 * d * (1 + R()), R() < 0.5 ? '#8a847c' : '#1d1b1a', 0.18);
    }
    for (let i = 0; i < 25; i++) {               // płaty śniegu w zagłębieniach
      const y = H * (0.77 + 0.18 * R()), d = 0.5 + (y / H - 0.74) * 3;
      plama(ctx, W, R() * W, y, H * 0.03 * d * (1 + R()), H * 0.004 * d, '#e9eef3', 0.45);
    }
  },

  // Gwiazdy, Droga Mleczna, mgławice i planeta
  kosmos(ctx, W, H, R, k) {
    pionowo(ctx, W, 0, H, [[0, '#04050d'], [0.5, '#070a18'], [1, '#03040a']]);
    const pas = (u) => H / 2 - Math.atan(Math.tan(0.55) * Math.sin(u * Math.PI * 2)) * H / Math.PI;   // pas galaktyki
    const mgl = ['#5b3a8c', '#2f4f9a', '#8c3a6e', '#3a7a8c'];
    for (let i = 0; i < 240; i++) {
      const u = R(), rx = H * (0.02 + 0.08 * R());
      plama(ctx, W, u * W, pas(u) + (R() - 0.5) * H * 0.12, rx, rx * (0.4 + 0.5 * R()), mgl[i % 4], 0.08 + 0.1 * R());
    }
    for (let i = 0; i < 120; i++) {
      const u = R(), rx = H * (0.01 + 0.03 * R());
      plama(ctx, W, u * W, pas(u) + (R() - 0.5) * H * 0.05, rx, rx * 0.5, '#e8e0ff', 0.08 + 0.1 * R());
    }
    const N = Math.round(W * H / 1300);
    for (let i = 0; i < N; i++) {                // gwiazdy rozsiane
      const r = (0.35 + R() * R() * 1.6) * k, kol = R() < 0.15 ? '#cfe0ff' : R() < 0.1 ? '#ffe2c4' : '#ffffff';
      gwiazda(ctx, W, H, R() * W, Math.acos(1 - 2 * R()) / Math.PI * H, r, kol, 0.35 + 0.65 * R());
    }
    for (let i = 0; i < N * 0.7; i++) {          // zagęszczenie w pasie galaktyki
      const u = R();
      gwiazda(ctx, W, H, u * W, pas(u) + (R() + R() + R() - 1.5) * H * 0.05, (0.3 + R() * 0.8) * k, '#ffffff', 0.25 + 0.5 * R());
    }
    for (let i = 0; i < 40; i++) {               // jasne gwiazdy z poświatą
      const x = R() * W, y = H * (0.1 + 0.8 * R());
      plama(ctx, W, x, y, 9 * k, 9 * k, '#cfe0ff', 0.6);
      gwiazda(ctx, W, H, x, y, 1.8 * k, '#ffffff', 1);
    }
    // planeta w dole po prawej (atmosfera + oświetlona strona)
    const px = W * 0.68, py = H * 0.7, pr = H * 0.15;
    plama(ctx, W, px, py, pr * 1.25, pr * 1.25, '#4fa3ff', 0.35);
    const g = ctx.createRadialGradient(px - pr * 0.45, py - pr * 0.45, pr * 0.1, px, py, pr);
    g.addColorStop(0, '#9ed0ff'); g.addColorStop(0.45, '#3b78b8'); g.addColorStop(0.85, '#132c4d'); g.addColorStop(1, '#070f1c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 14; i++) plama(ctx, W, px + (R() - 0.5) * pr * 1.6, py + (R() - 0.5) * pr * 1.6, pr * (0.2 + 0.4 * R()), pr * 0.05, '#e9f4ff', 0.25);
    ctx.restore();
    // słońce daleko
    plama(ctx, W, W * 0.15, H * 0.32, H * 0.1, H * 0.1, '#fff1cc', 0.35);
    plama(ctx, W, W * 0.15, H * 0.32, H * 0.012, H * 0.012, '#ffffff', 1);
  },

  // Pogodny dzień: niebo z chmurami, łagodne wzgórza, łąka
  niebo(ctx, W, H, R, k) {
    pionowo(ctx, W, 0, H / 2, [[0, '#1f57a8'], [0.5, '#4f8fd6'], [0.9, '#bcdcf5'], [1, '#e2f0fb']]);
    plama(ctx, W, W * 0.7, H * 0.22, H * 0.2, H * 0.2, '#fffbe6', 0.45);
    plama(ctx, W, W * 0.7, H * 0.22, H * 0.035, H * 0.035, '#ffffff', 1);
    for (let i = 0; i < 34; i++) {               // chmury kłębiaste: skupiska plam
      const cx = R() * W, cy = H * (0.18 + 0.27 * R()), s = H * (0.025 + 0.04 * R()) * (0.6 + (cy / H) * 0.9);
      for (let j = 0; j < 14; j++) plama(ctx, W, cx + (R() - 0.5) * s * 5, cy - R() * s * 1.2, s * (0.7 + R()), s * (0.6 + 0.5 * R()), j < 4 ? '#dfe7ef' : '#ffffff', 0.55 + 0.4 * R());
    }
    pionowo(ctx, W, H / 2, H, [[0, '#cfe1d0'], [0.04, '#9db88e'], [0.3, '#6e9a55'], [1, '#3f6630']]);
    warstwaGor(ctx, W, H, H * 0.505, H * 0.025, R, [[2, 1], [5, 0.6], [9, 0.3]], [[0, '#a7c1b3'], [1, '#8fae92']]);
    warstwaGor(ctx, W, H, H * 0.52, H * 0.02, R, [[3, 1], [7, 0.5], [13, 0.25]], [[0, '#86a978'], [1, '#6c9558']]);
    for (let i = 0; i < 2500; i++) {             // trawa: drobne kreski w dole
      const y = H * (0.56 + 0.44 * R());
      ctx.fillStyle = rgba(R() < 0.5 ? '#5d8a45' : '#86b062', 0.35);
      ctx.fillRect(R() * W, y, 2 * k, (2 + 6 * (y / H - 0.5)) * k);
    }
  },

  // Zachód nad wodą
  zachod(ctx, W, H, R, k) {
    pionowo(ctx, W, 0, H / 2, [[0, '#14143a'], [0.35, '#4a2f6b'], [0.7, '#c4566a'], [0.9, '#f08a4b'], [1, '#ffd27a']]);
    const sx = W * 0.5;
    plama(ctx, W, sx, H * 0.5, H * 0.3, H * 0.16, '#ffb347', 0.55);
    for (let i = 0; i < 24; i++) {
      const rx = H * (0.06 + 0.16 * R());
      plama(ctx, W, R() * W, H * (0.3 + 0.17 * R()), rx, rx * 0.07, R() < 0.5 ? '#ff9a6b' : '#8a3f6e', 0.35 + 0.3 * R());
    }
    ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.arc(sx, H * 0.5, H * 0.035, Math.PI, 0); ctx.fill();
    pionowo(ctx, W, H / 2, H, [[0, '#e48a59'], [0.08, '#8a4565'], [0.4, '#2c2347'], [1, '#100f22']]);
    for (let i = 0; i < 260; i++) {              // odbicie słońca w wodzie
      const y = H * (0.505 + 0.3 * R() * R()), szer = H * 0.06 * (1 - (y / H - 0.5) * 1.5) * (0.4 + R());
      ctx.fillStyle = rgba('#ffd28a', 0.12 + 0.25 * R());
      ctx.fillRect(sx - szer / 2 + (R() - 0.5) * H * 0.04, y, szer, 2 * k);
    }
    warstwaGor(ctx, W, H, H * 0.505, H * 0.03, R, [[2, 1], [5, 0.5], [11, 0.25]], [[0, '#3a2346'], [1, '#2a1a36']]);
    // woda przykrywa podstawę wzgórz
    pionowo(ctx, W, H * 0.52, H, [[0, 'rgba(60,35,80,0.9)'], [0.3, 'rgba(32,25,60,1)'], [1, '#100f22']]);
    for (let i = 0; i < 260; i++) {
      const y = H * (0.52 + 0.3 * R() * R()), szer = H * 0.05 * (0.4 + R());
      ctx.fillStyle = rgba('#ffc27a', 0.1 + 0.2 * R());
      ctx.fillRect(sx - szer / 2 + (R() - 0.5) * H * 0.03, y, szer, 2 * k);
    }
  },

  // Neutralne studio fotograficzne: jasne softboxy u góry, gładka podłoga
  studio(ctx, W, H, R, k) {
    pionowo(ctx, W, 0, H, [[0, '#2a2c30'], [0.3, '#4a4d52'], [0.49, '#7b7f85'], [0.5, '#8e9196'], [0.7, '#6d7075'], [1, '#3b3d41']]);
    for (const [u, w] of [[0.12, 0.08], [0.45, 0.12], [0.78, 0.08]]) {
      plama(ctx, W, u * W, H * 0.22, W * w, H * 0.07, '#ffffff', 0.25);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const dx of [0, -W, W]) ctx.fillRect(u * W - W * w * 0.45 + dx, H * 0.2, W * w * 0.9, H * 0.04);
    }
  },
};

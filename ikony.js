// ============================================================================
// IKONY PANELI (rysowane na płótnie — bez plików graficznych, wyglądają tak samo na PC i w goglach)
// rysujIkone(ctx, nazwa, cx, cy, rozmiar, kolor): środek (cx, cy), rozmiar = bok kwadratu ikony w px
// Używane przez panel viewera (index.html) i panel Szkicownika (szkicownik/panel.js).
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const IKONY = {
  GRUBOSC: 0.085,                 // grubość kreski jako ułamek rozmiaru ikony
};

export function rysujIkone(ctx, nazwa, cx, cy, s, kolor) {
  const f = RYSUNKI[nazwa];
  if (!f) return false;
  ctx.save();
  ctx.translate(cx - s / 2, cy - s / 2);
  ctx.scale(s / 100, s / 100);                 // ikony rysowane w kwadracie 100 × 100
  ctx.strokeStyle = kolor; ctx.fillStyle = kolor;
  ctx.lineWidth = IKONY.GRUBOSC * 100;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  f(ctx);
  ctx.restore();
  return true;
}

export const maIkone = (nazwa) => !!RYSUNKI[nazwa];

// Tło panelu (wspólne): ciemne szkło z delikatną siatką, świecącą linią u góry i narożnikami — wygląd przyrządu
export function tloPanelu(ctx, W, H) {
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(20,28,38,0.97)'); g.addColorStop(0.5, 'rgba(14,19,26,0.97)'); g.addColorStop(1, 'rgba(10,13,18,0.98)');
  ctx.fillStyle = g; rr(4, 4, W - 8, H - 8, 30); ctx.fill();
  ctx.save(); rr(4, 4, W - 8, H - 8, 30); ctx.clip();
  ctx.strokeStyle = 'rgba(47,208,255,0.06)'; ctx.lineWidth = 1;
  for (let x = 24; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 24; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const gl = ctx.createLinearGradient(0, 0, W, 0);
  gl.addColorStop(0, 'rgba(47,208,255,0)'); gl.addColorStop(0.5, 'rgba(47,208,255,0.9)'); gl.addColorStop(1, 'rgba(47,208,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(40, 6, W - 80, 3);
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(47,208,255,0.35)'; rr(4, 4, W - 8, H - 8, 30); ctx.stroke();
  ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 6;
  const d = 46;
  for (const [x, y, sx, sy] of [[10, 10, 1, 1], [W - 10, 10, -1, 1], [10, H - 10, 1, -1], [W - 10, H - 10, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * d); ctx.lineTo(x, y); ctx.lineTo(x + sx * d, y); ctx.stroke();
  }
}

// Wypełnienie przycisku: lekki gradient (wypukłość) + poświata przy najechaniu / aktywnym
export function tloPrzycisku(ctx, b, { aktywny, nad, zakladka, wylaczony }) {
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  if (aktywny) { g.addColorStop(0, '#ffa54a'); g.addColorStop(1, '#e8730f'); }
  else if (nad) { g.addColorStop(0, '#3a4654'); g.addColorStop(1, '#283039'); }
  else if (zakladka) { g.addColorStop(0, '#1d242c'); g.addColorStop(1, '#181d23'); }
  else { g.addColorStop(0, wylaczony ? '#22272e' : '#2e3742'); g.addColorStop(1, wylaczony ? '#1c2026' : '#222930'); }
  ctx.save();
  if (nad || aktywny) { ctx.shadowColor = aktywny ? 'rgba(255,138,31,0.8)' : 'rgba(47,208,255,0.9)'; ctx.shadowBlur = 18; }
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 18); ctx.fill();
  ctx.restore();
  ctx.lineWidth = nad ? 5 : 2;
  ctx.strokeStyle = nad ? '#2fd0ff' : (aktywny ? '#ffc285' : 'rgba(120,140,160,0.35)');
  ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 18); ctx.stroke();
  if (!aktywny && !wylaczony) {                  // blik u góry
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x + 14, b.y + 3); ctx.lineTo(b.x + b.w - 14, b.y + 3); ctx.stroke();
  }
}

const linia = (c, ...p) => { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.stroke(); };
const zamk = (c, ...p) => { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); };
const kolo = (c, x, y, r, pelne = false) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); pelne ? c.fill() : c.stroke(); };
const prost = (c, x, y, w, h, r = 6) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.stroke(); };
const szescian = (c, x, y, a) => {            // rzut izometryczny sześcianu
  const d = a * 0.45;
  zamk(c, x, y + d, x + a, y + d, x + a, y + a + d, x, y + a + d); c.stroke();
  linia(c, x, y + d, x + d, y, x + a + d, y, x + a, y + d);
  linia(c, x + a + d, y, x + a + d, y + a, x + a, y + a + d);
};
const strzalka = (c, x1, y1, x2, y2, g = 16) => {
  linia(c, x1, y1, x2, y2);
  const k = Math.atan2(y2 - y1, x2 - x1);
  linia(c, x2 - g * Math.cos(k - 0.6), y2 - g * Math.sin(k - 0.6), x2, y2, x2 - g * Math.cos(k + 0.6), y2 - g * Math.sin(k + 0.6));
};

const RYSUNKI = {
  // narzędzia podglądu
  wskaz: (c) => { zamk(c, 30, 14, 30, 78, 46, 63, 57, 88, 68, 83, 57, 58, 78, 58); c.stroke(); },
  rysuj: (c) => { zamk(c, 22, 78, 28, 60, 70, 18, 82, 30, 40, 72); c.stroke(); linia(c, 62, 26, 74, 38); linia(c, 18, 86, 30, 84); },
  gumka: (c) => { zamk(c, 20, 62, 54, 28, 82, 56, 48, 90, 34, 90); c.stroke(); linia(c, 36, 46, 64, 74); linia(c, 48, 90, 86, 90); },
  miarka: (c) => { zamk(c, 12, 62, 62, 12, 88, 38, 38, 88); c.stroke(); for (const t of [0.25, 0.42, 0.59, 0.76]) { const x = 12 + 50 * t, y = 62 - 50 * t; linia(c, x, y, x + 9, y + 9); } },
  kolor: (c) => { c.beginPath(); c.moveTo(50, 12); c.bezierCurveTo(30, 40, 22, 52, 22, 64); c.arc(50, 64, 28, Math.PI, 0, true); c.bezierCurveTo(78, 52, 70, 40, 50, 12); c.stroke(); },
  komentarz: (c) => { c.beginPath(); c.roundRect(14, 16, 72, 52, 12); c.stroke(); linia(c, 32, 68, 26, 88, 50, 68); linia(c, 30, 36, 70, 36); linia(c, 30, 50, 58, 50); },
  przekroj: (c) => { szescian(c, 16, 24, 48); c.save(); c.setLineDash([8, 7]); linia(c, 8, 52, 90, 34); c.restore(); },
  cofnij: (c) => { c.beginPath(); c.arc(54, 56, 28, Math.PI * 1.15, Math.PI * 0.55, false); c.stroke(); strzalka(c, 34, 22, 24, 40, 18); },
  zrzut: (c) => { c.beginPath(); c.roundRect(12, 30, 76, 54, 10); c.stroke(); linia(c, 34, 30, 40, 18, 60, 18, 66, 30); kolo(c, 50, 57, 15); },
  // chwytanie
  model: (c) => { szescian(c, 18, 22, 52); },
  czesc: (c) => { c.beginPath(); c.roundRect(30, 38, 40, 40, 6); c.stroke(); linia(c, 50, 12, 50, 30); strzalka(c, 50, 30, 50, 34, 10); },
  grupa: (c) => { c.save(); c.setLineDash([9, 7]); kolo(c, 50, 50, 36); c.restore(); kolo(c, 38, 44, 9, true); kolo(c, 62, 44, 9, true); kolo(c, 50, 64, 9, true); },
  // zakładki
  narzedzia: (c) => { linia(c, 28, 72, 58, 42); kolo(c, 66, 34, 16); linia(c, 20, 80, 28, 72); },
  drzewo: (c) => { linia(c, 22, 20, 22, 80); linia(c, 22, 36, 40, 36); linia(c, 22, 62, 40, 62); prost(c, 44, 26, 38, 20, 5); prost(c, 44, 52, 38, 20, 5); kolo(c, 22, 20, 6, true); },
  menu: (c) => { linia(c, 18, 28, 82, 28); linia(c, 18, 50, 82, 50); linia(c, 18, 72, 82, 72); },
  plik: (c) => { zamk(c, 12, 26, 40, 26, 48, 34, 88, 34, 88, 80, 12, 80); c.stroke(); },
  zapisz: (c) => { zamk(c, 16, 14, 72, 14, 86, 28, 86, 86, 16, 86); c.stroke(); prost(c, 30, 14, 34, 22, 3); prost(c, 28, 52, 44, 34, 4); },
  chmura: (c) => { c.beginPath(); c.moveTo(28, 74); c.arc(28, 58, 16, Math.PI / 2, Math.PI * 1.5); c.arc(50, 40, 20, Math.PI, 0); c.arc(72, 58, 16, Math.PI * 1.5, Math.PI / 2); c.closePath(); c.stroke(); },
  pobierz: (c) => { strzalka(c, 50, 14, 50, 66, 20); linia(c, 16, 70, 16, 86, 84, 86, 84, 70); },
  gogle: (c) => { c.beginPath(); c.roundRect(12, 32, 76, 40, 16); c.stroke(); kolo(c, 34, 52, 10); kolo(c, 66, 52, 10); },
  wyjdz: (c) => { linia(c, 46, 16, 16, 16, 16, 84, 46, 84); strzalka(c, 40, 50, 86, 50, 18); },
  oko: (c) => { c.beginPath(); c.moveTo(10, 50); c.quadraticCurveTo(50, 12, 90, 50); c.quadraticCurveTo(50, 88, 10, 50); c.stroke(); kolo(c, 50, 50, 12, true); },
  ukryj: (c) => { RYSUNKI.oko(c); linia(c, 18, 84, 82, 16); },
  ghost: (c) => { kolo(c, 50, 50, 34); c.beginPath(); c.arc(50, 50, 34, Math.PI / 2, Math.PI * 1.5); c.closePath(); c.fill(); },
  tylko: (c) => { c.save(); c.globalAlpha = 0.35; prost(c, 10, 36, 24, 24); prost(c, 66, 36, 24, 24); c.restore(); c.beginPath(); c.roundRect(36, 30, 28, 36, 5); c.fill(); },
  wszystko: (c) => { prost(c, 10, 36, 24, 24); prost(c, 38, 36, 24, 24); prost(c, 66, 36, 24, 24); },
  reset: (c) => { c.beginPath(); c.arc(50, 52, 30, Math.PI * 1.7, Math.PI * 1.25, false); c.stroke(); strzalka(c, 70, 18, 74, 30, 16); },
  skala: (c) => { strzalka(c, 30, 70, 16, 84, 14); strzalka(c, 70, 30, 84, 16, 14); prost(c, 32, 32, 36, 36, 4); },
  // szkicownik
  wybierz: (c) => { RYSUNKI.wskaz(c); },
  prostopadloscian: (c) => { szescian(c, 16, 24, 50); },
  walec: (c) => { c.beginPath(); c.ellipse(50, 26, 28, 10, 0, 0, Math.PI * 2); c.stroke(); linia(c, 22, 26, 22, 74); linia(c, 78, 26, 78, 74); c.beginPath(); c.ellipse(50, 74, 28, 10, 0, 0, Math.PI); c.stroke(); },
  kula: (c) => { kolo(c, 50, 50, 34); c.beginPath(); c.ellipse(50, 50, 34, 12, 0, 0, Math.PI); c.stroke(); },
  kopiuj: (c) => { prost(c, 30, 30, 50, 52, 6); linia(c, 20, 66, 20, 18, 64, 18); },
  usun: (c) => { linia(c, 18, 26, 82, 26); linia(c, 40, 26, 40, 16, 60, 16, 60, 26); zamk(c, 26, 26, 32, 86, 68, 86, 74, 26); c.stroke(); linia(c, 44, 40, 44, 74); linia(c, 56, 40, 56, 74); },
  grupuj: (c) => { linia(c, 26, 16, 14, 16, 14, 84, 26, 84); linia(c, 74, 16, 86, 16, 86, 84, 74, 84); prost(c, 28, 30, 18, 18, 3); prost(c, 54, 52, 18, 18, 3); },
  rozgrupuj: (c) => { c.save(); c.setLineDash([6, 8]); linia(c, 26, 16, 14, 16, 14, 84, 26, 84); linia(c, 74, 16, 86, 16, 86, 84, 74, 84); c.restore(); prost(c, 22, 30, 18, 18, 3); prost(c, 60, 52, 18, 18, 3); },
  wiele: (c) => { prost(c, 12, 14, 30, 30, 5); prost(c, 58, 14, 30, 30, 5); prost(c, 12, 56, 30, 30, 5); linia(c, 64, 70, 72, 78, 88, 58); },
  przejmij: (c) => { szescian(c, 10, 34, 34); strzalka(c, 56, 52, 86, 52, 14); },
  // szkic
  szkic: (c) => { zamk(c, 14, 70, 40, 24, 86, 34, 72, 80); c.stroke(); kolo(c, 14, 70, 6, true); kolo(c, 40, 24, 6, true); kolo(c, 86, 34, 6, true); kolo(c, 72, 80, 6, true); },
  plXY: (c) => { prost(c, 18, 18, 64, 64, 4); linia(c, 18, 82, 50, 82); linia(c, 18, 82, 18, 50); },
  plXZ: (c) => { zamk(c, 10, 66, 34, 34, 90, 34, 66, 66); c.stroke(); },
  plYZ: (c) => { zamk(c, 34, 10, 66, 30, 66, 90, 34, 70); c.stroke(); },
  linia: (c) => { linia(c, 16, 80, 84, 20); kolo(c, 16, 80, 8, true); kolo(c, 84, 20, 8, true); },
  hologram: (c) => { c.beginPath(); c.ellipse(50, 84, 30, 8, 0, 0, Math.PI * 2); c.stroke(); linia(c, 22, 82, 34, 40); linia(c, 78, 82, 66, 40);
                     c.save(); c.setLineDash([6, 6]); c.beginPath(); c.moveTo(34, 40); c.lineTo(50, 16); c.lineTo(66, 40); c.closePath(); c.stroke(); c.restore();
                     linia(c, 34, 40, 66, 40); },
  plWlasna: (c) => { zamk(c, 10, 70, 38, 46, 90, 46, 62, 70); c.stroke(); strzalka(c, 50, 58, 50, 14, 14); kolo(c, 50, 58, 5, true); },
  belka: (c) => { c.beginPath(); c.rect(12, 62, 24, 24); c.stroke(); linia(c, 12, 62, 64, 14, 88, 14, 36, 62); linia(c, 36, 86, 88, 38, 88, 14); },
  prostokat: (c) => { c.beginPath(); c.roundRect(22, 30, 56, 40, 3); c.stroke(); linia(c, 22, 84, 78, 84); linia(c, 90, 30, 90, 70); },
  okrag: (c) => { kolo(c, 50, 50, 30); linia(c, 50, 50, 72, 30); },
  lukStyczny: (c) => { linia(c, 10, 76, 46, 76); c.beginPath(); c.arc(46, 46, 30, Math.PI * 0.5, -Math.PI * 0.5, true); c.stroke(); kolo(c, 10, 76, 7, true); kolo(c, 46, 16, 7, true); },
  zaokraglij: (c) => { linia(c, 18, 86, 18, 48); c.beginPath(); c.arc(52, 48, 34, Math.PI, Math.PI * 1.5); c.stroke(); linia(c, 52, 14, 88, 14); c.save(); c.setLineDash([5, 6]); c.lineWidth = 4; linia(c, 18, 14, 52, 14); linia(c, 18, 14, 18, 48); c.restore(); },
  powierzchnia: (c) => { c.beginPath(); c.moveTo(12, 40); c.bezierCurveTo(32, 22, 52, 52, 72, 30); c.lineTo(88, 62); c.bezierCurveTo(68, 84, 48, 54, 28, 74); c.closePath(); c.stroke(); linia(c, 42, 38, 56, 70); },
  wstazka: (c) => { c.beginPath(); c.moveTo(14, 30); c.bezierCurveTo(40, 10, 60, 50, 86, 26); c.stroke(); c.beginPath(); c.moveTo(14, 74); c.bezierCurveTo(40, 54, 60, 94, 86, 70); c.stroke(); for (const x of [26, 50, 74]) linia(c, x, 30 + (x === 50 ? 2 : -6), x, 74 + (x === 50 ? 2 : -6)); },
  krzywe: (c) => { c.beginPath(); c.moveTo(12, 34); c.bezierCurveTo(36, 10, 60, 56, 88, 28); c.stroke(); c.beginPath(); c.moveTo(12, 78); c.bezierCurveTo(36, 54, 60, 100, 88, 72); c.stroke(); kolo(c, 12, 34, 6, true); kolo(c, 88, 72, 6, true); },
  tnij: (c) => { kolo(c, 28, 74, 12); kolo(c, 72, 74, 12); linia(c, 36, 64, 76, 12); linia(c, 64, 64, 24, 12); },
  pogrub: (c) => { c.beginPath(); c.moveTo(12, 40); c.bezierCurveTo(36, 24, 60, 52, 88, 34); c.stroke(); c.beginPath(); c.moveTo(12, 66); c.bezierCurveTo(36, 50, 60, 78, 88, 60); c.stroke(); linia(c, 12, 40, 12, 66); linia(c, 88, 34, 88, 60); strzalka(c, 50, 26, 50, 6, 12); },
  luk: (c) => { c.beginPath(); c.arc(50, 76, 36, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); kolo(c, 16, 64, 8, true); kolo(c, 84, 64, 8, true); kolo(c, 50, 40, 6, true); },
  wstecz: (c) => { zamk(c, 32, 22, 88, 22, 88, 78, 32, 78, 10, 50); c.stroke(); linia(c, 48, 38, 72, 62); linia(c, 72, 38, 48, 62); },
  anuluj: (c) => { linia(c, 24, 24, 76, 76); linia(c, 76, 24, 24, 76); },
  wyciagnij: (c) => { zamk(c, 10, 74, 34, 58, 90, 58, 66, 74); c.stroke(); strzalka(c, 50, 64, 50, 14, 18); },
  obrot: (c) => { c.beginPath(); c.ellipse(50, 56, 36, 14, 0, Math.PI * 0.15, Math.PI * 1.85); c.stroke(); strzalka(c, 76, 48, 84, 52, 14); c.save(); c.setLineDash([8, 7]); linia(c, 50, 10, 50, 92); c.restore(); },
  numer: (c) => { prost(c, 14, 24, 72, 52, 8); c.font = '700 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('123', 50, 52); },
  plus: (c) => { linia(c, 50, 22, 50, 78); linia(c, 22, 50, 78, 50); },
  minus: (c) => { linia(c, 22, 50, 78, 50); },
  ok: (c) => { linia(c, 18, 52, 40, 74, 84, 26); },
  wroc: (c) => { strzalka(c, 82, 50, 18, 50, 20); },
};
// ikona „szkicownik”: sześcian + ołówek (złożona)
RYSUNKI.szkicownik = (c) => {
  szescian(c, 8, 36, 36);
  c.save(); c.translate(30, -6); c.scale(0.72, 0.72); RYSUNKI.rysuj(c); c.restore();
};

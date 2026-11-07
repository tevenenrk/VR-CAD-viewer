// ============================================================================
// SZKICOWNIK BRYŁ — PANEL 3D (płótno 2D jako tekstura; klikany promieniem kontrolera albo myszą)
// Ten sam wygląd co panel viewera, ale osobny kod — viewer pozostaje nietknięty.
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const PANEL = {
  W: 1024, H: 1240,               // rozdzielczość płótna (px)
  PAD: 28, GAP: 14,               // marginesy i odstępy przycisków (px)
  SZEROKOSC_M: 0.24,              // szerokość panelu w goglach (m)
  POZ_NA_RECE: [0, 0.10, -0.07],  // położenie względem lewego kontrolera (m): [w prawo, w górę, do przodu = minus]
  NACHYLENIE_DEG: -35,            // pochylenie panelu do oczu
  PC_WYSOKOSC_EKRANU: 0.82,       // na PC: panel zajmuje tyle wysokości widoku
  PC_ODLEGLOSC_M: 1.0,            // na PC: odległość panelu przed kamerą
  KOLORY: {
    tlo: 'rgba(24,27,33,0.95)', ramka: '#3a3f47', tekst: '#e8eaed', szary: '#9aa0a6', akcent: '#ff8a1f',
    przycisk: '#2c3139', nad: '#3b424d', zakladka: '#23272e', pozycja: '#22262d', wylaczony: '#6b7079', komunikat: '#ffd27a',
  },
};

// Budowanie układu: rzędy przycisków o proporcjonalnych szerokościach
export class Uklad {
  constructor() { this.B = []; }
  rzad(y, h, items, x0 = PANEL.PAD, x1 = PANEL.W - PANEL.PAD) {
    const total = items.reduce((s, it) => s + (it.flex || 1), 0);
    const avail = x1 - x0 - PANEL.GAP * (items.length - 1);
    let x = x0;
    for (const it of items) {
      const w = avail * (it.flex || 1) / total;
      this.B.push({ kind: 'button', ...it, x, y, w, h });
      x += w + PANEL.GAP;
    }
  }
  etykieta(y, text) { this.B.push({ kind: 'label', x: PANEL.PAD, y, w: PANEL.W - 2 * PANEL.PAD, h: 36, text }); }
  info(y, text, h = 48, align = 'left', color) { this.B.push({ kind: 'info', x: PANEL.PAD, y, w: PANEL.W - 2 * PANEL.PAD, h, text, align, color }); }
  dodaj(item) { this.B.push(item); }
}

function fitFont(ctx, text, maxW, size, weight) {
  let s = size;
  do { ctx.font = `${weight} ${s}px system-ui, sans-serif`; } while (ctx.measureText(text).width > maxW && --s > 14);
}

export class Panel3D {
  constructor(THREE) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PANEL.W; this.canvas.height = PANEL.H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const w = PANEL.SZEROKOSC_M;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * PANEL.H / PANEL.W),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false }));
    this.mesh.name = 'Panel szkicownika';
    this.mesh.renderOrder = 10;
    this.przyciski = [];
    this.sig = '';
  }

  // items: wynik Uklad.B; hover: id pod promieniem; stopka: tekst na dole
  odswiez(items, hover, stopka) {
    this.przyciski = items;
    const sig = hover + '|' + stopka + '|' + JSON.stringify(items.map((b) => [b.id, b.text, b.active, b.disabled, b.checked, b.dim, b.sub, b.color]));
    if (sig === this.sig) return;
    this.sig = sig;
    this.rysuj(hover, stopka);
  }

  rysuj(hover, stopka) {
    const ctx = this.ctx, W = PANEL.W, H = PANEL.H, P = PANEL.PAD, K = PANEL.KOLORY;
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = K.tlo; rr(4, 4, W - 8, H - 8, 36); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = K.ramka; ctx.stroke();
    ctx.textBaseline = 'middle';
    for (const b of this.przyciski) {
      const text = b.text == null ? '' : String(b.text);
      const hov = hover === b.id && !b.disabled && b.id;
      if (b.kind === 'label') {
        ctx.textAlign = 'left'; ctx.fillStyle = K.szary; ctx.font = '500 30px system-ui, sans-serif';
        ctx.fillText(text, b.x + 4, b.y + b.h / 2); continue;
      }
      if (b.kind === 'info') {
        ctx.textAlign = b.align || 'left'; ctx.fillStyle = b.color || K.tekst; fitFont(ctx, text, b.w - 16, 34, 600);
        ctx.fillText(text, b.align === 'center' ? b.x + b.w / 2 : b.x + 4, b.y + b.h / 2); continue;
      }
      if (b.kind === 'wartosc') {                // duże pole z wpisywaną liczbą
        ctx.fillStyle = '#111317'; rr(b.x, b.y, b.w, b.h, 18); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = K.akcent; ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; fitFont(ctx, text + '│', b.w - 60, 84, 700);
        ctx.fillText(text + '│', b.x + b.w - 30, b.y + b.h / 2 + 4);
        if (b.sub) { ctx.textAlign = 'left'; ctx.fillStyle = K.szary; ctx.font = '500 30px system-ui, sans-serif'; ctx.fillText(b.sub, b.x + 24, b.y + b.h / 2); }
        continue;
      }
      if (b.kind === 'swatch') {
        ctx.fillStyle = b.color; rr(b.x, b.y, b.w, b.h, 18); ctx.fill();
        ctx.lineWidth = b.active ? 10 : (hov ? 6 : 2); ctx.strokeStyle = b.active ? '#ffffff' : (hov ? K.akcent : K.ramka); ctx.stroke();
        continue;
      }
      if (b.kind === 'check') {
        ctx.fillStyle = hov ? K.nad : K.przycisk; rr(b.x + 6, b.y + 6, b.w - 12, b.h - 12, 12); ctx.fill();
        ctx.lineWidth = hov ? 6 : 3; ctx.strokeStyle = hov ? '#ffffff' : '#5a606a'; ctx.stroke();
        if (b.checked) {
          ctx.strokeStyle = K.akcent; ctx.lineWidth = 8; ctx.beginPath();
          ctx.moveTo(b.x + 18, b.y + b.h * 0.52); ctx.lineTo(b.x + b.w * 0.43, b.y + b.h - 20); ctx.lineTo(b.x + b.w - 16, b.y + 18); ctx.stroke();
        }
        continue;
      }
      if (b.kind === 'item') {                   // wiersz listy
        ctx.fillStyle = hov ? K.nad : K.pozycja; rr(b.x, b.y, b.w, b.h, 14); ctx.fill();
        ctx.lineWidth = b.active || hov ? 5 : 2; ctx.strokeStyle = b.active ? K.akcent : (hov ? '#ffffff' : '#353a42'); ctx.stroke();
        ctx.textAlign = 'left'; ctx.fillStyle = b.disabled || b.dim ? '#80868e' : (b.active ? '#ffb15c' : K.tekst);
        fitFont(ctx, text, b.w - 36 - (b.sub ? 180 : 0), 34, b.active ? 700 : 500);
        ctx.fillText(text, b.x + 18, b.y + b.h / 2 + 1);
        if (b.sub) { ctx.textAlign = 'right'; ctx.fillStyle = K.szary; ctx.font = '500 26px system-ui, sans-serif'; ctx.fillText(b.sub, b.x + b.w - 16, b.y + b.h / 2 + 1); }
        continue;
      }
      ctx.fillStyle = b.active ? K.akcent : (hov ? K.nad : (b.tab ? K.zakladka : K.przycisk));
      rr(b.x, b.y, b.w, b.h, 20); ctx.fill();
      ctx.lineWidth = hov ? 6 : 3; ctx.strokeStyle = hov ? '#ffffff' : K.ramka; ctx.stroke();
      ctx.fillStyle = b.disabled ? K.wylaczony : (b.active ? '#111111' : K.tekst); ctx.textAlign = 'center';
      if (b.sub) {                               // przycisk z podpisem (np. pole liczbowe: „X” nad „120 mm”)
        ctx.font = '500 24px system-ui, sans-serif'; ctx.fillStyle = b.active ? '#111111' : K.szary;
        ctx.fillText(b.sub, b.x + b.w / 2, b.y + b.h * 0.3);
        ctx.fillStyle = b.disabled ? K.wylaczony : (b.active ? '#111111' : K.tekst);
        fitFont(ctx, text, b.w - 18, 36, 700);
        ctx.fillText(text, b.x + b.w / 2, b.y + b.h * 0.68);
      } else {
        fitFont(ctx, text, b.w - 18, b.tab ? 40 : 36, b.tab ? 700 : 600);
        ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 2);
      }
    }
    ctx.textAlign = 'center'; ctx.fillStyle = K.komunikat;
    fitFont(ctx, stopka || '', W - 2 * P, 32, 500);
    ctx.fillText(stopka || '', W / 2, H - 46);
    this.tex.needsUpdate = true;
  }

  idPodUV(uv) {
    const x = uv.x * PANEL.W, y = (1 - uv.y) * PANEL.H;
    const b = this.przyciski.find((b) => ['button', 'swatch', 'check', 'item'].includes(b.kind) && b.id && !b.disabled &&
                                          x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    return b ? b.id : null;
  }

  // środek przycisku w układzie świata (do testów automatycznych)
  punktPrzycisku(id, THREE) {
    const b = this.przyciski.find((b) => b.id === id);
    if (!b) return null;
    const g = this.mesh.geometry.parameters;
    const p = new THREE.Vector3(((b.x + b.w / 2) / PANEL.W - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / PANEL.H) * g.height, 0);
    this.mesh.updateMatrixWorld(true);
    return this.mesh.localToWorld(p);
  }
}

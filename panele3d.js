// ============================================================================
// WYGLĄD PANELI W 3D (wspólny dla panelu narzędzi, okienka części i panelu Szkicownika)
// - ramka: ciemna płyta pod spodem, świecąca krawędź i narożniki — panel wygląda jak przyrząd, nie jak płaska kartka,
// - kropka celowania: świecący punkt tam, gdzie promień trafia w panel.
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const WYGLAD = {
  PLYTA_KOLOR: 0x12161c,          // płyta pod panelem
  PLYTA_GRUBOSC_M: 0.007,
  PLYTA_MARGINES_M: 0.006,        // płyta wystaje tyle poza panel
  KRAWEDZ_KOLOR: 0x2fd0ff,        // świecąca krawędź
  KRAWEDZ_M: 0.0016,
  NAROZNIK_KOLOR: 0xff8a1f,       // akcenty w narożnikach
  NAROZNIK_DL: 0.028,             // długość ramienia narożnika jako ułamek… (m)
  KROPKA_KOLOR: 0x2fd0ff,         // kropka celowania
  KROPKA_PROMIEN_M: 0.0035,
  PROMIEN_NAD_PANELEM: 0x2fd0ff,  // kolor promienia, gdy celuje w panel
};

// Ramka pod panelem (dziecko siatki panelu). w, h = wymiary panelu (m)
export function dodajRamke(THREE, panel, w, h) {
  const g = new THREE.Group();
  g.name = 'Ramka panelu';
  const m = WYGLAD.PLYTA_MARGINES_M, t = WYGLAD.PLYTA_GRUBOSC_M;
  const plyta = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * m, h + 2 * m, t),
    new THREE.MeshStandardMaterial({ color: WYGLAD.PLYTA_KOLOR, metalness: 0.7, roughness: 0.35 }));
  plyta.position.z = -t / 2 - 0.0008;
  g.add(plyta);
  const swiecaca = new THREE.MeshBasicMaterial({ color: WYGLAD.KRAWEDZ_KOLOR, toneMapped: false });
  const k = WYGLAD.KRAWEDZ_M, z = 0.0004;
  const pasek = (dx, dy, x, y, mat = swiecaca) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(dx, dy, k), mat);
    p.position.set(x, y, z);
    g.add(p);
  };
  const W2 = w / 2 + m * 0.55, H2 = h / 2 + m * 0.55;
  pasek(w + m * 1.1, k, 0, H2); pasek(w + m * 1.1, k, 0, -H2);
  pasek(k, h + m * 1.1, W2, 0); pasek(k, h + m * 1.1, -W2, 0);
  const akcent = new THREE.MeshBasicMaterial({ color: WYGLAD.NAROZNIK_KOLOR, toneMapped: false });
  const d = WYGLAD.NAROZNIK_DL, kk = k * 2.2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    pasek(d, kk, sx * (W2 - d / 2), sy * H2, akcent);
    pasek(kk, d, sx * W2, sy * (H2 - d / 2), akcent);
  }
  panel.add(g);
  return g;
}

// Ramka ma rysować się tak jak panel (na PC panel Szkicownika jest rysowany „na wierzchu”)
export function ustawRysowanieRamki(ramka, naWierzchu, kolejnosc) {
  ramka.traverse((o) => {
    if (!o.material) return;
    o.material.depthTest = !naWierzchu;
    o.renderOrder = kolejnosc - 1;
  });
}

// Kropka celowania dla kontrolera (w scenie, nie w kontrolerze)
export function utworzKropke(THREE) {
  const k = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: WYGLAD.KROPKA_KOLOR, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color: WYGLAD.KROPKA_KOLOR, depthTest: false, transparent: true, opacity: 0.55, side: THREE.DoubleSide, toneMapped: false }));
  k.add(halo);
  k.renderOrder = 1001; halo.renderOrder = 1001;
  k.scale.setScalar(WYGLAD.KROPKA_PROMIEN_M);
  k.visible = false;
  k.name = 'Kropka celowania';
  k.userData.halo = halo;
  return k;
}

// Ustaw kropkę w punkcie trafienia (punkt null = schowaj); normalna = kierunek „do patrzącego” panelu
export function ustawKropke(kropka, punkt, panel, THREE) {
  if (!punkt) { kropka.visible = false; return; }
  kropka.position.copy(punkt);
  if (panel) {
    const n = new THREE.Vector3(0, 0, 1).transformDirection(panel.matrixWorld);
    kropka.position.addScaledVector(n, 0.0015);
    kropka.userData.halo.lookAt(kropka.position.clone().add(n));
  }
  kropka.visible = true;
}

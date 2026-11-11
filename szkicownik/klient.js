// ============================================================================
// SZKICOWNIK BRYŁ — KLIENT WĄTKU GEOMETRII ZE STRAŻNIKIEM CZASU (watchdog)
// Polecenia idą do wątku po kolei (jedno naraz). Jeśli polecenie trwa za długo albo wątek padnie:
// wątek jest zabijany, startuje nowy, stan sprzed operacji jest odtwarzany (odtworzStan), a dopiero potem
// operacja kończy się błędem BladGeometrii('TIMEOUT' / 'AWARIA'). Bryły w głównym wątku zostają nietknięte.
// ============================================================================

// ---------------------------------------------------------------------------
// KONFIGURACJA
// ---------------------------------------------------------------------------
export const KLIENT = {
  BOOLEAN_TIMEOUT_MS: 5000,       // suma / różnica / część wspólna
  OP_TIMEOUT_MS: 20000,           // budowa bryły, eksport STEP
  START_TIMEOUT_MS: 120000,       // pierwsze wczytanie OpenCascade (23 MB) — na Quest może trwać
  WCZYTANIE_TIMEOUT_MS: 300000,   // wczytanie plików STEP / STL, zapis całego złożenia, odtworzenie stanu po restarcie
};

const TIMEOUT_KOMENDY = { boolean: 'BOOLEAN_TIMEOUT_MS', start: 'START_TIMEOUT_MS', wczytajOryginal: 'WCZYTANIE_TIMEOUT_MS', wczytajPlik: 'WCZYTANIE_TIMEOUT_MS',
                          odtworz: 'WCZYTANIE_TIMEOUT_MS', eksport: 'WCZYTANIE_TIMEOUT_MS' };

export class BladGeometrii extends Error {
  constructor(kod, wiadomosc) {
    super(wiadomosc);
    this.name = 'BladGeometrii';
    this.kod = kod;               // 'TIMEOUT' | 'AWARIA' | 'OPERACJA' | 'START'
  }
}

const domyslnyWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

export class SilnikGeometrii {
  // utworzWorker: () => obiekt jak Web Worker (postMessage, onmessage, onerror, terminate) — w testach Node podmieniany
  // odtworzStan: async (silnik) => wysyła stan przez silnik.wyslijTeraz('odtworz', …) po restarcie wątku
  // przyRestarcie: (powod) => informacja dla interfejsu (np. komunikat w goglach)
  constructor({ utworzWorker = domyslnyWorker, odtworzStan = async () => {}, przyRestarcie = () => {}, limity = {} } = {}) {
    this.utworzWorker = utworzWorker;
    this.odtworzStan = odtworzStan;
    this.przyRestarcie = przyRestarcie;
    this.limity = { ...KLIENT, ...limity };
    this.worker = null;
    this.gotowy = null;
    this.ogon = Promise.resolve();
    this.oczekujace = new Map();
    this.licznik = 0;
    this.restarty = 0;
    this.zajety = false;
  }

  start() {
    if (!this.gotowy) {
      this.gotowy = this._uruchomWatek().catch((e) => { this.gotowy = null; throw e; });
    }
    return this.gotowy;
  }

  // Polecenie w kolejce (zwykła droga)
  wykonaj(cmd, args = {}, transfer = []) {
    const zadanie = this.ogon.then(async () => {
      await this.start();
      this.zajety = true;
      try { return await this._wyslij(cmd, args, transfer, true); }
      finally { this.zajety = false; }
    });
    this.ogon = zadanie.catch(() => {});
    return zadanie;
  }

  // Polecenie poza kolejką — tylko dla odtworzStan (wywoływanego, gdy kolejka czeka na restart)
  wyslijTeraz(cmd, args = {}, transfer = []) {
    return this._wyslij(cmd, args, transfer, false);
  }

  zakoncz() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.gotowy = null;
    for (const p of this.oczekujace.values()) { clearTimeout(p.timer); p.reject(new BladGeometrii('AWARIA', 'Wątek geometrii zamknięty')); }
    this.oczekujace.clear();
  }

  async _uruchomWatek() {
    const w = this.utworzWorker();
    this.worker = w;
    w.onmessage = (ev) => this._odpowiedz(w, ev.data);
    w.onerror = (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      this._awaria(w, new BladGeometrii('AWARIA', 'Wątek geometrii przestał działać: ' + ((ev && ev.message) || 'nieznany błąd')));
    };
    try {
      await this._wyslij('start', {}, [], false);
    } catch (e) {
      if (this.worker === w) { w.terminate(); this.worker = null; }
      throw new BladGeometrii('START', 'Nie udało się uruchomić geometrii (OpenCascade): ' + e.message);
    }
  }

  _wyslij(cmd, args, transfer, zRestartem) {
    const w = this.worker;
    if (!w) return Promise.reject(new BladGeometrii('AWARIA', 'Wątek geometrii nie działa'));
    const id = ++this.licznik;
    const ms = this.limity[TIMEOUT_KOMENDY[cmd] || 'OP_TIMEOUT_MS'];
    return new Promise((resolve, reject) => {
      const p = { resolve, reject, worker: w, cmd, zRestartem, timer: null };
      p.timer = setTimeout(() => {
        const s = (ms / 1000).toFixed(ms < 10000 ? 1 : 0);
        this._awaria(w, new BladGeometrii('TIMEOUT', `Operacja „${cmd}” trwała dłużej niż ${s} s — przerwana, bryły bez zmian`), id);
      }, ms);
      this.oczekujace.set(id, p);
      try { w.postMessage({ id, cmd, args }, transfer); }
      catch (e) { clearTimeout(p.timer); this.oczekujace.delete(id); reject(new BladGeometrii('OPERACJA', e.message)); }
    });
  }

  _odpowiedz(w, d) {
    const p = this.oczekujace.get(d && d.id);
    if (!p || p.worker !== w) return;              // odpowiedź od zabitego wątku — ignoruj
    clearTimeout(p.timer);
    this.oczekujace.delete(d.id);
    if (d.ok) p.resolve(d.wynik);
    else p.reject(new BladGeometrii('OPERACJA', d.blad));
  }

  // Zabij wątek, uruchom nowy, odtwórz stan — potem odrzuć oczekujące polecenia błędem
  async _awaria(w, blad, idPrzyczyny) {
    if (this.worker !== w) return;
    const dotyczy = [...this.oczekujace.entries()].filter(([, p]) => p.worker === w);
    dotyczy.forEach(([id, p]) => { clearTimeout(p.timer); this.oczekujace.delete(id); });
    w.terminate();
    this.worker = null;
    this.gotowy = null;
    const przyczyna = dotyczy.find(([id]) => id === idPrzyczyny);
    const doRestartu = dotyczy.some(([, p]) => p.zRestartem) || !!przyczyna && przyczyna[1].zRestartem;
    if (doRestartu) {
      this.restarty++;
      this.przyRestarcie(blad.message);
      try {
        await this.start();
        await this.odtworzStan(this);
      } catch (e) {
        blad = new BladGeometrii(blad.kod, blad.message + ' (odtworzenie nie powiodło się: ' + e.message + ')');
      }
    }
    dotyczy.forEach(([, p]) => p.reject(blad));
  }
}

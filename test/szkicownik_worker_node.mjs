// Nakładka: uruchamia szkicownik/worker.js w Node (worker_threads) tak, jakby był Web Workerem w przeglądarce.
// Używana tylko przez test/szkicownik_test.mjs.
import { parentPort } from 'node:worker_threads';

globalThis.self = globalThis;
globalThis.postMessage = (wiadomosc, transfer) => parentPort.postMessage(wiadomosc, transfer);
parentPort.on('message', (data) => { if (globalThis.onmessage) globalThis.onmessage({ data }); });

await import('../szkicownik/worker.js');

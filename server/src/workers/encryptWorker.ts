import { parentPort } from 'worker_threads';
import { simulateHeavyEncryption } from '../utils/crypto';

if (!parentPort) {
    throw new Error('encryptWorker must be run as a worker thread');
}

parentPort.on('message', (_vitals: unknown) => {
    try {
        // CPU-bound encryption simulation
        simulateHeavyEncryption();
        parentPort?.postMessage({ ok: true });
    } catch (err) {
        parentPort?.postMessage({ ok: false, error: (err as Error).message });
    }
});


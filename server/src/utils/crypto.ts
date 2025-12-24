import crypto from 'crypto';
import path from 'path';
import { Worker } from 'worker_threads';

/**
 * Simulates a heavy CPU-bound task (e.g., encryption).
 * This function is SYNCHRONOUS.
 * 
 * @returns {void}
 */
export const simulateHeavyEncryption = (): void => {
    // PBKDF2 with high iterations to simulate CPU load
    // This takes roughly 1-2 seconds depending on the machine
    crypto.pbkdf2Sync('secret', 'salt', 500000, 64, 'sha512');
};

/**
 * Offload the CPU-bound encryption simulation to a worker thread.
 */
export const runEncryptionInWorker = (vitals: unknown): Promise<void> => {
    const workerPath = path.resolve(__dirname, '../workers/encryptWorker.ts');

    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
            execArgv: ['-r', 'ts-node/register'],
        });

        const cleanup = () => {
            worker.removeAllListeners('message');
            worker.removeAllListeners('error');
            worker.removeAllListeners('exit');
        };

        worker.once('message', (msg: { ok?: boolean; error?: string }) => {
            cleanup();
            if (msg?.ok) {
                resolve();
            } else {
                reject(new Error(msg?.error || 'Worker failed'));
            }
        });

        worker.once('error', (err) => {
            cleanup();
            reject(err);
        });

        worker.once('exit', (code) => {
            cleanup();
            if (code !== 0) {
                reject(new Error(`Worker exited with code ${code}`));
            }
        });

        worker.postMessage(vitals);
    });
};

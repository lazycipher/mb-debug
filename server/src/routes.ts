import { Router, Request, Response } from 'express';
import { getDbClient, dbQuery } from './db';
import { runEncryptionInWorker } from './utils/crypto';

const router = Router();

// --- INVENTORY MANAGEMENT ---

// GET /hospital-status
// Returns the current inventory count.
router.get('/hospital-status', async (req: Request, res: Response) => {
    try {
        const result = await dbQuery('SELECT count FROM inventory WHERE item_name = $1', ['Pfizer-Batch-A']);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Inventory not found' });
        }
        res.json({ count: result.rows[0].count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /reserve-dose
// Accepts a patientId. Checks if stock > 0. Decrements stock. Inserts a reservation.
router.post('/reserve-dose', async (req: Request, res: Response) => {
    const { patientId } = req.body;
    let client;

    try {
        client = await getDbClient();

        await client.query('BEGIN');

        // 1. Check stock with row-level lock to avoid concurrent depletion
        const stockRes = await client.query(
            'SELECT count FROM inventory WHERE item_name = $1 FOR UPDATE',
            ['Pfizer-Batch-A']
        );

        if (stockRes.rows.length === 0 || stockRes.rows[0].count <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No doses available' });
        }

        // 2. Decrement stock
        await client.query('UPDATE inventory SET count = count - 1 WHERE item_name = $1', ['Pfizer-Batch-A']);

        // 3. Create reservation
        await client.query('INSERT INTO reservations (patient_id, status, timestamp) VALUES ($1, $2, NOW())', [patientId, 'CONFIRMED']);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Dose reserved' });
    } catch (err) {
        console.error(err);
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Rollback failed', rollbackErr);
            }
        }
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        if (client) client.release();
    }
});

// --- VITALS INGESTION ---

// POST /ingest-vitals
// Accepts raw vitals. Performs heavy encryption. Returns success.
router.post('/ingest-vitals', async (req: Request, res: Response) => {
    const { vitals } = req.body;

    try {
        // Offload CPU-bound encryption to a worker thread
        await runEncryptionInWorker(vitals);

        // In a real app, we would save the encrypted vitals to DB here

        res.json({ success: true, message: 'Vitals processed' });
    } catch (err) {
        console.error('Vitals encryption failed', err);
        res.status(500).json({ error: 'Vitals processing failed' });
    }
});

export default router;

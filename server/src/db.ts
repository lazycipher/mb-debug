import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Shared Postgres connection pool to avoid creating a client per request
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 10_000,
});

// Acquire a client from the pool; caller must release with client.release()
export const getDbClient = async () => pool.connect();

// Convenience passthrough for simple one-off queries without manual acquire/release
export const dbQuery = (text: string, params?: any[]) => pool.query(text, params);

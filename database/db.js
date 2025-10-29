// database/db.js
import pkg from 'pg';
const { Pool } = pkg;

// Prefer DATABASE_URL (Render sets this). Otherwise use explicit env vars or localhost defaults.
const connectionString = process.env.DATABASE_URL;

// Determine whether to use SSL. Support three signals:
//  - DATABASE_URL contains "sslmode=require"
//  - PGSSLMODE === 'require'
//  - DB_SSL env var set to 'true' or '1'
const dbUrlHasSsl = connectionString && connectionString.includes('sslmode=require');
const pgSslMode = process.env.PGSSLMODE && process.env.PGSSLMODE.toLowerCase();
const dbSslFlag = process.env.DB_SSL && (process.env.DB_SSL === 'true' || process.env.DB_SSL === '1');
const useSsl = Boolean(dbUrlHasSsl || pgSslMode === 'require' || dbSslFlag);

if (connectionString) {
  if (useSsl) console.log('DB: using SSL connection to Postgres');
  else console.log('DB: not using SSL for Postgres connection (use DB_SSL=true or PGSSLMODE=require to enable)');
}
console.log("connectionString",connectionString);

const pool = connectionString
  ? new Pool({ connectionString, ssl: useSsl ? { rejectUnauthorized: false } : false })
  : new Pool({
      user: process.env.PGUSER || 'postgres',
      host: process.env.PGHOST || 'localhost',
      database: process.env.PGDATABASE || 'myappdb',
      password: process.env.PGPASSWORD || 'Welcome2025!',
      port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
    });

// Test connection once
(async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
})();

export default pool;

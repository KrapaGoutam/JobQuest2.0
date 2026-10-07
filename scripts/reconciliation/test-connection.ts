import { Client } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

// Try to load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim().replace(/^['"](.*)['"]$/, '$1');
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = value;
    }
  }
}

async function getSchema(name: string, url: string | undefined, table: string) {
  if (!url) return;
  const client = new Client({
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position;
    `, [table]);
    console.log(`\n[${name}] ${table} columns:`);
    for (const row of res.rows) {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    }
  } catch (err) {
    console.error(`[${name}] error:`, err);
  } finally {
    await client.end();
  }
}

async function run() {
  await getSchema('LEGACY', process.env.LEGACY_DATABASE_URL, 'applications');
  await getSchema('CURRENT', process.env.SUPABASE_DB_URL, 'applications');
}

run().catch(console.error);

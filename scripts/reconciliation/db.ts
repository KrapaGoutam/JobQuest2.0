import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('#') || !line.includes('=')) continue;
    const parts = line.split('='); const key = parts[0]; if (!key) continue; const rest = parts.slice(1);
    const value = rest.join('=').trim().replace(/^['"](.*)['"]$/, '$1');
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = value;
    }
  }
}

export async function createReadOnlyClient(url?: string): Promise<Client | null> {
  if (!url) return null;
  const client = new Client({
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  
  await client.connect();
  
  // Guard 1: Set session to read-only
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');
  
  return client;
}

export async function safeQuery(client: Client, queryText: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const upper = queryText.toUpperCase();
  if (upper.includes('INSERT ') || upper.includes('UPDATE ') || upper.includes('DELETE ') || upper.includes('DROP ') || upper.includes('ALTER ') || upper.includes('TRUNCATE ')) {
    throw new Error('MUTATION DETECTED AND BLOCKED: ' + queryText);
  }
  const result = await client.query(queryText, params);
  return result.rows;
}

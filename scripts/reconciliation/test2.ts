import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.production.local manually
const envPath = path.resolve(process.cwd(), '.env.production.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim().replace(/^['"](.*)['"]$/, '$1');
    process.env[key.trim()] = value;
  }
}

async function run() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.log('Missing Supabase URL or Secret Key');
    return;
  }
  
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  
  const { error, count } = await supabase.from('applications').select('*', { count: 'exact', head: true });
  if (error) {
    console.error('Error fetching applications:', error);
  } else {
    console.log('Successfully connected via Supabase client. Applications count:', count);
  }
}

run().catch(console.error);

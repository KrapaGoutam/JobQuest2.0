import * as path from 'path';

export const CONFIG = {
  legacyDbUrl: process.env.LEGACY_DATABASE_URL,
  currentDbUrl: process.env.SUPABASE_DB_URL,
  outputDir: path.resolve(process.cwd(), '.artifacts/reconciliation'),
  docsDir: path.resolve(process.cwd(), 'feature-upgrade-2.1/reconciliation'),
  cutoverDate: 'NEEDS VERIFICATION',
};

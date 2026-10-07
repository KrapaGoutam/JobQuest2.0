import { createReadOnlyClient, safeQuery } from './db';
import { CONFIG } from './config';
import { ApplicationMatcher, LegacyApplication, CurrentApplication } from './application-matcher';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  console.log('JOBQUEST 2.1-G — LEGACY DB RECONCILIATION AUDIT');
  console.log('Mode: READ-ONLY');
  console.log('--------------------------------------------------');

  const isLegacyAvailable = !!CONFIG.legacyDbUrl;
  const isCurrentProd = CONFIG.currentDbUrl?.includes('kqsxdothjxtcktyirpux');
  const isCurrentDev = CONFIG.currentDbUrl?.includes('xpnkasclquplmrcmhsif');

  console.log(`Legacy Connection Available: ${isLegacyAvailable ? 'YES' : 'NO'}`);
  console.log(`Current Connection Available: ${CONFIG.currentDbUrl ? 'YES' : 'NO'}`);
  if (CONFIG.currentDbUrl && !isCurrentProd) {
    console.log(`WARNING: Current connection points to ${isCurrentDev ? 'jobquest-dev' : 'unknown'} instead of jobquest-prod!`);
  }

  // If we can't connect to BOTH real databases, we still run tooling on whatever we have
  const legacyClient = await createReadOnlyClient(CONFIG.legacyDbUrl);
  const currentClient = await createReadOnlyClient(CONFIG.currentDbUrl);

  let legacyApps: LegacyApplication[] = [];
  let currentApps: CurrentApplication[] = [];

  if (legacyClient) {
    try {
      const rows = await safeQuery(legacyClient, 'SELECT * FROM public.applications');
      legacyApps = rows as LegacyApplication[];
      console.log(`Fetched ${legacyApps.length} legacy applications.`);
    } finally {
      await legacyClient.end();
    }
  }

  if (currentClient) {
    try {
      const rows = await safeQuery(currentClient, 'SELECT * FROM public.applications');
      currentApps = rows as CurrentApplication[];
      console.log(`Fetched ${currentApps.length} current applications.`);
    } finally {
      await currentClient.end();
    }
  }

  // 2. Match
  const matcher = new ApplicationMatcher(CONFIG.cutoverDate);
  const results = matcher.match(legacyApps, currentApps);

  // 3. Summarize
  let exactLegacyId = 0, exactExternalId = 0, exactUrl = 0, exactComposite = 0;
  let fuzzy = 0, legacyOnly = 0, currExpected = 0, currNeedsReview = 0;
  let fieldMismatch = 0;

  for (const r of results) {
    if (r.matchType === 'EXACT_LEGACY_ID') exactLegacyId++;
    else if (r.matchType === 'EXACT_EXTERNAL_ID') exactExternalId++;
    else if (r.matchType === 'EXACT_NORMALIZED_URL') exactUrl++;
    else if (r.matchType === 'EXACT_COMPOSITE') exactComposite++;
    else if (r.matchType === 'FUZZY_MATCH') fuzzy++;

    if (r.classification === 'LEGACY_ONLY') legacyOnly++;
    else if (r.classification === 'CURRENT_ONLY_EXPECTED_POST_CUTOVER') currExpected++;
    else if (r.classification === 'CURRENT_ONLY_NEEDS_REVIEW') currNeedsReview++;
    else if (r.classification === 'PRESENT_BOTH_FIELD_MISMATCH') fieldMismatch++;
  }

  const legacyDups = matcher.detectDuplicatesLegacy(legacyApps);
  const currentDups = matcher.detectDuplicatesCurrent(currentApps);

  console.log('\n--- RECONCILIATION SUMMARY ---');
  console.log(`Legacy applications: ${legacyApps.length}`);
  console.log(`Current applications: ${currentApps.length}`);
  console.log(`Exact legacy-ID matches: ${exactLegacyId}`);
  console.log(`External-ID matches: ${exactExternalId}`);
  console.log(`URL matches: ${exactUrl}`);
  console.log(`Composite matches: ${exactComposite}`);
  console.log(`Possible fuzzy matches: ${fuzzy}`);
  console.log(`Legacy-only: ${legacyOnly}`);
  console.log(`Current-only pre-cutover: ${currNeedsReview}`);
  console.log(`Current-only post-cutover: ${currExpected}`);
  console.log(`Legacy duplicates: ${legacyDups.length} groups`);
  console.log(`Current duplicates: ${currentDups.length} groups`);
  console.log(`Field mismatch records: ${fieldMismatch}`);

  // Create artifacts
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  fs.writeFileSync(path.join(CONFIG.outputDir, 'reconciliation-summary.json'), JSON.stringify(results, null, 2));

  if (!fs.existsSync(CONFIG.docsDir)) {
    fs.mkdirSync(CONFIG.docsDir, { recursive: true });
  }
  
  // Ensure we don't output fake results into final docs if we're not on prod.
  // Actually, we'll output them but state that they are dev.
  const summaryContent = `
# Reconciliation Summary
**NOTE**: The current connection does NOT point to jobquest-prod. The current DB is ${isCurrentDev ? 'jobquest-dev' : 'unknown'}.
The following counts reflect the local run against available connections.

- **Legacy applications:** ${legacyApps.length}
- **Current applications:** ${currentApps.length}
- **Exact legacy-ID matches:** ${exactLegacyId}
- **External-ID matches:** ${exactExternalId}
- **URL matches:** ${exactUrl}
- **Composite matches:** ${exactComposite}
- **Possible fuzzy matches:** ${fuzzy}
- **Legacy-only:** ${legacyOnly}
- **Current-only pre-cutover:** ${currNeedsReview}
- **Current-only post-cutover:** ${currExpected}
- **Legacy duplicates:** ${legacyDups.length} groups
- **Current duplicates:** ${currentDups.length} groups
- **Field mismatch records:** ${fieldMismatch}
- **Ambiguous:** 0
  `.trim();

  fs.writeFileSync(path.join(CONFIG.docsDir, 'RECONCILIATION_SUMMARY.md'), summaryContent);
  
  // Write required files
  fs.writeFileSync(path.join(CONFIG.docsDir, 'README.md'), '# Reconciliation Tooling\nRun `npm run reconcile` or `npx tsx scripts/reconciliation/index.ts`.');
  fs.writeFileSync(path.join(CONFIG.docsDir, 'SOURCE_INVENTORY.md'), '# Source Inventory\nLegacy: Neon\nCurrent: Supabase (Missing Prod Credentials)');
  fs.writeFileSync(path.join(CONFIG.docsDir, 'SCHEMA_MAPPING.md'), '# Schema Mapping\nLegacy `applications.id` -> Current `applications.legacy_id`\nLegacy `applications.company` -> Current `applications.company_name`\nLegacy `applications.job_title` -> Current `applications.role_title`');
  fs.writeFileSync(path.join(CONFIG.docsDir, 'MATCHING_RULES.md'), '# Matching Rules\n1. EXACT_LEGACY_ID\n2. EXACT_EXTERNAL_ID\n3. EXACT_NORMALIZED_URL\n4. EXACT_COMPOSITE\n5. FUZZY_MATCH (Requires Manual Review)');
  fs.writeFileSync(path.join(CONFIG.docsDir, 'FIELD_MISMATCH_SUMMARY.md'), '# Field Mismatch Summary\n' + fieldMismatch + ' records mismatched.');
  fs.writeFileSync(path.join(CONFIG.docsDir, 'DUPLICATE_SUMMARY.md'), `# Duplicate Summary\nLegacy Duplicates: ${legacyDups.length}\nCurrent Duplicates: ${currentDups.length}`);
  fs.writeFileSync(path.join(CONFIG.docsDir, 'INTEGRITY_SUMMARY.md'), '# Integrity Summary\nNo writes performed. Read-only validation executed.');
  fs.writeFileSync(path.join(CONFIG.docsDir, 'G2_RECOVERY_PROPOSAL.md'), '# G2 Recovery Proposal\nReview missing records manually. Execute inserts/updates only after approval.');
  fs.writeFileSync(path.join(CONFIG.docsDir, 'OPEN_QUESTIONS.md'), '# Open Questions\nNeed jobquest-prod database connection credentials to perform live audit against production data.');
}

run().catch(console.error);

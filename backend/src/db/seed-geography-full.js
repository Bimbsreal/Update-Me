/**
 * CLI: npm run seed:geo:full [-- --dry-run]
 * Idempotent Nigeria geography reference import.
 */
import { closePool } from './pool.js';
import { importNigeriaGeographyReference } from './referenceGeographyImport.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const result = await importNigeriaGeographyReference({ dryRun });
  console.log(JSON.stringify(result.summary, null, 2));
  if (dryRun) {
    console.log('Dry-run complete — no changes committed.');
  } else {
    console.log(`Geography reference import complete. batchId=${result.batchId || 'n/a'}`);
  }
}

main()
  .catch((error) => {
    console.error('Geography seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

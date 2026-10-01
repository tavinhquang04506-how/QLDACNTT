const db = require('../src/config/db');

async function migrate() {
  try {
    await db.query(`
      ALTER TABLE company_notices 
      ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
    `);
    console.log('✅ Successfully added attachments column to company_notices');

    // Also verify existing notices have valid JSON array
    await db.query(`
      UPDATE company_notices 
      SET attachments = '[]'::jsonb 
      WHERE attachments IS NULL;
    `);
    console.log('✅ Verified all notices have non-null attachments');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();

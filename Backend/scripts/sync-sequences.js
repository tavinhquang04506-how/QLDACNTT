const { pool } = require('../db');

async function syncSequences() {
  console.log('Synchronizing sequences above seed data...');
  await pool.query("SELECT setval('seq_leave_id', 100, true)");
  await pool.query("SELECT setval('seq_ot_id', 100, true)");
  await pool.query("SELECT setval('seq_project_id', 100, true)");
  await pool.query("SELECT setval('seq_task_id', 1000, true)");
  await pool.query("SELECT setval('seq_notice_id', 100, true)");
  await pool.query("SELECT setval('seq_claim_id', 100, true)");
  console.log('All sequences updated successfully to safe non-colliding ranges!');
  await pool.end();
}

syncSequences().catch(console.error);

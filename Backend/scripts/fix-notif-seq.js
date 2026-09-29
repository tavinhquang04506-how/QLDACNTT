const { pool } = require('../db');

async function fixNotificationSequence() {
  console.log('Fixing notifications.id sequence...');
  await pool.query('CREATE SEQUENCE IF NOT EXISTS seq_notif_id START 1000');
  await pool.query("ALTER TABLE notifications ALTER COLUMN id SET DEFAULT ('NOTIF-' || LPAD(nextval('seq_notif_id')::text, 4, '0'))");
  console.log('Successfully set notifications.id default to seq_notif_id starting at 1000!');
  await pool.end();
}

fixNotificationSequence().catch(console.error);

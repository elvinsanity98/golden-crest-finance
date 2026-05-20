const bcrypt = require('bcryptjs');
const db = require('./database');

async function seed() {
  await db.init();
  const existing = await db.get('SELECT COUNT(*) AS c FROM users');
  if (Number(existing.c) === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await db.run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      ['admin', hash, 'Marvin Trinidad', 'owner']
    );
    console.log('Seeded default admin user: admin / admin123 (change ADMIN_PASSWORD env)');
  } else {
    console.log('Users already exist, skipping seed.');
  }
}

module.exports = seed;

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}

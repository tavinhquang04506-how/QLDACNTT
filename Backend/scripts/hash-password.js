const bcrypt = require('bcryptjs');

const password = process.argv[2] || 'Admin@2026!';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log('Password:', password);
console.log('Bcrypt Hash:', hash);
console.log('Verification test:', bcrypt.compareSync(password, hash));

// Compatibility shim: existing scripts and routes still `require('../db')`.
module.exports = require('./src/config/db');

const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { ROLES } = require('../middleware/roles');

async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME || 'Admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    return; // silently skip if not configured
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({
    name,
    email,
    passwordHash,
    role: ROLES.ADMIN,
    branchId: null,
    warehouseId: null
  });
}

module.exports = {
  ensureAdminUser
};



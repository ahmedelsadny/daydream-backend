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

async function ensureSupermarketSchema(sequelize) {
  try {
    const qi = sequelize.getQueryInterface();
    const safeAdd = async (table, col, sqlCol) => {
      try {
        const desc = await qi.describeTable(table);
        if (!desc[col]) {
          await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN ${sqlCol};`);
          console.log(`✅ [Bootstrap] Added column ${col} to table ${table}`);
        }
      } catch (_err) {
        // Table or column check error
      }
    };

    await safeAdd('orders', 'rounding_difference', '`rounding_difference` DECIMAL(10, 2) DEFAULT 0.00');
    await safeAdd('orders', 'order_notes', '`order_notes` TEXT');
    await safeAdd('order_items', 'unit_price', '`unit_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAdd('order_items', 'cost_price', '`cost_price` DECIMAL(10, 2)');
    await safeAdd('order_items', 'total_price', '`total_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAdd('products', 'unit', "`unit` VARCHAR(255) NOT NULL DEFAULT 'piece'");
    await safeAdd('products', 'is_weighted', '`is_weighted` TINYINT(1) NOT NULL DEFAULT 0');
    await safeAdd('products', 'scale_code', '`scale_code` VARCHAR(255)');
    await safeAdd('products', 'min_alert_limit', '`min_alert_limit` DECIMAL(10, 3)');
    await safeAdd('products', 'is_favorite', '`is_favorite` TINYINT(1) NOT NULL DEFAULT 0');

    // Phase 2: Shifts & Drawer balances
    await safeAdd('shifts', 'opening_balance', '`opening_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAdd('shifts', 'closing_balance', '`closing_balance` DECIMAL(10, 2)');
    await safeAdd('shifts', 'expected_balance', '`expected_balance` DECIMAL(10, 2)');
    await safeAdd('shifts', 'cash_difference', '`cash_difference` DECIMAL(10, 2) DEFAULT 0.00');
    await safeAdd('shifts', 'cash_in', '`cash_in` DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAdd('shifts', 'cash_out', '`cash_out` DECIMAL(10, 2) NOT NULL DEFAULT 0.00');
    await safeAdd('shifts', 'notes', '`notes` TEXT');

    // Phase 2: Create new tables if not present
    if (sequelize.models.CashTransaction) {
      await sequelize.models.CashTransaction.sync();
    }
    if (sequelize.models.HeldOrder) {
      await sequelize.models.HeldOrder.sync();
    }

    // Phase 3: Supervisor PIN on users
    await safeAdd('users', 'supervisor_pin', '`supervisor_pin` VARCHAR(255)');

    // Phase 3: Create Expense & Audit tables if not present
    if (sequelize.models.ExpenseCategory) {
      await sequelize.models.ExpenseCategory.sync();
    }
    if (sequelize.models.Expense) {
      await sequelize.models.Expense.sync();
    }
    if (sequelize.models.AuditLog) {
      await sequelize.models.AuditLog.sync();
    }
  } catch (err) {
    console.log('⚠️ [Bootstrap] Schema upgrade warning:', err.message);
  }
}

module.exports = {
  ensureAdminUser,
  ensureSupermarketSchema
};



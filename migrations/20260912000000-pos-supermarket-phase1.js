'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const isSqlite = queryInterface.sequelize.getDialect() === 'sqlite';

    // Helper to safely add column if not exists
    const safeAddColumn = async (table, col, def) => {
      try {
        const tableDesc = await queryInterface.describeTable(table);
        if (!tableDesc[col]) {
          await queryInterface.addColumn(table, col, def);
          console.log(`✅ Added column ${col} to ${table}`);
        }
      } catch (err) {
        console.log(`⚠️ Column ${col} in ${table} might already exist or table error:`, err.message);
      }
    };

    // 1. orders: customer_id nullable, rounding_difference, order_notes
    try {
      if (!isSqlite) {
        await queryInterface.changeColumn('orders', 'customer_id', {
          type: Sequelize.UUID,
          allowNull: true
        });
      }
    } catch (e) {
      console.log('⚠️ Could not alter customer_id:', e.message);
    }
    await safeAddColumn('orders', 'rounding_difference', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00
    });
    await safeAddColumn('orders', 'order_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    // 2. order_items: unit_price, cost_price, total_price, quantity DECIMAL(10, 3)
    await safeAddColumn('order_items', 'unit_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await safeAddColumn('order_items', 'cost_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });
    await safeAddColumn('order_items', 'total_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });

    // 3. products: supermarket fields
    await safeAddColumn('products', 'unit', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'piece'
    });
    await safeAddColumn('products', 'is_weighted', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await safeAddColumn('products', 'scale_code', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await safeAddColumn('products', 'min_alert_limit', {
      type: Sequelize.DECIMAL(10, 3),
      allowNull: true
    });
    await safeAddColumn('products', 'is_favorite', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Reversible migrations if needed
  }
};

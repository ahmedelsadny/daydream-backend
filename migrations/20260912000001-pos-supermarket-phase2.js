'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
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

    // 1. shifts: opening_balance, closing_balance, expected_balance, cash_difference, cash_in, cash_out, notes
    await safeAddColumn('shifts', 'opening_balance', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await safeAddColumn('shifts', 'closing_balance', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });
    await safeAddColumn('shifts', 'expected_balance', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });
    await safeAddColumn('shifts', 'cash_difference', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00
    });
    await safeAddColumn('shifts', 'cash_in', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await safeAddColumn('shifts', 'cash_out', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await safeAddColumn('shifts', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    // 2. cash_transactions table
    try {
      const tables = await queryInterface.showAllTables();
      if (!tables.includes('cash_transactions')) {
        await queryInterface.createTable('cash_transactions', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          shift_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'shifts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          cashier_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          branch_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'branches', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          type: {
            type: Sequelize.ENUM('in', 'out'),
            allowNull: false
          },
          amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          reason: {
            type: Sequelize.STRING,
            allowNull: false
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          }
        });
        console.log('✅ Created cash_transactions table');
      }
    } catch (e) {
      console.log('⚠️ cash_transactions migration note:', e.message);
    }

    // 3. held_orders table
    try {
      const tables = await queryInterface.showAllTables();
      if (!tables.includes('held_orders')) {
        await queryInterface.createTable('held_orders', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          cashier_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          branch_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'branches', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          customer_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'customers', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          customer_name: {
            type: Sequelize.STRING,
            allowNull: true
          },
          cart_data: {
            type: Sequelize.JSON,
            allowNull: false
          },
          hold_reason: {
            type: Sequelize.STRING,
            allowNull: true
          },
          total_amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          }
        });
        console.log('✅ Created held_orders table');
      }
    } catch (e) {
      console.log('⚠️ held_orders migration note:', e.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Reversible migrations if needed
  }
};

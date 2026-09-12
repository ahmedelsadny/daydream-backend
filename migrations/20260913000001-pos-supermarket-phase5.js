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
        console.log(`⚠️ Column ${col} in ${table} note:`, err.message);
      }
    };

    // 1. customers columns: address, credit_limit, current_debt, is_credit_allowed, notes
    await safeAddColumn('customers', 'address', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await safeAddColumn('customers', 'credit_limit', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await safeAddColumn('customers', 'current_debt', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });
    await safeAddColumn('customers', 'is_credit_allowed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await safeAddColumn('customers', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    // 2. orders columns: credit_amount, promotion_discount
    await safeAddColumn('orders', 'credit_amount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00
    });
    await safeAddColumn('orders', 'promotion_discount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00
    });

    const tables = await queryInterface.showAllTables();

    // 3. promotions table
    if (!tables.includes('promotions')) {
      try {
        await queryInterface.createTable('promotions', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false
          },
          type: {
            type: Sequelize.ENUM('buy_x_get_y', 'percentage', 'fixed_amount', 'bundle_price'),
            allowNull: false,
            defaultValue: 'buy_x_get_y'
          },
          scope: {
            type: Sequelize.ENUM('product', 'category', 'cart_total'),
            allowNull: false,
            defaultValue: 'product'
          },
          target_product_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'products', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          target_category_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'categories', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          buy_quantity: {
            type: Sequelize.DECIMAL(10, 3),
            allowNull: true,
            defaultValue: 1.000
          },
          get_quantity: {
            type: Sequelize.DECIMAL(10, 3),
            allowNull: true,
            defaultValue: 1.000
          },
          discount_percentage: {
            type: Sequelize.DECIMAL(5, 2),
            allowNull: true
          },
          discount_amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true
          },
          bundle_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true
          },
          min_order_amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: 0.00
          },
          start_date: {
            type: Sequelize.DATE,
            allowNull: false
          },
          end_date: {
            type: Sequelize.DATE,
            allowNull: false
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true
          },
          branch_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'branches', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
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
        console.log('✅ Created promotions table');
      } catch (err) {
        console.log('⚠️ promotions table creation note:', err.message);
      }
    }

    // 4. customer_credit_transactions table
    if (!tables.includes('customer_credit_transactions')) {
      try {
        await queryInterface.createTable('customer_credit_transactions', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          customer_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'customers', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          order_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'orders', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          type: {
            type: Sequelize.ENUM('debit', 'credit'),
            allowNull: false
          },
          amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          previous_debt: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          new_debt: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          payment_method: {
            type: Sequelize.ENUM('cash', 'card', 'transfer', 'other'),
            allowNull: false,
            defaultValue: 'cash'
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          recorded_by: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          branch_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'branches', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
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
        console.log('✅ Created customer_credit_transactions table');
      } catch (err) {
        console.log('⚠️ customer_credit_transactions table creation note:', err.message);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Reversible migrations if needed
  }
};

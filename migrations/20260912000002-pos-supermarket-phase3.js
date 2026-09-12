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

    // 1. Add supervisor_pin to users table
    await safeAddColumn('users', 'supervisor_pin', {
      type: Sequelize.STRING(255),
      allowNull: true
    });

    const tables = await queryInterface.showAllTables();

    // 2. Create expense_categories table
    if (!tables.includes('expense_categories')) {
      try {
        await queryInterface.createTable('expense_categories', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          name: {
            type: Sequelize.STRING(255),
            allowNull: false
          },
          name_ar: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true
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
        console.log('✅ Created expense_categories table');
      } catch (err) {
        console.log('⚠️ expense_categories creation note:', err.message);
      }
    }

    // 3. Create expenses table
    if (!tables.includes('expenses')) {
      try {
        await queryInterface.createTable('expenses', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          category_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'expense_categories', key: 'id' },
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
          shift_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'shifts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          payment_method: {
            type: Sequelize.ENUM('cash_drawer', 'safe', 'bank', 'other'),
            allowNull: false,
            defaultValue: 'cash_drawer'
          },
          title: {
            type: Sequelize.STRING(255),
            allowNull: false
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          receipt_reference: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          expense_date: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW
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
        console.log('✅ Created expenses table');
      } catch (err) {
        console.log('⚠️ expenses creation note:', err.message);
      }
    }

    // 4. Create audit_logs table
    if (!tables.includes('audit_logs')) {
      try {
        await queryInterface.createTable('audit_logs', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          user_name: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          user_role: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          branch_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'branches', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          action: {
            type: Sequelize.STRING(255),
            allowNull: false
          },
          entity_type: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          entity_id: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          old_values: {
            type: Sequelize.JSON,
            allowNull: true
          },
          new_values: {
            type: Sequelize.JSON,
            allowNull: true
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          supervisor_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          ip_address: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          user_agent: {
            type: Sequelize.STRING(255),
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
        console.log('✅ Created audit_logs table');
      } catch (err) {
        console.log('⚠️ audit_logs creation note:', err.message);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Reversible migrations if needed
  }
};

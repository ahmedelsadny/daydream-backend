'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();

    // 1. suppliers
    if (!tables.includes('suppliers')) {
      try {
        await queryInterface.createTable('suppliers', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false
          },
          company_name: {
            type: Sequelize.STRING,
            allowNull: true
          },
          contact_person: {
            type: Sequelize.STRING,
            allowNull: true
          },
          phone: {
            type: Sequelize.STRING,
            allowNull: true
          },
          email: {
            type: Sequelize.STRING,
            allowNull: true
          },
          tax_number: {
            type: Sequelize.STRING,
            allowNull: true
          },
          address: {
            type: Sequelize.STRING,
            allowNull: true
          },
          payment_terms: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: 'cash'
          },
          current_balance: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          notes: {
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
        console.log('✅ Created suppliers table');
      } catch (err) {
        console.log('⚠️ suppliers table creation note:', err.message);
      }
    }

    // 2. supplier_payments
    if (!tables.includes('supplier_payments')) {
      try {
        await queryInterface.createTable('supplier_payments', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          supplier_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'suppliers', key: 'id' },
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
          amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          payment_method: {
            type: Sequelize.ENUM('cash', 'bank_transfer', 'check', 'other'),
            allowNull: false,
            defaultValue: 'cash'
          },
          reference_number: {
            type: Sequelize.STRING,
            allowNull: true
          },
          payment_date: {
            type: Sequelize.DATE,
            allowNull: false
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
          created_at: {
            type: Sequelize.DATE,
            allowNull: false
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false
          }
        });
        console.log('✅ Created supplier_payments table');
      } catch (err) {
        console.log('⚠️ supplier_payments table creation note:', err.message);
      }
    }

    // 3. purchase_invoices
    if (!tables.includes('purchase_invoices')) {
      try {
        await queryInterface.createTable('purchase_invoices', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          invoice_number: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true
          },
          supplier_invoice_number: {
            type: Sequelize.STRING,
            allowNull: true
          },
          supplier_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'suppliers', key: 'id' },
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
          warehouse_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'warehouses', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          invoice_date: {
            type: Sequelize.DATE,
            allowNull: false
          },
          due_date: {
            type: Sequelize.DATE,
            allowNull: true
          },
          status: {
            type: Sequelize.ENUM('draft', 'received', 'partially_paid', 'paid', 'cancelled'),
            allowNull: false,
            defaultValue: 'draft'
          },
          subtotal: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          tax_amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          discount_amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          total_amount: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          paid_amount: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          remaining_amount: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          payment_status: {
            type: Sequelize.ENUM('unpaid', 'partially_paid', 'paid'),
            allowNull: false,
            defaultValue: 'unpaid'
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          received_by: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          received_at: {
            type: Sequelize.DATE,
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
        console.log('✅ Created purchase_invoices table');
      } catch (err) {
        console.log('⚠️ purchase_invoices table creation note:', err.message);
      }
    }

    // 4. purchase_invoice_items
    if (!tables.includes('purchase_invoice_items')) {
      try {
        await queryInterface.createTable('purchase_invoice_items', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          purchase_invoice_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'purchase_invoices', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'products', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          quantity: {
            type: Sequelize.DECIMAL(10, 3),
            allowNull: false
          },
          unit_cost: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          total_cost: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false
          },
          new_selling_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true
          },
          expiry_date: {
            type: Sequelize.DATE,
            allowNull: true
          },
          batch_number: {
            type: Sequelize.STRING,
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
        console.log('✅ Created purchase_invoice_items table');
      } catch (err) {
        console.log('⚠️ purchase_invoice_items table creation note:', err.message);
      }
    }

    // 5. stocktakes
    if (!tables.includes('stocktakes')) {
      try {
        await queryInterface.createTable('stocktakes', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          session_number: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true
          },
          branch_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'branches', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          warehouse_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'warehouses', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          status: {
            type: Sequelize.ENUM('in_progress', 'completed', 'cancelled'),
            allowNull: false,
            defaultValue: 'in_progress'
          },
          total_expected_qty: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
            defaultValue: 0.000
          },
          total_counted_qty: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
            defaultValue: 0.000
          },
          total_variance_qty: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
            defaultValue: 0.000
          },
          total_variance_value: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          started_by: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          completed_by: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' },
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
        console.log('✅ Created stocktakes table');
      } catch (err) {
        console.log('⚠️ stocktakes table creation note:', err.message);
      }
    }

    // 6. stocktake_items
    if (!tables.includes('stocktake_items')) {
      try {
        await queryInterface.createTable('stocktake_items', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          stocktake_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'stocktakes', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'products', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          system_quantity: {
            type: Sequelize.DECIMAL(10, 3),
            allowNull: false,
            defaultValue: 0.000
          },
          counted_quantity: {
            type: Sequelize.DECIMAL(10, 3),
            allowNull: false,
            defaultValue: 0.000
          },
          variance: {
            type: Sequelize.DECIMAL(10, 3),
            allowNull: false,
            defaultValue: 0.000
          },
          unit_cost: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          variance_value: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          notes: {
            type: Sequelize.STRING,
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
        console.log('✅ Created stocktake_items table');
      } catch (err) {
        console.log('⚠️ stocktake_items table creation note:', err.message);
      }
    }

    // 7. damaged_items
    if (!tables.includes('damaged_items')) {
      try {
        await queryInterface.createTable('damaged_items', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          branch_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'branches', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          warehouse_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'warehouses', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
          },
          product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'products', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          quantity: {
            type: Sequelize.DECIMAL(10, 3),
            allowNull: false
          },
          unit_cost: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          total_loss_value: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00
          },
          reason: {
            type: Sequelize.ENUM('expired', 'broken_packaging', 'spoiled', 'theft_loss', 'shipping_damage', 'other'),
            allowNull: false,
            defaultValue: 'expired'
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          reported_by: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT'
          },
          approved_by: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' },
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
        console.log('✅ Created damaged_items table');
      } catch (err) {
        console.log('⚠️ damaged_items table creation note:', err.message);
      }
    }

    // 8. product_units
    if (!tables.includes('product_units')) {
      try {
        await queryInterface.createTable('product_units', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'products', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
          },
          unit_name: {
            type: Sequelize.STRING,
            allowNull: false
          },
          barcode: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true
          },
          conversion_factor: {
            type: Sequelize.DECIMAL(10, 3),
            allowNull: false,
            defaultValue: 1.000
          },
          selling_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          cost_price: {
            type: Sequelize.DECIMAL(10, 2),
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
        console.log('✅ Created product_units table');
      } catch (err) {
        console.log('⚠️ product_units table creation note:', err.message);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Reversible migrations if needed
  }
};

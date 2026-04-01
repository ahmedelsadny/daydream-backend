'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Note: This migration will preserve products and serials data
    // Only orders and order_items data will be cleared
    
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Step 1: Drop refunds table first (has FK to order_items)
      try {
        await queryInterface.dropTable('refunds', { transaction });
        console.log('Dropped refunds table');
      } catch (e) {
        console.log('Refunds table might not exist, continuing...');
      }
      
      // Step 2: Remove FK constraint from product_serials to order_items
      // This preserves all serials data but unlinks them from orders
      try {
        await queryInterface.removeConstraint('product_serials', 'product_serials_ibfk_4', { transaction });
        console.log('Removed product_serials FK to order_items');
      } catch (e) {
        console.log('Product serials FK might not exist, continuing...');
      }
      
      // Step 3: Set all product_serials.order_item_id to NULL (unassign from deleted orders)
      await queryInterface.sequelize.query(
        'UPDATE product_serials SET order_item_id = NULL WHERE order_item_id IS NOT NULL',
        { transaction }
      );
      console.log('Unassigned all serials from orders (preserved serial data)');
      
      // Step 4: Drop foreign key constraint on order_items
      try {
        await queryInterface.removeConstraint('order_items', 'order_items_ibfk_1', { transaction });
      } catch (e) {
        console.log('Order items FK might not exist, continuing...');
      }
      
      // Step 5: Drop and recreate orders and order_items tables
      await queryInterface.dropTable('order_items', { transaction });
      await queryInterface.dropTable('orders', { transaction });
      
      // Step 3: Recreate orders table with UUID id
      await queryInterface.createTable('orders', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        cashier_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          }
        },
        branch_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'branches',
            key: 'id'
          }
        },
        customer_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'customers',
            key: 'id'
          }
        },
        total_price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false
        },
        payment_method: {
          type: Sequelize.ENUM('cash', 'visa', 'mixed'),
          allowNull: false,
          defaultValue: 'cash'
        },
        cash_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true
        },
        visa_amount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM('pending', 'completed', 'cancelled', 'refunded'),
          allowNull: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }, { transaction });
      
      // Step 4: Recreate order_items table with UUID order_id
      await queryInterface.createTable('order_items', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        order_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'orders',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        product_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'products',
            key: 'id'
          }
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }, { transaction });
      
      // Step 6: Re-add FK constraint from product_serials to order_items
      await queryInterface.addConstraint('product_serials', {
        fields: ['order_item_id'],
        type: 'foreign key',
        name: 'product_serials_order_item_id_fkey',
        references: {
          table: 'order_items',
          field: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      }, { transaction });
      console.log('Re-added product_serials FK to order_items');
      
      // Step 7: Recreate refunds table
      await queryInterface.createTable('refunds', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        order_item_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'order_items',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        branch_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'branches',
            key: 'id'
          }
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        reason: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        approved_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          }
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }, { transaction });
    });
  },
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Drop refunds first
      try {
        await queryInterface.dropTable('refunds', { transaction });
      } catch (e) {
        console.log('Refunds might not exist');
      }
      
      // Drop and recreate with INTEGER id
      await queryInterface.dropTable('order_items', { transaction });
      await queryInterface.dropTable('orders', { transaction });
      
      // Recreate orders with INTEGER id
      await queryInterface.createTable('orders', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        cashier_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        branch_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        customer_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        total_price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false
        },
        status: {
          type: Sequelize.ENUM('pending', 'completed', 'cancelled', 'refunded'),
          allowNull: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }, { transaction });
      
      // Recreate order_items with INTEGER order_id
      await queryInterface.createTable('order_items', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        order_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'orders',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        product_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        sold_price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }, { transaction });
      
      // Recreate refunds
      await queryInterface.createTable('refunds', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        order_item_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'order_items',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        branch_id: {
          type: Sequelize.UUID,
          allowNull: false
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        reason: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        approved_by: {
          type: Sequelize.UUID,
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
      }, { transaction });
    });
  }
};

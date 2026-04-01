'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('refunds', 'status', {
            type: Sequelize.ENUM('pending', 'approved', 'rejected'),
            allowNull: false,
            defaultValue: 'pending',
            after: 'quantity'
        });

        await queryInterface.addColumn('refunds', 'refund_amount', {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
            after: 'status'
        });

        await queryInterface.addColumn('refunds', 'requested_by', {
            type: Sequelize.UUID,
            allowNull: false,
            after: 'refund_amount'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('refunds', 'requested_by');
        await queryInterface.removeColumn('refunds', 'refund_amount');
        await queryInterface.removeColumn('refunds', 'status');
    }
};

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const createError = require('http-errors');

const { server, logging } = require('./Config');
const db = require('./models');
const { ensureAdminUser } = require('./Config/bootstrap');
const apiRouter = express.Router();

const app = express();

// Global middlewares
app.use(helmet());
app.use(cors(server.cors));
app.options(/.*/, cors(server.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(morgan(logging.format));

// Health check
apiRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Auth routes
apiRouter.use('/auth', require('./controllers/auth.controller'));
// Categories routes
apiRouter.use('/categories', require('./controllers/categories.controller'));
// Subcategories routes
apiRouter.use('/subcategories', require('./controllers/subcategories.controller'));
// Warehouses routes
apiRouter.use('/warehouses', require('./controllers/warehouses.controller'));
// Branches routes
apiRouter.use('/branches', require('./controllers/branches.controller'));
// Transfer routes
apiRouter.use('/transfer', require('./controllers/transfer.controller'));
// Products routes
apiRouter.use('/products', require('./controllers/products.controller'));
// Customers routes
apiRouter.use('/customers', require('./controllers/customers.controller'));
// Orders routes
apiRouter.use('/orders', require('./controllers/orders.controller'));
// Refunds routes
apiRouter.use('/refunds', require('./controllers/refunds.controller'));
// Replacements routes
apiRouter.use('/replacements', require('./controllers/replacements.controller'));
// Cashier Discounts routes
apiRouter.use('/cashier-discounts', require('./controllers/cashierDiscounts.controller'));
// Shifts routes
apiRouter.use('/shifts', require('./controllers/shifts.controller'));
// Receipt Settings routes
apiRouter.use('/receipt-settings', require('./controllers/receiptSettings.controller'));
// Analytics routes
apiRouter.use('/analytics', require('./controllers/analytics.controller'));

// Mount API v1 router
app.use('/api/v1', apiRouter);



// Swagger docs (configured if available)
try {
  const { swaggerUi, swaggerSpec } = require('./Config/swagger');
  if (swaggerUi && swaggerSpec) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    // Serve raw swagger JSON for export
    app.get('/api-docs.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });
  }
} catch (_err) {
  // Swagger not configured yet; skipping
}

// 404 handler
app.use((_req, _res, next) => {
  next(createError(404, 'Resource not found'));
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Internal Server Error',
    status
  });
});

// Start server only when executed directly
if (require.main === module) {
  (async () => {
    try {
      console.log('🔄 Attempting to connect to database...');
      await db.sequelize.authenticate();
      console.log('✅ Database connected successfully!');

      // Auto sync is now disabled - use migrations instead
      await db.sequelize.sync();

      console.log('🔄 Ensuring admin user exists...');
      await ensureAdminUser();
      console.log('✅ Admin user check complete!');

      app.listen(server.port, server.host, () => {
        // eslint-disable-next-line no-console
        console.log(`🚀 Server running on http://${server.host}:${server.port}`);
        console.log(`📝 API available at: http://${server.host}:${server.port}/api/v1`);
        console.log(`📚 Docs available at: http://${server.host}:${server.port}/api-docs`);
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('❌ Failed to start server:', err);
      console.error('Error details:', err.message);
      console.error('Stack trace:', err.stack);
      process.exit(1);
    }
  })();
}

module.exports = app;



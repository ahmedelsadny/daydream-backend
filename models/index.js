const fs = require("fs");
const path = require("path");
const { Sequelize, DataTypes } = require("sequelize");
try {
  require("mysql2");
} catch (e) {
  // mysql2 not found, continuing as it might be using sqlite
}
const env = process.env.NODE_ENV || "development";
const config = require("../Config/config")[env];

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  config,
);

const db = {};

// Helper to load model files
const basename = path.basename(__filename);
fs.readdirSync(__dirname)
  .filter(
    (file) =>
      file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js",
  )
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

// Associations
const {
  User,
  Customer,
  Warehouse,
  Branch,
  Product,
  Category,
  SubCategory,
  Inventory,
  Order,
  OrderItem,
  Refund,
  Replacement,
  ReplacementOrderItem,
  CashierDiscount,
  ProductSerial,
  Transfer,
  TransferItem,
  Shift,
  ReceiptSettings,
  CashTransaction,
  HeldOrder,
  ExpenseCategory,
  Expense,
  AuditLog,
  Supplier,
  SupplierPayment,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  Stocktake,
  StocktakeItem,
  DamagedItem,
  ProductUnit,
  Promotion,
  CustomerCreditTransaction,
} = db;

if (User) {
  User.belongsTo(Branch, { foreignKey: "branchId" });
  User.belongsTo(Warehouse, { foreignKey: "warehouseId" });
}

if (Customer && Order) {
  Customer.hasMany(Order, { foreignKey: "customerId", onDelete: "SET NULL" });
  Order.belongsTo(Customer, { foreignKey: "customerId" });
}

if (Warehouse && Branch) {
  Warehouse.hasMany(Branch, { foreignKey: "warehouseId", onDelete: "CASCADE" });
  Branch.belongsTo(Warehouse, { foreignKey: "warehouseId" });
}

if (Branch && User) {
  Branch.hasMany(User, { foreignKey: "branchId" });
}

if (Branch && Order) {
  Branch.hasMany(Order, { foreignKey: "branchId", onDelete: "RESTRICT" });
  Order.belongsTo(Branch, { foreignKey: "branchId" });
}

if (Category && SubCategory) {
  Category.hasMany(SubCategory, {
    foreignKey: "categoryId",
    onDelete: "CASCADE",
  });
  SubCategory.belongsTo(Category, { foreignKey: "categoryId" });
}

if (Product && Category) {
  Product.belongsTo(Category, { foreignKey: "categoryId" });
}
if (Product && SubCategory) {
  Product.belongsTo(SubCategory, { foreignKey: "subCategoryId" });
}

if (Product && Inventory) {
  Product.hasMany(Inventory, { foreignKey: "productId", onDelete: "CASCADE" });
  Inventory.belongsTo(Product, { foreignKey: "productId" });
}

if (Warehouse && Inventory) {
  Warehouse.hasMany(Inventory, { foreignKey: "warehouseId" });
  Inventory.belongsTo(Warehouse, { foreignKey: "warehouseId" });
}

if (Branch && Inventory) {
  Branch.hasMany(Inventory, { foreignKey: "branchId" });
  Inventory.belongsTo(Branch, { foreignKey: "branchId" });
}

if (Order && User) {
  Order.belongsTo(User, { as: "cashier", foreignKey: "cashierId" });
}

if (Order && OrderItem) {
  Order.hasMany(OrderItem, { foreignKey: "orderId", onDelete: "CASCADE" });
  OrderItem.belongsTo(Order, { foreignKey: "orderId" });
}

if (OrderItem && Product) {
  OrderItem.belongsTo(Product, { foreignKey: "productId" });
  Product.hasMany(OrderItem, { foreignKey: "productId", onDelete: "RESTRICT" });
}

if (Refund && OrderItem) {
  Refund.belongsTo(OrderItem, { foreignKey: "orderItemId" });
}
if (Refund && Branch) {
  Refund.belongsTo(Branch, { foreignKey: "branchId" });
}
if (Refund && User) {
  Refund.belongsTo(User, { as: "requester", foreignKey: "requestedBy" });
  Refund.belongsTo(User, { as: "approver", foreignKey: "approvedBy" });
}

if (Replacement && OrderItem) {
  Replacement.belongsTo(OrderItem, {
    foreignKey: "originalOrderItemId",
    as: "originalOrderItem",
  });
}
if (Replacement && Order) {
  Replacement.belongsTo(Order, {
    foreignKey: "newOrderId",
    as: "newOrder",
  });
}
if (Replacement && Branch) {
  Replacement.belongsTo(Branch, { foreignKey: "branchId" });
}
if (Replacement && Customer) {
  Replacement.belongsTo(Customer, { foreignKey: "customerId" });
}
if (Replacement && User) {
  Replacement.belongsTo(User, {
    foreignKey: "processedBy",
    as: "processor",
  });
}

// New associations for multi-item replacements
if (Replacement && ReplacementOrderItem) {
  Replacement.hasMany(ReplacementOrderItem, {
    foreignKey: "replacementId",
    as: "ReplacementOrderItems",
  });
}

if (ReplacementOrderItem && OrderItem) {
  ReplacementOrderItem.belongsTo(OrderItem, {
    foreignKey: "orderItemId",
    as: "OrderItem",
  });
}

if (CashierDiscount && User) {
  CashierDiscount.belongsTo(User, {
    foreignKey: "cashierId",
    as: "cashier",
  });
  CashierDiscount.belongsTo(User, {
    foreignKey: "createdBy",
    as: "creator",
  });
}

if (Order && CashierDiscount) {
  Order.belongsTo(CashierDiscount, {
    foreignKey: "cashierDiscountId",
    as: "appliedDiscount",
  });
}

if (ProductSerial && Product) {
  ProductSerial.belongsTo(Product, { foreignKey: "productId" });
  Product.hasMany(ProductSerial, {
    foreignKey: "productId",
    onDelete: "RESTRICT",
  });
}

if (ProductSerial && Warehouse) {
  ProductSerial.belongsTo(Warehouse, { foreignKey: "warehouseId" });
  Warehouse.hasMany(ProductSerial, { foreignKey: "warehouseId" });
}

if (ProductSerial && Branch) {
  ProductSerial.belongsTo(Branch, { foreignKey: "branchId" });
  Branch.hasMany(ProductSerial, { foreignKey: "branchId" });
}

if (ProductSerial && OrderItem) {
  ProductSerial.belongsTo(OrderItem, { foreignKey: "orderItemId" });
  OrderItem.hasMany(ProductSerial, { foreignKey: "orderItemId" });
}

if (Transfer && Product) {
  Transfer.belongsTo(Product, { foreignKey: "productId" });
  Product.hasMany(Transfer, { foreignKey: "productId" });
}

if (Transfer && TransferItem) {
  Transfer.hasMany(TransferItem, {
    foreignKey: "transferId",
    onDelete: "CASCADE",
  });
  TransferItem.belongsTo(Transfer, { foreignKey: "transferId" });
}

if (TransferItem && Product) {
  TransferItem.belongsTo(Product, { foreignKey: "productId" });
  Product.hasMany(TransferItem, { foreignKey: "productId" });
}

if (Transfer && User) {
  Transfer.belongsTo(User, { as: "Requester", foreignKey: "requestedBy" });
  User.hasMany(Transfer, { foreignKey: "requestedBy" });
}

if (Transfer && Warehouse) {
  Transfer.belongsTo(Warehouse, {
    as: "FromWarehouse",
    foreignKey: "fromLocationId",
    constraints: false,
    scope: {
      fromLocationType: "warehouse",
    },
  });
  Transfer.belongsTo(Warehouse, {
    as: "ToWarehouse",
    foreignKey: "toLocationId",
    constraints: false,
    scope: {
      toLocationType: "warehouse",
    },
  });
}

if (Transfer && Branch) {
  Transfer.belongsTo(Branch, {
    as: "FromBranch",
    foreignKey: "fromLocationId",
    constraints: false,
    scope: {
      fromLocationType: "branch",
    },
  });
  Transfer.belongsTo(Branch, {
    as: "ToBranch",
    foreignKey: "toLocationId",
    constraints: false,
    scope: {
      toLocationType: "branch",
    },
  });
}

if (Shift && User) {
  Shift.belongsTo(User, { as: "cashier", foreignKey: "cashierId" });
  User.hasMany(Shift, { foreignKey: "cashierId" });
}

if (Shift && Branch) {
  Shift.belongsTo(Branch, { foreignKey: "branchId" });
  Branch.hasMany(Shift, { foreignKey: "branchId" });
}

if (CashTransaction && Shift) {
  CashTransaction.belongsTo(Shift, { foreignKey: "shiftId" });
  Shift.hasMany(CashTransaction, { foreignKey: "shiftId" });
}

if (CashTransaction && User) {
  CashTransaction.belongsTo(User, { as: "cashier", foreignKey: "cashierId" });
  User.hasMany(CashTransaction, { foreignKey: "cashierId" });
}

if (CashTransaction && Branch) {
  CashTransaction.belongsTo(Branch, { foreignKey: "branchId" });
  Branch.hasMany(CashTransaction, { foreignKey: "branchId" });
}

if (HeldOrder && Branch) {
  HeldOrder.belongsTo(Branch, { foreignKey: "branchId" });
  Branch.hasMany(HeldOrder, { foreignKey: "branchId" });
}

if (HeldOrder && User) {
  HeldOrder.belongsTo(User, { as: "cashier", foreignKey: "cashierId" });
  User.hasMany(HeldOrder, { foreignKey: "cashierId" });
}

if (HeldOrder && Customer) {
  HeldOrder.belongsTo(Customer, { foreignKey: "customerId" });
  Customer.hasMany(HeldOrder, { foreignKey: "customerId" });
}

if (Expense && ExpenseCategory) {
  Expense.belongsTo(ExpenseCategory, { as: "category", foreignKey: "categoryId" });
  ExpenseCategory.hasMany(Expense, { foreignKey: "categoryId" });
}

if (Expense && Branch) {
  Expense.belongsTo(Branch, { foreignKey: "branchId" });
  Branch.hasMany(Expense, { foreignKey: "branchId" });
}

if (Expense && User) {
  Expense.belongsTo(User, { as: "recorder", foreignKey: "userId" });
  User.hasMany(Expense, { foreignKey: "userId" });
}

if (Expense && Shift) {
  Expense.belongsTo(Shift, { foreignKey: "shiftId" });
  Shift.hasMany(Expense, { foreignKey: "shiftId" });
}

if (AuditLog && User) {
  AuditLog.belongsTo(User, { as: "user", foreignKey: "userId" });
  AuditLog.belongsTo(User, { as: "supervisor", foreignKey: "supervisorId" });
}

if (AuditLog && Branch) {
  AuditLog.belongsTo(Branch, { foreignKey: "branchId" });
  Branch.hasMany(AuditLog, { foreignKey: "branchId" });
}

// ==================== Phase 4: Suppliers, Purchases, Stocktaking, Packaging ====================
if (Supplier && PurchaseInvoice) {
  Supplier.hasMany(PurchaseInvoice, { foreignKey: "supplierId" });
  PurchaseInvoice.belongsTo(Supplier, { as: "supplier", foreignKey: "supplierId" });
}

if (Supplier && SupplierPayment) {
  Supplier.hasMany(SupplierPayment, { as: "payments", foreignKey: "supplierId" });
  SupplierPayment.belongsTo(Supplier, { as: "supplier", foreignKey: "supplierId" });
}

if (SupplierPayment && Branch) {
  SupplierPayment.belongsTo(Branch, { foreignKey: "branchId" });
}

if (SupplierPayment && User) {
  SupplierPayment.belongsTo(User, { as: "recorder", foreignKey: "recordedBy" });
}

if (PurchaseInvoice && PurchaseInvoiceItem) {
  PurchaseInvoice.hasMany(PurchaseInvoiceItem, { as: "items", foreignKey: "purchaseInvoiceId", onDelete: "CASCADE" });
  PurchaseInvoiceItem.belongsTo(PurchaseInvoice, { foreignKey: "purchaseInvoiceId" });
}

if (PurchaseInvoice && Branch) {
  PurchaseInvoice.belongsTo(Branch, { foreignKey: "branchId" });
}

if (PurchaseInvoice && Warehouse) {
  PurchaseInvoice.belongsTo(Warehouse, { foreignKey: "warehouseId" });
}

if (PurchaseInvoice && User) {
  PurchaseInvoice.belongsTo(User, { as: "receiver", foreignKey: "receivedBy" });
}

if (PurchaseInvoiceItem && Product) {
  PurchaseInvoiceItem.belongsTo(Product, { as: "product", foreignKey: "productId" });
  Product.hasMany(PurchaseInvoiceItem, { foreignKey: "productId" });
}

if (Stocktake && StocktakeItem) {
  Stocktake.hasMany(StocktakeItem, { as: "items", foreignKey: "stocktakeId", onDelete: "CASCADE" });
  StocktakeItem.belongsTo(Stocktake, { foreignKey: "stocktakeId" });
}

if (Stocktake && Branch) {
  Stocktake.belongsTo(Branch, { foreignKey: "branchId" });
}

if (Stocktake && Warehouse) {
  Stocktake.belongsTo(Warehouse, { foreignKey: "warehouseId" });
}

if (Stocktake && User) {
  Stocktake.belongsTo(User, { as: "initiator", foreignKey: "startedBy" });
  Stocktake.belongsTo(User, { as: "completer", foreignKey: "completedBy" });
}

if (StocktakeItem && Product) {
  StocktakeItem.belongsTo(Product, { as: "product", foreignKey: "productId" });
}

if (DamagedItem && Product) {
  DamagedItem.belongsTo(Product, { as: "product", foreignKey: "productId" });
  Product.hasMany(DamagedItem, { foreignKey: "productId" });
}

if (DamagedItem && Branch) {
  DamagedItem.belongsTo(Branch, { foreignKey: "branchId" });
}

if (DamagedItem && Warehouse) {
  DamagedItem.belongsTo(Warehouse, { foreignKey: "warehouseId" });
}

if (DamagedItem && User) {
  DamagedItem.belongsTo(User, { as: "reporter", foreignKey: "reportedBy" });
  DamagedItem.belongsTo(User, { as: "approver", foreignKey: "approvedBy" });
}

if (Product && ProductUnit) {
  Product.hasMany(ProductUnit, { as: "units", foreignKey: "productId", onDelete: "CASCADE" });
  ProductUnit.belongsTo(Product, { as: "product", foreignKey: "productId" });
}

// ==================== Phase 5: Promotions & Customer Credit ====================
if (Customer && CustomerCreditTransaction) {
  Customer.hasMany(CustomerCreditTransaction, { as: "creditTransactions", foreignKey: "customerId" });
  CustomerCreditTransaction.belongsTo(Customer, { as: "customer", foreignKey: "customerId" });
}

if (CustomerCreditTransaction && Order) {
  CustomerCreditTransaction.belongsTo(Order, { as: "order", foreignKey: "orderId" });
}

if (CustomerCreditTransaction && User) {
  CustomerCreditTransaction.belongsTo(User, { as: "recorder", foreignKey: "recordedBy" });
}

if (CustomerCreditTransaction && Branch) {
  CustomerCreditTransaction.belongsTo(Branch, { foreignKey: "branchId" });
}

if (Promotion && Product) {
  Promotion.belongsTo(Product, { as: "targetProduct", foreignKey: "targetProductId" });
}

if (Promotion && Category) {
  Promotion.belongsTo(Category, { as: "targetCategory", foreignKey: "targetCategoryId" });
}

if (Promotion && Branch) {
  Promotion.belongsTo(Branch, { foreignKey: "branchId" });
}

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

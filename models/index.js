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
} = db;

if (User) {
  User.belongsTo(Branch, { foreignKey: "branchId" });
  User.belongsTo(Warehouse, { foreignKey: "warehouseId" });
}

if (Customer && Order) {
  Customer.hasMany(Order, { foreignKey: "customerId", onDelete: "CASCADE" });
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
  Branch.hasMany(Order, { foreignKey: "branchId", onDelete: "CASCADE" });
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
  Product.hasMany(OrderItem, { foreignKey: "productId" });
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
    onDelete: "CASCADE",
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

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

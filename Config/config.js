require("dotenv").config();
const path = require("path");

const base = {
  dialect: "sqlite",
  storage: path.join(__dirname, "../database.sqlite"),
  logging: false,
  define: {
    underscored: true,
    timestamps: true,
  },
};

module.exports = {
  development: { ...base },
  staging: { ...base },
  production: { ...base },
};

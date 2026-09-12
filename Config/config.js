require("dotenv").config();
const path = require("path");

const dialect = process.env.DB_DIALECT || "sqlite";

const base = dialect === "mysql"
  ? {
      dialect: "mysql",
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      username: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "daydream_db",
      logging: false,
      define: {
        underscored: true,
        timestamps: true,
      },
    }
  : {
      dialect: "sqlite",
      storage: process.env.DB_STORAGE || path.join(__dirname, "../database.sqlite"),
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

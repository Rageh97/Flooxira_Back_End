const { Sequelize } = require('sequelize');

console.log("===== DATABASE CONFIG =====");
console.log("DB_DIALECT:", process.env.DB_DIALECT);
console.log("MYSQL_DATABASE:", process.env.MYSQL_DATABASE);
console.log("MYSQL_USER:", process.env.MYSQL_USER);
console.log("MYSQL_HOST:", process.env.MYSQL_HOST);
console.log("MYSQL_PORT:", process.env.MYSQL_PORT);
console.log("===========================");

const DIALECT = process.env.DB_DIALECT ; // 'mysql' for production

let sequelize;
if (DIALECT === 'mysql') {
  console.log("➡ Using MySQL Database");
  sequelize = new Sequelize(
    process.env.MYSQL_DATABASE,
    process.env.MYSQL_USER,
    process.env.MYSQL_PASSWORD,
    {
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT) || 3306,
      dialect: 'mysql',
      logging: false,
      dialectOptions: {
        ssl: { rejectUnauthorized: false },
        allowPublicKeyRetrieval: true
      },
    }
  );
} else {
  console.log("➡ Using SQLite Database");
  const storage = process.env.SQLITE_PATH || 'data/dev.sqlite';
  sequelize = new Sequelize({ dialect: 'sqlite', storage, logging: false });
}

module.exports = { sequelize };

const { Sequelize } = require('sequelize');

const DIALECT = process.env.DB_DIALECT || 'sqlite'; // 'mysql' for production

let sequelize;
if (DIALECT === 'mysql') {
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
  const storage = process.env.SQLITE_PATH || 'data/dev.sqlite';
  sequelize = new Sequelize({ dialect: 'sqlite', storage, logging: false });
}

module.exports = { sequelize };

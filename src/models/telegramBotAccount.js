const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const crypto = require('../utils/crypto');

const TelegramBotAccount = sequelize.define('TelegramBotAccount', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		references: { model: 'users', key: 'id' }
	},
	botUserId: {
		type: DataTypes.STRING,
		allowNull: true
	},
	username: {
		type: DataTypes.STRING,
		allowNull: true
	},
	name: {
		type: DataTypes.STRING,
		allowNull: true
	},
	token: {
		type: DataTypes.TEXT,
		allowNull: true,
		get() {
			const rawValue = this.getDataValue('token');
			return rawValue ? crypto.decrypt(rawValue) : null;
		},
		set(value) {
			if (value) this.setDataValue('token', crypto.encrypt(value));
			else this.setDataValue('token', null);
		}
	},
	webhookSecret: {
		type: DataTypes.STRING,
		allowNull: true
	},
	isActive: {
		type: DataTypes.BOOLEAN,
		defaultValue: true
	},
	lastSyncAt: {
		type: DataTypes.DATE,
		allowNull: true
	}
}, {
	tableName: 'telegram_bot_accounts',
	timestamps: true
});

module.exports = TelegramBotAccount;


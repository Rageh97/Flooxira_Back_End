const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'text',
    validate: {
      isIn: [['text', 'link', 'photo', 'video']]
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  linkUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mediaUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hashtags: {
    type: DataTypes.STRING,
    allowNull: true
  },
  format: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'feed',
    validate: {
      isIn: [['feed', 'reel', 'story']]
    }
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'draft',
    validate: {
      isIn: [['draft', 'scheduled', 'published', 'failed']]
    }
  },
  fbPostId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Instagram fields
  instagramPostId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // TikTok fields
  tiktokPostId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // YouTube fields
  youtubeVideoId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // LinkedIn fields
  linkedinPostId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Pinterest fields
  pinterestPostId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  pinterestBoardId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Platform selection
  platforms: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['facebook']
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'posts',
  timestamps: true
});

User.hasMany(Post, { foreignKey: 'userId' });
Post.belongsTo(User, { foreignKey: 'userId' });

module.exports = { Post };



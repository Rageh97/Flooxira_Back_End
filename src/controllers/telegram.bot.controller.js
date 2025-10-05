const tgBot = require('../services/telegramBotService');
const TelegramBotAccount = require('../models/telegramBotAccount');
const TelegramChat = require('../models/telegramChat');

async function connect(req, res) {
	try {
		const userId = req.userId;
    const { token, baseUrl } = req.body || {};
    console.log('[TG-Bot] Connect request:', { userId, hasToken: !!token, baseUrl });
		
		if (!token) return res.status(400).json({ success: false, message: 'token required' });
		
    const forwardedProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0]?.trim();
    const forwardedHost = (req.headers['x-forwarded-host'] || '').toString().split(',')[0]?.trim();
    const proto = forwardedProto || req.protocol || 'http';
    const host = forwardedHost || req.get('host');
    const inferredBase = host ? `${proto}://${host}` : '';
    const publicBase = baseUrl || process.env.PUBLIC_BASE_URL || inferredBase;
    console.log('[TG-Bot] Using webhook base URL:', publicBase);
		
		const info = await tgBot.connectBot(userId, token, publicBase);
		console.log('[TG-Bot] Connect success:', info);
		
		return res.json({ success: true, bot: info });
	} catch (e) {
		console.error('[TG-Bot] Connect failed:', e.message, e.stack);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function info(req, res) {
	const userId = req.userId;
	const record = await tgBot.getActiveBot(userId);
	if (!record) return res.json({ success: true, bot: null });
	return res.json({ success: true, bot: { botUserId: record.botUserId, username: record.username, name: record.name } });
}

async function testBot(req, res) {
	try {
		const userId = req.userId;
		const bot = await tgBot.getActiveBot(userId);
		if (!bot || !bot.token) {
			return res.json({ success: false, message: 'No active bot found' });
		}
		
		// Test getMe to verify bot is working
		const me = await tgBot.verifyToken(bot.token);
		return res.json({ 
			success: true, 
			bot: { 
				id: me.id, 
				username: me.username, 
				name: me.first_name,
				can_join_groups: me.can_join_groups,
				can_read_all_group_messages: me.can_read_all_group_messages
			} 
		});
	} catch (e) {
		console.error('[TG-Bot] Test bot error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function webhook(req, res) {
	try {
		const userId = Number(req.params.userId);
		const record = await TelegramBotAccount.findOne({ where: { userId, isActive: true }, order: [['updatedAt', 'DESC']] });
		if (!record) {
			console.warn('[TG-Bot] Webhook: No active bot found for user', userId);
			return res.status(404).json({});
		}
		
		const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
		if (!secretHeader || secretHeader !== record.webhookSecret) {
			console.warn('[TG-Bot] Webhook: Invalid secret token');
			return res.status(401).json({});
		}
		
		const update = req.body;
		console.log('[TG-Bot] Webhook received update:', JSON.stringify(update, null, 2));
		
		// Process the update asynchronously
    if (update && update.message) {
      // Don't await - process in background
      tgBot.handleIncomingMessage(userId, update).catch(err => {
        console.error('[TG-Bot] Error processing webhook message:', err.message);
      });
    }
    // Handle inline button presses (callback queries)
    if (update && update.callback_query) {
      tgBot.handleCallbackQuery(userId, update.callback_query).catch(err => {
        console.error('[TG-Bot] Error processing callback query:', err.message);
      });
    }
		
		// Always respond quickly to Telegram
		res.status(200).json({ ok: true });
	} catch (e) {
		console.error('[TG-Bot] Webhook error:', e.message);
		res.status(200).json({ ok: true });
	}
}

async function sendMessage(req, res) {
	try {
		const userId = req.userId;
		const { chatId, text } = req.body || {};
		if (!chatId || !text) return res.status(400).json({ success: false, message: 'chatId and text required' });
		
		const result = await tgBot.sendMessage(userId, chatId, text);
		return res.json({ success: true, message: result });
	} catch (e) {
		console.error('[TG-Bot] Send message error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function getChat(req, res) {
	try {
		const userId = req.userId;
		const { chatId } = req.params;
		if (!chatId) return res.status(400).json({ success: false, message: 'chatId required' });
		
		const chat = await tgBot.getChat(userId, chatId);
		return res.json({ success: true, chat });
	} catch (e) {
		console.error('[TG-Bot] Get chat error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function getChatAdmins(req, res) {
	try {
		const userId = req.userId;
		const { chatId } = req.params;
		if (!chatId) return res.status(400).json({ success: false, message: 'chatId required' });
		
		const admins = await tgBot.getChatAdministrators(userId, chatId);
		return res.json({ success: true, administrators: admins });
	} catch (e) {
		console.error('[TG-Bot] Get admins error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function promoteMember(req, res) {
	try {
		const userId = req.userId;
		const { chatId, memberId, permissions } = req.body || {};
		if (!chatId || !memberId) return res.status(400).json({ success: false, message: 'chatId and memberId required' });
		
		const result = await tgBot.promoteChatMember(userId, chatId, memberId, permissions);
		return res.json({ success: true, result });
	} catch (e) {
		console.error('[TG-Bot] Promote member error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function getUpdates(req, res) {
	try {
		const userId = req.userId;
		const { offset, limit } = req.query;
		
		const updates = await tgBot.getUpdates(userId, Number(offset) || 0, Number(limit) || 100);
		return res.json({ success: true, updates });
	} catch (e) {
		console.error('[TG-Bot] Get updates error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function getChatHistory(req, res) {
	try {
		const userId = req.userId;
		const { chatId, limit = 50, offset = 0 } = req.query;
		
		const whereClause = { userId };
		if (chatId) whereClause.chatId = chatId;
		
		const chats = await TelegramChat.findAll({
			where: whereClause,
			order: [['timestamp', 'DESC']],
			limit: Number(limit),
			offset: Number(offset)
		});
		
		return res.json({ success: true, chats });
	} catch (e) {
		console.error('[TG-Bot] Get chat history error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function getChatStats(req, res) {
	try {
		const userId = req.userId;
		const { Op } = require('sequelize');
		
		const totalMessages = await TelegramChat.count({ where: { userId } });
		const incomingMessages = await TelegramChat.count({ where: { userId, messageType: 'incoming' } });
		const outgoingMessages = await TelegramChat.count({ where: { userId, messageType: 'outgoing' } });
		
		const knowledgeBaseResponses = await TelegramChat.count({ 
			where: { userId, responseSource: 'fuse' } 
		});
		const aiResponses = await TelegramChat.count({ 
			where: { userId, responseSource: { [Op.in]: ['openai', 'gemini'] } } 
		});
		const fallbackResponses = await TelegramChat.count({ 
			where: { userId, responseSource: 'fallback' } 
		});
		
		const uniqueChats = await TelegramChat.count({
			where: { userId },
			distinct: true,
			col: 'chatId'
		});
		
		return res.json({
			success: true,
			stats: {
				totalMessages,
				incomingMessages,
				outgoingMessages,
				totalContacts: uniqueChats,
				knowledgeBaseResponses,
				aiResponses,
				fallbackResponses
			}
		});
	} catch (e) {
		console.error('[TG-Bot] Get stats error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function getChatContacts(req, res) {
	try {
		const userId = req.userId;
		
		const contacts = await TelegramChat.findAll({
			where: { userId },
			attributes: [
				'chatId',
				'chatType',
				'chatTitle',
				[TelegramChat.sequelize.fn('COUNT', TelegramChat.sequelize.col('id')), 'messageCount'],
				[TelegramChat.sequelize.fn('MAX', TelegramChat.sequelize.col('timestamp')), 'lastMessageTime']
			],
			group: ['chatId', 'chatType', 'chatTitle'],
			order: [[TelegramChat.sequelize.fn('MAX', TelegramChat.sequelize.col('timestamp')), 'DESC']]
		});
		
		return res.json({ success: true, contacts });
	} catch (e) {
		console.error('[TG-Bot] Get contacts error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function exportMembers(req, res) {
	try {
		const userId = req.userId;
		const { chatId } = req.params;
		
		if (!chatId) {
			return res.status(400).json({ success: false, message: 'chatId is required' });
		}
		
		// Get chat info for title
		let chatTitle = 'Unknown Chat';
		try {
			const chatInfo = await tgBot.getChat(userId, chatId);
			chatTitle = chatInfo.title || chatInfo.first_name || `Chat_${chatId}`;
		} catch (e) {
			console.warn('[TG-Bot] Could not get chat title:', e.message);
		}
		
		const result = await tgBot.exportChatMembers(userId, chatId, chatTitle);
		
		if (result.success) {
			// Set headers for file download
			res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
			
			// Send file
			const fs = require('fs');
			const fileStream = fs.createReadStream(result.filepath);
			
			fileStream.pipe(res);
			
			// Clean up file after sending
			fileStream.on('end', () => {
				try {
					fs.unlinkSync(result.filepath);
					console.log('[TG-Bot] Cleaned up exported file:', result.filename);
				} catch (cleanupError) {
					console.warn('[TG-Bot] Failed to cleanup file:', cleanupError.message);
				}
			});
		} else {
			return res.status(400).json({ success: false, message: 'Export failed' });
		}
	} catch (e) {
		console.error('[TG-Bot] Export members error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function getChatMembersInfo(req, res) {
	try {
		const userId = req.userId;
		const { chatId } = req.params;
		
		if (!chatId) {
			return res.status(400).json({ success: false, message: 'chatId is required' });
		}
		
		const membersData = await tgBot.getChatMembers(userId, chatId);
		return res.json({ success: true, ...membersData });
	} catch (e) {
		console.error('[TG-Bot] Get members info error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

async function getBotChats(req, res) {
	try {
		const userId = req.userId;
		const chatsData = await tgBot.getBotChats(userId);
		return res.json({ success: true, ...chatsData });
	} catch (e) {
		console.error('[TG-Bot] Get bot chats error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

// Send template message
async function sendTemplateMessage(req, res) {
	try {
		const userId = req.userId;
		const { templateId, chatId, variables } = req.body;
		
		if (!templateId || !chatId) {
			return res.status(400).json({ success: false, message: 'templateId and chatId are required' });
		}

		const bot = await tgBot.getActiveBot(userId);
		if (!bot || !bot.token) {
			return res.status(400).json({ success: false, message: 'No active bot found' });
		}

		// Get template with buttons
		const { TelegramTemplate, TelegramTemplateButton } = require('../models/telegramTemplate');
		const template = await TelegramTemplate.findOne({
			where: { id: templateId, userId, isActive: true },
			include: [
				{
					model: TelegramTemplateButton,
					as: 'buttons',
					where: { parentButtonId: null, isActive: true },
					required: false,
					include: [
						{
							model: TelegramTemplateButton,
							as: 'ChildButtons',
							where: { isActive: true },
							required: false
						}
					]
				}
			]
		});

		if (!template) {
			return res.status(404).json({ success: false, message: 'Template not found' });
		}

		const result = await tgBot.sendTemplateMessage(bot.token, chatId, template, variables || {});
		
		// Log usage
		await tgBot.logTemplateUsage(
			templateId, 
			userId, 
			chatId, 
			result.result?.message_id, 
			variables || {}, 
			true, 
			null
		);

		return res.json({ success: true, data: result });
	} catch (e) {
		console.error('[TG-Bot] Send template message error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

// Get active templates for bot
async function getActiveTemplates(req, res) {
	try {
		const userId = req.userId;
		const templates = await tgBot.getActiveTemplates(userId);
		return res.json({ success: true, data: templates });
	} catch (e) {
		console.error('[TG-Bot] Get active templates error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

// Find matching template for message
async function findMatchingTemplate(req, res) {
	try {
		const userId = req.userId;
		const { message } = req.body;
		
		if (!message) {
			return res.status(400).json({ success: false, message: 'message is required' });
		}

		const template = await tgBot.findMatchingTemplate(userId, message);
		return res.json({ success: true, data: template });
	} catch (e) {
		console.error('[TG-Bot] Find matching template error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

// Test template matching
async function testTemplateMatching(req, res) {
	try {
		const userId = req.userId;
		const { message } = req.body;
		
		if (!message) {
			return res.status(400).json({ success: false, message: 'message is required' });
		}

		const template = await tgBot.findMatchingTemplate(userId, message);
		
		if (template) {
			return res.json({ 
				success: true, 
				data: {
					found: true,
					template: {
						id: template.id,
						name: template.name,
						bodyText: template.bodyText,
						triggerKeywords: template.triggerKeywords
					}
				}
			});
		} else {
			return res.json({ 
				success: true, 
				data: {
					found: false,
					message: 'No matching template found'
				}
			});
		}
	} catch (e) {
		console.error('[TG-Bot] Test template matching error:', e.message);
		return res.status(400).json({ success: false, message: e.message });
	}
}

module.exports = { 
	connect, webhook, info, testBot, sendMessage, getChat, getChatAdmins, promoteMember, 
	getUpdates, getChatHistory, getChatStats, getChatContacts, exportMembers, getChatMembersInfo, getBotChats,
	sendTemplateMessage, getActiveTemplates, findMatchingTemplate, testTemplateMatching
};


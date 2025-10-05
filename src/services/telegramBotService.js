const axios = require('axios');
const crypto = require('crypto');
const TelegramBotAccount = require('../models/telegramBotAccount');
const TelegramChat = require('../models/telegramChat');
const { TelegramTemplate, TelegramTemplateButton, TelegramTemplateUsage } = require('../models/telegramTemplate');
const { searchOrAnswer } = require('./botSearchService');
const conversationService = require('./conversationService');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

class TelegramBotService {
	constructor() {}

	generateWebhookSecret() {
		return crypto.randomBytes(16).toString('hex');
	}

	async verifyToken(token) {
		const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`;
		console.log('[TG-Bot] Verifying token with URL:', url.replace(token, 'HIDDEN'));
		
		try {
			const resp = await axios.get(url, { timeout: 15000 });
			console.log('[TG-Bot] getMe response:', { ok: resp.data?.ok, result: resp.data?.result });
			
			if (!resp.data?.ok) throw new Error('Invalid bot token');
			return resp.data.result;
		} catch (err) {
			console.error('[TG-Bot] Token verification failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Invalid bot token: ' + err.message);
		}
	}

	async setWebhook(token, webhookUrl, secretToken) {
		const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/setWebhook`;
		const params = { url: webhookUrl, secret_token: secretToken, drop_pending_updates: false };
		console.log('[TG-Bot] Setting webhook:', { webhookUrl, hasSecret: !!secretToken });
		
		try {
			const resp = await axios.post(url, params, { timeout: 15000 });
			console.log('[TG-Bot] Webhook response:', { ok: resp.data?.ok, description: resp.data?.description });
			
			if (!resp.data?.ok) throw new Error(resp.data?.description || 'Failed to set webhook');
			return true;
		} catch (err) {
			console.error('[TG-Bot] Webhook setting failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Failed to set webhook: ' + err.message);
		}
	}

	async deleteWebhook(token) {
		const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/deleteWebhook`;
		const resp = await axios.post(url, {}, { timeout: 15000 });
		return !!resp.data?.ok;
	}

	async connectBot(userId, token, baseUrl) {
		const me = await this.verifyToken(token);
		const secret = this.generateWebhookSecret();
		const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/telegram-bot/webhook/${userId}`;
		
		// Only set webhook if URL is HTTPS (Telegram requirement)
		let webhookSet = false;
		if (webhookUrl.startsWith('https://')) {
			try {
				await this.setWebhook(token, webhookUrl, secret);
				webhookSet = true;
				console.log('[TG-Bot] Webhook set successfully');
			} catch (err) {
				console.warn('[TG-Bot] Webhook setting failed, continuing without webhook:', err.message);
			}
		} else {
			console.log('[TG-Bot] Skipping webhook setup for non-HTTPS URL:', webhookUrl);
		}
		
		const [record] = await TelegramBotAccount.findOrCreate({
			where: { userId, botUserId: String(me.id) },
			defaults: { userId, botUserId: String(me.id), username: me.username, name: me.first_name || '', token, webhookSecret: secret, isActive: true }
		});
		if (!record.isNewRecord) {
			record.username = me.username;
			record.name = me.first_name || '';
			record.token = token;
			record.webhookSecret = secret;
			record.isActive = true;
			await record.save();
		}
		
		return { 
			botUserId: String(me.id), 
			username: me.username, 
			name: me.first_name || '', 
			webhookSet 
		};
	}

	async getActiveBot(userId) {
		return await TelegramBotAccount.findOne({ where: { userId, isActive: true }, order: [['updatedAt', 'DESC']] });
	}

	async sendMessage(userId, chatId, text) {
		const bot = await this.getActiveBot(userId);
		if (!bot || !bot.token) throw new Error('No active bot found');
		
		const url = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/sendMessage`;
		const params = { chat_id: chatId, text, parse_mode: 'HTML' };
		console.log('[TG-Bot] Sending message to:', chatId, 'text length:', text.length);
		
		try {
			const resp = await axios.post(url, params, { timeout: 15000 });
			console.log('[TG-Bot] sendMessage response:', { ok: resp.data?.ok, description: resp.data?.description });
			
			if (!resp.data?.ok) throw new Error(resp.data?.description || 'Failed to send message');
			return resp.data.result;
		} catch (err) {
			console.error('[TG-Bot] Send message failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Failed to send message: ' + (err.response?.data?.description || err.message));
		}
	}

	async getChat(userId, chatId) {
		const bot = await this.getActiveBot(userId);
		if (!bot || !bot.token) throw new Error('No active bot found');
		
		const url = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getChat`;
		const params = { chat_id: chatId };
		console.log('[TG-Bot] Getting chat info for:', chatId);
		
		try {
			const resp = await axios.post(url, params, { timeout: 15000 });
			console.log('[TG-Bot] getChat response:', { ok: resp.data?.ok, description: resp.data?.description });
			
			if (!resp.data?.ok) throw new Error(resp.data?.description || 'Failed to get chat');
			return resp.data.result;
		} catch (err) {
			console.error('[TG-Bot] Get chat failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Failed to get chat: ' + (err.response?.data?.description || err.message));
		}
	}

	async answerCallbackQuery(token, callbackQueryId, text = '', showAlert = false) {
		const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/answerCallbackQuery`;
		const params = { callback_query_id: callbackQueryId };
		if (text) params.text = text;
		if (showAlert) params.show_alert = true;
		await axios.post(url, params, { timeout: 10000 });
	}

	async handleCallbackQuery(userId, callbackQuery) {
		const bot = await this.getActiveBot(userId);
		if (!bot || !bot.token) throw new Error('No active bot found');

		const data = String(callbackQuery.data || '').trim();
		const message = callbackQuery.message;
		const chatId = message?.chat?.id;
		const messageId = message?.message_id;

		// Acknowledge the button press quickly
		try { await this.answerCallbackQuery(bot.token, callbackQuery.id); } catch {}

		if (!chatId || !messageId) return;

		try {
			// Open submenu for a specific button
			if (/^btn:\d+$/.test(data)) {
				const buttonId = Number(data.split(':')[1]);
				const button = await TelegramTemplateButton.findByPk(buttonId, { include: [{ model: TelegramTemplateButton, as: 'ChildButtons' }] });
				if (!button) return;

				if (Array.isArray(button.ChildButtons) && button.ChildButtons.length > 0) {
					const rows = this.buildInlineKeyboard(button.ChildButtons, 2, true);
					rows.push([{ text: '⬅️ رجوع', callback_data: `menu:${button.templateId}` }, { text: '🏠 الرئيسية', callback_data: `menu:${button.templateId}` }]);
					await axios.post(`https://api.telegram.org/bot${encodeURIComponent(bot.token)}/editMessageText`, {
						chat_id: chatId,
						message_id: messageId,
						text: `<b>${button.text}</b>\n\nاختر خيارًا:`,
						parse_mode: 'HTML',
						reply_markup: { inline_keyboard: rows }
					});
					return;
				}

				// Leaf button actions
				if (button.buttonType === 'url' && button.url) {
					await this.sendMessage(userId, String(chatId), `🔗 ${button.url}`);
					return;
				}
				if (button.buttonType === 'callback' && button.callbackData) {
					await this.sendMessage(userId, String(chatId), String(button.callbackData));
					return;
				}
				await this.sendMessage(userId, String(chatId), `Selected: ${button.text}`);
				return;
			}

			// Show template root menu
			if (/^menu:\d+$/.test(data)) {
				const templateId = Number(data.split(':')[1]);
				const template = await TelegramTemplate.findByPk(templateId, { include: [{ model: TelegramTemplateButton, as: 'buttons', where: { parentButtonId: null }, required: false }] });
				if (!template) return;
				const rows = this.buildInlineKeyboard(template.buttons || [], 2, false);
				await axios.post(`https://api.telegram.org/bot${encodeURIComponent(bot.token)}/editMessageText`, {
					chat_id: chatId,
					message_id: messageId,
					text: this.formatTemplateMessage(template),
					parse_mode: 'HTML',
					reply_markup: { inline_keyboard: rows }
				});
				return;
			}

			// Fallback
			await this.sendMessage(userId, String(chatId), data ? `Selected: ${data}` : 'Button pressed');
		} catch (e) {
			console.error('[TG-Bot] handleCallbackQuery error:', e.message);
		}
	}

	async getChatAdministrators(userId, chatId) {
		const bot = await this.getActiveBot(userId);
		if (!bot || !bot.token) throw new Error('No active bot found');
		
		const url = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getChatAdministrators`;
		const params = { chat_id: chatId };
		console.log('[TG-Bot] Getting admins for chat:', chatId);
		
		try {
			const resp = await axios.post(url, params, { timeout: 15000 });
			console.log('[TG-Bot] getChatAdministrators response:', { ok: resp.data?.ok, description: resp.data?.description });
			
			if (!resp.data?.ok) throw new Error(resp.data?.description || 'Failed to get administrators');
			return resp.data.result;
		} catch (err) {
			console.error('[TG-Bot] Get admins failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Failed to get administrators: ' + (err.response?.data?.description || err.message));
		}
	}

	async promoteChatMember(userId, chatId, memberId, permissions = {}) {
		const bot = await this.getActiveBot(userId);
		if (!bot || !bot.token) throw new Error('No active bot found');
		
		// Check if trying to promote the bot itself
		if (memberId === bot.botUserId) {
			throw new Error('❌ Cannot promote the bot itself. The bot needs to be promoted by a human admin first. Please ask a group admin to promote the bot manually.');
		}
		
		// First, check the chat type to ensure it's a supergroup or channel
		try {
			const chatInfo = await this.getChat(userId, chatId);
			console.log('[TG-Bot] Chat info:', { type: chatInfo.type, title: chatInfo.title });
			
			if (chatInfo.type === 'group') {
				throw new Error('Member promotion is only available for supergroups and channels. This appears to be a regular group. Please convert it to a supergroup first.');
			}
			
			if (chatInfo.type !== 'supergroup' && chatInfo.type !== 'channel') {
				throw new Error(`Member promotion is not available for ${chatInfo.type} chats. Only supergroups and channels support member promotion.`);
			}
		} catch (chatErr) {
			console.error('[TG-Bot] Chat type check failed:', chatErr.message);
			// If we can't get chat info, we'll still try the promotion but with a warning
			console.warn('[TG-Bot] Could not verify chat type, proceeding with promotion attempt...');
		}
		
		const url = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/promoteChatMember`;
		
		// Build parameters object - only include permissions that are true
		const params = { 
			chat_id: chatId, 
			user_id: memberId
		};
		
		// Add permissions only if they are true (don't send false values)
		if (permissions.can_manage_chat) params.can_manage_chat = true;
		if (permissions.can_delete_messages) params.can_delete_messages = true;
		if (permissions.can_manage_video_chats) params.can_manage_video_chats = true;
		if (permissions.can_restrict_members) params.can_restrict_members = true;
		if (permissions.can_promote_members) params.can_promote_members = true;
		if (permissions.can_change_info) params.can_change_info = true;
		if (permissions.can_invite_users) params.can_invite_users = true;
		if (permissions.can_pin_messages) params.can_pin_messages = true;
		if (permissions.can_post_messages) params.can_post_messages = true;
		if (permissions.can_edit_messages) params.can_edit_messages = true;
		if (permissions.can_manage_topics) params.can_manage_topics = true;
		if (permissions.can_post_stories) params.can_post_stories = true;
		if (permissions.can_edit_stories) params.can_edit_stories = true;
		if (permissions.can_delete_stories) params.can_delete_stories = true;
		if (permissions.can_manage_direct_messages) params.can_manage_direct_messages = true;
		
		console.log('[TG-Bot] Promoting member with params:', params);
		
		try {
			const resp = await axios.post(url, params, { timeout: 15000 });
			console.log('[TG-Bot] Promote response:', { ok: resp.data?.ok, result: resp.data?.result });
			
			if (!resp.data?.ok) {
				console.error('[TG-Bot] Promote failed:', resp.data);
				
				// Provide specific error messages for common issues
				if (resp.data?.description?.includes('supergroup and channel chats only')) {
					throw new Error('❌ Member promotion is only available for supergroups and channels. Regular groups do not support this feature. Please convert your group to a supergroup first.');
				}
				
				if (resp.data?.description?.includes('not enough rights')) {
					throw new Error('❌ The bot does not have sufficient permissions to promote members. Make sure the bot is an administrator with "Promote Members" permission.');
				}
				
				if (resp.data?.description?.includes('user not found')) {
					throw new Error('❌ User not found. Make sure the user ID is correct and the user has interacted with the bot or is a member of the chat.');
				}
				
				if (resp.data?.description?.includes("can't promote self")) {
					throw new Error('❌ Cannot promote the bot itself. The bot needs to be promoted by a human admin first. Please ask a group admin to promote the bot manually.');
				}
				
				throw new Error(resp.data?.description || 'Failed to promote member');
			}
			return resp.data.result;
		} catch (err) {
			console.error('[TG-Bot] Promote member failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Failed to promote member: ' + (err.response?.data?.description || err.message));
		}
	}

	async getUpdates(userId, offset = 0, limit = 100) {
		const bot = await this.getActiveBot(userId);
		if (!bot || !bot.token) throw new Error('No active bot found');
		
		const url = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getUpdates`;
		const params = { offset, limit, timeout: 10 };
		console.log('[TG-Bot] Getting updates with params:', params);
		
		try {
			const resp = await axios.post(url, params, { timeout: 15000 });
			console.log('[TG-Bot] getUpdates response:', { 
				ok: resp.data?.ok, 
				updateCount: resp.data?.result?.length,
				updates: resp.data?.result?.map(u => ({
					id: u.update_id,
					fromId: u.message?.from?.id,
					fromUsername: u.message?.from?.username,
					chatId: u.message?.chat?.id,
					text: u.message?.text
				}))
			});
			
			if (!resp.data?.ok) throw new Error(resp.data?.description || 'Failed to get updates');
			return resp.data.result;
		} catch (err) {
			console.error('[TG-Bot] Get updates failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Failed to get updates: ' + (err.response?.data?.description || err.message));
		}
	}

	async handleIncomingMessage(userId, update) {
		try {
			const message = update.message;
			if (!message || !message.text) return; // Skip non-text messages
			
			const chatId = String(message.chat.id);
			const fromId = String(message.from.id);
			const text = message.text.trim();
			
			console.log(`[TG-Bot] Processing message from ${fromId} in chat ${chatId}: ${text}`);
			
			// Save incoming message
			await this.logChatMessage(userId, chatId, message.chat.type, message.chat.title || message.chat.first_name, 'incoming', text);
			
			// Skip if it's a command (starts with /)
			if (text.startsWith('/')) {
				console.log('[TG-Bot] Skipping command message');
				return;
			}
			
			let response = '';
			let responseSource = 'fallback';
			let knowledgeBaseMatch = null;
			
			// Use the same search logic as WhatsApp
			try {
				console.log(`[TG-Bot] BotData search start for user ${userId}...`);
				const result = await searchOrAnswer(userId, text, 0.5, 3, fromId);
				console.log(`[TG-Bot] BotData search result source=`, result?.source);
				
				if (result?.source === 'fuse' && Array.isArray(result.matches) && result.matches.length > 0) {
					// Use knowledge base match
					const match = result.matches[0];
					response = this.formatBotDataResponse(match, text);
					responseSource = 'fuse';
					knowledgeBaseMatch = JSON.stringify(match);
					console.log('[TG-Bot] Using knowledge base response');
				} else if (result?.source === 'openai' || result?.source === 'gemini') {
					// Use AI response
					response = result.answer || 'Sorry, I could not generate a response.';
					responseSource = result.source;
					console.log(`[TG-Bot] Using ${result.source} response`);
				} else if (result?.source === 'small_talk') {
					// Use small talk response
					response = result.answer;
					responseSource = 'small_talk';
					console.log('[TG-Bot] Using small talk response');
				} else {
					// Fallback
					response = 'Sorry, I could not find relevant information. Please try rephrasing your question.';
					responseSource = 'fallback';
					console.log('[TG-Bot] Using fallback response');
				}
			} catch (searchError) {
				console.error('[TG-Bot] Search error:', searchError.message);
				response = 'Sorry, I encountered an error while processing your message.';
				responseSource = 'error';
			}
			
			// Send response
			if (response && response.trim()) {
				try {
					await this.sendMessage(userId, chatId, response);
					
					// Log outgoing message
					await this.logChatMessage(userId, chatId, message.chat.type, message.chat.title || message.chat.first_name, 'outgoing', response, responseSource, knowledgeBaseMatch);
					
					console.log(`[TG-Bot] Sent response to ${chatId}: ${response.substring(0, 100)}...`);
				} catch (sendError) {
					console.error('[TG-Bot] Failed to send response:', sendError.message);
				}
			}
		} catch (error) {
			console.error('[TG-Bot] Error handling incoming message:', error.message);
		}
	}

	formatBotDataResponse(match, query) {
		// Format the bot data response similar to WhatsApp
		const data = match.data || {};
		
		// Try to find relevant fields
		const name = data.name || data.اسم || data.product_name || data.اسم_المنتج;
		const description = data.description || data.وصف || data.details || data.تفاصيل;
		const price = data.price || data.سعر || data.السعر;
		
		let response = '';
		
		if (name) {
			response += `**${name}**\n\n`;
		}
		
		if (description) {
			response += `${description}\n\n`;
		}
		
		if (price) {
			response += `💰 السعر: ${price}\n\n`;
		}
		
		// Add other fields
		Object.entries(data).forEach(([key, value]) => {
			if (key !== 'name' && key !== 'اسم' && key !== 'description' && key !== 'وصف' && key !== 'price' && key !== 'سعر' && value) {
				response += `${key}: ${value}\n`;
			}
		});
		
		return response.trim() || 'تم العثور على معلومات ذات صلة.';
	}

	async logChatMessage(userId, chatId, chatType, chatTitle, messageType, messageContent, responseSource = null, knowledgeBaseMatch = null) {
		try {
			await TelegramChat.create({
				userId,
				chatId,
				chatType,
				chatTitle,
				messageType,
				messageContent,
				responseSource,
				knowledgeBaseMatch,
				timestamp: new Date()
			});
		} catch (error) {
			console.error('[TG-Bot] Failed to log chat message:', error.message);
		}
	}

	async getChatMembers(userId, chatId, limit = 200) {
		const bot = await this.getActiveBot(userId);
		if (!bot || !bot.token) throw new Error('No active bot found');
		
		const url = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getChatMembersCount`;
		console.log('[TG-Bot] Getting member count for chat:', chatId);
		
		try {
			// First get member count
			const countResp = await axios.post(url, { chat_id: chatId }, { timeout: 15000 });
			console.log('[TG-Bot] Member count response:', { ok: countResp.data?.ok, count: countResp.data?.result });
			
			if (!countResp.data?.ok) {
				throw new Error(countResp.data?.description || 'Failed to get member count');
			}
			
			const memberCount = countResp.data.result;
			
			// For channels and large groups, we can only get admins
			const adminsUrl = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getChatAdministrators`;
			const adminsResp = await axios.post(adminsUrl, { chat_id: chatId }, { timeout: 15000 });
			
			if (!adminsResp.data?.ok) {
				throw new Error(adminsResp.data?.description || 'Failed to get administrators');
			}
			
			const admins = adminsResp.data.result || [];
			
			// Note: Telegram Bot API doesn't allow getting full member lists for privacy reasons
			// We can only get administrators and the bot itself
			return {
				totalCount: memberCount,
				members: admins.map(admin => ({
					id: admin.user.id,
					first_name: admin.user.first_name,
					last_name: admin.user.last_name || '',
					username: admin.user.username || '',
					status: admin.status,
					is_bot: admin.user.is_bot || false,
					phone_number: '', // Not available via Bot API
					join_date: admin.joined_date ? new Date(admin.joined_date * 1000).toISOString() : ''
				})),
				note: 'Due to Telegram privacy policies, only administrators are shown. Full member lists are not available via Bot API.'
			};
		} catch (err) {
			console.error('[TG-Bot] Get members failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Failed to get chat members: ' + (err.response?.data?.description || err.message));
		}
	}

	async exportChatMembers(userId, chatId, chatTitle = 'Unknown Chat') {
		try {
			console.log('[TG-Bot] Exporting members for chat:', chatId);
			
			const membersData = await this.getChatMembers(userId, chatId);
			const members = membersData.members;
			
			if (!members || members.length === 0) {
				throw new Error('No members found or insufficient permissions');
			}
			
			// Prepare data for Excel
			const excelData = members.map((member, index) => ({
				'#': index + 1,
				'User ID': member.id,
				'First Name': member.first_name,
				'Last Name': member.last_name,
				'Username': member.username ? `@${member.username}` : '',
				'Status': member.status,
				'Is Bot': member.is_bot ? 'Yes' : 'No',
				'Phone Number': member.phone_number || 'N/A',
				'Join Date': member.join_date || 'N/A'
			}));
			
			// Add summary row
			excelData.unshift({
				'#': 'SUMMARY',
				'User ID': `Total Members: ${membersData.totalCount}`,
				'First Name': `Exported: ${members.length}`,
				'Last Name': 'Type: Administrators only',
				'Username': `Chat: ${chatTitle}`,
				'Status': `Export Date: ${new Date().toISOString()}`,
				'Is Bot': membersData.note,
				'Phone Number': '',
				'Join Date': ''
			});
			
			// Create workbook
			const wb = xlsx.utils.book_new();
			const ws = xlsx.utils.json_to_sheet(excelData);
			
			// Set column widths
			ws['!cols'] = [
				{ width: 5 },   // #
				{ width: 15 },  // User ID
				{ width: 20 },  // First Name
				{ width: 20 },  // Last Name
				{ width: 20 },  // Username
				{ width: 15 },  // Status
				{ width: 10 },  // Is Bot
				{ width: 20 },  // Phone Number
				{ width: 20 }   // Join Date
			];
			
			xlsx.utils.book_append_sheet(wb, ws, 'Members');
			
			// Generate filename
			const sanitizedTitle = chatTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
			const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
			const filename = `telegram_${sanitizedTitle}_${timestamp}.xlsx`;
			const filepath = path.join(process.cwd(), 'back-end', 'uploads', 'tmp', filename);
			
			// Ensure directory exists
			const dir = path.dirname(filepath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			
			// Write file
			xlsx.writeFile(wb, filepath);
			
			console.log(`[TG-Bot] Exported ${members.length} members to ${filename}`);
			
			return {
				success: true,
				filename,
				filepath,
				memberCount: members.length,
				totalCount: membersData.totalCount,
				note: membersData.note
			};
		} catch (error) {
			console.error('[TG-Bot] Export failed:', error.message);
			throw error;
		}
	}

	async getBotChats(userId) {
		const bot = await this.getActiveBot(userId);
		if (!bot || !bot.token) throw new Error('No active bot found');
		
		try {
			// Get recent updates to find chats the bot is in
			const updatesUrl = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getUpdates`;
			const updatesResp = await axios.post(updatesUrl, { 
				limit: 100,
				timeout: 30 
			}, { timeout: 15000 });
			
			if (!updatesResp.data?.ok) {
				throw new Error(updatesResp.data?.description || 'Failed to get updates');
			}
			
			const updates = updatesResp.data.result || [];
			const chatMap = new Map();
			
			// Process updates to extract chat information
			updates.forEach(update => {
				let chat = null;
				let chatType = 'unknown';
				
				if (update.message) {
					chat = update.message.chat;
					chatType = 'message';
				} else if (update.channel_post) {
					chat = update.channel_post.chat;
					chatType = 'channel_post';
				} else if (update.edited_message) {
					chat = update.edited_message.chat;
					chatType = 'edited_message';
				} else if (update.edited_channel_post) {
					chat = update.edited_channel_post.chat;
					chatType = 'edited_channel_post';
				} else if (update.my_chat_member) {
					chat = update.my_chat_member.chat;
					chatType = 'my_chat_member';
				} else if (update.chat_member) {
					chat = update.chat_member.chat;
					chatType = 'chat_member';
				}
				
				if (chat && chat.id) {
					const chatId = chat.id.toString();
					if (!chatMap.has(chatId)) {
						chatMap.set(chatId, {
							id: chatId,
							title: chat.title || chat.first_name || `Chat_${chatId}`,
							type: chat.type,
							username: chat.username,
							description: chat.description || '',
							invite_link: chat.invite_link || '',
							lastActivity: new Date(update.update_id * 1000).toISOString(),
							chatType: chatType,
							canManage: false
						});
					}
				}
			});
			
			// Try to get more detailed info for each chat
			const chatPromises = Array.from(chatMap.values()).map(async (chatInfo) => {
				try {
					// Get chat info
					const chatUrl = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getChat`;
					const chatResp = await axios.post(chatUrl, { chat_id: chatInfo.id }, { timeout: 10000 });
					
					if (chatResp.data?.ok) {
						const chat = chatResp.data.result;
						chatInfo.title = chat.title || chat.first_name || chatInfo.title;
						chatInfo.type = chat.type;
						chatInfo.username = chat.username;
						chatInfo.description = chat.description || '';
						chatInfo.invite_link = chat.invite_link || '';
					}
					
					// Check if bot can manage chat (try to get administrators)
					try {
						const adminsUrl = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getChatAdministrators`;
						await axios.post(adminsUrl, { chat_id: chatInfo.id }, { timeout: 5000 });
						chatInfo.canManage = true;
					} catch (e) {
						chatInfo.canManage = false;
					}
					
					// Get member count if possible
					try {
						const countUrl = `https://api.telegram.org/bot${encodeURIComponent(bot.token)}/getChatMembersCount`;
						const countResp = await axios.post(countUrl, { chat_id: chatInfo.id }, { timeout: 5000 });
						if (countResp.data?.ok) {
							chatInfo.memberCount = countResp.data.result;
						}
					} catch (e) {
						// Member count not available
					}
					
				} catch (e) {
					console.warn(`[TG-Bot] Could not get details for chat ${chatInfo.id}:`, e.message);
				}
				
				return chatInfo;
			});
			
			const chats = await Promise.all(chatPromises);
			
			// Sort by last activity
			chats.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
			
			return {
				success: true,
				chats: chats,
				total: chats.length,
				note: 'Chats are discovered from recent bot activity. Make sure your bot has been active in groups/channels to see them here.'
			};
			
		} catch (err) {
			console.error('[TG-Bot] Get bot chats failed:', err.message);
			if (err.response) {
				console.error('[TG-Bot] Response status:', err.response.status);
				console.error('[TG-Bot] Response data:', err.response.data);
			}
			throw new Error('Failed to get bot chats: ' + (err.response?.data?.description || err.message));
		}
	}

	// Template-related methods
	async getActiveTemplates(userId) {
		try {
			const templates = await TelegramTemplate.findAll({
				where: { userId, isActive: true },
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
				],
				order: [['displayOrder', 'ASC']]
			});

			// Parse JSON fields back to arrays
			const parsedTemplates = templates.map(template => {
				const templateData = template.toJSON();
				if (templateData.triggerKeywords) {
					try {
						templateData.triggerKeywords = JSON.parse(templateData.triggerKeywords);
					} catch (e) {
						templateData.triggerKeywords = [];
					}
				}
				if (templateData.pollOptions) {
					try {
						templateData.pollOptions = JSON.parse(templateData.pollOptions);
					} catch (e) {
						templateData.pollOptions = [];
					}
				}
				return templateData;
			});

			return parsedTemplates;
		} catch (error) {
			console.error('[TG-Bot] Error getting active templates:', error);
			return [];
		}
	}

	async findMatchingTemplate(userId, message) {
		try {
			const templates = await this.getActiveTemplates(userId);
			
			// Normalize incoming message
			const messageLower = String(message || '').toLowerCase().trim();
			if (!messageLower) return null;

			for (const template of templates) {
				// Check trigger keywords
				if (template.triggerKeywords && template.triggerKeywords.length > 0) {
					// Parse trigger keywords if they're stored as JSON string
					let keywords = template.triggerKeywords;
					if (typeof keywords === 'string') {
						try {
							keywords = JSON.parse(keywords);
						} catch (e) {
							keywords = [];
						}
					}
					
					if (keywords && keywords.length > 0) {
						const normalizedKeywords = keywords
							.map(k => String(k || '').toLowerCase().trim())
							.filter(Boolean);

						const hasKeyword = normalizedKeywords.some(keyword => {
							if (!keyword) return false;
							// Match exact or contained (after trimming)
							return messageLower === keyword || messageLower.includes(keyword);
						});

						if (hasKeyword) {
							return template;
						}
					}
				}
			}

			return null;
		} catch (error) {
			console.error('[TG-Bot] Error finding matching template:', error);
			return null;
		}
	}

	async sendTemplateMessage(botToken, chatId, template, variables = {}) {
		try {
			let messageText = template.bodyText;
			
			// Replace variables in message text
			if (template.variables && template.variables.length > 0) {
				for (const variable of template.variables) {
					const placeholder = `{{${variable.variableName}}}`;
					const value = variables[variable.variableName] || variable.defaultValue || '';
					messageText = messageText.replace(new RegExp(placeholder, 'g'), value);
				}
			}

			// Add header and footer if they exist
			if (template.headerText) {
				messageText = template.headerText + '\n\n' + messageText;
			}
			if (template.footerText) {
				messageText = messageText + '\n\n' + template.footerText;
			}

			const messageData = {
				chat_id: chatId,
				text: messageText,
				parse_mode: 'HTML'
			};

			// Add buttons if they exist
			if (template.buttons && template.buttons.length > 0) {
				const inlineKeyboard = this.buildInlineKeyboard(template.buttons);
				messageData.reply_markup = {
					inline_keyboard: inlineKeyboard
				};
			}

			// Handle different template types
			if (template.templateType === 'media' && template.mediaUrl) {
				return await this.sendMediaMessage(botToken, chatId, template, messageData);
			} else if (template.templateType === 'poll') {
				return await this.sendPollMessage(botToken, chatId, template, messageData);
			} else {
				// Regular text message
				const response = await axios.post(
					`https://api.telegram.org/bot${botToken}/sendMessage`,
					messageData
				);
				return response.data;
			}
		} catch (error) {
			console.error('[TG-Bot] Error sending template message:', error);
			throw error;
		}
	}

	buildInlineKeyboard(buttons, buttonsPerRow = 2, isSubmenu = false) {
		const keyboard = [];
		let currentRow = [];

		for (const button of buttons) {
			const buttonData = {
				text: button.text
			};

			switch (button.buttonType) {
				case 'url':
					buttonData.url = button.url;
					break;
				case 'callback':
					buttonData.callback_data = `btn:${button.id}`;
					break;
				case 'web_app':
					buttonData.web_app = { url: button.webAppUrl };
					break;
				case 'switch_inline':
					buttonData.switch_inline_query = button.switchInlineQuery || '';
					break;
				case 'switch_inline_current':
					buttonData.switch_inline_query_current_chat = button.switchInlineQuery || '';
					break;
				default:
					buttonData.callback_data = `btn:${button.id}`;
			}

			currentRow.push(buttonData);
			if (currentRow.length >= buttonsPerRow) {
				keyboard.push(currentRow);
				currentRow = [];
			}
		}

		if (currentRow.length > 0) keyboard.push(currentRow);
		return keyboard;
	}

	formatTemplateMessage(template) {
		let text = '';
		if (template.headerText) text += `<b>${template.headerText}</b>\n\n`;
		text += template.bodyText || '';
		if (template.footerText) text += `\n\n<i>${template.footerText}</i>`;
		return text.trim() || '<b>اختر خيارًا</b>';
	}

	async sendMediaMessage(botToken, chatId, template, messageData) {
		const mediaType = template.mediaType;
		const mediaUrl = template.mediaUrl;
		const caption = messageData.text;

		let method = '';
		let mediaField = '';

		switch (mediaType) {
			case 'photo':
				method = 'sendPhoto';
				mediaField = 'photo';
				break;
			case 'video':
				method = 'sendVideo';
				mediaField = 'video';
				break;
			case 'document':
				method = 'sendDocument';
				mediaField = 'document';
				break;
			case 'audio':
				method = 'sendAudio';
				mediaField = 'audio';
				break;
			case 'voice':
				method = 'sendVoice';
				mediaField = 'voice';
				break;
			default:
				throw new Error('Unsupported media type');
		}

		const payload = {
			chat_id: chatId,
			[mediaField]: mediaUrl,
			caption: caption,
			parse_mode: 'HTML'
		};

		// Add buttons if they exist
		if (template.buttons && template.buttons.length > 0) {
			const inlineKeyboard = this.buildInlineKeyboard(template.buttons);
			payload.reply_markup = {
				inline_keyboard: inlineKeyboard
			};
		}

		const response = await axios.post(
			`https://api.telegram.org/bot${botToken}/${method}`,
			payload
		);

		return response.data;
	}

	async sendPollMessage(botToken, chatId, template, messageData) {
		let pollOptions = template.pollOptions || [];
		// Parse poll options if they're stored as JSON string
		if (typeof pollOptions === 'string') {
			try {
				pollOptions = JSON.parse(pollOptions);
			} catch (e) {
				pollOptions = [];
			}
		}
		
		const pollType = template.pollType || 'regular';
		const correctAnswer = template.correctAnswer;
		const explanation = template.explanation;

		const pollData = {
			chat_id: chatId,
			question: messageData.text,
			options: pollOptions,
			type: pollType === 'quiz' ? 'quiz' : 'regular'
		};

		if (pollType === 'quiz' && correctAnswer !== undefined) {
			pollData.correct_option_id = correctAnswer;
		}

		if (explanation) {
			pollData.explanation = explanation;
		}

		const response = await axios.post(
			`https://api.telegram.org/bot${botToken}/sendPoll`,
			pollData
		);

		return response.data;
	}

	async logTemplateUsage(templateId, userId, chatId, messageId, variables, success, errorMessage) {
		try {
			await TelegramTemplateUsage.create({
				templateId,
				userId,
				chatId,
				messageId,
				variables: JSON.stringify(variables),
				success,
				errorMessage
			});
		} catch (error) {
			console.error('[TG-Bot] Error logging template usage:', error);
		}
	}

	// Handle incoming messages from webhook
	async handleIncomingMessage(userId, update) {
		try {
			console.log('[TG-Bot] Processing incoming message for user:', userId);
			
			if (!update.message) {
				console.log('[TG-Bot] No message in update');
				return;
			}

			const message = update.message;
			const chatId = message.chat.id.toString();
			const messageText = message.text || '';
			const messageId = message.message_id;

			console.log('[TG-Bot] Message details:', {
				chatId,
				messageText,
				messageId,
				from: message.from?.username || message.from?.first_name
			});

			// Save incoming message to chat history
			await TelegramChat.create({
				userId,
				chatId,
				chatType: message.chat.type,
				chatTitle: message.chat.title || message.from?.first_name || 'Unknown',
				messageType: 'incoming',
				messageContent: messageText,
				responseSource: 'telegram',
				timestamp: new Date()
			});

			// Check for template triggers
			if (messageText.trim()) {
				const matchingTemplate = await this.findMatchingTemplate(userId, messageText);
				
				if (matchingTemplate) {
					console.log('[TG-Bot] Found matching template:', matchingTemplate.name);
					
					try {
						const bot = await this.getActiveBot(userId);
						if (bot && bot.token) {
							const result = await this.sendTemplateMessage(bot.token, chatId, matchingTemplate);
							
							// Log template usage
							await this.logTemplateUsage(
								matchingTemplate.id,
								userId,
								chatId,
								result.result?.message_id,
								{},
								true,
								null
							);

							// Save outgoing message to chat history
							await TelegramChat.create({
								userId,
								chatId,
								chatType: message.chat.type,
								chatTitle: message.chat.title || message.from?.first_name || 'Unknown',
								messageType: 'outgoing',
								messageContent: matchingTemplate.bodyText,
								responseSource: 'template',
								knowledgeBaseMatch: matchingTemplate.name,
								timestamp: new Date()
							});

							console.log('[TG-Bot] Template sent successfully');
							return;
						}
					} catch (error) {
						console.error('[TG-Bot] Error sending template:', error);
						
						// Log failed template usage
						await this.logTemplateUsage(
							matchingTemplate.id,
							userId,
							chatId,
							null,
							{},
							false,
							error.message
						);
					}
				}
			}

			// If no template matched, you can add other bot logic here
			// For example, AI responses, knowledge base search, etc.
			console.log('[TG-Bot] No template matched, message processed');

		} catch (error) {
			console.error('[TG-Bot] Error handling incoming message:', error);
		}
	}
}

module.exports = new TelegramBotService();


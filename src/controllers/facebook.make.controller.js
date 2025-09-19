const { FacebookAccount } = require('../models/facebookAccount');

const makeService = require('../services/make.service');

async function getFacebookPagesMake(req, res) {
	try {
		const pages = await makeService.getFacebookPages(req.userId);
		return res.json({ pages });
	} catch (error) {
		console.error('Error getting Facebook pages via Make:', error);
		return res.status(500).json({ message: 'Failed to get pages', error: error.message });
	}
}

async function selectFacebookPageMake(req, res) {
	try {
		const { pageId, pageName } = req.body;
		if (!pageId) {
			return res.status(400).json({ message: 'pageId is required' });
		}
		const [account, created] = await FacebookAccount.findOrCreate({
			where: { userId: req.userId },
			defaults: {
				userId: req.userId,
				pageId,
				destination: 'page',
				accessToken: ''
			}
		});
		if (!created) {
			account.pageId = pageId;
			account.destination = 'page';
			account.accessToken = '';
			await account.save();
		}
		return res.json({ success: true, pageId, pageName: pageName || null });
	} catch (error) {
		console.error('Error selecting Facebook page via Make:', error);
		return res.status(500).json({ message: 'Failed to select page' });
	}
}

module.exports = {
	getFacebookPagesMake,
	selectFacebookPageMake
};

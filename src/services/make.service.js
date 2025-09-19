const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

function requireEnv(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing environment variable: ${name}`);
	}
	return value;
}

async function postJson(url, payload) {
    // Optional auth for Make webhooks
    const extraHeaders = {};
    // If explicit header name/value provided, use it
    if (process.env.MAKE_WEBHOOK_AUTH_HEADER_NAME && process.env.MAKE_WEBHOOK_AUTH_HEADER_VALUE) {
        extraHeaders[process.env.MAKE_WEBHOOK_AUTH_HEADER_NAME] = process.env.MAKE_WEBHOOK_AUTH_HEADER_VALUE;
    } else if (process.env.MAKE_WEBHOOK_SECRET) {
        // Fallback to Authorization: Bearer <secret>
        extraHeaders['Authorization'] = `Bearer ${process.env.MAKE_WEBHOOK_SECRET}`;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...extraHeaders
        },
        body: JSON.stringify(payload),
        timeout: 30000
    });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const message = data?.message || data?.error || `HTTP ${res.status}`;
		throw new Error(`Make webhook failed: ${message}`);
	}
	return data;
}

async function getFacebookPages(userId) {
	const url = requireEnv('MAKE_PAGES_WEBHOOK_URL');
	// Expected Make response: { pages: [{ id, name, hasInstagram?, instagramAccount? }] }
	const data = await postJson(url, { userId });
	const pages = Array.isArray(data.pages) ? data.pages : [];
	// Normalize shape for frontend backward compatibility
	return pages.map(p => ({
		id: String(p.id),
		name: p.name || 'Unknown Page',
		accessToken: '',
		hasInstagram: !!p.hasInstagram || !!p.instagramAccount,
		instagramAccount: p.instagramAccount || null
	}));
}

async function publishFacebook(userId, params) {
	const url = requireEnv('MAKE_FACEBOOK_PUBLISH_WEBHOOK_URL');
	// params should include: pageId, type, format, content, linkUrl, mediaUrl, hashtags
	const data = await postJson(url, { userId, ...params });
	// Expected Make response: { id, type }
	return { id: data.id, type: data.type || 'page_post' };
}

module.exports = {
	getFacebookPages,
	publishFacebook
};

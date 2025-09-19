const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

function requireEnv(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing environment variable: ${name}`);
	}
	return value;
}

function appendQueryParam(baseUrl, name, value) {
    try {
        const u = new URL(baseUrl);
        u.searchParams.set(name, value);
        return u.toString();
    } catch {
        return baseUrl;
    }
}

async function postJson(url, payload) {
    // Optional auth for Make webhooks
    const extraHeaders = {};
    // If explicit header name/value provided, use it
    if (process.env.MAKE_WEBHOOK_AUTH_HEADER_NAME && process.env.MAKE_WEBHOOK_AUTH_HEADER_VALUE) {
        extraHeaders[process.env.MAKE_WEBHOOK_AUTH_HEADER_NAME] = process.env.MAKE_WEBHOOK_AUTH_HEADER_VALUE;
    }
    // Common patterns supported: Authorization Bearer and X-API-Key
    if (process.env.MAKE_WEBHOOK_SECRET) {
        extraHeaders['Authorization'] = `Bearer ${process.env.MAKE_WEBHOOK_SECRET}`;
        extraHeaders['X-API-Key'] = process.env.MAKE_WEBHOOK_SECRET;
    }
    // Optional query param auth
    if (process.env.MAKE_WEBHOOK_QUERY_PARAM && process.env.MAKE_WEBHOOK_QUERY_VALUE) {
        url = appendQueryParam(url, process.env.MAKE_WEBHOOK_QUERY_PARAM, process.env.MAKE_WEBHOOK_QUERY_VALUE);
    }

    // Debug (safe): show URL host and which auth headers applied (names only)
    try {
        const dbgUrl = new URL(url);
        console.log('[Make] POST', { host: dbgUrl.host, path: dbgUrl.pathname, hasBearer: !!process.env.MAKE_WEBHOOK_SECRET, customHeader: process.env.MAKE_WEBHOOK_AUTH_HEADER_NAME || null, queryAuthParam: process.env.MAKE_WEBHOOK_QUERY_PARAM || null });
    } catch {}

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...extraHeaders
        },
        body: JSON.stringify(payload),
        timeout: 30000
    });
    let text;
    try { text = await res.text(); } catch { text = ''; }
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!res.ok) {
        console.error('[Make] Webhook error', { status: res.status, body: text?.slice(0, 500) });
        const message = data?.message || data?.error || text || `HTTP ${res.status}`;
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

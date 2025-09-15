const SallaAccount = require('../models/sallaAccount');
const { User } = require('../models/user');

const SALLA_CLIENT_ID = process.env.SALLA_CLIENT_ID;
const SALLA_CLIENT_SECRET = process.env.SALLA_CLIENT_SECRET;
// Must MATCH the redirect_uri used in the auth start URL (and registered in Salla)
const SALLA_OAUTH_REDIRECT = process.env.SALLA_OAUTH_REDIRECT || 'http://localhost:4000/auth/salla/callback';

async function exchangeCode(req, res) {
  try {
    const { code } = req.body;
    const userId = req.userId;

    if (!code) {
      return res.status(400).json({ message: 'Salla authorization code is required' });
    }

    // Exchange code for access token (Salla expects form-encoded at accounts.salla.sa)
    const tokenResponse = await fetch('https://accounts.salla.sa/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: SALLA_CLIENT_ID || '',
        client_secret: SALLA_CLIENT_SECRET || '',
        redirect_uri: SALLA_OAUTH_REDIRECT,
        code
      })
    });

    const tokenText = await tokenResponse.text();
    let tokenData;
    try { tokenData = tokenText ? JSON.parse(tokenText) : {}; } catch { tokenData = { raw: tokenText }; }
    if (!tokenResponse.ok || tokenData.error) {
      return res.status(400).json({ message: tokenData.error_description || 'Failed to exchange Salla code', error: tokenData });
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const tokenScope = tokenData.scope || null; // space-separated scopes
    const expiresIn = tokenData.expires_in ? Number(tokenData.expires_in) : null;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    // Fetch store info (best-effort): try /me first, then /store
    let storeId = null;
    let storeName = null;
    let ownerEmail = null;
    try {
      const meResp1 = await fetch('https://api.salla.dev/admin/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
      });
      const meText1 = await meResp1.text();
      let meData1; try { meData1 = meText1 ? JSON.parse(meText1) : {}; } catch { meData1 = { raw: meText1 }; }
      if (meResp1.ok && !meData1.error) {
        // Some responses include merchant/store info inside data
        storeId = meData1?.data?.store?.id || meData1?.data?.id || null;
        storeName = meData1?.data?.store?.name || meData1?.data?.name || null;
        ownerEmail = meData1?.data?.email || null;
      }
      if (!storeName) {
        const meResp2 = await fetch('https://api.salla.dev/admin/v2/store', {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
        });
        const meText2 = await meResp2.text();
        let meData2; try { meData2 = meText2 ? JSON.parse(meText2) : {}; } catch { meData2 = { raw: meText2 }; }
        if (meResp2.ok && !meData2.error) {
          storeId = meData2?.data?.id || storeId;
          storeName = meData2?.data?.name || storeName;
          ownerEmail = meData2?.data?.email || ownerEmail;
        }
      }
    } catch {}

    // Upsert account
    const [account] = await SallaAccount.findOrCreate({
      where: { userId },
      defaults: {
        userId,
        sallaStoreId: storeId,
        storeName,
        ownerEmail,
        accessToken,
        refreshToken,
        expiresAt,
        scope: tokenScope,
        isActive: true,
        lastSyncAt: new Date()
      }
    });

    account.sallaStoreId = storeId;
    account.storeName = storeName;
    account.ownerEmail = ownerEmail;
    account.accessToken = accessToken;
    account.refreshToken = refreshToken;
    account.scope = tokenScope;
    account.expiresAt = expiresAt;
    account.isActive = true;
    account.lastSyncAt = new Date();
    await account.save();

    return res.json({
      message: storeName ? 'Salla account connected' : 'Salla connected (limited). Grant basic read scope to load store info.',
      account: {
        id: account.id,
        sallaStoreId: account.sallaStoreId,
        storeName: account.storeName,
        ownerEmail: account.ownerEmail,
        scope: account.scope || null
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Internal error exchanging Salla code', error: String(err?.message || err) });
  }
}

async function getSallaAccount(req, res) {
  const userId = req.userId;
  const account = await SallaAccount.findOne({ where: { userId } });
  if (!account) return res.json({ connected: false });
  return res.json({
    connected: true,
    account: {
      id: account.id,
      sallaStoreId: account.sallaStoreId,
      storeName: account.storeName,
      ownerEmail: account.ownerEmail,
      lastSyncAt: account.lastSyncAt
    }
  });
}

async function disconnectSalla(req, res) {
  const userId = req.userId;
  const account = await SallaAccount.findOne({ where: { userId } });
  if (!account) return res.status(404).json({ message: 'No Salla account connected' });
  account.isActive = false;
  account.accessToken = '';
  account.refreshToken = '';
  await account.save();
  return res.json({ message: 'Salla disconnected' });
}

async function testSallaConnection(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) {
      return res.json({ ok: false, message: 'Salla not connected' });
    }
    
    console.log('=== SALLA CONNECTION TEST ===');
    console.log('Token (first 20 chars):', account.accessToken.substring(0, 20) + '...');
    console.log('Scope:', account.scope);
    
    // First test basic connectivity
    try {
      console.log('Testing basic connectivity to Salla API...');
      const testResp = await fetch('https://api.salla.dev/admin/v2/me', {
        headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json' }
      });
      console.log('Basic connectivity test - Status:', testResp.status, testResp.statusText);
      
      const testText = await testResp.text();
      console.log('Basic connectivity test - Response:', testText.substring(0, 200));
      
      let testData; try { testData = testText ? JSON.parse(testText) : {}; } catch { testData = { raw: testText }; }
      
      if (testResp.ok && !testData.error) {
        console.log('SUCCESS: Basic connectivity works');
        return res.json({ ok: true, message: 'Salla API reachable', storeName: testData?.data?.store?.name || testData?.data?.name || null });
      } else {
        console.log('Basic connectivity failed, trying store endpoint...');
        const resp2 = await fetch('https://api.salla.dev/admin/v2/store', {
          headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json' }
        });
        const respText2 = await resp2.text();
        console.log('Store endpoint - Status:', resp2.status, resp2.statusText);
        console.log('Store endpoint - Response:', respText2.substring(0, 200));
        
        let data2; try { data2 = respText2 ? JSON.parse(respText2) : {}; } catch { data2 = { raw: respText2 }; }
        if (!resp2.ok || data2.error) {
          const reason = data2.error_description || data2.message || 'Unknown error';
          return res.json({ ok: false, message: `Salla API test failed: ${reason}` });
        }
        return res.json({ ok: true, message: 'Salla API reachable', storeName: data2?.data?.name || null });
      }
    } catch (fetchErr) {
      console.log('Fetch error details:', {
        message: fetchErr.message,
        name: fetchErr.name,
        code: fetchErr.code,
        cause: fetchErr.cause,
        stack: fetchErr.stack
      });
      return res.json({ ok: false, message: `Network error: ${fetchErr.message}` });
    }
  } catch (err) {
    console.log('General error:', err);
    return res.json({ ok: false, message: `Error testing Salla: ${String(err?.message || err)}` });
  }
}

// Simple network test function
async function testNetworkConnectivity(req, res) {
  try {
    console.log('=== NETWORK CONNECTIVITY TEST ===');
    
    // Test 1: Basic HTTP request
    try {
      const testResp = await fetch('https://httpbin.org/get');
      const testText = await testResp.text();
      console.log('HTTP test - Status:', testResp.status);
      console.log('HTTP test - Response length:', testText.length);
    } catch (err) {
      console.log('HTTP test failed:', err.message);
    }
    
    // Test 2: Salla API without auth
    try {
      const sallaResp = await fetch('https://api.salla.dev/admin/v2/me');
      const sallaText = await sallaResp.text();
      console.log('Salla API test - Status:', sallaResp.status);
      console.log('Salla API test - Response:', sallaText.substring(0, 200));
    } catch (err) {
      console.log('Salla API test failed:', err.message);
    }
    
    // Test 3: Google DNS
    try {
      const dnsResp = await fetch('https://8.8.8.8');
      console.log('DNS test - Status:', dnsResp.status);
    } catch (err) {
      console.log('DNS test failed:', err.message);
    }
    
    return res.json({ ok: true, message: 'Network test completed. Check console logs.' });
  } catch (err) {
    return res.json({ ok: false, message: `Network test error: ${err.message}` });
  }
}

module.exports = {
  exchangeCode,
  getSallaAccount,
  disconnectSalla,
  testSallaConnection,
  testNetworkConnectivity
};

// Extra: expose store info for dashboard
async function getSallaStore(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    console.log('=== SALLA DEBUG ===');
    console.log('Token (first 20 chars):', account.accessToken.substring(0, 20) + '...');
    console.log('Scope:', account.scope);
    
    // Try multiple endpoints to find the right one
    const endpoints = [
      // Common guesses
      'https://api.salla.dev/admin/v2/me',
      'https://api.salla.dev/admin/v2/store', 
      'https://api.salla.dev/admin/v2/merchant',
      'https://api.salla.dev/admin/v2/account',
      // Store/settings related
      'https://api.salla.dev/admin/v2/settings/store',
      'https://api.salla.dev/admin/v2/store/settings',
      'https://api.salla.dev/admin/v2/store-settings',
      // Fallbacks that return something identifiable
      'https://api.salla.dev/admin/v2/products?per_page=1',
      'https://api.salla.dev/admin/v2/orders?per_page=1'
    ];
    
    for (const url of endpoints) {
      console.log(`Trying: ${url}`);
      try {
        const resp = await fetch(url, { 
          headers: { 
            Authorization: `Bearer ${account.accessToken}`, 
            Accept: 'application/json',
            'Content-Type': 'application/json'
          } 
        });
        const text = await resp.text();
        console.log(`Status: ${resp.status} ${resp.statusText}`);
        console.log('Response:', text.substring(0, 500));
        
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        
        if (resp.ok && !data.error) {
          // Extract store info from various response structures
          const storeCandidate = data?.data?.store || data?.store || data?.data || data;
          const store = typeof storeCandidate === 'object' ? storeCandidate : {};
          const name = store.name || store.store_name || store.title || null;
          const id = store.id || store.store_id || null;
          const email = store.email || store.contact_email || null;
          if (id || name) {
            console.log('SUCCESS: Found store info');
            return res.json({
              ok: true,
              store: {
                id: id,
                name: name,
                email: email
              },
              scope: account.scope || null,
              endpoint: url
            });
          }
          // If this endpoint returns list (products/orders), still consider API reachable
          if (Array.isArray(data?.data) || Array.isArray(data?.products) || Array.isArray(data?.orders)) {
            console.log('SUCCESS: API reachable via', url);
            return res.json({ ok: true, message: 'Salla API reachable', endpoint: url, scope: account.scope || null });
          }
        }
      } catch (err) {
        console.log(`Error with ${url}:`, err.message);
        console.log(`Full error:`, err);
        console.log(`Error type:`, typeof err);
        console.log(`Error stack:`, err.stack);
      }
    }
    
    console.log('=== END DEBUG ===');
    return res.json({ ok: false, message: 'No store info found in any endpoint. Check console logs for details.' });
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching Salla store info: ${String(err?.message || err)}` });
  }
}

module.exports.getSallaStore = getSallaStore;

// List products (minimal)
async function listSallaProducts(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    const url = `https://api.salla.dev/admin/v2/products?per_page=${Number(req.query.per_page || 20)}&page=${Number(req.query.page || 1)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json' } });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to fetch products: ${reason}` });
    }
    return res.json({ ok: true, data: data.data || [] });
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching products: ${String(err?.message || err)}` });
  }
}

module.exports.listSallaProducts = listSallaProducts;

async function createSallaProduct(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    const r = await fetch('https://api.salla.dev/admin/v2/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to create product: ${reason}`, data });
    }
    return res.json({ ok: true, product: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error creating product: ${String(err?.message || err)}` });
  }
}

async function updateSallaProduct(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    const productId = req.params.id;
    const r = await fetch(`https://api.salla.dev/admin/v2/products/${productId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update product: ${reason}`, data });
    }
    return res.json({ ok: true, product: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating product: ${String(err?.message || err)}` });
  }
}

async function listSallaOrders(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    const url = `https://api.salla.dev/admin/v2/orders?per_page=${Number(req.query.per_page || 20)}&page=${Number(req.query.page || 1)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json' } });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to fetch orders: ${reason}` });
    }
    return res.json({ ok: true, data: data.data || [] });
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching orders: ${String(err?.message || err)}` });
  }
}

async function updateSallaOrder(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    const orderId = req.params.id;
    const r = await fetch(`https://api.salla.dev/admin/v2/orders/${orderId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update order: ${reason}`, data });
    }
    return res.json({ ok: true, order: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating order: ${String(err?.message || err)}` });
  }
}

async function listSallaCustomers(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    const url = `https://api.salla.dev/admin/v2/customers?per_page=${Number(req.query.per_page || 20)}&page=${Number(req.query.page || 1)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}`, Accept: 'application/json' } });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to fetch customers: ${reason}` });
    }
    return res.json({ ok: true, data: data.data || [] });
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching customers: ${String(err?.message || err)}` });
  }
}

async function updateSallaCustomer(req, res) {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    const customerId = req.params.id;
    const r = await fetch(`https://api.salla.dev/admin/v2/customers/${customerId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update customer: ${reason}`, data });
    }
    return res.json({ ok: true, customer: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating customer: ${String(err?.message || err)}` });
  }
}

// Categories Management
const listSallaCategories = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, per_page = 12 } = req.query;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/categories?page=${page}&per_page=${per_page}`, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to fetch categories: ${reason}`, data });
    }
    return res.json({ ok: true, categories: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching categories: ${String(err?.message || err)}` });
  }
};

const createSallaCategory = async (req, res) => {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/categories`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to create category: ${reason}`, data });
    }
    return res.json({ ok: true, category: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error creating category: ${String(err?.message || err)}` });
  }
};

const updateSallaCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/categories/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update category: ${reason}`, data });
    }
    return res.json({ ok: true, category: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating category: ${String(err?.message || err)}` });
  }
};

const deleteSallaCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/categories/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to delete category: ${reason}`, data });
    }
    return res.json({ ok: true, category: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error deleting category: ${String(err?.message || err)}` });
  }
};

// Brands Management
const listSallaBrands = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, per_page = 12 } = req.query;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/brands?page=${page}&per_page=${per_page}`, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to fetch brands: ${reason}`, data });
    }
    return res.json({ ok: true, brands: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching brands: ${String(err?.message || err)}` });
  }
};

const createSallaBrand = async (req, res) => {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/brands`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to create brand: ${reason}`, data });
    }
    return res.json({ ok: true, brand: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error creating brand: ${String(err?.message || err)}` });
  }
};

const updateSallaBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/brands/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update brand: ${reason}`, data });
    }
    return res.json({ ok: true, brand: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating brand: ${String(err?.message || err)}` });
  }
};

const deleteSallaBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/brands/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to delete brand: ${reason}`, data });
    }
    return res.json({ ok: true, brand: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error deleting brand: ${String(err?.message || err)}` });
  }
};

// Branches Management
const listSallaBranches = async (req, res) => {
  try {
    const { page = 1, per_page = 12 } = req.query;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/branches?page=${page}&per_page=${per_page}`, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to fetch branches: ${reason}`, data });
    }
    return res.json({ ok: true, branches: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching branches: ${String(err?.message || err)}` });
  }
};

const createSallaBranch = async (req, res) => {
  try {
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/branches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to create branch: ${reason}`, data });
    }
    return res.json({ ok: true, branch: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error creating branch: ${String(err?.message || err)}` });
  }
};

const updateSallaBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/branches/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update branch: ${reason}`, data });
    }
    return res.json({ ok: true, branch: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating branch: ${String(err?.message || err)}` });
  }
};

const deleteSallaBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/branches/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to delete branch: ${reason}`, data });
    }
    return res.json({ ok: true, branch: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error deleting branch: ${String(err?.message || err)}` });
  }
};

// Payments Management
const listSallaPayments = async (req, res) => {
  try {
    const { page = 1, per_page = 12 } = req.query;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    // Use transactions endpoint (payments endpoint doesn't exist)
    const url = `https://api.salla.dev/admin/v2/transactions?page=${page}&per_page=${per_page}`;
    console.log(`Fetching payments/transactions: ${url}`);
    
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    
    if (r.ok && !data.error) {
      console.log(`Success fetching payments/transactions`);
      return res.json({ ok: true, payments: data.data || data });
    } else {
      const reason = data.error_description || data.message || data.error?.message || `HTTP ${r.status}: ${r.statusText}`;
      console.log('Salla Payments API Error:', { status: r.status, statusText: r.statusText, response: text });
      return res.json({ ok: false, message: `Failed to fetch payments: ${reason}`, data });
    }
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching payments: ${String(err?.message || err)}` });
  }
};

const updateSallaPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/payments/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update payment: ${reason}`, data });
    }
    return res.json({ ok: true, payment: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating payment: ${String(err?.message || err)}` });
  }
};

// Settings Management
const getSallaSettings = async (req, res) => {
  try {
    const { entity = 'store' } = req.query;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    // Valid entities according to Salla API documentation
    const validEntities = ['store', 'orders', 'products', 'reports', 'customers', 'blogs', 'mahally', 'feedbacks'];
    if (!validEntities.includes(entity)) {
      return res.json({ 
        ok: false, 
        message: `Invalid entity '${entity}'. Valid entities are: ${validEntities.join(', ')}` 
      });
    }
    
    const url = `https://api.salla.dev/admin/v2/settings?entity=${entity}`;
    console.log(`Fetching settings for entity '${entity}': ${url}`);
    
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    
    if (r.ok && !data.error) {
      console.log(`Success fetching settings for entity '${entity}'`);
      return res.json({ ok: true, settings: data.data || data, entity });
    } else {
      const reason = data.error_description || data.message || data.error?.message || `HTTP ${r.status}: ${r.statusText}`;
      console.log('Salla Settings API Error:', { status: r.status, statusText: r.statusText, response: text });
      
      // Handle specific error cases
      if (r.status === 422 && reason.includes('invalid_fields')) {
        return res.json({ 
          ok: false, 
          message: `Entity '${entity}' may not be available in your Salla plan or has invalid configuration`, 
          data 
        });
      }
      
      return res.json({ ok: false, message: `Failed to fetch settings for entity '${entity}': ${reason}`, data });
    }
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching settings: ${String(err?.message || err)}` });
  }
};

const updateSallaSettings = async (req, res) => {
  try {
    const { entity = 'store', ...settingsData } = req.body;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    console.log(`Updating settings for entity '${entity}' with data:`, settingsData);
    
    // Update each setting field individually using the /settings/fields/{slug} endpoint
    const updateResults = [];
    const errors = [];
    
    for (const [slug, value] of Object.entries(settingsData)) {
      if (slug === 'entity') continue; // Skip entity parameter
      
      try {
        const url = `https://api.salla.dev/admin/v2/settings/fields/${slug}`;
        console.log(`Updating field '${slug}': ${url}`);
        
        const r = await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ value })
        });
        const text = await r.text();
        let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        
        if (r.ok && !data.error) {
          console.log(`Success updating field '${slug}'`);
          updateResults.push({ slug, success: true, data: data.data || data });
        } else {
          const reason = data.error_description || data.message || data.error?.message || `HTTP ${r.status}: ${r.statusText}`;
          console.log(`Failed updating field '${slug}':`, { status: r.status, statusText: r.statusText, response: text });
          errors.push({ slug, error: reason });
        }
      } catch (err) {
        console.log(`Error updating field '${slug}':`, err.message);
        errors.push({ slug, error: err.message });
      }
    }
    
    if (errors.length === 0) {
      return res.json({ 
        ok: true, 
        message: `Successfully updated ${updateResults.length} settings`, 
        results: updateResults,
        entity 
      });
    } else if (updateResults.length > 0) {
      return res.json({ 
        ok: true, 
        message: `Updated ${updateResults.length} settings, ${errors.length} failed`, 
        results: updateResults,
        errors,
        entity 
      });
    } else {
      return res.json({ 
        ok: false, 
        message: `Failed to update all settings`, 
        errors,
        entity 
      });
    }
  } catch (err) {
    return res.json({ ok: false, message: `Error updating settings: ${String(err?.message || err)}` });
  }
};

// Reviews and Questions Management (both use the same /reviews endpoint)
const listSallaReviews = async (req, res) => {
  try {
    const { page = 1, per_page = 12, type = 'rating' } = req.query;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const url = `https://api.salla.dev/admin/v2/reviews?page=${page}&per_page=${per_page}&type=${type}`;
    console.log(`Fetching reviews: ${url}`);
    
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    
    if (r.ok && !data.error) {
      console.log(`Success fetching reviews`);
      return res.json({ ok: true, reviews: data.data || data });
    } else {
      const reason = data.error_description || data.message || data.error?.message || `HTTP ${r.status}: ${r.statusText}`;
      console.log('Salla Reviews API Error:', { status: r.status, statusText: r.statusText, response: text });
      return res.json({ ok: false, message: `Failed to fetch reviews: ${reason}`, data });
    }
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching reviews: ${String(err?.message || err)}` });
  }
};

const updateSallaReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/reviews/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update review: ${reason}`, data });
    }
    return res.json({ ok: true, review: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating review: ${String(err?.message || err)}` });
  }
};

const listSallaQuestions = async (req, res) => {
  try {
    const { page = 1, per_page = 12 } = req.query;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    // Questions use the same /reviews endpoint with type=ask
    const url = `https://api.salla.dev/admin/v2/reviews?page=${page}&per_page=${per_page}&type=ask`;
    console.log(`Fetching questions: ${url}`);
    
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    
    if (r.ok && !data.error) {
      console.log(`Success fetching questions`);
      return res.json({ ok: true, questions: data.data || data });
    } else {
      const reason = data.error_description || data.message || data.error?.message || `HTTP ${r.status}: ${r.statusText}`;
      console.log('Salla Questions API Error:', { status: r.status, statusText: r.statusText, response: text });
      return res.json({ ok: false, message: `Failed to fetch questions: ${reason}`, data });
    }
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching questions: ${String(err?.message || err)}` });
  }
};

const updateSallaQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/questions/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || 'Unknown error';
      return res.json({ ok: false, message: `Failed to update question: ${reason}`, data });
    }
    return res.json({ ok: true, question: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating question: ${String(err?.message || err)}` });
  }
};

module.exports.createSallaProduct = createSallaProduct;
module.exports.updateSallaProduct = updateSallaProduct;
module.exports.listSallaOrders = listSallaOrders;
module.exports.updateSallaOrder = updateSallaOrder;
module.exports.listSallaCustomers = listSallaCustomers;
module.exports.updateSallaCustomer = updateSallaCustomer;
module.exports.listSallaCategories = listSallaCategories;
module.exports.createSallaCategory = createSallaCategory;
module.exports.updateSallaCategory = updateSallaCategory;
module.exports.deleteSallaCategory = deleteSallaCategory;
module.exports.listSallaBrands = listSallaBrands;
module.exports.createSallaBrand = createSallaBrand;
module.exports.updateSallaBrand = updateSallaBrand;
module.exports.deleteSallaBrand = deleteSallaBrand;
module.exports.listSallaBranches = listSallaBranches;
module.exports.createSallaBranch = createSallaBranch;
module.exports.updateSallaBranch = updateSallaBranch;
module.exports.deleteSallaBranch = deleteSallaBranch;
module.exports.listSallaPayments = listSallaPayments;
module.exports.updateSallaPayment = updateSallaPayment;
// Get specific settings field by slug
const getSallaSettingsField = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/settings/fields/${slug}`, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || data.error?.message || `HTTP ${r.status}: ${r.statusText}`;
      console.log('Salla Settings Field API Error:', { status: r.status, statusText: r.statusText, response: text });
      return res.json({ ok: false, message: `Failed to fetch settings field: ${reason}`, data });
    }
    return res.json({ ok: true, field: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error fetching settings field: ${String(err?.message || err)}` });
  }
};

// Update specific settings field by slug
const updateSallaSettingsField = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.userId;
    const account = await SallaAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) return res.json({ ok: false, message: 'Salla not connected' });
    
    const r = await fetch(`https://api.salla.dev/admin/v2/settings/fields/${slug}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    
    if (!r.ok || data.error) {
      const reason = data.error_description || data.message || data.error?.message || `HTTP ${r.status}: ${r.statusText}`;
      console.log('Salla Settings Field Update API Error:', { status: r.status, statusText: r.statusText, response: text });
      return res.json({ ok: false, message: `Failed to update settings field: ${reason}`, data });
    }
    return res.json({ ok: true, field: data.data || data });
  } catch (err) {
    return res.json({ ok: false, message: `Error updating settings field: ${String(err?.message || err)}` });
  }
};

module.exports.getSallaSettings = getSallaSettings;
module.exports.updateSallaSettings = updateSallaSettings;
module.exports.getSallaSettingsField = getSallaSettingsField;
module.exports.updateSallaSettingsField = updateSallaSettingsField;
module.exports.listSallaReviews = listSallaReviews;
module.exports.updateSallaReview = updateSallaReview;
module.exports.listSallaQuestions = listSallaQuestions;
module.exports.updateSallaQuestion = updateSallaQuestion;

const FacebookAccount = require('../models/facebookAccount');
const crypto = require('../utils/crypto');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

async function getFacebookAccount(req, res) {
  try {
    const account = await FacebookAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.json({ connected: false });
    }
    
    return res.json({
      connected: true,
      name: account.name,
      email: account.email,
      pageId: account.pageId,
      groupId: account.groupId,
      destination: account.destination,
      instagramId: account.instagramId,
      instagramUsername: account.instagramUsername
    });
  } catch (error) {
    console.error('Error getting Facebook account:', error);
    return res.status(500).json({ message: 'Failed to get account info' });
  }
}

async function getFacebookPages(req, res) {
  try {
    const account = await FacebookAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Facebook account connected' });
    }
    
    const token = crypto.decrypt(account.accessToken);
    console.log('Getting Facebook pages...');
    console.log('Environment check at start:');
    console.log('FB_APP_ID:', process.env.FB_APP_ID ? 'SET' : 'NOT SET');
    console.log('FB_APP_SECRET:', process.env.FB_APP_SECRET ? 'SET' : 'NOT SET');
    console.log('Current working directory:', process.cwd());
    console.log('NODE_ENV:', process.env.NODE_ENV);
    
    // Show actual values (be careful with secrets in production)
    if (process.env.FB_APP_ID) {
      console.log('App ID (first 4 chars):', process.env.FB_APP_ID.substring(0, 4) + '...');
    }
    if (process.env.FB_APP_SECRET) {
      console.log('App Secret (first 4 chars):', process.env.FB_APP_SECRET.substring(0, 4) + '...');
    }
    
    // First, check what type of token we have
    const meResponse = await fetch(
      `https://graph.facebook.com/v21.0/me?access_token=${token}&fields=id,name,email`,
      { timeout: 10000 }
    );
    
    if (!meResponse.ok) {
      const errorText = await meResponse.text();
      console.log('Me endpoint error:', errorText);
      return res.status(400).json({ message: `Failed to get user info: ${errorText}` });
    }
    
    const meData = await meResponse.json();
    console.log('Token info:', meData);
    
    // Check if this is a page token by trying to access it as a page
    // Page tokens can access page info directly
    try {
      console.log('Testing if this is a page token...');
      const pageTestResponse = await fetch(
        `https://graph.facebook.com/v21.0/${meData.id}?access_token=${token}&fields=id,name,instagram_business_account{id,username,media_count}`,
        { timeout: 10000 }
      );
      
      if (pageTestResponse.ok) {
        const pageData = await pageTestResponse.json();
        console.log('Page test response:', JSON.stringify(pageData, null, 2));
        
        // If we get page data with name, this is a page token
        if (pageData.id && pageData.name) {
          console.log('Confirmed: This is a page token for page:', pageData.name);
          
          const pages = [{
            id: pageData.id,
            name: pageData.name,
            accessToken: token,
            hasInstagram: !!pageData.instagram_business_account,
            instagramAccount: pageData.instagram_business_account ? {
              id: pageData.instagram_business_account.id,
              username: pageData.instagram_business_account.username
            } : null
          }];
          
          console.log(`Found ${pages.length} Facebook page (page token)`);
          return res.json({ pages });
        }
      }
    } catch (error) {
      console.log('Page test failed:', error.message);
    }
    
    // If this is a user token, get all pages
    console.log('This is a user token, getting all pages...');
    
    // Try to get pages directly with Instagram fields (GPT's solution)
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&fields=id,name,access_token,instagram_business_account{id,username,media_count}`
    );
    
    console.log('Facebook pages response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Facebook pages error:', errorText);
      return res.status(400).json({ message: `Failed to get pages: ${errorText}` });
    }
    
    const data = await response.json();
    
    // If no pages found, try multiple approaches to find pages
    if (data.data && data.data.length === 0) {
      console.log('No pages found with /me/accounts, trying alternative methods...');
      
      // Method 1: Check token permissions
      try {
        console.log('Checking token permissions...');
        const permissionsResponse = await fetch(
          `https://graph.facebook.com/v21.0/me/permissions?access_token=${token}`,
          { timeout: 10000 }
        );
        
        if (permissionsResponse.ok) {
          const permissionsData = await permissionsResponse.json();
          console.log('Token permissions:', permissionsData.data.map(p => `${p.permission}: ${p.status}`));
        }
      } catch (error) {
        console.log('Failed to check permissions:', error.message);
      }
      
      // Method 2: Try to access current user as a page directly
      try {
        console.log('Method 2: Trying direct page access for user ID:', meData.id);
        const pageResponse = await fetch(
          `https://graph.facebook.com/v21.0/${meData.id}?access_token=${token}&fields=id,name,category,instagram_business_account{id,username,media_count}`,
          { timeout: 10000 }
        );
        
        if (pageResponse.ok) {
          const pageData = await pageResponse.json();
          console.log('Direct page access response:', JSON.stringify(pageData, null, 2));
          
          // If it has a category, it's a page
          if (pageData.id && pageData.name && pageData.category) {
            console.log('Found page via direct access:', pageData.name);
            const pages = [{
              id: pageData.id,
              name: pageData.name,
              accessToken: token,
              hasInstagram: !!pageData.instagram_business_account,
              instagramAccount: pageData.instagram_business_account ? {
                id: pageData.instagram_business_account.id,
                username: pageData.instagram_business_account.username
              } : null
            }];
            
            console.log(`Found ${pages.length} Facebook page (direct access)`);
            return res.json({ pages });
          }
        } else {
          const errorText = await pageResponse.text();
          console.log('Direct page access failed:', errorText);
        }
      } catch (error) {
        console.log('Direct page access error:', error.message);
      }
      
      // Method 3: Try different pages endpoint
      try {
        console.log('Method 3: Trying different pages endpoint...');
        const altPagesResponse = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${token}&fields=accounts{id,name,access_token}`,
          { timeout: 10000 }
        );
        
        if (altPagesResponse.ok) {
          const altPagesData = await altPagesResponse.json();
          console.log('Alternative pages response:', JSON.stringify(altPagesData, null, 2));
          
          if (altPagesData.accounts && altPagesData.accounts.data && altPagesData.accounts.data.length > 0) {
            const pages = altPagesData.accounts.data.map(page => ({
              id: page.id,
              name: page.name,
              accessToken: page.access_token,
              hasInstagram: false, // We'll check Instagram separately
              instagramAccount: null
            }));
            
            console.log(`Found ${pages.length} Facebook pages (alternative method)`);
            return res.json({ pages });
          }
        }
      } catch (error) {
        console.log('Alternative pages method failed:', error.message);
      }
      
        // Method 4: Check if user has any pages with different roles
      try {
        console.log('Method 4: Checking for pages with any role...');
        const rolesResponse = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&fields=id,name,access_token,role,tasks`,
          { timeout: 10000 }
        );
        
        if (rolesResponse.ok) {
          const rolesData = await rolesResponse.json();
          console.log('Pages with roles response:', JSON.stringify(rolesData, null, 2));
          
          if (rolesData.data && rolesData.data.length > 0) {
            const pages = rolesData.data.map(page => ({
              id: page.id,
              name: page.name,
              accessToken: page.access_token,
              role: page.role,
              tasks: page.tasks,
              hasInstagram: false,
              instagramAccount: null
            }));
            
            console.log(`Found ${pages.length} Facebook pages with roles`);
            return res.json({ pages });
          }
        } else {
          const errorText = await rolesResponse.text();
          console.log('Pages with roles failed:', errorText);
        }
      } catch (error) {
        console.log('Pages with roles method failed:', error.message);
      }
      
      // Method 5: Try different Facebook API versions
      try {
        console.log('Method 5: Trying different API versions...');
        const versions = ['v18.0', 'v19.0', 'v20.0', 'v21.0'];
        
        for (const version of versions) {
          console.log(`Trying API version: ${version}`);
          const versionResponse = await fetch(
            `https://graph.facebook.com/${version}/me/accounts?access_token=${token}&fields=id,name,access_token`,
            { timeout: 10000 }
          );
          
          if (versionResponse.ok) {
            const versionData = await versionResponse.json();
            console.log(`API ${version} response:`, JSON.stringify(versionData, null, 2));
            
            if (versionData.data && versionData.data.data && versionData.data.data.length > 0) {
              const pages = versionData.data.data.map(page => ({
                id: page.id,
                name: page.name,
                accessToken: page.access_token,
                hasInstagram: false,
                instagramAccount: null
              }));
              
              console.log(`Found ${pages.length} Facebook pages with API ${version}`);
              return res.json({ pages });
            }
          } else {
            const errorText = await versionResponse.text();
            console.log(`API ${version} failed:`, errorText);
          }
        }
      } catch (error) {
        console.log('API versions method failed:', error.message);
      }
      
      // Method 6: Check Facebook app connection and debug token
      try {
        console.log('Method 6: Debugging token and app connection...');
        
        // Debug environment variables
        console.log('Environment variables check:');
        console.log('FB_APP_ID:', process.env.FB_APP_ID ? 'SET' : 'NOT SET');
        console.log('FB_APP_SECRET:', process.env.FB_APP_SECRET ? 'SET' : 'NOT SET');
        console.log('NODE_ENV:', process.env.NODE_ENV);
        
        if (!process.env.FB_APP_ID || !process.env.FB_APP_SECRET) {
          console.log('❌ Facebook app credentials missing from environment variables!');
          return res.status(500).json({ message: 'Facebook app configuration missing' });
        }
        
        // Check token debug info
        const debugResponse = await fetch(
          `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`,
          { timeout: 10000 }
        );
        
        if (debugResponse.ok) {
          const debugData = await debugResponse.json();
          console.log('Token debug info:', JSON.stringify(debugData, null, 2));
          
          // Check if token is valid and has correct scopes
          if (debugData.data) {
            console.log('Token scopes:', debugData.data.scopes);
            console.log('Token type:', debugData.data.type);
            console.log('Token expires at:', debugData.data.expires_at);
            console.log('Token is valid:', debugData.data.is_valid);
          }
        } else {
          const errorText = await debugResponse.text();
          console.log('Token debug failed:', errorText);
        }
        
        // Check app permissions
        const appResponse = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${token}&fields=id,name,email,accounts{id,name,access_token,role}`,
          { timeout: 10000 }
        );
        
        if (appResponse.ok) {
          const appData = await appResponse.json();
          console.log('App connection response:', JSON.stringify(appData, null, 2));
          
          if (appData.accounts && appData.accounts.data && appData.accounts.data.length > 0) {
            const pages = appData.accounts.data.map(page => ({
              id: page.id,
              name: page.name,
              accessToken: page.access_token,
              role: page.role,
              hasInstagram: false,
              instagramAccount: null
            }));
            
            console.log(`Found ${pages.length} Facebook pages via app connection`);
            return res.json({ pages });
          }
        } else {
          const errorText = await appResponse.text();
          console.log('App connection failed:', errorText);
        }
      } catch (error) {
        console.log('App connection debug failed:', error.message);
      }
      
      // Method 7: Check for Instagram-linked pages specifically
      try {
        console.log('Method 7: Checking for Instagram-linked pages...');
        
        // Try to get pages with Instagram business accounts using the correct approach
        const instagramResponse = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${token}&fields=id,name,email,accounts{id,name,access_token,instagram_business_account{id,username,media_count}}`,
          { timeout: 10000 }
        );
        
        if (instagramResponse.ok) {
          const instagramData = await instagramResponse.json();
          console.log('Instagram-linked pages response:', JSON.stringify(instagramData, null, 2));
          
          if (instagramData.accounts && instagramData.accounts.data && instagramData.accounts.data.length > 0) {
            console.log('Found Instagram-linked pages!');
            const pages = instagramData.accounts.data.map(page => ({
              id: page.id,
              name: page.name,
              accessToken: page.access_token,
              hasInstagram: !!page.instagram_business_account,
              instagramAccount: page.instagram_business_account ? {
                id: page.instagram_business_account.id,
                username: page.instagram_business_account.username
              } : null
            }));
            
            console.log(`Found ${pages.length} Instagram-linked Facebook pages`);
            return res.json({ pages });
          }
        } else {
          const errorText = await instagramResponse.text();
          console.log('Instagram-linked pages failed:', errorText);
        }
      } catch (error) {
        console.log('Instagram-linked pages check failed:', error.message);
      }
      
      // Method 7.5: Try to get pages with business manager approach
      try {
        console.log('Method 7.5: Trying business manager approach...');
        
        // Some Instagram-linked pages are only accessible through business manager
        const businessPagesResponse = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${token}&fields=id,name,email,business_users{id,name,email,business{id,name,verification_status,owned_pages{id,name,access_token,instagram_business_account{id,username}}}}`,
          { timeout: 10000 }
        );
        
        if (businessPagesResponse.ok) {
          const businessPagesData = await businessPagesResponse.json();
          console.log('Business pages response:', JSON.stringify(businessPagesData, null, 2));
          
          if (businessPagesData.business_users && businessPagesData.business_users.data && businessPagesData.business_users.data.length > 0) {
            const business = businessPagesData.business_users.data[0].business;
            if (business && business.owned_pages && business.owned_pages.data && business.owned_pages.data.length > 0) {
              console.log('Found pages through business manager!');
              const pages = business.owned_pages.data.map(page => ({
                id: page.id,
                name: page.name,
                accessToken: page.access_token,
                hasInstagram: !!page.instagram_business_account,
                instagramAccount: page.instagram_business_account ? {
                  id: page.instagram_business_account.id,
                  username: page.instagram_business_account.username
                } : null
              }));
              
              console.log(`Found ${pages.length} Facebook pages through business manager`);
              return res.json({ pages });
            }
          }
        }
      } catch (error) {
        console.log('Business manager approach failed:', error.message);
      }
      
      // Method 7.6: Instagram-linked pages workaround - try to find page by name
      try {
        console.log('Method 7.6: Trying Instagram-linked pages workaround...');
        
        // Instagram-linked pages often need to be accessed differently
        // Try to get the page directly if we know the user ID might be a page
        const directPageResponse = await fetch(
          `https://graph.facebook.com/v21.0/${meData.id}?access_token=${token}&fields=id,name,category,fan_count,verification_status,instagram_business_account{id,username,media_count}`,
          { timeout: 10000 }
        );
        
        if (directPageResponse.ok) {
          const directPageData = await directPageResponse.json();
          console.log('Direct page access response:', JSON.stringify(directPageData, null, 2));
          
          // If it has a category and name, it's likely a page
          if (directPageData.id && directPageData.name && directPageData.category) {
            console.log('Found Instagram-linked page via direct access!');
            const pages = [{
              id: directPageData.id,
              name: directPageData.name,
              accessToken: token, // Use the current token
              hasInstagram: !!directPageData.instagram_business_account,
              instagramAccount: directPageData.instagram_business_account ? {
                id: directPageData.instagram_business_account.id,
                username: directPageData.instagram_business_account.username
              } : null
            }];
            
            console.log(`Found ${pages.length} Instagram-linked Facebook page (direct access)`);
            return res.json({ pages });
          }
        } else {
          const errorText = await directPageResponse.text();
          console.log('Direct page access failed:', errorText);
        }
      } catch (error) {
        console.log('Instagram-linked pages workaround failed:', error.message);
      }
      
      // Method 7.7: Try Instagram-specific endpoints for linked pages
      try {
        console.log('Method 7.7: Trying Instagram-specific endpoints...');
        
        // Instagram-linked pages sometimes need Instagram API endpoints
        const instagramEndpointResponse = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${token}&fields=id,name,email,accounts{id,name,access_token,instagram_business_account{id,username,media_count,profile_picture_url}}`,
          { timeout: 10000 }
        );
        
        if (instagramEndpointResponse.ok) {
          const instagramEndpointData = await instagramEndpointResponse.json();
          console.log('Instagram endpoint response:', JSON.stringify(instagramEndpointData, null, 2));
          
          if (instagramEndpointData.accounts && instagramEndpointData.accounts.data && instagramEndpointData.accounts.data.length > 0) {
            console.log('Found pages through Instagram endpoint!');
            const pages = instagramEndpointData.accounts.data.map(page => ({
              id: page.id,
              name: page.name,
              accessToken: page.access_token,
              hasInstagram: !!page.instagram_business_account,
              instagramAccount: page.instagram_business_account ? {
                id: page.instagram_business_account.id,
                username: page.instagram_business_account.username
              } : null
            }));
            
            console.log(`Found ${pages.length} Facebook pages through Instagram endpoint`);
            return res.json({ pages });
          }
        } else {
          const errorText = await instagramEndpointResponse.text();
          console.log('Instagram endpoint failed:', errorText);
        }
      } catch (error) {
        console.log('Instagram endpoint method failed:', error.message);
      }
      
      // Method 7.8: GPT's solution - try /me/accounts with Instagram fields
      try {
        console.log('Method 7.8: Trying GPT\'s solution - /me/accounts with Instagram fields...');
        
        // GPT's exact solution: GET /me/accounts?fields=id,name,instagram_business_account
        const gptSolutionResponse = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&fields=id,name,access_token,instagram_business_account{id,username,media_count}`,
          { timeout: 10000 }
        );
        
        if (gptSolutionResponse.ok) {
          const gptSolutionData = await gptSolutionResponse.json();
          console.log('GPT solution response:', JSON.stringify(gptSolutionData, null, 2));
          
          if (gptSolutionData.data && gptSolutionData.data.length > 0) {
            console.log('GPT solution worked! Found pages with Instagram fields');
            const pages = gptSolutionData.data.map(page => ({
              id: page.id,
              name: page.name,
              accessToken: page.access_token,
              hasInstagram: !!page.instagram_business_account,
              instagramAccount: page.instagram_business_account ? {
                id: page.instagram_business_account.id,
                username: page.instagram_business_account.username
              } : null
            }));
            
            console.log(`Found ${pages.length} Facebook pages using GPT's solution`);
            return res.json({ pages });
          }
        } else {
          const errorText = await gptSolutionResponse.text();
          console.log('GPT solution failed:', errorText);
        }
      } catch (error) {
        console.log('GPT solution method failed:', error.message);
      }
      
      // Method 8: Check for business accounts
      try {
        console.log('Method 8: Checking for business accounts...');
        const businessResponse = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${token}&fields=id,name,email,business_users{id,name,email,business{id,name,verification_status}}`,
          { timeout: 10000 }
        );
        
        if (businessResponse.ok) {
          const businessData = await businessResponse.json();
          console.log('Business accounts response:', JSON.stringify(businessData, null, 2));
          
          if (businessData.business_users && businessData.business_users.data && businessData.business_users.data.length > 0) {
            console.log('Found business accounts, but no pages. This suggests you need to create or get admin access to a Facebook page.');
          }
        }
      } catch (error) {
        console.log('Business accounts check failed:', error.message);
      }
      
      // Method 9: Check if Instagram permissions are missing
      try {
        console.log('Method 9: Checking Instagram permissions...');
        
        // Instagram-linked pages often need additional permissions
        const instagramPermissionsResponse = await fetch(
          `https://graph.facebook.com/v21.0/me/permissions?access_token=${token}`,
          { timeout: 10000 }
        );
        
        if (instagramPermissionsResponse.ok) {
          const instagramPermissionsData = await instagramPermissionsResponse.json();
          console.log('All token permissions:', instagramPermissionsData.data.map(p => `${p.permission}: ${p.status}`));
          
          // Check for Instagram-specific permissions
          const hasInstagramBasic = instagramPermissionsData.data.some(p => p.permission === 'instagram_basic' && p.status === 'granted');
          const hasInstagramContent = instagramPermissionsData.data.some(p => p.permission === 'instagram_content_publish' && p.status === 'granted');
          
          console.log('Instagram Basic permission:', hasInstagramBasic ? 'GRANTED' : 'MISSING');
          console.log('Instagram Content permission:', hasInstagramContent ? 'GRANTED' : 'MISSING');
          
                  if (!hasInstagramBasic) {
          console.log('⚠️ Instagram Basic permission missing - this might be why Instagram-linked pages don\'t show up');
        }
      }
    } catch (error) {
      console.log('Instagram permissions check failed:', error.message);
    }
    
    // Method 10: Check if user has any pages at all
    try {
      console.log('Method 10: Checking if user has any pages...');
      
      // Try to get any pages the user might have access to
      const userPagesResponse = await fetch(
        `https://graph.facebook.com/v21.0/me?access_token=${token}&fields=id,name,accounts{id,name,access_token,instagram_business_account{id,username}}`,
        { timeout: 10000 }
      );
      
      if (userPagesResponse.ok) {
        const userPagesData = await userPagesResponse.json();
        console.log('User pages check response:', JSON.stringify(userPagesData, null, 2));
        
        if (userPagesData.accounts && userPagesData.accounts.data && userPagesData.accounts.data.length > 0) {
          console.log('Found pages through user accounts field!');
          const pages = userPagesData.accounts.data.map(page => ({
            id: page.id,
            name: page.name,
            accessToken: page.access_token,
            hasInstagram: !!page.instagram_business_account,
            instagramAccount: page.instagram_business_account ? {
              id: page.instagram_business_account.id,
              username: page.instagram_business_account.username
            } : null
          }));
          
          console.log(`Found ${pages.length} Facebook pages through user accounts`);
          return res.json({ pages });
        } else {
          console.log('No pages found in user accounts field either');
          console.log('User definitely has no Facebook Pages');
          console.log('SOLUTION: User needs to create a Facebook Page first');
        }
      } else {
        const errorText = await userPagesResponse.text();
        console.log('User pages check failed:', errorText);
      }
    } catch (error) {
      console.log('User pages check method failed:', error.message);
    }
  }
  console.log('Facebook pages data:', JSON.stringify(data, null, 2));
    
    if (data.error) {
      return res.status(400).json({ message: data.error.message });
    }
    
    const pages = data.data.map(page => ({
      id: page.id,
      name: page.name,
      accessToken: page.access_token,
      hasInstagram: !!page.instagram_business_account,
      instagramAccount: page.instagram_business_account ? {
        id: page.instagram_business_account.id,
        username: page.instagram_business_account.username
      } : null
    }));
    
    console.log(`Found ${pages.length} Facebook pages`);
    
    if (pages.length === 0) {
      console.log('⚠️ NO FACEBOOK PAGES FOUND!');
      console.log('This means:');
      console.log('1. You have no Facebook Pages (only a personal profile)');
      console.log('2. Instagram can only be connected to Facebook Pages, not personal profiles');
      console.log('3. SOLUTION: Create a Facebook Page first at facebook.com/pages/create');
      console.log('4. Then connect Instagram to that page');
      
      return res.json({ 
        pages: [],
        message: 'No Facebook Pages found. You need to create a Facebook Page first before connecting Instagram.',
        solution: 'Go to facebook.com/pages/create to create a page, then connect Instagram to it.'
      });
    }
    
    return res.json({ pages });
  } catch (error) {
    console.error('Error getting Facebook pages:', error);
    return res.status(500).json({ message: 'Failed to get pages', error: error.message });
  }
}

async function selectFacebookPage(req, res) {
  try {
    const { pageId, pageName } = req.body;
    
    if (!pageId) {
      return res.status(400).json({ message: 'pageId is required' });
    }
    
    // Get the user's Facebook account to get the access token
    const userAccount = await FacebookAccount.findOne({ where: { userId: req.userId } });
    if (!userAccount || !userAccount.accessToken) {
      return res.status(400).json({ message: 'No Facebook account connected. Please connect your Facebook account first.' });
    }
    
    const userAccessToken = crypto.decrypt(userAccount.accessToken);
    
    // Get page details and verify the user has access to this page
    const pageResponse = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=name,access_token&access_token=${userAccessToken}`
    );
    const pageData = await pageResponse.json();
    
    if (pageData.error) {
      return res.status(400).json({ message: pageData.error.message });
    }
    
    // Update or create Facebook account with page-specific token
    const [account, created] = await FacebookAccount.findOrCreate({
      where: { userId: req.userId },
      defaults: {
        userId: req.userId,
        pageId: pageId,
        destination: 'page',
        accessToken: crypto.encrypt(pageData.access_token || userAccessToken),
        name: pageData.name || pageName
      }
    });
    
    if (!created) {
      account.pageId = pageId;
      account.destination = 'page';
      account.accessToken = crypto.encrypt(pageData.access_token || userAccessToken);
      account.name = pageData.name || pageName;
      await account.save();
    }
    
    return res.json({
      success: true,
      pageId: pageId,
      pageName: pageData.name || pageName
    });
  } catch (error) {
    console.error('Error selecting Facebook page:', error);
    return res.status(500).json({ message: 'Failed to select page' });
  }
}

async function getFacebookGroups(req, res) {
  try {
    const account = await FacebookAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Facebook account connected' });
    }
    
    const token = crypto.decrypt(account.accessToken);
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me/groups?access_token=${token}&fields=id,name,member_count`
    );
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ message: data.error.message });
    }
    
    const groups = data.data.map(group => ({
      id: group.id,
      name: group.name,
      memberCount: group.member_count || 0
    }));
    
    return res.json({ groups });
  } catch (error) {
    console.error('Error getting Facebook groups:', error);
    return res.status(500).json({ message: 'Failed to get groups' });
  }
}

async function selectFacebookGroup(req, res) {
  try {
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: 'groupId is required' });
    }
    
    const account = await FacebookAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Facebook account connected' });
    }
    
    account.groupId = groupId;
    account.destination = 'group';
    await account.save();
    
    return res.json({ success: true, groupId });
  } catch (error) {
    console.error('Error selecting Facebook group:', error);
    return res.status(500).json({ message: 'Failed to select group' });
  }
}

async function exchangeCode(req, res) {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: 'code is required' });
    }
    
    console.log('Exchanging Facebook OAuth code:', code);
    
    // Exchange code for access token
    const { getClientCredentials } = require('../services/credentialsService');
    const { clientId: fbId, clientSecret: fbSecret, redirectUri: fbRedirect } = await getClientCredentials(req.userId, 'facebook');
    const tokenResponse = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: fbId,
        client_secret: fbSecret,
        redirect_uri: fbRedirect,
        code: code
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error);
      return res.status(400).json({ message: tokenData.error.message });
    }
    
    console.log('Facebook token received, getting long-lived token...');
    
    // Get long-lived token - FIXED: Use query parameters instead of body for GET request
    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${fbId}&client_secret=${fbSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    
    const longLivedData = await longLivedResponse.json();
    
    if (longLivedData.error) {
      console.error('Long-lived token error:', longLivedData.error);
      return res.status(400).json({ message: longLivedData.error.message });
    }
    
    console.log('Long-lived token received, getting user info...');
    
    // Get user info - try with email first, fallback to id,name only if email fails
    let userResponse = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${longLivedData.access_token}`
    );
    let userData = await userResponse.json();
    
    // If email field fails (e.g., for Pages), retry without email
    if (userData.error && userData.error.code === 100 && userData.error.message.includes('email')) {
      console.log('Email field not available, retrying without email field...');
      userResponse = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${longLivedData.access_token}`
      );
      userData = await userResponse.json();
    }
    
    if (userData.error) {
      return res.status(400).json({ message: userData.error.message });
    }
    
    console.log('User info received:', userData.name);
    
    // Encrypt and store the token
    const encryptedToken = crypto.encrypt(longLivedData.access_token);
    
    // Save or update Facebook account
    const [account, created] = await FacebookAccount.findOrCreate({
      where: { userId: req.userId },
      defaults: {
        userId: req.userId,
        fbUserId: userData.id,
        name: userData.name,
        email: userData.email || null, // Handle case where email is not available
        accessToken: encryptedToken,
        tokenExpiresAt: longLivedData.expires_in ? new Date(Date.now() + longLivedData.expires_in * 1000) : null
      }
    });
    
    if (!created) {
      account.fbUserId = userData.id;
      account.name = userData.name;
      account.email = userData.email || null; // Handle case where email is not available
      account.accessToken = encryptedToken;
      account.tokenExpiresAt = longLivedData.expires_in ? new Date(Date.now() + longLivedData.expires_in * 1000) : null;
      await account.save();
    }
    
    console.log('Facebook account saved successfully');
    
    return res.json({
      success: true,
      message: 'Facebook account connected successfully. Please select your Facebook page and Instagram account.',
      account: {
        id: account.id,
        name: account.name,
        email: account.email
      }
    });
    
  } catch (error) {
    console.error('Error exchanging code:', error);
    return res.status(500).json({ message: 'Failed to exchange code' });
  }
}

async function disconnectFacebook(req, res) {
  try {
    console.log('Disconnect request received for user:', req.userId);
    
    const account = await FacebookAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      console.log('No Facebook account found for user:', req.userId);
      return res.status(400).json({ message: 'No Facebook account connected' });
    }
    
    console.log('Found Facebook account to disconnect:', account.id);
    
    // Delete the Facebook account
    await account.destroy();
    
    console.log('Facebook account successfully disconnected for user:', req.userId);
    
    return res.json({
      success: true,
      message: 'Facebook account disconnected successfully'
    });
  } catch (error) {
    console.error('Error disconnecting Facebook account:', error);
    return res.status(500).json({ 
      message: 'Failed to disconnect Facebook account',
      error: error.message 
    });
  }
}

async function testFacebookConnection(req, res) {
  try {
    const account = await FacebookAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Facebook account connected' });
    }
    
    const token = crypto.decrypt(account.accessToken);
    
    // Simple test to check if token is valid
    const testResponse = await fetch(
      `https://graph.facebook.com/v21.0/me?access_token=${token}`,
      { timeout: 10000 }
    );
    
    if (!testResponse.ok) {
      return res.status(400).json({ 
        message: 'Facebook token is invalid or expired',
        status: testResponse.status 
      });
    }
    
    const testData = await testResponse.json();
    return res.json({ 
      message: 'Facebook connection is working',
      user: testData.name,
      userId: testData.id
    });
  } catch (error) {
    console.error('Error testing Facebook connection:', error);
    return res.status(500).json({ 
      message: 'Failed to test Facebook connection',
      error: error.message 
    });
  }
}

async function getInstagramAccounts(req, res) {
  try {
    const account = await FacebookAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Facebook account connected' });
    }
    
    const token = crypto.decrypt(account.accessToken);
    
            // First, test basic Facebook connection (without permissions for page tokens)
        console.log('Testing basic Facebook connection...');
        try {
          const testResponse = await fetch(
            `https://graph.facebook.com/v21.0/me?access_token=${token}`,
            { timeout: 10000 }
          );
          
          if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.log('Basic Facebook test failed:', errorText);
            return res.status(400).json({ 
              message: 'Facebook token is invalid or expired',
              error: errorText
            });
          }
          
          const testData = await testResponse.json();
          console.log('Basic Facebook test successful:', testData.name);
          console.log('This is a page token for page:', testData.id);
          
        } catch (testError) {
          console.log('Basic Facebook test error:', testError.message);
          return res.status(500).json({ 
            message: 'Failed to connect to Facebook',
            error: testError.message
          });
        }
    
    // Get pages and check which ones have Instagram with timeout and retry
    let pagesData;
    let retries = 3;
    
    while (retries > 0) {
      try {
        console.log(`Attempting to fetch Instagram accounts (attempt ${4 - retries}/3)`);
        
        // First, check if we have a page token or user token
        console.log('Checking token type...');
        const meResponse = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${token}`,
          { timeout: 10000 }
        );
        
        const meData = await meResponse.json();
        console.log('Token type check:', meData);
        
                // Try to get Instagram info directly from the current page
        console.log('Getting Instagram info from current page...');
        
        // Try different field combinations to see what works
        const fieldCombinations = [
          'instagram_business_account{id,username,media_count}',
          'instagram_business_account',
          'instagram_business_account{id,username}',
          'connected_instagram_account'
        ];
        
        let instagramData = null;
        let workingFields = null;
        
        for (const fields of fieldCombinations) {
          try {
            console.log(`Trying fields: ${fields}`);
            const instagramResponse = await fetch(
              `https://graph.facebook.com/v21.0/${meData.id}?access_token=${token}&fields=${fields}`,
              { timeout: 10000 }
            );
            
            if (instagramResponse.ok) {
              const responseData = await instagramResponse.json();
              console.log(`Response with fields "${fields}":`, JSON.stringify(responseData, null, 2));
              
              if (responseData.instagram_business_account || responseData.connected_instagram_account) {
                instagramData = responseData;
                workingFields = fields;
                break;
              }
            } else {
              const errorText = await instagramResponse.text();
              console.log(`Fields "${fields}" failed:`, errorText);
            }
          } catch (error) {
            console.log(`Fields "${fields}" error:`, error.message);
          }
        }
        
        if (!instagramData) {
          console.log('No Instagram data found with any field combination');
          
                  // Try alternative approach: get Instagram data using page token
        console.log('Trying alternative Instagram API approaches...');
        
        // Method 1: Get page token first, then Instagram data
        try {
          console.log('Method 1: Getting page token and Instagram data...');
          
          // Get page access token from user token
          const pageTokenResponse = await fetch(
            `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&fields=id,name,access_token,instagram_business_account{id,username,media_count}`,
            { timeout: 15000 }
          );
          
          if (pageTokenResponse.ok) {
            const pageTokenData = await pageTokenResponse.json();
            console.log('Pages data:', JSON.stringify(pageTokenData, null, 2));
            
            if (pageTokenData.data && pageTokenData.data.length > 0) {
              const instagramAccounts = pageTokenData.data
                .filter(page => page.instagram_business_account)
                .map(page => ({
                  pageId: page.id,
                  pageName: page.name,
                  instagramId: page.instagram_business_account.id,
                  username: page.instagram_business_account.username,
                  mediaCount: page.instagram_business_account.media_count || 0,
                  pageAccessToken: page.access_token
                }));
              
              if (instagramAccounts.length > 0) {
                console.log(`Found ${instagramAccounts.length} Instagram accounts via page token method`);
                return res.json({ instagramAccounts });
              }
            }
          }
        } catch (error) {
          console.log('Method 1 failed:', error.message);
        }
        
        // Method 2: Try to get Instagram account directly using page ID
        try {
          console.log('Method 2: Direct Instagram API call...');
          const instagramDirectResponse = await fetch(
            `https://graph.facebook.com/v21.0/${meData.id}?access_token=${token}&fields=instagram_business_account{id,username,media_count}`,
            { timeout: 15000 }
          );
            
            if (instagramDirectResponse.ok) {
              const instagramDirectData = await instagramDirectResponse.json();
              console.log('Direct Instagram API response:', JSON.stringify(instagramDirectData, null, 2));
              
              if (instagramDirectData.instagram_business_account) {
                const instagramAccounts = [{
                  pageId: meData.id,
                  pageName: meData.name,
                  instagramId: instagramDirectData.instagram_business_account.id,
                  username: instagramDirectData.instagram_business_account.username,
                  mediaCount: instagramDirectData.instagram_business_account.media_count || 0,
                  pageAccessToken: token // Include the page access token
                }];
                
                console.log(`Found ${instagramAccounts.length} Instagram accounts via direct API`);
                console.log('Returning Instagram accounts:', JSON.stringify(instagramAccounts, null, 2));
                return res.json({ instagramAccounts });
              }
            }
          } catch (directError) {
            console.log('Direct Instagram API failed:', directError.message);
          }
          
          // Method 2: Try to get Instagram account using different field names
          try {
            console.log('Method 2: Different field names...');
            const fieldNames = ['instagram_business_account', 'connected_instagram_account', 'instagram_account'];
            
            for (const fieldName of fieldNames) {
              const fieldResponse = await fetch(
                `https://graph.facebook.com/v21.0/${meData.id}?access_token=${token}&fields=${fieldName}`,
                { timeout: 10000 }
              );
              
              if (fieldResponse.ok) {
                const fieldData = await fieldResponse.json();
                console.log(`Field "${fieldName}" response:`, JSON.stringify(fieldData, null, 2));
                
                if (fieldData[fieldName]) {
                  const instagramAccounts = [{
                    pageId: meData.id,
                    pageName: meData.name,
                    instagramId: fieldData[fieldName].id,
                    username: fieldData[fieldName].username,
                    mediaCount: fieldData[fieldName].media_count || 0,
                    pageAccessToken: token // Include the page access token
                  }];
                  
                  console.log(`Found ${instagramAccounts.length} Instagram accounts via field "${fieldName}"`);
                  console.log('Returning Instagram accounts:', JSON.stringify(instagramAccounts, null, 2));
                  return res.json({ instagramAccounts });
                }
              }
            }
          } catch (fieldError) {
            console.log('Field name method failed:', fieldError.message);
          }
          
          return res.json({ instagramAccounts: [] });
        }
        
        console.log(`Using fields: ${workingFields}`);
        const instagramResponse = { ok: true }; // Mock response since we already have data
        
        if (instagramResponse.ok) {
          console.log('Instagram data from page:', JSON.stringify(instagramData, null, 2));
          
          // Check for different possible field names
          const instagramAccount = instagramData.instagram_business_account || instagramData.connected_instagram_account;
          
          if (instagramAccount) {
            console.log('Instagram account found:', instagramAccount);
            const instagramAccounts = [{
              pageId: meData.id,
              pageName: meData.name,
              instagramId: instagramAccount.id,
              username: instagramAccount.username,
              mediaCount: instagramAccount.media_count || 0,
              pageAccessToken: token // Include the page access token
            }];
            
            console.log(`Found ${instagramAccounts.length} Instagram accounts via page token`);
            console.log('Returning Instagram accounts:', JSON.stringify(instagramAccounts, null, 2));
            return res.json({ instagramAccounts });
          } else {
            console.log('No Instagram account connected to this page');
            console.log('Available fields in response:', Object.keys(instagramData));
            return res.json({ instagramAccounts: [] });
          }
                 } else {
           const errorText = await instagramResponse.text();
           console.log('Instagram fetch failed:', errorText);
           return res.status(400).json({ 
             message: 'Failed to get Instagram info from page',
             error: errorText
           });
         }
         
         break; // Success, exit retry loop
        
      } catch (fetchError) {
        retries--;
        console.error(`Fetch attempt failed (${retries} retries left):`, fetchError.message);
        
        if (retries === 0) {
          throw fetchError;
        }
        
        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (pagesData.error) {
      return res.status(400).json({ message: pagesData.error.message });
    }
    
    // Filter pages that have Instagram accounts
    const instagramAccounts = pagesData.data
      .filter(page => page.instagram_business_account)
      .map(page => ({
        pageId: page.id,
        pageName: page.name,
        instagramId: page.instagram_business_account.id,
        username: page.instagram_business_account.username,
        mediaCount: page.instagram_business_account.media_count || 0
      }));
    
    // If no Instagram accounts found, try a different approach
    if (instagramAccounts.length === 0) {
      console.log('No Instagram accounts found in pages, trying alternative method...');
      
      // Try to get Instagram accounts directly
      try {
        const instagramResponse = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&fields=id,name,instagram_business_account{id,username,media_count}`,
          { timeout: 15000 }
        );
        
        if (instagramResponse.ok) {
          const instagramData = await instagramResponse.json();
          if (instagramData.data && instagramData.data.length > 0) {
            const altInstagramAccounts = instagramData.data
              .filter(page => page.instagram_business_account)
              .map(page => ({
                pageId: page.id,
                pageName: page.name,
                instagramId: page.instagram_business_account.id,
                username: page.instagram_business_account.username,
                mediaCount: page.instagram_business_account.media_count || 0
              }));
            
            if (altInstagramAccounts.length > 0) {
              console.log(`Found ${altInstagramAccounts.length} Instagram accounts via alternative method`);
              return res.json({ instagramAccounts: altInstagramAccounts });
            }
          }
        }
      } catch (altError) {
        console.log('Alternative Instagram fetch also failed:', altError.message);
      }
    }
    
    console.log(`Found ${instagramAccounts.length} Instagram accounts`);
    return res.json({ instagramAccounts });
  } catch (error) {
    console.error('Error getting Instagram accounts:', error);
    return res.status(500).json({ 
      message: 'Failed to get Instagram accounts',
      error: error.message 
    });
  }
}

async function selectInstagramAccount(req, res) {
  try {
    const { pageId, instagramId, accessToken } = req.body;
    
    if (!pageId || !instagramId) {
      return res.status(400).json({ message: 'pageId and instagramId are required' });
    }
    
    // If no accessToken provided, try to get it from the user's Facebook account
    let tokenToUse = accessToken;
    if (!tokenToUse) {
      const userAccount = await FacebookAccount.findOne({ where: { userId: req.userId } });
      if (!userAccount || !userAccount.accessToken) {
        return res.status(400).json({ message: 'No Facebook account connected. Please connect your Facebook account first.' });
      }
      tokenToUse = crypto.decrypt(userAccount.accessToken);
    }
    
    console.log('Selecting Instagram account:', { pageId, instagramId, hasToken: !!tokenToUse });
    
    // Get Instagram account details
    const instagramResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramId}?fields=id,username,media_count&access_token=${tokenToUse}`,
      { timeout: 10000 }
    );
    
    if (!instagramResponse.ok) {
      const errorText = await instagramResponse.text();
      console.error('Instagram API error:', errorText);
      return res.status(400).json({ message: `Failed to get Instagram account details: ${errorText}` });
    }
    
    const instagramData = await instagramResponse.json();
    
    if (instagramData.error) {
      console.error('Instagram API error:', instagramData.error);
      return res.status(400).json({ message: instagramData.error.message });
    }
    
    console.log('Instagram account details:', instagramData);
    
    // Update or create Facebook account with Instagram info
    const [account, created] = await FacebookAccount.findOrCreate({
      where: { userId: req.userId },
      defaults: {
        userId: req.userId,
        pageId: pageId,
        instagramId: instagramId,
        instagramUsername: instagramData.username,
        destination: 'page', // Keep as page since it's still a Facebook page
        accessToken: crypto.encrypt(tokenToUse)
      }
    });
    
    if (!created) {
      account.pageId = pageId;
      account.instagramId = instagramId;
      account.instagramUsername = instagramData.username;
      account.destination = 'page'; // Keep as page since it's still a Facebook page
      account.accessToken = crypto.encrypt(tokenToUse);
      await account.save();
    }
    
    console.log('Instagram account selected successfully');
    
    return res.json({
      success: true,
      message: 'Instagram account selected successfully',
      instagramId: instagramId,
      username: instagramData.username
    });
  } catch (error) {
    console.error('Error selecting Instagram account:', error);
    return res.status(500).json({ message: 'Failed to select Instagram account', error: error.message });
  }
}

module.exports = {
  getFacebookAccount,
  getFacebookPages,
  selectFacebookPage,
  getFacebookGroups,
  selectFacebookGroup,
  exchangeCode,
  getInstagramAccounts,
  selectInstagramAccount,
  testFacebookConnection,
  disconnectFacebook
};



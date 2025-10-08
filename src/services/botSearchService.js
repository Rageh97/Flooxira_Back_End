const Fuse = require('fuse.js');
const { BotField } = require('../models/botField');
const { BotData } = require('../models/botData');
const { BotSettings } = require('../models/botSettings');
const OpenAI = require('openai');
const conversationService = require('./conversationService');
let GoogleGenerativeAI;
try { GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI; } catch (_) { GoogleGenerativeAI = null; }

let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (_) {
  openai = null;
}

async function callGeminiHTTP(model, prompt) {
  const fetch = require('node-fetch');
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`;
  const body = {
    contents: [
      { role: 'user', parts: [{ text: prompt }] }
    ]
  };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini HTTP ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text?.trim();
}

// Field aliases in Arabic and English to understand intent-based questions
const FIELD_ALIASES = {
  name: ['اسم_المنتج', 'product_name', 'name', 'الاسم', 'اسم', 'اسم_المنتج', 'product_name'],
  price: ['السعر', 'price', 'التكلفة', 'cost', 'سعر', 'السعر'],
  description: ['الوصف', 'description', 'details', 'تفاصيل', 'وصف', 'الوصف'],
  category: ['الفئة', 'القسم', 'التصنيف', 'category', 'فئة', 'الفئة'],
  brand: ['الماركة', 'brand', 'ماركة', 'الماركة'],
  warranty: ['الضمان', 'warranty', 'ضمان', 'الضمان'],
  stock: ['المخزون', 'stock', 'مخزون', 'المخزون'],
  availability: ['متوفر', 'التوفر', 'المتوفر', 'متاح', 'availability', 'stock', 'in_stock']
};

function normalizeArabic(text) {
  return String(text || '')
    .replace(/[\u064B-\u0652]/g, '') // remove tashkeel
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

const AR_STOPWORDS = new Set(['في','من','الى','إلى','على','عن','مع','ثم','او','أو','أن','إن','كان','كانت','هذا','هذه','ذلك','تلك','هل','ما','ماذا','كم','كيف','اي','أي','لو','من فضلك','من_فضلك','شكرا','شكراً','السلام','عليكم','مرحبا','مرحباً']);

function tokenize(text) {
  const t = normalizeArabic(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return t.split(/\s+/).filter(Boolean).filter((w) => !AR_STOPWORDS.has(w));
}

const SYNONYMS = new Map([
  ['سعر', ['ثمن','بكام','price','تكلفه','التكلفة']],
  ['منتج', ['بضاعه','بضاع','منتجات','items','products','سلعة','سلع']],
  ['متوفر', ['متاح','available','in_stock','يوجد','يوجَد','موجود']],
  ['فئة', ['قسم','تصنيف','category']],
  ['اسم', ['name','لقب','عنوان']]
]);

const SMALL_TALK = [
  { match: /(السلام\s*عليكم|salam|assalamu)/i, reply: 'وعليكم السلام ورحمة الله وبركاته 👋\nأهلاً وسهلاً في شانس بلاي! 🎮\nأنا سلمى، موظفة خدمة العملاء هنا 😊\nشانس بلاي منصة متخصصة في الألعاب والترفيه الرقمي، نقدم أفضل المنتجات والخدمات لعشاق الألعاب 🎯\nكيف أقدر أساعدك اليوم؟' },
  { match: /(مرحبا|اهلا|أهلا|hi|hello)/i, reply: 'أهلاً وسهلاً في شانس بلاي! 🎮\nأنا سلمى، موظفة خدمة العملاء هنا 😊\nكيف أقدر أساعدك اليوم؟' },
  { match: /(شكرا|شكرًا|thanks|thank you)/i, reply: 'على الرحب والسعة! 😊\nهل في شي ثاني أقدر أساعدك فيه؟' },
  { match: /(مع السلامه|وداعا|باي|bye)/i, reply: 'إلى اللقاء! 🙋‍♀️\nنتمنى لك يوماً سعيداً، وترجع لنا أي وقت!' },
  { match: /(مستعد|بدي اشتريها|موافق على الشراء|اقتنعت|خلاص موافق)/i, reply: 'ممتاز! تفضل رابط الشراء:\nhttps://chanceplay.com/buy-now\n\nشكراً لثقتك في شانس بلاي! 🎉' }
];

// Smart greeting function that considers conversation history
function getSmartGreeting(conversationContext) {
  if (!conversationContext) {
    return 'أهلاً وسهلاً في شانس بلاي! 🎮\nأنا سلمى، موظفة خدمة العملاء هنا 😊\nكيف أقدر أساعدك اليوم؟';
  }

  const { isReturningCustomer, customerName, serviceContext, conversationStage } = conversationContext;

  // Returning customer - no greeting, direct to business
  if (isReturningCustomer) {
    if (customerName) {
      return `أهلاً ${customerName}! 😊\nكيف أقدر أساعدك اليوم؟`;
    }
    return 'أهلاً! 😊\nكيف أقدر أساعدك اليوم؟';
  }

  // First time customer - full greeting
  return 'أهلاً وسهلاً في شانس بلاي! 🎮\nأنا سلمى، موظفة خدمة العملاء هنا 😊\nكيف أقدر أساعدك اليوم؟';
}

function expandQueryWithSynonyms(query) {
  const tokens = tokenize(query);
  const expanded = new Set(tokens);
  for (const t of tokens) {
    for (const [key, vals] of SYNONYMS.entries()) {
      if (t.includes(key) || vals.some((v) => t.includes(v))) {
        expanded.add(key);
        vals.forEach((v) => expanded.add(v));
      }
    }
  }
  return Array.from(expanded);
}

function detectIntent(query) {
  const q = normalizeArabic(query).toLowerCase();
  const isQuestion = /^(هل|ما|اي|أي|ماذا|كم|كيف)\b/.test(q) || q.includes('؟');
  const inventoryTerms = ['منتج', 'منتجات', 'بضاعه', 'بضاعة', 'بضاع', 'قائمة', 'كتالوج', 'catalog', 'products', 'items', 'available', 'list'];
  const priceTerms = ['السعر', 'ثمن', 'بكام', 'price', 'تكلفة', 'تكلفه'];
  const descTerms = ['وصف', 'الوصف', 'description', 'تفاصيل'];
  const availTerms = ['متوفر', 'المتوفر', 'متاح', 'availability', 'stock', 'in_stock'];

  const has = (terms) => terms.some((t) => q.includes(t));
  if (has(priceTerms)) return { type: 'price' };
  if (has(descTerms)) return { type: 'description' };
  if (has(availTerms)) return { type: 'availability' };
  if (has(inventoryTerms)) return { type: 'inventory' };
  return { type: isQuestion ? 'generic_question' : 'unknown' };
}

function getFieldValue(data, aliases) {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] && String(data[key]).trim() !== '') return data[key];
  }
  return undefined;
}

async function searchOrAnswer(userId, query, threshold = 0.5, limit = 3, contactNumber = null, customSettings = null) {
  // Get user's bot settings
  let userSettings = customSettings;
  if (!userSettings) {
    try {
      userSettings = await BotSettings.findOne({ where: { userId } });
    } catch (e) {
      console.log('[BotSearch] Failed to get user settings:', e.message);
    }
  }

  // Get conversation context first
  let conversationContext = null;
  if (contactNumber) {
    try {
      conversationContext = await conversationService.getSmartContext(userId, contactNumber);
    } catch (e) {
      console.log('[BotSearch] Failed to get conversation context:', e.message);
    }
  }

  // Smart small talk with memory awareness
  for (const st of SMALL_TALK) {
    if (st.match.test(query)) {
      // Check if this is a greeting and customer has greeted before
      if (st.match.test(query) && (query.includes('السلام') || query.includes('مرحبا') || query.includes('أهلا'))) {
        if (conversationContext && conversationContext.isReturningCustomer && conversationContext.greetingCount > 0) {
          // Returning customer - use smart greeting
          return { source: 'small_talk', answer: getSmartGreeting(conversationContext) };
        }
      }
      return { source: 'small_talk', answer: st.reply };
    }
  }

  const fields = await BotField.findAll({ where: { userId } });
  const rows = await BotData.findAll({ where: { userId }, order: [['createdAt','DESC']], limit: 1000 });
  console.log(`[BotSearch] userId=${userId} fields=${fields.length} rows=${rows.length} query="${query}"`);
  console.log(`[BotSearch] Field names:`, fields.map(f => f.fieldName));
  console.log(`[BotSearch] Sample data:`, rows.slice(0, 2).map(r => r.data));
  
  const keys = fields.map((f) => `data.${f.fieldName}`);
  const list = rows.map((r) => ({ id: r.id, data: r.data }));

  if (list.length && keys.length) {
    // create a composite field to improve matching across all values
    const decorated = list.map((item) => ({
      ...item,
      __composite: [
        // include keys and values to help match generic terms
        ...Object.keys(item.data || {}),
        ...Object.values(item.data || {}).filter(v => v && String(v).trim() !== '')
      ].map(v => normalizeArabic(v)).join(' | ')
    }));
    
    console.log(`[BotSearch] Decorated sample:`, decorated.slice(0, 1));
    
    const fuse = new Fuse(decorated, {
      includeScore: true,
      threshold: Math.max(0.2, Math.min(threshold, 0.8)), // More flexible threshold
      distance: 300,
      ignoreLocation: true,
      minMatchCharLength: 1,
      useExtendedSearch: true,
      keys: [...keys, '__composite']
    });
    
    const expanded = expandQueryWithSynonyms(query);
    const extended = expanded.map((t) => ({ $or: [{ __composite: t }, ...keys.map((k) => ({ [k]: t }))] }));
    const normalizedQuery = normalizeArabic(query);
    
    console.log(`[BotSearch] Expanded query:`, expanded);
    console.log(`[BotSearch] Normalized query:`, normalizedQuery);
    
    const results = fuse.search(extended.length ? { $and: extended } : normalizedQuery).slice(0, limit);
    
    console.log(`[BotSearch] Search results:`, results.length, results.map(r => ({ score: r.score, item: r.item.id })));
    
    if (results.length && (results[0].score ?? 1) <= threshold) {
      return { source: 'fuse', matches: results.map((r) => r.item) };
    }
  }

  // Intent-based answers
  try {
    const intent = detectIntent(query);
    if (list.length) {
      const nameAliases = FIELD_ALIASES.name;
      const priceAliases = FIELD_ALIASES.price;
      const descAliases = FIELD_ALIASES.description;
      const availAliases = FIELD_ALIASES.availability;

      // Find a likely product by name tokens
      const nameIndexed = list.map((it) => ({
        ...it,
        __name: normalizeArabic(String(getFieldValue(it.data, nameAliases) ?? ''))
      }));
      const fuseName = new Fuse(nameIndexed, { includeScore: true, threshold: 0.5, keys: ['__name'] });
      const normalizedQuery = normalizeArabic(query);
      const nameResults = fuseName.search(normalizedQuery);

      if (intent.type === 'price' && nameResults.length) {
        const match = nameResults[0].item;
        const data = match.data || {};
        const nameVal = getFieldValue(data, nameAliases) || 'هذا المنتج';
        const priceVal = getFieldValue(data, priceAliases);
        const descVal = getFieldValue(data, descAliases);
        const warrantyVal = data['الضمان'] || data['warranty'] || '';
        
        if (typeof priceVal !== 'undefined') {
          let answer = `💰 سعر ${nameVal}: ${priceVal} ريال سعودي\n`;
          if (descVal) answer += `📝 الوصف: ${String(descVal).slice(0, 150)}\n`;
          if (warrantyVal) answer += `🛡️ الضمان: ${warrantyVal}\n`;
          answer += `\n✨ هذا سعر ممتاز مقارنة بجودة المنتج!\n🚚 توصيل مجاني لجميع أنحاء المملكة\n🎮 شانس بلاي - منصة الألعاب والترفيه الرقمي المفضلة`;
          return { source: 'direct', answer };
        }
      }
      if (intent.type === 'description' && nameResults.length) {
        const match = nameResults[0].item;
        const data = match.data || {};
        const nameVal = getFieldValue(data, nameAliases) || 'هذا المنتج';
        const descVal = getFieldValue(data, descAliases);
        const priceVal = getFieldValue(data, priceAliases);
        const warrantyVal = data['الضمان'] || data['warranty'] || '';
        
        if (descVal) {
          let answer = `📱 المنتج: ${nameVal}\n`;
          answer += `📝 الوصف التفصيلي:\n${descVal}\n`;
          if (priceVal) answer += `💰 السعر: ${priceVal} ريال سعودي\n`;
          if (warrantyVal) answer += `🛡️ الضمان: ${warrantyVal}\n`;
          answer += `\n✨ هذا المنتج مميز جداً ويستحق الشراء! 💯\n🚚 توصيل سريع لجميع أنحاء المملكة\n🎮 شانس بلاي - منصة الألعاب والترفيه الرقمي المفضلة`;
          return { source: 'direct', answer };
        }
      }
      if (intent.type === 'availability' && nameResults.length) {
        const match = nameResults[0].item;
        const data = match.data || {};
        const nameVal = getFieldValue(data, nameAliases) || 'هذا المنتج';
        const availVal = getFieldValue(data, availAliases);
        const priceVal = getFieldValue(data, priceAliases);
        const stockVal = data['المخزون'] || data['stock'] || '';
        
        if (typeof availVal !== 'undefined') {
          const asText = String(availVal).toLowerCase();
          const yes = ['yes','true','1','متاح','متوفر','available','in_stock'].some(v => asText.includes(v));
          
          if (yes) {
            let answer = `✅ ${nameVal} متوفر عندنا الآن! 🎉\n`;
            if (priceVal) answer += `💰 السعر: ${priceVal} ريال سعودي\n`;
            if (stockVal) answer += `📦 المخزون: ${stockVal}\n`;
            answer += `🛡️ عندك ضمان كامل وخدمة عملاء ممتازة في شانس بلاي!\n🚚 توصيل سريع لجميع أنحاء المملكة\n🎮 شانس بلاي - منصة الألعاب والترفيه الرقمي المفضلة`;
            return { source: 'direct', answer };
          } else {
            return { source: 'direct', answer: `${nameVal} غير متوفر حالياً 😔\nبس عندنا منتجات مشابهة ممتازة! شوفها 👇` };
          }
        }
      }

      // Inventory/listing style question → concise list
      if (intent.type === 'inventory') {
        const preferredNameKeys = nameAliases;
        const preferredPriceKeys = priceAliases;
        const lines = list.slice(0, 5).map((it, idx) => {
          const data = it.data || {};
          const nameKey = preferredNameKeys.find(k => Object.prototype.hasOwnProperty.call(data, k)) || Object.keys(data)[0];
          const priceKey = preferredPriceKeys.find(k => Object.prototype.hasOwnProperty.call(data, k));
          const nameVal = nameKey ? data[nameKey] : `#${idx + 1}`;
          const priceVal = priceKey ? data[priceKey] : undefined;
          return priceVal ? `${idx + 1}- ${nameVal} - ${priceVal}` : `${idx + 1}- ${nameVal}`;
        });
        const more = list.length > 5 ? `\n+${list.length - 5} منتج آخر مميز! 🎉` : '';
        const summary = `عندنا ${list.length} منتج مميز في شانس بلاي! شوف بعضها:\n` + lines.join('\n') + more + `\n\nكلها بجودة عالية وضمان كامل! 💯\n🎮 شانس بلاي - منصة الألعاب والترفيه الرقمي المفضلة`;
        return { source: 'summary', answer: summary };
      }
    }
  } catch {}

  // Conversation context already retrieved above

  // LLM fallback: try OpenAI then Gemini, with STRICT grounding to DB
  // Rank rows by simple token overlap to keep only the most relevant context
  const tokens = tokenize(query);
  const scored = list.map((item) => {
    const text = tokenize(Object.values(item.data || {}).join(' ')).join(' ');
    const score = tokens.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
    return { item, score };
  }).sort((a, b) => b.score - a.score);
  const top = (scored[0]?.score || 0) > 0 ? scored.slice(0, 12).map(s => s.item) : list.slice(0, 12);
  const context = top.map((r) => r.data);
  
  // Build enhanced system prompt with user settings
  let systemPrompt = [];
  
  if (userSettings?.systemPrompt) {
    // Use custom system prompt
    systemPrompt.push(userSettings.systemPrompt);
  } else {
    // Use default prompts based on personality
    const defaultPrompts = {
      professional: [
        'أنت مساعد مهني ومتخصص في خدمة العملاء. تتعامل مع العملاء بأسلوب مهني ومهذب.',
        'ركز على تقديم المعلومات الدقيقة والمساعدة الفعالة.',
        'استخدم لغة واضحة ومهنية في جميع ردودك.'
      ],
      friendly: [
        'أنت مساعد ودود ومفيد. تتعامل مع العملاء بأسلوب دافئ ومقرب.',
        'كن مرحباً ومتفهماً لاحتياجات العملاء.',
        'استخدم لغة ودودة ومريحة في جميع ردودك.'
      ],
      casual: [
        'أنت مساعد مرتاح ومريح. تتعامل مع العملاء بأسلوب غير رسمي وودود.',
        'كن طبيعياً ومريحاً في التعامل.',
        'استخدم لغة يومية ومريحة في جميع ردودك.'
      ],
      formal: [
        'أنت مساعد رسمي ومهني. تتعامل مع العملاء بأسلوب رسمي ومهذب.',
        'ركز على الدقة والاحترافية في جميع التفاعلات.',
        'استخدم لغة رسمية ومهنية في جميع ردودك.'
      ],
      marketing: [
        'أنت مسوق خبير سعودي بخبرة 15 سنة في مجال التسويق. تتعامل مع العملاء باللهجة السعودية العامية.',
        'أسلوبك ودود ومقنع، تركز على فهم احتياجات العميل وتقديم الحلول المناسبة.',
        'عندما يقرر العميل الشراء، قدم رابط المنتج مباشرة ولا تعرض خدمات أخرى.',
        'إذا لم تجد المعلومات المطلوبة في البيانات المتوفرة، اعتذر وأخبره أن الخدمة ستتوفر قريباً.',
        'استخدم اللهجة السعودية في جميع ردودك وتجنب اللغة الرسمية.',
        'كن مختصراً ومهنياً، وتجنب الترحيب المتكرر في نفس المحادثة.'
      ]
    };
    
    const personality = userSettings?.personality || 'marketing';
    systemPrompt = defaultPrompts[personality] || defaultPrompts.marketing;
  }
  
  // Add business context if available
  if (userSettings?.businessName) {
    systemPrompt.push(`اسم الشركة: ${userSettings.businessName}`);
  }
  if (userSettings?.businessType) {
    systemPrompt.push(`نوع النشاط: ${userSettings.businessType}`);
  }
  if (userSettings?.businessDescription) {
    systemPrompt.push(`وصف النشاط: ${userSettings.businessDescription}`);
  }
  if (userSettings?.targetAudience) {
    systemPrompt.push(`الجمهور المستهدف: ${userSettings.targetAudience}`);
  }

  // Add conversation context awareness
  if (conversationContext) {
    if (conversationContext.customerName) {
      systemPrompt.push(`اسم العميل: ${conversationContext.customerName}`);
    }
    
    // Enhanced memory instructions
    if (conversationContext.isReturningCustomer) {
      systemPrompt.push('هذا عميل عائد - لا ترحب به مرة أخرى، ابدأ مباشرة بالموضوع.');
    }
    
    if (conversationContext.serviceContext && conversationContext.serviceContext.length > 0) {
      systemPrompt.push(`الخدمات المذكورة سابقاً: ${conversationContext.serviceContext.join(', ')}`);
    }
    
    if (conversationContext.conversationStage) {
      const stageInstructions = {
        'closing': 'العميل مستعد للشراء - ركز على إتمام الصفقة وقدم رابط الشراء.',
        'negotiation': 'العميل يبحث عن خصم - اقنعه بالقيمة والجودة.',
        'price_sensitive': 'العميل حساس للسعر - ركز على الفوائد والضمان.',
        'engaged': 'العميل مهتم ومتفاعل - قدم تفاصيل أكثر.',
        'interested': 'العميل يظهر اهتماماً - اشرح الفوائد.',
        'returning_customer': 'عميل عائد - لا ترحب، ابدأ مباشرة بالموضوع المطلوب.',
        'familiar_customer': 'عميل مألوف - استخدم أسلوب ودود ومباشر.',
        'exploration': 'العميل يستكشف - قدم نظرة عامة على الخدمات.'
      };
      if (stageInstructions[conversationContext.conversationStage]) {
        systemPrompt.push(stageInstructions[conversationContext.conversationStage]);
      }
    }
    
    if (conversationContext.previousTopics && conversationContext.previousTopics.length > 0) {
      systemPrompt.push(`المواضيع السابقة: ${conversationContext.previousTopics.join(', ')}`);
    }
    
    // Add greeting awareness
    if (conversationContext.greetingCount > 0) {
      systemPrompt.push('العميل رحب سابقاً - لا تكرر الترحيب، ابدأ مباشرة بالموضوع.');
    }
  }

  const system = systemPrompt.join(' ');
  const guidanceAr = 'استخدم البيانات التالية للإجابة. إذا لم تجد المنتج/الخدمة المطلوبة، اعتذر وأخبره أن الخدمة ستتوفر قريباً. إذا قرر العميل الشراء، قدم رابط الشراء مباشرة.';
  
  let userPrompt = `User query: ${query}\n\n${guidanceAr}\n\nContext rows (JSON):\n${JSON.stringify(context, null, 2)}`;
  
  // Add conversation history if available
  if (conversationContext && conversationContext.recentMessages && conversationContext.recentMessages.length > 0) {
    const recentHistory = conversationContext.recentMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    userPrompt += `\n\nRecent conversation:\n${recentHistory}`;
  }

  const user = userPrompt;

  // Use user settings for AI configuration
  const aiProvider = userSettings?.aiProvider || 'both';
  const openaiModel = userSettings?.openaiModel || 'gpt-4o-mini';
  const geminiModel = userSettings?.geminiModel || 'gemini-2.5-flash';
  const temperature = userSettings?.temperature || 0.7;
  const maxTokens = userSettings?.maxTokens || 1000;

  // Try OpenAI first if configured
  if ((aiProvider === 'openai' || aiProvider === 'both') && process.env.OPENAI_API_KEY) {
    try {
      const resp = await openai.chat.completions.create({
        model: openaiModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: temperature,
        max_tokens: maxTokens
      });
      const text = resp.choices?.[0]?.message?.content?.trim() || 'No answer available.';
      return { source: 'openai', answer: text };
    } catch (e) {
      console.warn('[BotSearch] OpenAI call failed, will try Gemini if available:', e?.message || e);
    }
  }

  // Try Google Gemini if configured
  if ((aiProvider === 'gemini' || aiProvider === 'both') && GoogleGenerativeAI && process.env.GOOGLE_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const httpModel = geminiModel.startsWith('models/') ? geminiModel : `models/${geminiModel}`;
      const sdkModelId = httpModel.split('/').pop(); // strip 'models/' for SDK
      let model = null;
      try { model = genAI.getGenerativeModel({ model: sdkModelId }); } catch (_) { model = null; }
      const prompt = `${system}\n\n${user}`;
      try {
        const result = await model.generateContent(prompt);
        const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          return { source: 'gemini', answer: text.trim() };
        }
      } catch (sdkErr) {
        // SDK may target v1beta in older versions; try direct HTTP v1
        try {
          const text = await callGeminiHTTP(httpModel, prompt);
          if (text) return { source: 'gemini', answer: text };
        } catch (_) {}
        throw sdkErr;
      }
    } catch (e) {
      console.warn('[BotSearch] Gemini call failed:', e?.message || e);
    }
  }

  return { source: 'fallback', answer: 'Sorry, I could not find relevant information.' };
}

module.exports = { searchOrAnswer };



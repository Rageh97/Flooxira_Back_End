const Fuse = require('fuse.js');
const { BotField } = require('../models/botField');
const { BotData } = require('../models/botData');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function searchOrAnswer(userId, query, threshold = 0.3, limit = 3) {
  const fields = await BotField.findAll({ where: { userId } });
  const rows = await BotData.findAll({ where: { userId }, order: [['createdAt','DESC']], limit: 1000 });
  const keys = fields.map((f) => `data.${f.fieldName}`);
  const list = rows.map((r) => ({ id: r.id, data: r.data }));

  if (list.length && keys.length) {
    const fuse = new Fuse(list, { includeScore: true, threshold, keys });
    const results = fuse.search(query).slice(0, limit);
    if (results.length && (results[0].score ?? 1) <= threshold) {
      return { source: 'fuse', matches: results.map((r) => r.item) };
    }
  }

  // Fallback to OpenAI with context
  const context = list.slice(0, 50).map((r) => r.data);
  const system = 'You are a helpful assistant. Answer ONLY using the provided JSON rows if applicable. Be concise and factual.';
  const user = `User query: ${query}\n\nContext rows (JSON):\n${JSON.stringify(context, null, 2)}`;
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2,
      max_tokens: 300
    });
    const text = resp.choices?.[0]?.message?.content?.trim() || 'No answer available.';
    return { source: 'openai', answer: text };
  } catch (e) {
    return { source: 'fallback', answer: 'Sorry, I could not find relevant information.' };
  }
}

module.exports = { searchOrAnswer };



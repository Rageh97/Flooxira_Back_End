const { BotField } = require('../models/botField');
const { BotData } = require('../models/botData');
const { Op } = require('sequelize');
const XLSX = require('xlsx');

function sanitizeFieldName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 120) || 'field';
}

function inferType(value) {
  if (value === null || typeof value === 'undefined') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  const s = String(value).trim();
  if (!s) return 'string';
  if (!Number.isNaN(Number(s))) return 'number';
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return 'date';
  return 'string';
}

async function addField(req, res) {
  try {
    const userId = req.userId;
    const { fieldName, fieldType } = req.body || {};
    const name = sanitizeFieldName(fieldName);
    if (!name) return res.status(400).json({ message: 'fieldName required' });
    const type = ['string','number','boolean','date','text'].includes(fieldType) ? fieldType : 'string';
    const field = await BotField.create({ userId, fieldName: name, fieldType: type });
    return res.json({ field });
  } catch (e) {
    if (e?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Field already exists' });
    }
    return res.status(500).json({ message: e?.message || 'Failed to create field' });
  }
}

async function listFields(req, res) {
  const userId = req.userId;
  const fields = await BotField.findAll({ where: { userId }, order: [['createdAt', 'ASC']] });
  return res.json({ fields });
}

async function saveData(req, res) {
  try {
    const userId = req.userId;
    const { data } = req.body || {};
    if (!data || typeof data !== 'object') return res.status(400).json({ message: 'data (object) required' });
    const row = await BotData.create({ userId, data });
    return res.json({ row });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to save data' });
  }
}

async function listData(req, res) {
  const userId = req.userId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { rows, count } = await BotData.findAndCountAll({ where: { userId }, order: [['createdAt','DESC']], limit, offset });
  return res.json({ rows, count, limit, offset });
}

async function uploadExcel(req, res) {
  try {
    const userId = req.userId;
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file provided' });
    const wb = XLSX.readFile(file.path);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // collect fields
    const fieldNames = new Set();
    for (const row of json) {
      Object.keys(row).forEach((k) => fieldNames.add(sanitizeFieldName(k)));
    }
    const existing = await BotField.findAll({ where: { userId } });
    const existingNames = new Set(existing.map((f) => f.fieldName));
    const toCreate = [];
    for (const fname of fieldNames) {
      if (!existingNames.has(fname)) {
        // infer type from first non-empty value
        let inferred = 'string';
        for (const r of json) {
          const val = r[fname] ?? r[Object.keys(r).find((k) => sanitizeFieldName(k) === fname) || ''];
          if (val !== '' && typeof val !== 'undefined') {
            inferred = inferType(val);
            break;
          }
        }
        toCreate.push({ userId, fieldName: fname, fieldType: inferred });
      }
    }
    if (toCreate.length) await BotField.bulkCreate(toCreate, { ignoreDuplicates: true });

    // Save rows
    const normalizedRows = json.map((r) => {
      const data = {};
      for (const [k, v] of Object.entries(r)) {
        data[sanitizeFieldName(k)] = v;
      }
      return { userId, data };
    });
    if (normalizedRows.length) await BotData.bulkCreate(normalizedRows);

    return res.json({ success: true, fieldsCreated: toCreate.length, rowsCreated: normalizedRows.length });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to upload Excel' });
  }
}

module.exports = { addField, listFields, saveData, listData, uploadExcel };



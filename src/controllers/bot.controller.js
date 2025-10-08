const { BotField } = require('../models/botField');
const { BotData } = require('../models/botData');
const { Op } = require('sequelize');
const XLSX = require('xlsx');

function sanitizeFieldName(name, index) {
  // If name is empty or undefined, create a descriptive name
  if (!name || name.trim() === '' || name === '__EMPTY') {
    return `column_${index + 1}`;
  }
  
  // Preserve Unicode letters/numbers (e.g., Arabic), collapse spaces to underscore
  // Remove characters that are not letters, numbers, or underscore
  const sanitized = String(name)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 120);
  
  // If the result is empty or just underscores, use a default name
  if (!sanitized || sanitized === '_' || sanitized === '__') {
    return `column_${index + 1}`;
  }
  
  return sanitized;
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
    const name = sanitizeFieldName(fieldName, 0);
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

async function deleteField(req, res) {
  try {
    const userId = req.userId;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const field = await BotField.findOne({ where: { id, userId } });
    if (!field) return res.status(404).json({ message: 'Not found' });
    await field.destroy();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to delete field' });
  }
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

async function updateData(req, res) {
  try {
    const userId = req.userId;
    const id = Number(req.params.id);
    const { data } = req.body || {};
    if (!id || !data || typeof data !== 'object') return res.status(400).json({ message: 'id and data required' });
    const row = await BotData.findOne({ where: { id, userId } });
    if (!row) return res.status(404).json({ message: 'Not found' });
    row.data = data;
    await row.save();
    return res.json({ row });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to update row' });
  }
}

async function deleteData(req, res) {
  try {
    const userId = req.userId;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const row = await BotData.findOne({ where: { id, userId } });
    if (!row) return res.status(404).json({ message: 'Not found' });
    await row.destroy();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to delete row' });
  }
}

async function uploadExcel(req, res) {
  try {
    const userId = req.userId;
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file provided' });
    const wb = XLSX.readFile(file.path);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
    console.log('Raw Excel data:', rawData.slice(0, 3));
    
    // Convert to object format with proper headers
    let json = [];
    if (rawData.length > 0) {
      const headers = rawData[0];
      const dataRows = rawData.slice(1);
      json = dataRows.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          if (header && header.trim() !== '') {
            obj[header] = row[index] || '';
          } else {
            obj[`column_${index + 1}`] = row[index] || '';
          }
        });
        return obj;
      });
      
      console.log('Processed Excel data:', json.slice(0, 2));
      console.log('Headers:', headers);
      console.log('Data rows count:', dataRows.length);
    }
    console.log('Excel data sample:', json.slice(0, 2));
    console.log('All columns:', Object.keys(json[0] || {}));

    // collect fields - use original column names with better sanitization
    const fieldNames = new Set();
    const columnMapping = {};
    
    // Get all unique column names from all rows
    const allColumns = new Set();
    for (const row of json) {
      Object.keys(row).forEach(k => allColumns.add(k));
    }
    
    console.log('All columns found:', Array.from(allColumns));
    console.log('Total columns found:', allColumns.size);
    
    // Create mapping for each column
    Array.from(allColumns).forEach((k, index) => {
      let sanitized;
      if (k === 'بيانات_المنتج') {
        sanitized = 'product_data';
      } else if (k.startsWith('__EMPTY')) {
        // For __EMPTY columns, create descriptive names
        const emptyIndex = k.replace('__EMPTY', '').replace('_', '');
        const emptyNum = emptyIndex ? parseInt(emptyIndex) : 0;
        sanitized = `column_${emptyNum + 2}`;
      } else if (k.startsWith('column_')) {
        // Keep column names as is
        sanitized = k;
      } else {
        sanitized = sanitizeFieldName(k, index);
      }
      
      columnMapping[k] = sanitized;
      fieldNames.add(sanitized);
      console.log(`Column mapping: "${k}" -> "${sanitized}"`);
    });
    console.log('Final field names:', Array.from(fieldNames));
    console.log('Total field names:', fieldNames.size);
    
    const existing = await BotField.findAll({ where: { userId } });
    const existingNames = new Set(existing.map((f) => f.fieldName));
    console.log('Existing field names:', Array.from(existingNames));
    
    const toCreate = [];
    for (const fname of fieldNames) {
      if (!existingNames.has(fname)) {
        // infer type from first non-empty value
        let inferred = 'string';
        for (const r of json) {
          // Find the original key that matches the sanitized field name
          const originalKey = Object.keys(r).find((k) => columnMapping[k] === fname);
          const val = originalKey ? r[originalKey] : undefined;
          if (val !== '' && typeof val !== 'undefined') {
            inferred = inferType(val);
            break;
          }
        }
        toCreate.push({ userId, fieldName: fname, fieldType: inferred });
        console.log(`Creating field: ${fname} (${inferred})`);
      } else {
        console.log(`Field already exists: ${fname}`);
      }
    }
    console.log('Fields to create:', toCreate.length);
    if (toCreate.length) await BotField.bulkCreate(toCreate, { ignoreDuplicates: true });

    // Save rows
    const normalizedRows = json.map((r) => {
      const data = {};
      for (const [k, v] of Object.entries(r)) {
        data[columnMapping[k]] = v;
      }
      console.log('Normalized row data:', data);
      return { userId, data };
    });
    if (normalizedRows.length) await BotData.bulkCreate(normalizedRows);

    return res.json({ success: true, fieldsCreated: toCreate.length, rowsCreated: normalizedRows.length });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to upload Excel' });
  } finally {
    try {
      if (req.file?.path) {
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
      }
    } catch {}
  }
}

module.exports = { addField, listFields, deleteField, saveData, listData, updateData, deleteData, uploadExcel };
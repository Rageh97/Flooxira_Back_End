const { Plan } = require('../models/plan');

async function publicPlans(req, res) {
  try {
    const plans = await Plan.findAll({
      where: { isActive: true },
      order: [['priceCents', 'ASC']]
    });
    return res.json({ plans });
  } catch (e) {
    console.error('Public plans error:', e);
    return res.status(500).json({ message: 'Failed to get plans' });
  }
}

async function listPlans(req, res) {
  try {
    const plans = await Plan.findAll({
      order: [['createdAt', 'DESC']]
    });
    return res.json({ plans });
  } catch (e) {
    console.error('List plans error:', e);
    return res.status(500).json({ message: 'Failed to get plans' });
  }
}

async function createPlan(req, res) {
  try {
    const { name, priceCents, interval, features, isActive } = req.body;
    if (!name || !priceCents || !interval) {
      return res.status(400).json({ message: 'Name, priceCents, and interval are required' });
    }
    const plan = await Plan.create({
      name,
      priceCents,
      interval,
      features: features || {},
      isActive: isActive !== false
    });
    return res.status(201).json({ plan });
  } catch (e) {
    console.error('Create plan error:', e);
    return res.status(500).json({ message: 'Failed to create plan' });
  }
}

async function updatePlan(req, res) {
  try {
    const { id } = req.params;
    const plan = await Plan.findByPk(id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    
    const { name, priceCents, interval, features, isActive } = req.body;
    if (name !== undefined) plan.name = name;
    if (priceCents !== undefined) plan.priceCents = priceCents;
    if (interval !== undefined) plan.interval = interval;
    if (features !== undefined) plan.features = features;
    if (isActive !== undefined) plan.isActive = isActive;
    
    await plan.save();
    return res.json({ plan });
  } catch (e) {
    console.error('Update plan error:', e);
    return res.status(500).json({ message: 'Failed to update plan' });
  }
}

async function deletePlan(req, res) {
  try {
    const { id } = req.params;
    const plan = await Plan.findByPk(id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    
    await plan.destroy();
    return res.json({ ok: true });
  } catch (e) {
    console.error('Delete plan error:', e);
    return res.status(500).json({ message: 'Failed to delete plan' });
  }
}

module.exports = {
  publicPlans,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan
};





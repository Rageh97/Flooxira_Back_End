const { WhatsappTemplate, WhatsappTemplateButton } = require('../models/whatsappTemplate');
const { Op } = require('sequelize');

// Helper function to parse triggerKeywords
function parseTemplateData(template) {
  const data = template.toJSON ? template.toJSON() : template;
  if (data.triggerKeywords && typeof data.triggerKeywords === 'string') {
    try {
      data.triggerKeywords = JSON.parse(data.triggerKeywords);
    } catch (e) {
      data.triggerKeywords = [];
    }
  }
  return data;
}

// Create new template
const createTemplate = async (req, res) => {
  try {
    const { name, description, headerText, footerText, triggerKeywords, displayOrder } = req.body;
    const userId = req.user.id;

    const template = await WhatsappTemplate.create({
      userId,
      name,
      description,
      headerText,
      footerText,
      triggerKeywords: Array.isArray(triggerKeywords) ? JSON.stringify(triggerKeywords) : triggerKeywords || '[]',
      displayOrder: displayOrder || 0
    });

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create template',
      error: error.message
    });
  }
};

// Get all templates for user
const getTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isActive } = req.query;

    const whereClause = { userId };
    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }

    const templates = await WhatsappTemplate.findAll({
      where: whereClause,
      include: [
        {
          model: WhatsappTemplateButton,
          as: 'buttons',
          where: { parentButtonId: null }, // Only root level buttons
          required: false,
          include: [
            {
              model: WhatsappTemplateButton,
              as: 'childButtons',
              required: false
            }
          ]
        }
      ],
      order: [['displayOrder', 'ASC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: templates.map(parseTemplateData)
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get templates',
      error: error.message
    });
  }
};

// Get single template
const getTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const template = await WhatsappTemplate.findOne({
      where: { id, userId },
      include: [
        {
          model: WhatsappTemplateButton,
          as: 'buttons',
          where: { parentButtonId: null },
          required: false,
          include: [
            {
              model: WhatsappTemplateButton,
              as: 'childButtons',
              required: false
            }
          ]
        }
      ]
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.json({
      success: true,
      data: parseTemplateData(template)
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get template',
      error: error.message
    });
  }
};

// Update template
const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, description, headerText, footerText, triggerKeywords, displayOrder, isActive } = req.body;

    const template = await WhatsappTemplate.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    await template.update({
      name,
      description,
      headerText,
      footerText,
      triggerKeywords: Array.isArray(triggerKeywords) ? JSON.stringify(triggerKeywords) : triggerKeywords,
      displayOrder,
      isActive
    });

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update template',
      error: error.message
    });
  }
};

// Delete template
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const template = await WhatsappTemplate.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Delete all buttons first
    await WhatsappTemplateButton.destroy({
      where: { templateId: id }
    });

    await template.destroy();

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete template',
      error: error.message
    });
  }
};

// Create button
const createButton = async (req, res) => {
  try {
    const { templateId, parentButtonId, buttonText, buttonType, responseText, url, phoneNumber, displayOrder } = req.body;
    const userId = req.user.id;

    // Verify template belongs to user
    const template = await WhatsappTemplate.findOne({
      where: { id: templateId, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // If parent button, verify it belongs to same template
    if (parentButtonId) {
      const parentButton = await WhatsappTemplateButton.findOne({
        where: { id: parentButtonId, templateId }
      });

      if (!parentButton) {
        return res.status(400).json({
          success: false,
          message: 'Parent button not found or does not belong to this template'
        });
      }
    }

    const button = await WhatsappTemplateButton.create({
      templateId,
      parentButtonId,
      buttonText,
      buttonType,
      responseText,
      url,
      phoneNumber,
      displayOrder: displayOrder || 0
    });

    res.status(201).json({
      success: true,
      data: button
    });
  } catch (error) {
    console.error('Create button error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create button',
      error: error.message
    });
  }
};

// Update button
const updateButton = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { buttonText, buttonType, responseText, url, phoneNumber, displayOrder, isActive } = req.body;

    const button = await WhatsappTemplateButton.findOne({
      where: { id },
      include: [
        {
          model: WhatsappTemplate,
          where: { userId }
        }
      ]
    });

    if (!button) {
      return res.status(404).json({
        success: false,
        message: 'Button not found'
      });
    }

    await button.update({
      buttonText,
      buttonType,
      responseText,
      url,
      phoneNumber,
      displayOrder,
      isActive
    });

    res.json({
      success: true,
      data: button
    });
  } catch (error) {
    console.error('Update button error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update button',
      error: error.message
    });
  }
};

// Delete button
const deleteButton = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const button = await WhatsappTemplateButton.findOne({
      where: { id },
      include: [
        {
          model: WhatsappTemplate,
          where: { userId }
        }
      ]
    });

    if (!button) {
      return res.status(404).json({
        success: false,
        message: 'Button not found'
      });
    }

    // Delete child buttons first
    await WhatsappTemplateButton.destroy({
      where: { parentButtonId: id }
    });

    await button.destroy();

    res.json({
      success: true,
      message: 'Button deleted successfully'
    });
  } catch (error) {
    console.error('Delete button error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete button',
      error: error.message
    });
  }
};

// Get active templates for WhatsApp
const getActiveTemplates = async (req, res) => {
  try {
    const userId = req.user.id;

    const templates = await WhatsappTemplate.findAll({
      where: { userId, isActive: true },
      include: [
        {
          model: WhatsappTemplateButton,
          as: 'buttons',
          where: { parentButtonId: null, isActive: true },
          required: false,
          include: [
            {
              model: WhatsappTemplateButton,
              as: 'childButtons',
              where: { isActive: true },
              required: false
            }
          ]
        }
      ],
      order: [['displayOrder', 'ASC']]
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Get active templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active templates',
      error: error.message
    });
  }
};

module.exports = {
  createTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  createButton,
  updateButton,
  deleteButton,
  getActiveTemplates
};
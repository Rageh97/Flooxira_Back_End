const { 
  TelegramTemplate, 
  TelegramTemplateButton, 
  TelegramTemplateVariable, 
  TelegramTemplateUsage 
} = require('../models/telegramTemplate');
const { Op } = require('sequelize');

// Helper function to recursively load all child buttons
async function loadAllChildButtons(buttons) {
  if (!buttons || buttons.length === 0) return buttons;
  
  for (let button of buttons) {
    const childButtons = await TelegramTemplateButton.findAll({
      where: { parentButtonId: button.id, isActive: true },
      order: [['displayOrder', 'ASC']]
    });
    
    if (childButtons.length > 0) {
      button.ChildButtons = await loadAllChildButtons(childButtons);
    }
  }
  
  return buttons;
}

// Create new template
const createTemplate = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      headerText, 
      bodyText, 
      footerText, 
      triggerKeywords, 
      displayOrder,
      templateType,
      mediaType,
      mediaUrl,
      pollOptions,
      pollType,
      correctAnswer,
      explanation,
      variables
    } = req.body;
    const userId = req.user.id;

    const template = await TelegramTemplate.create({
      userId,
      name,
      description,
      headerText,
      bodyText,
      footerText,
      triggerKeywords: triggerKeywords ? JSON.stringify(triggerKeywords) : null,
      displayOrder: displayOrder || 0,
      templateType: templateType || 'text',
      mediaType,
      mediaUrl,
      pollOptions: pollOptions ? JSON.stringify(pollOptions) : null,
      pollType,
      correctAnswer,
      explanation
    });

    // Create variables if provided
    if (variables && Array.isArray(variables)) {
      for (const variable of variables) {
        await TelegramTemplateVariable.create({
          templateId: template.id,
          variableName: variable.variableName,
          variableType: variable.variableType || 'text',
          defaultValue: variable.defaultValue,
          isRequired: variable.isRequired || false,
          options: variable.options ? JSON.stringify(variable.options) : null,
          placeholder: variable.placeholder,
          displayOrder: variable.displayOrder || 0
        });
      }
    }

    // Reload template with associations
    const fullTemplate = await TelegramTemplate.findByPk(template.id, {
      include: [
        { model: TelegramTemplateButton, as: 'buttons', where: { parentButtonId: null }, required: false },
        { model: TelegramTemplateVariable, as: 'variables', required: false }
      ]
    });

    res.status(201).json({
      success: true,
      data: fullTemplate
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
    const { isActive, templateType, search } = req.query;

    const whereClause = { userId };
    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }
    if (templateType) {
      whereClause.templateType = templateType;
    }
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { bodyText: { [Op.like]: `%${search}%` } }
      ];
    }

    const templates = await TelegramTemplate.findAll({
      where: whereClause,
      include: [
        {
          model: TelegramTemplateButton,
          as: 'buttons',
          where: { parentButtonId: null, isActive: true },
          required: false
        },
        {
          model: TelegramTemplateVariable,
          as: 'variables',
          required: false
        }
      ],
      order: [['displayOrder', 'ASC'], ['createdAt', 'DESC']]
    });

    // Load all child buttons recursively for each template
    for (let template of templates) {
      if (template.buttons) {
        template.buttons = await loadAllChildButtons(template.buttons);
      }
    }

    // Parse JSON fields back to arrays
    const parsedTemplates = templates.map(template => {
      const templateData = template.toJSON();
      if (templateData.triggerKeywords) {
        try {
          templateData.triggerKeywords = JSON.parse(templateData.triggerKeywords);
        } catch (e) {
          templateData.triggerKeywords = [];
        }
      }
      if (templateData.pollOptions) {
        try {
          templateData.pollOptions = JSON.parse(templateData.pollOptions);
        } catch (e) {
          templateData.pollOptions = [];
        }
      }
      return templateData;
    });

    res.json({
      success: true,
      data: parsedTemplates
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

    const template = await TelegramTemplate.findOne({
      where: { id, userId },
      include: [
        {
          model: TelegramTemplateButton,
          as: 'buttons',
          where: { parentButtonId: null, isActive: true },
          required: false
        },
        {
          model: TelegramTemplateVariable,
          as: 'variables',
          required: false
        }
      ]
    });

    if (template && template.buttons) {
      template.buttons = await loadAllChildButtons(template.buttons);
    }

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Parse JSON fields back to arrays
    const templateData = template.toJSON();
    if (templateData.triggerKeywords) {
      try {
        templateData.triggerKeywords = JSON.parse(templateData.triggerKeywords);
      } catch (e) {
        templateData.triggerKeywords = [];
      }
    }
    if (templateData.pollOptions) {
      try {
        templateData.pollOptions = JSON.parse(templateData.pollOptions);
      } catch (e) {
        templateData.pollOptions = [];
      }
    }

    res.json({
      success: true,
      data: templateData
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
    const updateData = req.body;

    const template = await TelegramTemplate.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Handle poll options serialization
    if (updateData.pollOptions) {
      updateData.pollOptions = JSON.stringify(updateData.pollOptions);
    }

    // Handle trigger keywords serialization
    if (updateData.triggerKeywords) {
      updateData.triggerKeywords = JSON.stringify(updateData.triggerKeywords);
    }

    await template.update(updateData);

    // Update variables if provided
    if (updateData.variables && Array.isArray(updateData.variables)) {
      // Delete existing variables
      await TelegramTemplateVariable.destroy({
        where: { templateId: id }
      });

      // Create new variables
      for (const variable of updateData.variables) {
        await TelegramTemplateVariable.create({
          templateId: id,
          variableName: variable.variableName,
          variableType: variable.variableType || 'text',
          defaultValue: variable.defaultValue,
          isRequired: variable.isRequired || false,
          options: variable.options ? JSON.stringify(variable.options) : null,
          placeholder: variable.placeholder,
          displayOrder: variable.displayOrder || 0
        });
      }
    }

    // Reload template with associations
    const updatedTemplate = await TelegramTemplate.findByPk(id, {
      include: [
        { model: TelegramTemplateButton, as: 'buttons', where: { parentButtonId: null }, required: false },
        { model: TelegramTemplateVariable, as: 'variables', required: false }
      ]
    });

    res.json({
      success: true,
      data: updatedTemplate
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

    const template = await TelegramTemplate.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Delete related data
    await TelegramTemplateButton.destroy({ where: { templateId: id } });
    await TelegramTemplateVariable.destroy({ where: { templateId: id } });
    await TelegramTemplateUsage.destroy({ where: { templateId: id } });
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
    const { templateId, parentButtonId, text, buttonType, url, callbackData, webAppUrl, switchInlineQuery, displayOrder } = req.body;
    const userId = req.user.id;

    // Verify template ownership
    const template = await TelegramTemplate.findOne({
      where: { id: templateId, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const button = await TelegramTemplateButton.create({
      templateId,
      parentButtonId,
      text,
      buttonType,
      url,
      callbackData,
      webAppUrl,
      switchInlineQuery,
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
    const updateData = req.body;
    const userId = req.user.id;

    const button = await TelegramTemplateButton.findOne({
      where: { id },
      include: [{ model: TelegramTemplate, as: 'template' }]
    });

    if (!button || button.template.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Button not found'
      });
    }

    await button.update(updateData);

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

    const button = await TelegramTemplateButton.findOne({
      where: { id },
      include: [{ model: TelegramTemplate, as: 'template' }]
    });

    if (!button || button.template.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Button not found'
      });
    }

    // Delete child buttons first
    await TelegramTemplateButton.destroy({
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

// Get active templates for bot
const getActiveTemplates = async (req, res) => {
  try {
    const userId = req.user.id;

    const templates = await TelegramTemplate.findAll({
      where: { userId, isActive: true },
      include: [
        {
          model: TelegramTemplateButton,
          as: 'buttons',
          where: { parentButtonId: null, isActive: true },
          required: false
        },
        {
          model: TelegramTemplateVariable,
          as: 'variables',
          required: false
        }
      ],
      order: [['displayOrder', 'ASC']]
    });

    // Load all child buttons recursively for each template
    for (let template of templates) {
      if (template.buttons) {
        template.buttons = await loadAllChildButtons(template.buttons);
      }
    }

    // Parse JSON fields back to arrays
    const parsedTemplates = templates.map(template => {
      const templateData = template.toJSON();
      if (templateData.triggerKeywords) {
        try {
          templateData.triggerKeywords = JSON.parse(templateData.triggerKeywords);
        } catch (e) {
          templateData.triggerKeywords = [];
        }
      }
      if (templateData.pollOptions) {
        try {
          templateData.pollOptions = JSON.parse(templateData.pollOptions);
        } catch (e) {
          templateData.pollOptions = [];
        }
      }
      return templateData;
    });

    res.json({
      success: true,
      data: parsedTemplates
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

// Get template usage statistics
const getTemplateStats = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const template = await TelegramTemplate.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const usage = await TelegramTemplateUsage.findAll({
      where: { templateId: id },
      order: [['sentAt', 'DESC']],
      limit: 100
    });

    const stats = {
      totalUsage: usage.length,
      successCount: usage.filter(u => u.success).length,
      errorCount: usage.filter(u => !u.success).length,
      recentUsage: usage.slice(0, 10)
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get template stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get template stats',
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
  getActiveTemplates,
  getTemplateStats
};

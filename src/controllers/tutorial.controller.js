const { Tutorial } = require('../models/tutorial');

// Get all tutorials for users
async function getAllTutorials(req, res) {
  try {
    console.log('[Tutorials] Fetching tutorials...');
    
    const tutorials = await Tutorial.findAll({
      where: { isActive: true },
      order: [['order', 'ASC'], ['createdAt', 'DESC']],
      attributes: ['id', 'title', 'description', 'youtubeUrl', 'youtubeVideoId', 'thumbnailUrl', 'duration', 'category', 'order', 'views', 'createdAt']
    });

    console.log('[Tutorials] Found tutorials:', tutorials.length);
    
    // If no tutorials found, return empty array
    if (tutorials.length === 0) {
      console.log('[Tutorials] No tutorials found, returning empty array');
      return res.json({ success: true, tutorials: [] });
    }
    
    // Ensure all tutorials have required fields
    const safeTutorials = tutorials.map(tutorial => ({
      id: tutorial.id,
      title: tutorial.title || 'بدون عنوان',
      description: tutorial.description || '',
      youtubeUrl: tutorial.youtubeUrl || '',
      youtubeVideoId: tutorial.youtubeVideoId || '',
      thumbnailUrl: tutorial.thumbnailUrl || '',
      duration: tutorial.duration || 0,
      category: tutorial.category || 'عام',
      order: tutorial.order || 0,
      views: tutorial.views || 0,
      createdAt: tutorial.createdAt
    }));

    res.json({ success: true, tutorials: safeTutorials });
  } catch (e) {
    console.error('Error fetching tutorials:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch tutorials', error: e.message });
  }
}

// Get all tutorials for admin
async function getAllTutorialsAdmin(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const tutorials = await Tutorial.findAll({
      order: [['order', 'ASC'], ['createdAt', 'DESC']]
    });

    res.json({ success: true, tutorials });
  } catch (e) {
    console.error('Error fetching tutorials:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch tutorials', error: e.message });
  }
}

// Create tutorial
async function createTutorial(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { title, description, youtubeUrl, category, order } = req.body;

    if (!title || !youtubeUrl) {
      return res.status(400).json({ success: false, message: 'Title and YouTube URL are required' });
    }

    // Extract YouTube video ID
    const youtubeVideoId = extractYouTubeVideoId(youtubeUrl);
    if (!youtubeVideoId) {
      return res.status(400).json({ success: false, message: 'Invalid YouTube URL' });
    }

    const tutorial = await Tutorial.create({
      title,
      description,
      youtubeUrl,
      youtubeVideoId,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeVideoId}/maxresdefault.jpg`,
      category: category || 'عام',
      order: order || 0
    });

    res.json({ success: true, tutorial });
  } catch (e) {
    console.error('Error creating tutorial:', e);
    res.status(500).json({ success: false, message: 'Failed to create tutorial', error: e.message });
  }
}

// Update tutorial
async function updateTutorial(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;
    const { title, description, youtubeUrl, category, order, isActive } = req.body;

    const tutorial = await Tutorial.findByPk(id);
    if (!tutorial) {
      return res.status(404).json({ success: false, message: 'Tutorial not found' });
    }

    // If YouTube URL is provided, extract video ID
    if (youtubeUrl && youtubeUrl !== tutorial.youtubeUrl) {
      const youtubeVideoId = extractYouTubeVideoId(youtubeUrl);
      if (!youtubeVideoId) {
        return res.status(400).json({ success: false, message: 'Invalid YouTube URL' });
      }
      tutorial.youtubeVideoId = youtubeVideoId;
      tutorial.thumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/maxresdefault.jpg`;
    }

    // Update fields
    if (title) tutorial.title = title;
    if (description !== undefined) tutorial.description = description;
    if (youtubeUrl) tutorial.youtubeUrl = youtubeUrl;
    if (category) tutorial.category = category;
    if (order !== undefined) tutorial.order = order;
    if (isActive !== undefined) tutorial.isActive = isActive;

    await tutorial.save();

    res.json({ success: true, tutorial });
  } catch (e) {
    console.error('Error updating tutorial:', e);
    res.status(500).json({ success: false, message: 'Failed to update tutorial', error: e.message });
  }
}

// Delete tutorial
async function deleteTutorial(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;

    const tutorial = await Tutorial.findByPk(id);
    if (!tutorial) {
      return res.status(404).json({ success: false, message: 'Tutorial not found' });
    }

    await tutorial.destroy();

    res.json({ success: true, message: 'Tutorial deleted successfully' });
  } catch (e) {
    console.error('Error deleting tutorial:', e);
    res.status(500).json({ success: false, message: 'Failed to delete tutorial', error: e.message });
  }
}

// Increment views
async function incrementViews(req, res) {
  try {
    const { id } = req.params;

    const tutorial = await Tutorial.findByPk(id);
    if (!tutorial) {
      return res.status(404).json({ success: false, message: 'Tutorial not found' });
    }

    tutorial.views += 1;
    await tutorial.save();

    res.json({ success: true, views: tutorial.views });
  } catch (e) {
    console.error('Error incrementing views:', e);
    res.status(500).json({ success: false, message: 'Failed to increment views', error: e.message });
  }
}

// Helper function to extract YouTube video ID
function extractYouTubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

module.exports = {
  getAllTutorials,
  getAllTutorialsAdmin,
  createTutorial,
  updateTutorial,
  deleteTutorial,
  incrementViews
};














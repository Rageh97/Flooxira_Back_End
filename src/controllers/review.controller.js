const { Review } = require('../models/review');
const { User } = require('../models/user');
const { sequelize } = require('../sequelize');

// Get all reviews for users (approved only)
async function getAllReviews(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const offset = (page - 1) * limit;

    const { count, rows: reviews } = await Review.findAndCountAll({
      where: { status: 'approved' },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.json({ 
      success: true, 
      reviews,
      total: count,
      totalPages,
      currentPage: page,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    });
  } catch (e) {
    console.error('Error fetching reviews:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews', error: e.message });
  }
}

// Get all reviews for admin
async function getAllReviewsAdmin(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const reviews = await Review.findAll({
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'processedByUser',
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, reviews });
  } catch (e) {
    console.error('Error fetching reviews:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews', error: e.message });
  }
}

// Create review
async function createReview(req, res) {
  try {
    const { rating, title, comment } = req.body;

    if (!rating || !title) {
      return res.status(400).json({ success: false, message: 'Rating and title are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Check if user already has a pending or approved review
    const existingReview = await Review.findOne({
      where: {
        userId: req.user.id,
        status: ['pending', 'approved']
      }
    });

    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have a review pending or approved. You can only submit one review.' 
      });
    }

    const review = await Review.create({
      userId: req.user.id,
      rating,
      title,
      comment,
      status: 'pending'
    });

    res.json({ 
      success: true, 
      review,
      message: 'Review submitted successfully. It will be reviewed by our team before being published.' 
    });
  } catch (e) {
    console.error('Error creating review:', e);
    res.status(500).json({ success: false, message: 'Failed to create review', error: e.message });
  }
}

// Update review status (admin only)
async function updateReviewStatus(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const review = await Review.findByPk(id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    review.status = status;
    review.adminNotes = adminNotes;
    review.processedAt = new Date();
    review.processedBy = req.user.id;

    await review.save();

    res.json({ success: true, review });
  } catch (e) {
    console.error('Error updating review status:', e);
    res.status(500).json({ success: false, message: 'Failed to update review status', error: e.message });
  }
}

// Delete review (admin only)
async function deleteReview(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;

    const review = await Review.findByPk(id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await review.destroy();

    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (e) {
    console.error('Error deleting review:', e);
    res.status(500).json({ success: false, message: 'Failed to delete review', error: e.message });
  }
}

// Get review statistics
async function getReviewStats(req, res) {
  try {
    const stats = await Review.findAll({
      where: { status: 'approved' },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalReviews'],
        [sequelize.fn('AVG', sequelize.col('rating')), 'averageRating'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN rating = 5 THEN 1 END')), 'fiveStars'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN rating = 4 THEN 1 END')), 'fourStars'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN rating = 3 THEN 1 END')), 'threeStars'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN rating = 2 THEN 1 END')), 'twoStars'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN rating = 1 THEN 1 END')), 'oneStar']
      ],
      raw: true
    });

    res.json({ success: true, stats: stats[0] });
  } catch (e) {
    console.error('Error fetching review stats:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch review stats', error: e.message });
  }
}

// Update review status (admin only)
async function updateReviewStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const review = await Review.findByPk(id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await review.update({
      status,
      adminNotes,
      processedAt: new Date(),
      processedBy: req.user.id
    });

    res.json({ success: true, message: 'Review status updated successfully' });
  } catch (e) {
    console.error('Error updating review status:', e);
    res.status(500).json({ success: false, message: 'Failed to update review status', error: e.message });
  }
}

// Delete review (admin only)
async function deleteReview(req, res) {
  try {
    const { id } = req.params;

    const review = await Review.findByPk(id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await review.destroy();

    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (e) {
    console.error('Error deleting review:', e);
    res.status(500).json({ success: false, message: 'Failed to delete review', error: e.message });
  }
}

module.exports = {
  getAllReviews,
  getAllReviewsAdmin,
  createReview,
  updateReviewStatus,
  deleteReview,
  getReviewStats
};


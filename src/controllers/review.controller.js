const { Review } = require('../models/review');
const { User } = require('../models/user');
const { sequelize } = require('../sequelize');

// Get all reviews for users (approved only)
async function getAllReviews(req, res) {
  try {
    console.log('[Reviews] Fetching reviews...');
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const offset = (page - 1) * limit;

    const { count, rows: reviews } = await Review.findAndCountAll({
      where: { status: 'approved' },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    console.log('[Reviews] Found reviews:', reviews.length);

    const totalPages = Math.ceil(count / limit);

    // If no reviews found, return empty array
    if (reviews.length === 0) {
      console.log('[Reviews] No reviews found, returning empty array');
      return res.json({ 
        success: true, 
        reviews: [],
        total: 0,
        totalPages: 1,
        currentPage: page,
        hasNextPage: false,
        hasPrevPage: false
      });
    }

    // Ensure all reviews have required fields
    const safeReviews = reviews.map(review => ({
      id: review.id,
      userId: review.userId,
      rating: review.rating || 5,
      title: review.title || 'بدون عنوان',
      comment: review.comment || '',
      status: review.status,
      createdAt: review.createdAt,
      user: {
        id: review.user?.id || review.userId,
        name: review.user?.name || 'عميل',
        email: review.user?.email || ''
      }
    }));

    res.json({ 
      success: true, 
      reviews: safeReviews,
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
    console.log('[Review Stats] Fetching review statistics...');
    
    const totalReviews = await Review.count();
    const approvedReviews = await Review.count({ where: { status: 'approved' } });
    const pendingReviews = await Review.count({ where: { status: 'pending' } });
    const rejectedReviews = await Review.count({ where: { status: 'rejected' } });

    console.log('[Review Stats] Counts:', { totalReviews, approvedReviews, pendingReviews, rejectedReviews });

    // Calculate average rating
    let avgRating = 0;
    try {
      const avgRatingResult = await Review.findOne({
        where: { status: 'approved' },
        attributes: [
          [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating']
        ],
        raw: true
      });

      avgRating = avgRatingResult?.avgRating ? parseFloat(avgRatingResult.avgRating).toFixed(1) : 0;
    } catch (avgError) {
      console.error('Error calculating average rating:', avgError);
      avgRating = 0;
    }

    // Get rating distribution
    let ratingDistribution = {};
    try {
      const ratingDistributionData = await Review.findAll({
        where: { status: 'approved' },
        attributes: [
          'rating',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['rating'],
        order: [['rating', 'ASC']],
        raw: true
      });

      ratingDistribution = ratingDistributionData.reduce((acc, item) => {
        acc[item.rating] = parseInt(item.count);
        return acc;
      }, {});
    } catch (distError) {
      console.error('Error getting rating distribution:', distError);
      ratingDistribution = {};
    }

    const stats = {
      totalReviews: totalReviews,
      averageRating: parseFloat(avgRating),
      fiveStars: ratingDistribution[5] || 0,
      fourStars: ratingDistribution[4] || 0,
      threeStars: ratingDistribution[3] || 0,
      twoStars: ratingDistribution[2] || 0,
      oneStar: ratingDistribution[1] || 0,
      total: totalReviews,
      approved: approvedReviews,
      pending: pendingReviews,
      rejected: rejectedReviews,
      ratingDistribution: ratingDistribution
    };

    console.log('[Review Stats] Final stats:', stats);

    res.json({
      success: true,
      stats: stats
    });
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


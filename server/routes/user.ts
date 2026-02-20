import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: UserProfile
 *   description: Legacy user profile endpoint
 */

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Get current user profile (legacy endpoint)
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Unauthorized
 */
// Protected route - requires authentication
router.get('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

export default router;

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { DEFAULT_PREFERENCES } from '../services/sync.service.js';
import { Router } from 'express';

const router = Router();
router.use(requireAuth);

// Get user's ICS feed URL
router.get('/ics-url', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { canvas_ics_feed_url: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      ics_url: user.canvas_ics_feed_url,
    });
  } catch (error) {
    console.error('Error fetching ICS URL:', error);
    return res.status(500).json({ error: 'Failed to fetch ICS URL' });
  }
});

// Set or update user's ICS feed URL
router.put('/ics-url', async (req, res) => {
  try {
    const { ics_url } = req.body;

    if (!ics_url || typeof ics_url !== 'string' || ics_url.trim().length === 0) {
      return res.status(400).json({ error: 'Valid ICS URL is required' });
    }

    // Basic validation - ensure it's a URL
    try {
      new URL(ics_url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Optionally validate it's an .ics URL
    if (!ics_url.toLowerCase().endsWith('.ics')) {
      return res.status(400).json({
        error: 'URL must point to an .ics file',
        message: 'The URL should end with .ics',
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { canvas_ics_feed_url: ics_url.trim() },
      select: { canvas_ics_feed_url: true },
    });

    return res.json({
      success: true,
      message: 'ICS feed URL updated successfully',
      ics_url: updatedUser.canvas_ics_feed_url,
    });
  } catch (error) {
    console.error('Error updating ICS URL:', error);
    return res.status(500).json({ error: 'Failed to update ICS URL' });
  }
});

// Delete user's ICS feed URL
router.delete('/ics-url', async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { canvas_ics_feed_url: null },
    });

    return res.json({
      success: true,
      message: 'ICS feed URL removed successfully',
    });
  } catch (error) {
    console.error('Error deleting ICS URL:', error);
    return res.status(500).json({ error: 'Failed to delete ICS URL' });
  }
});

// Get user sync preferences
router.get('/preferences', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { preferences: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      preferences: user.preferences || DEFAULT_PREFERENCES,
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update user sync preferences
router.put('/preferences', async (req, res) => {
  try {
    const { preferences } = req.body;

    // Validate preferences structure
    if (!preferences) {
      return res.status(400).json({ error: 'Preferences object is required' });
    }

    if (!preferences.sync_rules) {
      return res.status(400).json({ error: 'sync_rules is required in preferences' });
    }

    if (!Array.isArray(preferences.sync_rules.calendar) || !Array.isArray(preferences.sync_rules.tasks)) {
      return res.status(400).json({
        error: 'sync_rules.calendar and sync_rules.tasks must be arrays',
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { preferences },
      select: { preferences: true },
    });

    return res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: updatedUser.preferences,
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;

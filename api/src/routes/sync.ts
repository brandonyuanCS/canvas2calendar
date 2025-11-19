import { requireAuth } from '../middleware/auth.middleware.js';
import * as SyncService from '../services/sync.service.js';
import { Router } from 'express';

const router = Router();
router.use(requireAuth);

// Master sync endpoint - syncs to both calendar and tasks based on user preferences
router.post('/', async (req, res) => {
  try {
    const { ics_url } = req.body; // optional override

    const report = await SyncService.syncFromICS(req.user!.id, ics_url);

    return res.json({
      success: true,
      report: {
        calendar: {
          summary: {
            created: report.calendar.created.length,
            updated: report.calendar.updated.length,
            deleted: report.calendar.deleted.length,
            unchanged: report.calendar.unchanged.length,
            errors: report.calendar.errors.length,
          },
          details: {
            created: report.calendar.created,
            updated: report.calendar.updated,
            deleted: report.calendar.deleted,
            errors: report.calendar.errors,
          },
        },
        tasks: {
          summary: {
            lists_created: report.tasks.taskLists.created.length,
            lists_existing: report.tasks.taskLists.existing.length,
            tasks_created: report.tasks.tasks.created.length,
            tasks_updated: report.tasks.tasks.updated.length,
            tasks_deleted: report.tasks.tasks.deleted.length,
            tasks_unchanged: report.tasks.tasks.unchanged.length,
            errors: report.tasks.errors.length,
          },
          details: {
            taskLists: report.tasks.taskLists,
            tasks: {
              created: report.tasks.tasks.created,
              updated: report.tasks.tasks.updated,
              deleted: report.tasks.tasks.deleted,
              errors: report.tasks.errors,
            },
          },
        },
        metadata: report.metadata,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'No ICS feed URL provided or stored for this user') {
        return res.status(400).json({
          error: error.message,
          message: 'Please provide an ics_url in the request body or set it using PUT /user/ics-url',
        });
      }
      if (error.message === 'No calendar found for this user') {
        return res.status(404).json({
          error: error.message,
          message: 'Create a calendar first using POST /calendar',
        });
      }
      console.error('Error in central sync:', error);
      return res.status(500).json({ error: 'Failed to sync from ICS' });
    }
    return res.status(500).json({ error: 'Failed to sync from ICS' });
  }
});

// Full calendar reset endpoint - deletes all calendars, task lists, events, and tasks
router.post('/reset', async (req, res) => {
  try {
    const report = await SyncService.resetAllData(req.user!.id);

    return res.json({
      success: true,
      report: {
        calendars: {
          deleted: report.calendars.deleted,
          errors: report.calendars.errors,
        },
        events: {
          deleted: report.events.deleted,
          errors: report.events.errors,
        },
        taskLists: {
          deleted: report.taskLists.deleted,
          errors: report.taskLists.errors,
        },
        tasks: {
          deleted: report.tasks.deleted,
          errors: report.tasks.errors,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          error: error.message,
        });
      }
      if (error.message === 'User not authenticated with Google') {
        return res.status(401).json({
          error: error.message,
          message: 'Please re-authenticate with Google',
        });
      }
      console.error('Error in reset:', error);
      return res.status(500).json({ error: 'Failed to reset calendar data' });
    }
    return res.status(500).json({ error: 'Failed to reset calendar data' });
  }
});

export default router;

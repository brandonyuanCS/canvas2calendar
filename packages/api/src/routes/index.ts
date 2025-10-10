import authRoutes from './auth.js';
import calendarRoutes from './calendar.js';
import taskListRoutes from './taskList.js';
import { Router } from 'express';

const router = Router();
router.use('/auth', authRoutes);
router.use('/calendar', calendarRoutes);
router.use('/taskList', taskListRoutes);

export default router;

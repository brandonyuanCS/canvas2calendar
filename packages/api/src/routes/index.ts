import authRoutes from './auth.js';
import calendarRoutes from './calendar.js';
import syncRoutes from './sync.js';
import taskListRoutes from './taskList.js';
import userRoutes from './user.js';
import { Router } from 'express';

const router = Router();
router.use('/auth', authRoutes);
router.use('/calendar', calendarRoutes);
router.use('/sync', syncRoutes);
router.use('/taskList', taskListRoutes);
router.use('/user', userRoutes);

export default router;

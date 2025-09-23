import authRoutes from './auth.js';
import calendarRoutes from './calendar.js';
import { Router } from 'express';

const router = Router();
router.use('/auth', authRoutes);
router.use('/calendar', calendarRoutes);

export default router;

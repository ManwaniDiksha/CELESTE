import { Router } from 'express';

const router = Router();

/**
 * Health-check endpoint used to confirm that the Express API is reachable.
 */
router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'celeste-api',
    environment: process.env.VERCEL ? 'vercel' : 'local',
    timestamp: new Date().toISOString(),
  });
});

export default router;

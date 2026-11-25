import { Router } from 'express';
import { isSupabaseConfigured } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import { getDisplayData, getHomeData, getJoinOptionsData } from '../services/queueService.js';

export function createPublicRouter({
  getSupabase = getSupabaseClient,
  isConfigured = isSupabaseConfigured,
} = {}) {
  const router = Router();

  router.get('/home', async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database service is not configured.',
      });
    }

    try {
      const data = await getHomeData(getSupabase());
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      console.error('[CELESTE public] GET /api/public/home failed:', err?.message || 'Unknown error');
      return res.status(503).json({
        success: false,
        error: 'Unable to load salon summary right now.',
      });
    }
  });

  router.get('/join-options', async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database service is not configured.',
      });
    }

    try {
      const data = await getJoinOptionsData(getSupabase());
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      console.error('[CELESTE public] GET /api/public/join-options failed:', err?.message || 'Unknown error');
      return res.status(503).json({
        success: false,
        error: 'Unable to load queue registration options right now.',
      });
    }
  });

  router.get('/display', async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database service is not configured.',
      });
    }

    try {
      const data = await getDisplayData(getSupabase());
      return res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      console.error('[CELESTE public] GET /api/public/display failed:', err?.message || 'Unknown error');
      return res.status(503).json({
        success: false,
        error: 'Unable to load waiting area display right now.',
      });
    }
  });

  return router;
}

export default createPublicRouter();

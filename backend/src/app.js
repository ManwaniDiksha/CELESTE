import express from 'express';
import { isTrustProxyEnabled, validateStartupEnv } from './config/env.js';
import { createCorsMiddleware, securityHeadersMiddleware } from './middleware/security.js';
import appointmentsRouter from './routes/appointments.js';
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';
import ownerRouter from './routes/owner.js';
import publicRouter from './routes/public.js';
import queueRouter from './routes/queue.js';
import receptionRouter from './routes/reception.js';
import staffRouter from './routes/staff.js';

validateStartupEnv();

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', isTrustProxyEnabled() ? 1 : false);

app.use(securityHeadersMiddleware);
app.use(createCorsMiddleware());
app.use(express.json({ limit: '100kb' }));

// Basic API info route
app.get('/api', (_req, res) => {
  res.status(200).json({
    name: 'CELESTE Salon Queue Management API',
    status: 'ready',
    healthEndpoint: '/api/health',
  });
});

// Mount feature routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api/queue', queueRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/reception', receptionRouter);
app.use('/api/staff', staffRouter);
app.use('/api/owner', ownerRouter);

// Fallback for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API route not found',
    path: req.originalUrl,
  });
});

// Global error handler (never exposes stack traces or internal secrets)
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON request body.',
    });
  }

  const statusCode = Number.isInteger(err?.status)
    ? err.status
    : Number.isInteger(err?.statusCode)
      ? err.statusCode
      : 500;

  const safeMessage =
    statusCode >= 500
      ? 'Internal server error'
      : err?.message || 'Request could not be processed.';

  return res.status(statusCode).json({
    success: false,
    error: safeMessage,
  });
});

export default app;

import app from '../backend/src/app.js';

// Export the Express app directly for Vercel's Node.js serverless runtime.
// Do not call app.listen() here; Vercel handles incoming HTTP requests automatically.
export default app;

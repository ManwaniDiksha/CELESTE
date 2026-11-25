import 'dotenv/config';
import app from './src/app.js';
import { getLocalServerPort } from './src/config/env.js';

const PORT = getLocalServerPort();

const server = app.listen(PORT, () => {
  console.log(`CELESTE API listening locally at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `Fatal: Port ${PORT} is already in use. Stop the process occupying port ${PORT} or set another PORT in .env. Refusing to fall back to another port.`
    );
    process.exit(1);
  }

  console.error(`Fatal: Failed to start CELESTE API on port ${PORT}:`, err?.message || err);
  process.exit(1);
});

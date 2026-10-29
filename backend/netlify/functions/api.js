import serverless from 'serverless-http';
import app from '../../src/server.js';

// Netlify rewrites /api/* to this function while preserving the /api prefix.
// The Express application remains the single source of truth for all routes,
// middleware, cookies, validation, authentication, and error handling.
export const handler = serverless(app);

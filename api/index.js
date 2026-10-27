// Vercel discovers files in /api as serverless functions.  Keep the
// application routes in the existing Express server so local and production
// behavior use the same authentication, database, and error handling.
import app from '../backend/src/server.js';

export default app;

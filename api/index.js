/**
 * Vercel serverless entry — mounts the Express app so /api/* works in production.
 * Locally, use `npm run server` or `npm run dev` (Express listens on PORT).
 */
const app = require("../server/index");

module.exports = app;

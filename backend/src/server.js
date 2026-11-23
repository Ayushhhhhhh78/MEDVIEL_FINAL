const app = require('./app');
const db = require('./database/db');

const PORT = process.env.PORT || 5055;

const server = app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`MEDVEIL Cryptographic API Server`);
  console.log(`Private Healthcare. Verifiable Claims.`);
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`=================================================`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully.');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = server;

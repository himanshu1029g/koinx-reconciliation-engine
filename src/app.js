require('dotenv').config();

const express = require('express');
const connectDB = require('./config/db');
const reconcileRoutes = require('./routes/reconcile.routes');
const logger = require('./utils/logger');


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/', reconcileRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});


app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});


const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();

module.exports = app;

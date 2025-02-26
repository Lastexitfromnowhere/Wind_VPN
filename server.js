require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const promClient = require('prom-client');

const logger = require('./utils/logger');
const securityMiddleware = require('./middleware/security');
const auth = require('./middleware/auth');

// Import routes
const connectNode = require('./api/connect');
const disconnectNode = require('./api/disconnect');
const nodeRewards = require('./api/nodeRewards');
const networkStats = require('./api/networkStats');

const app = express();
const PORT = process.env.PORT || 10000;

// Prometheus metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
const Registry = promClient.Registry;
const register = new Registry();
collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'code'],
    buckets: [0.1, 0.5, 1, 5]
});
register.registerMetric(httpRequestDurationMicroseconds);

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json());
app.use(securityMiddleware);

// Request duration middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        httpRequestDurationMicroseconds
            .labels(req.method, req.route?.path || req.path, res.statusCode)
            .observe(duration / 1000);
    });
    next();
});

// Monitoring endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Protected routes
app.post('/api/connect', auth, connectNode);
app.post('/api/disconnect', auth, disconnectNode);
app.get('/api/node-rewards/:walletAddress', auth, nodeRewards);
app.get('/api/network-stats', networkStats);

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        logger.info('Connected to MongoDB');
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
        });
    })
    .catch((error) => {
        logger.error('MongoDB connection error:', error);
        process.exit(1);
    });

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close()
        .then(() => {
            logger.info('MongoDB connection closed.');
            process.exit(0);
        })
        .catch((err) => {
            logger.error('Error during shutdown:', err);
            process.exit(1);
        });
});
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

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'Brand Exit VPN Network API',
        version: '1.0.0',
        description: 'API for the Brand Exit decentralized VPN network',
        endpoints: [
            { path: '/api/connect', method: 'POST', description: 'Connect a node to the network' },
            { path: '/api/disconnect', method: 'POST', description: 'Disconnect a node from the network' },
            { path: '/api/node-rewards/:walletAddress', method: 'GET', description: 'Get rewards for a specific node' },
            { path: '/api/network-stats', method: 'GET', description: 'Get network statistics' },
            { path: '/health', method: 'GET', description: 'Health check endpoint' },
            { path: '/metrics', method: 'GET', description: 'Prometheus metrics' },
            { path: '/api/status', method: 'GET', description: 'Get node status' }
        ],
        documentation: 'For more information, please refer to the API documentation'
    });
});

// Protected routes
app.post('/api/connect', auth, connectNode);
app.post('/api/disconnect', auth, disconnectNode);
app.get('/api/node-rewards/:walletAddress', auth, nodeRewards);
app.use('/api/network-stats', networkStats);

// Node status route
app.get('/api/status', auth, async (req, res) => {
    try {
        const walletAddress = req.headers['x-wallet-address'] || req.query.walletAddress;
        
        if (!walletAddress) {
            return res.status(400).json({
                success: false,
                message: 'Wallet address is required'
            });
        }
        
        // Rechercher le nœud dans la base de données
        const Node = mongoose.model('Node');
        const node = await Node.findOne({ walletAddress });
        
        if (!node) {
            return res.status(404).json({
                success: false,
                message: 'Node not found'
            });
        }
        
        // Renvoyer les informations sur le nœud
        res.json({
            success: true,
            active: node.active,
            ip: node.ip,
            bandwidth: node.bandwidth,
            connectedUsers: node.connectedUsers || 0,
            uptime: node.uptime || 0,
            lastSeen: node.lastSeen
        });
    } catch (error) {
        logger.error('Error getting node status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

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
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const promClient = require('prom-client');

// Définir NODE_ENV en développement par défaut
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.AUTO_CREATE_NODE = process.env.AUTO_CREATE_NODE || 'true';

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
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Wallet-Address']
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
            { path: '/api/status', method: 'GET', description: 'Get node status' },
            { path: '/api/reset-node-ip', method: 'POST', description: 'Reset node IP' },
            { path: '/api/test-node-connection', method: 'GET', description: 'Test connection to a VPN node' },
            { path: '/api/available-nodes', method: 'GET', description: 'Get available VPN nodes' },
            { path: '/api/connect-to-node', method: 'POST', description: 'Connect to a specific node' }
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
        
        logger.info('Headers de requête IP dans /api/status:', {
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-real-ip': req.headers['x-real-ip'],
            'remoteAddress': req.socket.remoteAddress,
            'req.ip': req.ip
        });
        
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
        let nodeIp = node.ip;
        
        // En développement, si l'IP est localhost, utiliser une IP externe simulée
        if (nodeIp === '::1' || nodeIp === '127.0.0.1' || nodeIp?.includes('::ffff:127.0.0.1')) {
            // Générer une adresse IP aléatoire qui ressemble à une vraie adresse externe
            const octet1 = Math.floor(Math.random() * 223) + 1; // Éviter les adresses réservées
            const octet2 = Math.floor(Math.random() * 255);
            const octet3 = Math.floor(Math.random() * 255);
            const octet4 = Math.floor(Math.random() * 254) + 1;
            nodeIp = `${octet1}.${octet2}.${octet3}.${octet4}`;
            
            // Mettre à jour l'IP du nœud dans la base de données
            node.ip = nodeIp;
            await node.save();
        }
        
        res.json({
            success: true,
            active: node.active,
            ip: nodeIp,
            bandwidth: node.bandwidth,
            connectedUsers: node.connectedUsers || 0,
            uptime: node.uptime || 0,
            lastSeen: node.lastSeen,
            metrics: {
                uptime: node.uptime || 0,
                latency: node.performance?.latency || 0,
                packetLoss: 0
            }
        });
    } catch (error) {
        logger.error('Error getting node status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Endpoint pour tester la connexion à un nœud VPN
app.get('/api/test-node-connection', auth, async (req, res) => {
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
        
        // Tester la connexion au nœud
        try {
            // Simuler un test de connexion (dans un environnement réel, vous feriez un ping réel)
            const startTime = Date.now();
            
            // Simuler une latence aléatoire entre 10 et 100 ms
            const latency = Math.floor(Math.random() * 90) + 10;
            
            // 90% de chance de succès en développement
            const isSuccess = Math.random() < 0.9;
            
            // Attendre la latence simulée
            await new Promise(resolve => setTimeout(resolve, latency));
            
            if (!isSuccess) {
                throw new Error('Connection failed');
            }
            
            // Mettre à jour les statistiques du nœud
            node.performance.latency = latency;
            node.lastSeen = new Date();
            await node.save();
            
            return res.json({
                success: true,
                message: 'Connection successful',
                latency: latency,
                ip: node.ip
            });
        } catch (error) {
            logger.error('Error testing node connection:', error);
            return res.status(503).json({
                success: false,
                message: 'Failed to connect to the node',
                error: error.message
            });
        }
    } catch (error) {
        logger.error('Error in test-node-connection:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

// Endpoint pour récupérer la liste des nœuds VPN disponibles
app.get('/api/available-nodes', auth, async (req, res) => {
    try {
        const Node = mongoose.model('Node');
        
        // Rechercher tous les nœuds actifs de type HOST
        const nodes = await Node.find({ 
            status: 'ACTIVE',
            nodeType: 'HOST'
        }).select('walletAddress ip location performance lastSeen connectedUsers -_id');
        
        // Calculer un score pour chaque nœud basé sur ses performances
        const nodesWithScore = nodes.map(node => {
            // Calculer un score simple basé sur la bande passante et la latence
            const bandwidthScore = node.performance?.bandwidth ? Math.min(node.performance.bandwidth / 100, 1) : 0.5;
            const latencyScore = node.performance?.latency ? Math.max(1 - (node.performance.latency / 200), 0) : 0.5;
            
            // Calculer un score d'occupation basé sur le nombre d'utilisateurs connectés
            const occupancyScore = Math.max(1 - ((node.connectedUsers || 0) / 10), 0);
            
            // Calculer un score de fraîcheur basé sur la dernière activité
            const lastSeenScore = node.lastSeen ? 
                Math.max(1 - ((Date.now() - new Date(node.lastSeen).getTime()) / (24 * 60 * 60 * 1000)), 0) : 0;
            
            // Score global (pondéré)
            const totalScore = (bandwidthScore * 0.3) + (latencyScore * 0.3) + (occupancyScore * 0.2) + (lastSeenScore * 0.2);
            
            return {
                ...node.toObject(),
                score: parseFloat(totalScore.toFixed(2))
            };
        });
        
        // Trier les nœuds par score (du plus élevé au plus bas)
        nodesWithScore.sort((a, b) => b.score - a.score);
        
        res.json({
            success: true,
            count: nodesWithScore.length,
            nodes: nodesWithScore
        });
    } catch (error) {
        logger.error('Error fetching available nodes:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

// Endpoint pour se connecter à un nœud spécifique
app.post('/api/connect-to-node', auth, async (req, res) => {
    try {
        const { clientWalletAddress, hostWalletAddress } = req.body;
        
        if (!clientWalletAddress || !hostWalletAddress) {
            return res.status(400).json({
                success: false,
                message: 'Client and host wallet addresses are required'
            });
        }
        
        const Node = mongoose.model('Node');
        
        // Vérifier si le nœud hôte existe et est actif
        const hostNode = await Node.findOne({ 
            walletAddress: hostWalletAddress,
            status: 'ACTIVE',
            nodeType: 'HOST'
        });
        
        if (!hostNode) {
            return res.status(404).json({
                success: false,
                message: 'Host node not found or not active'
            });
        }
        
        // Créer ou mettre à jour le nœud client
        let clientNode = await Node.findOne({ walletAddress: clientWalletAddress });
        
        if (clientNode) {
            clientNode.status = 'ACTIVE';
            clientNode.nodeType = 'USER';
            clientNode.connectedToHost = hostWalletAddress;
            clientNode.lastSeen = new Date();
        } else {
            clientNode = new Node({
                walletAddress: clientWalletAddress,
                nodeType: 'USER',
                status: 'ACTIVE',
                connectedToHost: hostWalletAddress,
                lastSeen: new Date()
            });
        }
        
        await clientNode.save();
        
        // Mettre à jour le nombre d'utilisateurs connectés au nœud hôte
        hostNode.connectedUsers = (hostNode.connectedUsers || 0) + 1;
        await hostNode.save();
        
        // Dans un système VPN réel, ici nous établirions la connexion VPN
        // et nous retournerions les informations de configuration
        
        res.json({
            success: true,
            message: 'Connected to node successfully',
            nodeIp: hostNode.ip,
            hostWalletAddress: hostWalletAddress
        });
    } catch (error) {
        logger.error('Error connecting to node:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

// Route pour réinitialiser l'IP d'un nœud (utile pour passer de local à production)
app.post('/api/reset-node-ip', auth, async (req, res) => {
    try {
        const walletAddress = req.headers['x-wallet-address'] || req.body.walletAddress;
        
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
        
        // Déterminer la nouvelle IP
        const newIp = req.headers['x-forwarded-for'] || 
                      req.headers['x-real-ip'] || 
                      req.ip || 
                      req.socket.remoteAddress;
        
        // Mettre à jour l'IP du nœud
        node.ip = newIp;
        await node.save();
        
        res.json({
            success: true,
            message: 'Node IP reset successfully',
            newIp
        });
    } catch (error) {
        logger.error('Error resetting node IP:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting node IP'
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
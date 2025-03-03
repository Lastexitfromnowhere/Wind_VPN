require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const promClient = require('prom-client');
const { exec } = require('child_process');

// Définir NODE_ENV en développement par défaut
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.AUTO_CREATE_NODE = process.env.AUTO_CREATE_NODE || 'true';

const logger = require('./utils/logger');
const securityMiddleware = require('./middleware/security');
const auth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 10000;

// Configurer Express pour faire confiance au proxy
app.set('trust proxy', 1);

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
    origin: ['https://wind-frontend-rosy.vercel.app', 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Wallet-Address', 'Origin', 'X-Requested-With', 'Accept'],
    credentials: true
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
            { path: '/api/connect-to-node', method: 'POST', description: 'Connect to a specific node' },
            { path: '/api/client-disconnect', method: 'POST', description: 'Disconnect from a node' }
        ],
        documentation: 'For more information, please refer to the API documentation'
    });
});

// Swagger docs
try {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(require('./swagger')));
} catch (error) {
  logger.error('Error loading Swagger documentation:', error);
}

// Déclaration des variables de routes
let connectNode, disconnectNode, nodeRewards, networkStats, dailyClaims, connectedClients, wireguardRoutes;

try {
  // Import routes
  connectNode = require('./api/connect');
  disconnectNode = require('./api/disconnect');
  nodeRewards = require('./api/nodeRewards');
  networkStats = require('./api/networkStats');
  dailyClaims = require('./api/dailyClaims');
  connectedClients = require('./api/connectedClients');
  wireguardRoutes = require('./routes/wireguard');

  // Utiliser les routes qui sont des objets router
  if (networkStats && typeof networkStats === 'function') {
    app.use('/api/network-stats', networkStats);
  }

  if (dailyClaims && typeof dailyClaims === 'function') {
    app.use('/api/dailyClaims', dailyClaims);
  }

  if (typeof connectedClients === 'function') {
    app.use('/api/connectedClients', connectedClients);
  } else if (connectedClients && typeof connectedClients === 'object') {
    app.use('/api', connectedClients);
  }
  
  if (wireguardRoutes && typeof wireguardRoutes === 'function') {
    app.use('/api', wireguardRoutes);
  }
} catch (error) {
  logger.error('Error importing or using routes:', error);
}

// Protected routes - Vérifier si les routes sont disponibles avant de les utiliser
if (connectNode) app.post('/api/connect', auth, connectNode);
if (disconnectNode) app.post('/api/disconnect', auth, disconnectNode);
if (nodeRewards) app.get('/api/node-rewards/:walletAddress', auth, nodeRewards);
if (networkStats) app.use('/api/network-stats', networkStats);

// Node status route
app.get('/api/status', auth, async (req, res) => {
    try {
        const walletAddress = req.headers['x-wallet-address'] || req.query.walletAddress;
        
        // Extraire l'adresse IP réelle du client
        let clientIP = "0.0.0.0";
        if (req.headers['x-forwarded-for']) {
            // Prendre la première adresse IP dans la liste x-forwarded-for
            clientIP = req.headers['x-forwarded-for'].split(',')[0].trim();
        } else if (req.ip) {
            clientIP = req.ip;
        } else if (req.socket && req.socket.remoteAddress) {
            clientIP = req.socket.remoteAddress.replace(/^::ffff:/, '');
        }
        
        logger.info('Headers de requête IP dans /api/status:', {
            'service': 'vpn-network',
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'remoteAddress': req.socket.remoteAddress,
            'req.ip': req.ip,
            'clientIP': clientIP
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
        
        // Si le nœud n'existe pas, renvoyer un statut inactif
        if (!node) {
            logger.info(`Nœud non trouvé pour ${walletAddress}, renvoi d'un statut inactif`);
            return res.json({
                success: true,
                active: false,
                status: 'INACTIVE',
                clientIP: clientIP,
                ip: clientIP,
                connectedUsers: 0,
                nodeType: 'USER',
                performance: {
                    bandwidth: 0,
                    latency: 0,
                    packetLoss: 0
                },
                stats: {
                    uptime: 0,
                    earnings: 0
                }
            });
        }
        
        // Assurer la cohérence entre status et active
        if (node.status === 'ACTIVE' && !node.active) {
            logger.info(`Correcting inconsistency for node ${walletAddress}: status is ACTIVE but active is false`);
            node.active = true;
            await node.save();
        } else if (node.status === 'INACTIVE' && node.active) {
            logger.info(`Correcting inconsistency for node ${walletAddress}: status is INACTIVE but active is true`);
            node.status = 'ACTIVE';
            await node.save();
        }
        
        logger.info(`Node status for ${walletAddress}: status=${node.status}, active=${node.active}`);
        
        // Utiliser l'IP stockée dans le modèle ou une valeur par défaut
        const nodeIp = node.ip || "0.0.0.0";
        
        res.json({
            success: true,
            active: node.active,
            status: node.status,
            ip: nodeIp,
            bandwidth: node.bandwidth,
            connectedUsers: node.connectedUsers || 0,
            uptime: node.uptime || 0,
            lastSeen: node.lastSeen,
            metrics: {
                uptime: node.uptime || 0,
                latency: node.performance?.latency || 0,
                packetLoss: 0
            },
            clientIP: clientIP
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
            
            // Utiliser l'IP stockée dans le modèle ou une valeur par défaut
            const nodeIp = node.ip || "0.0.0.0";
            
            return res.json({
                success: true,
                message: 'Connection successful',
                latency: latency,
                ip: nodeIp
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
        logger.info('Fetching available nodes...');
        const Node = mongoose.model('Node');
        
        // Calculer la date limite pour les nœuds actifs (30 minutes)
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        logger.info(`Limite de temps pour les nœuds actifs: ${thirtyMinutesAgo.toISOString()}`);
        
        // Ajouter des logs pour les adresses spécifiques
        const specialAddresses = [
            'BmtYvq2KvNkXtc9VFKVvW9rbzRzthFiCgS2eXrhovAPU', // PC1 ou PC2
            'GD3oxRGF8RKLm6hmEzCRarWtWCZEErMJDEfb49yDxrEm'  // PC3
        ];
        
        // Vérifier si ces adresses existent dans la base de données
        for (const address of specialAddresses) {
            const nodeExists = await Node.findOne({ walletAddress: address });
            logger.info(`Vérification de l'adresse spéciale ${address.substring(0, 10)}... - Existe dans la DB: ${nodeExists ? 'Oui' : 'Non'}`);
            if (nodeExists) {
                logger.info(`Détails du nœud ${address.substring(0, 10)}... - Status: ${nodeExists.status}, Active: ${nodeExists.active}, LastSeen: ${nodeExists.lastSeen ? new Date(nodeExists.lastSeen).toISOString() : 'N/A'}, NodeType: ${nodeExists.nodeType}`);
            }
        }
        
        // Récupérer TOUS les nœuds HOST sans aucun filtre initial
        const allNodes = await Node.find({ 
            nodeType: 'HOST'
        }).select('walletAddress ip location performance lastSeen connectedUsers status active nodeType lastDisconnected -_id');
        
        logger.info(`Nombre total de nœuds HOST dans la base de données: ${allNodes.length}`);
        
        // Logs pour tous les nœuds trouvés
        allNodes.forEach(node => {
            logger.info(`Nœud HOST trouvé - Wallet: ${node.walletAddress.substring(0, 10)}..., Status: ${node.status}, Active: ${node.active}, LastSeen: ${node.lastSeen ? new Date(node.lastSeen).toISOString() : 'N/A'}`);
        });
        
        // Maintenant, appliquer le filtre pour les nœuds actifs ou récemment vus
        const nodes = allNodes.filter(node => {
            return node.status === 'ACTIVE' || 
                  (node.lastSeen && new Date(node.lastSeen) >= thirtyMinutesAgo) || 
                  (node.lastDisconnected && new Date(node.lastDisconnected) >= thirtyMinutesAgo && node.status === 'INACTIVE');
        });
        
        // Corriger les incohérences entre status et active pour tous les nœuds avant de continuer
        const updatePromises = [];
        for (const node of nodes) {
            try {
                const walletPrefix = node.walletAddress && node.walletAddress.length > 8 
                    ? node.walletAddress.substring(0, 8) 
                    : (node.walletAddress || 'Unknown');
                    
                logger.info(`Nœud trouvé - Wallet: ${walletPrefix}..., Status: ${node.status || 'Unknown'}, Active: ${node.active !== undefined ? node.active : 'Unknown'}, LastSeen: ${node.lastSeen ? new Date(node.lastSeen).toISOString() : 'N/A'}, NodeType: ${node.nodeType || 'Unknown'}`);
                
                // Vérifier et corriger les incohérences entre status et active
                let needsUpdate = false;
                let updateFields = {};
                
                // Cas 1: Status ACTIVE mais active false
                if (node.status === 'ACTIVE' && node.active === false) {
                    logger.info(`Correction d'incohérence pour ${walletPrefix}... - Status ACTIVE mais active false`);
                    updateFields.active = true;
                    needsUpdate = true;
                }
                
                // Cas 2: Status INACTIVE mais active true
                if (node.status === 'INACTIVE' && node.active === true) {
                    logger.info(`Correction d'incohérence pour ${walletPrefix}... - Status INACTIVE mais active true`);
                    updateFields.status = 'ACTIVE';
                    needsUpdate = true;
                }
                
                // Cas 3: Nœud vu récemment (moins de 30 minutes) mais INACTIVE
                if (node.lastSeen && new Date(node.lastSeen) >= thirtyMinutesAgo && node.status === 'INACTIVE') {
                    logger.info(`Correction d'incohérence pour ${walletPrefix}... - Vu récemment mais status INACTIVE`);
                    updateFields.status = 'ACTIVE';
                    updateFields.active = true;
                    needsUpdate = true;
                }
                
                if (needsUpdate) {
                    updatePromises.push(
                        Node.updateOne(
                            { walletAddress: node.walletAddress }, 
                            { $set: updateFields }
                        ).then(() => {
                            logger.info(`Incohérence corrigée pour ${walletPrefix}...`);
                            // Mettre à jour l'objet node en mémoire aussi
                            Object.assign(node, updateFields);
                        }).catch(err => {
                            logger.error(`Erreur lors de la correction de l'incohérence pour ${walletPrefix}...`, err);
                        })
                    );
                }
            } catch (error) {
                logger.error('Erreur lors du log du nœud:', error);
            }
        }
        
        // Attendre que toutes les mises à jour soient terminées
        if (updatePromises.length > 0) {
            logger.info(`Correction de ${updatePromises.length} incohérences...`);
            await Promise.all(updatePromises);
            logger.info(`Corrections terminées.`);
        }
        
        // Ajouter des logs pour voir les nœuds filtrés
        logger.info(`Nombre de nœuds après filtrage: ${nodes.length}`);
        nodes.forEach(node => {
            const isSpecialNode = specialAddresses.includes(node.walletAddress);
            logger.info(`Nœud filtré: ${node.walletAddress} - Status: ${node.status}, Active: ${node.active}, Est un nœud spécial: ${isSpecialNode}`);
            
            // Afficher toutes les propriétés pour tous les nœuds pour faciliter le débogage
            logger.info(`Propriétés complètes du nœud ${node.walletAddress}:`);
            logger.info(`- nodeType: ${node.nodeType}`);
            logger.info(`- status: ${node.status}`);
            logger.info(`- active: ${node.active}`);
            logger.info(`- lastSeen: ${node.lastSeen ? new Date(node.lastSeen).toISOString() : 'N/A'}`);
            logger.info(`- lastDisconnected: ${node.lastDisconnected ? new Date(node.lastDisconnected).toISOString() : 'N/A'}`);
            logger.info(`- ip: ${node.ip || 'N/A'}`);
            logger.info(`- connectedUsers: ${node.connectedUsers || 0}`);
            logger.info(`- connectedToHost: ${node.connectedToHost || 'N/A'}`);
        });
        
        // Calculer un score pour chaque nœud basé sur ses performances
        const nodesWithScore = nodes
            .filter(node => {
                // Vérifier que l'adresse wallet est valide (ne pas filtrer par format d'adresse)
                return node.walletAddress && node.walletAddress.length > 0;
            })
            .map(node => {
                try {
                    // Log pour déboguer le statut des nœuds
                    const walletPrefix = node.walletAddress && node.walletAddress.length > 8 
                        ? node.walletAddress.substring(0, 8) 
                        : (node.walletAddress || 'Unknown');
                    
                    logger.info(`Node ${walletPrefix}... - Status: ${node.status || 'Unknown'}, Last seen: ${node.lastSeen || 'N/A'}`);
                    
                    // Vérifier si les objets existent
                    if (!node.performance) {
                        node.performance = { bandwidth: 0, latency: 0 };
                    }
                    
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
                    
                    const nodeObj = {
                        walletAddress: node.walletAddress,
                        ip: node.ip || '0.0.0.0',
                        location: node.location || { country: 'Unknown', region: 'Unknown' },
                        performance: node.performance,
                        lastSeen: node.lastSeen || new Date(),
                        connectedUsers: node.connectedUsers || 0,
                        status: node.status || 'INACTIVE',
                        active: node.active || false,
                        score: parseFloat(totalScore.toFixed(2))
                    };
                    
                    return nodeObj;
                } catch (error) {
                    logger.error(`Erreur lors du calcul du score pour le nœud ${node.walletAddress || 'Unknown'}:`, error);
                    // Retourner un objet avec des valeurs par défaut en cas d'erreur
                    return {
                        walletAddress: node.walletAddress || 'Unknown',
                        ip: node.ip || '0.0.0.0',
                        location: node.location || { country: 'Unknown', region: 'Unknown' },
                        performance: node.performance || { bandwidth: 0, latency: 0 },
                        lastSeen: node.lastSeen || new Date(),
                        connectedUsers: node.connectedUsers || 0,
                        status: node.status || 'INACTIVE',
                        score: 0
                    };
                }
            });
        
        // Trier les nœuds par score (du plus élevé au plus bas)
        nodesWithScore.sort((a, b) => b.score - a.score);
        
        // Ajouter un log pour les nœuds qui seront renvoyés
        const validNodes = nodesWithScore.filter(node => {
            // Inclure les nœuds actifs ou ceux vus récemment
            return node.status === 'ACTIVE' || 
                   (node.lastSeen && new Date(node.lastSeen) >= thirtyMinutesAgo);
        });
        
        logger.info(`Returning ${validNodes.length} valid nodes with scores`);
        
        res.json({
            success: true,
            count: validNodes.length,
            nodes: validNodes
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

// Endpoint pour qu'un client se déconnecte d'un nœud
app.post('/api/client-disconnect', auth, async (req, res) => {
    try {
        const { clientWalletAddress } = req.body;
        const walletAddress = req.headers['x-wallet-address'] || clientWalletAddress;
        
        if (!walletAddress) {
            return res.status(400).json({
                success: false,
                message: 'Client wallet address is required'
            });
        }
        
        const Node = mongoose.model('Node');
        
        // Trouver le nœud client
        const clientNode = await Node.findOne({ 
            walletAddress: walletAddress,
            nodeType: 'USER',
            status: 'ACTIVE'
        });
        
        if (!clientNode) {
            return res.status(404).json({
                success: false,
                message: 'Active client node not found'
            });
        }
        
        // Récupérer l'adresse du nœud hôte auquel le client est connecté
        const hostWalletAddress = clientNode.connectedToHost;
        
        if (!hostWalletAddress) {
            return res.status(400).json({
                success: false,
                message: 'Client is not connected to any host'
            });
        }
        
        // Mettre à jour le nœud client
        clientNode.status = 'INACTIVE';
        clientNode.connectedToHost = null;
        clientNode.lastSeen = new Date();
        await clientNode.save();
        
        // Mettre à jour le nœud hôte (décrémenter le nombre d'utilisateurs connectés)
        const hostNode = await Node.findOne({ walletAddress: hostWalletAddress });
        if (hostNode) {
            hostNode.connectedUsers = Math.max((hostNode.connectedUsers || 1) - 1, 0);
            await hostNode.save();
        }
        
        // Mettre à jour la connexion dans la collection Connection si elle existe
        const Connection = mongoose.model('Connection');
        const connection = await Connection.findOne({
            clientWalletAddress: walletAddress,
            hostWalletAddress: hostWalletAddress,
            status: 'ACTIVE'
        });
        
        if (connection) {
            connection.status = 'DISCONNECTED';
            connection.disconnectedAt = new Date();
            connection.lastActivity = new Date();
            await connection.save();
        }
        
        res.json({
            success: true,
            message: 'Disconnected from node successfully'
        });
    } catch (error) {
        logger.error('Error disconnecting client from node:', error);
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

// Activer l'IP Forwarding (nécessaire pour WireGuard)
function enableIpForwarding() {
  logger.info('Tentative d\'activation de l\'IP Forwarding...');
  
  // Méthode 1: Utiliser sysctl
  exec('sysctl -w net.ipv4.ip_forward=1', (error, stdout, stderr) => {
    if (error) {
      logger.warn(`Échec de l'activation de l'IP Forwarding avec sysctl: ${error.message}`);
      logger.info('Tentative avec la méthode alternative...');
      
      // Méthode 2: Écrire directement dans /proc
      exec('echo 1 > /proc/sys/net/ipv4/ip_forward', (error2, stdout2, stderr2) => {
        if (error2) {
          logger.warn(`Échec de l'activation de l'IP Forwarding via /proc: ${error2.message}`);
          logger.warn('L\'IP Forwarding n\'a pas pu être activé. WireGuard pourrait ne pas fonctionner correctement.');
        } else {
          logger.info('IP Forwarding activé avec succès via /proc.');
        }
      });
    } else {
      logger.info('IP Forwarding activé avec succès via sysctl.');
    }
    
    // Vérifier l'état actuel
    exec('cat /proc/sys/net/ipv4/ip_forward', (error3, stdout3, stderr3) => {
      if (error3) {
        logger.warn(`Impossible de vérifier l'état de l'IP Forwarding: ${error3.message}`);
      } else {
        logger.info(`État actuel de l'IP Forwarding: ${stdout3.trim()}`);
      }
    });
  });
}

// Initialiser la connexion MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    logger.info('Connected to MongoDB');
    
    // Démarrer le serveur
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      
      // Activer l'IP Forwarding pour WireGuard
      enableIpForwarding();
      
      // Initialiser WireGuard si disponible
      try {
        const wireguardUtils = require('./utils/wireguardUtils');
        wireguardUtils.initializeWireGuard();
      } catch (error) {
        logger.warn('WireGuard initialization failed:', error.message);
      }
    });
  })
  .catch(err => {
    logger.error('MongoDB connection error:', err);
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
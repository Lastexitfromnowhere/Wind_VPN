// api/connectedClients.js
const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const Node = require('../models/Node');
const Connection = require('../models/Connection');
const { redisClient } = require('../utils/redis');

// Endpoint pour récupérer les clients connectés à un nœud hôte
router.get('/connected-clients', authenticateJWT, async (req, res) => {
  try {
    const hostWalletAddress = req.user.walletAddress;
    
    if (!hostWalletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Host wallet address is required' 
      });
    }

    // Vérifier si le nœud existe et est actif
    const hostNode = await Node.findOne({ 
      walletAddress: hostWalletAddress,
      nodeType: 'HOST',
      status: 'ACTIVE'
    });

    if (!hostNode) {
      return res.status(404).json({ 
        success: false, 
        message: 'Active host node not found' 
      });
    }

    // Récupérer les connexions actives depuis Redis pour des performances optimales
    let connectedClients = [];
    try {
      const cachedClients = await redisClient.get(`connected_clients:${hostWalletAddress}`);
      if (cachedClients) {
        connectedClients = JSON.parse(cachedClients);
      }
    } catch (redisError) {
      console.error('Redis error:', redisError);
      // En cas d'erreur Redis, continuer avec la base de données
    }

    // Si pas de données en cache, récupérer depuis la base de données
    if (!connectedClients || connectedClients.length === 0) {
      const connections = await Connection.find({
        hostWalletAddress: hostWalletAddress,
        status: 'ACTIVE'
      }).populate('clientNode', 'walletAddress ip lastSeen');

      connectedClients = connections.map(conn => ({
        connectionId: conn._id,
        walletAddress: conn.clientWalletAddress,
        ip: conn.clientNode?.ip || 'Unknown',
        connectedSince: conn.connectedAt,
        lastActivity: conn.lastActivity || conn.connectedAt
      }));

      // Mettre en cache les résultats pour 30 secondes
      try {
        await redisClient.set(
          `connected_clients:${hostWalletAddress}`, 
          JSON.stringify(connectedClients),
          'EX',
          30
        );
      } catch (redisCacheError) {
        console.error('Redis cache error:', redisCacheError);
        // Continuer même si la mise en cache échoue
      }
    }

    return res.json({
      success: true,
      connectedClients: connectedClients,
      totalConnections: connectedClients.length
    });

  } catch (error) {
    console.error('Error fetching connected clients:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching connected clients', 
      error: error.message 
    });
  }
});

// Endpoint pour déconnecter un client spécifique
router.post('/disconnect-client', authenticateJWT, async (req, res) => {
  try {
    const hostWalletAddress = req.user.walletAddress;
    const { clientWalletAddress } = req.body;
    
    if (!hostWalletAddress || !clientWalletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Host wallet address and client wallet address are required' 
      });
    }

    // Vérifier si le nœud hôte existe et est actif
    const hostNode = await Node.findOne({ 
      walletAddress: hostWalletAddress,
      nodeType: 'HOST',
      status: 'ACTIVE'
    });

    if (!hostNode) {
      return res.status(404).json({ 
        success: false, 
        message: 'Active host node not found' 
      });
    }

    // Trouver la connexion active entre l'hôte et le client
    const connection = await Connection.findOne({
      hostWalletAddress: hostWalletAddress,
      clientWalletAddress: clientWalletAddress,
      status: 'ACTIVE'
    });

    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Active connection not found' 
      });
    }

    // Mettre à jour le statut de la connexion
    const now = new Date();
    connection.status = 'DISCONNECTED';
    connection.disconnectedAt = now;
    connection.lastActivity = now;
    await connection.save();

    // Mettre à jour le nœud client
    await Node.findOneAndUpdate(
      { walletAddress: clientWalletAddress },
      { 
        $set: { 
          status: 'INACTIVE',
          connectedToHost: null,
          lastActivity: now
        }
      }
    );

    // Mettre à jour le compteur de clients connectés pour l'hôte
    await Node.findOneAndUpdate(
      { walletAddress: hostWalletAddress },
      { $inc: { connectedClients: -1 } }
    );

    // Invalider le cache Redis
    try {
      await redisClient.del(`connected_clients:${hostWalletAddress}`);
    } catch (redisError) {
      console.error('Redis error:', redisError);
      // Continuer même si l'invalidation du cache échoue
    }

    return res.json({
      success: true,
      message: 'Client disconnected successfully'
    });

  } catch (error) {
    console.error('Error disconnecting client:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error disconnecting client', 
      error: error.message 
    });
  }
});

module.exports = router;

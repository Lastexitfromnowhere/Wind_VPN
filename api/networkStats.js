const express = require('express');
const Node = require('../models/Node');
const logger = require('../utils/logger');
const router = express.Router();

router.get('/network-stats', async (req, res) => {
  try {
    // Récupérer les statistiques depuis MongoDB
    const totalNodes = await Node.countDocuments();
    const activeNodes = await Node.countDocuments({ 'stats.isOnline': true });
    
    const stats = {
      totalNodes: totalNodes || 0,
      activeNodes: activeNodes || 0,
      totalBandwidth: 42.5, // À remplacer par une vraie mesure
      averageUptime: 98.5,  // À remplacer par un vrai calcul
      networkHealth: activeNodes > 0 ? 'healthy' : 'degraded'
    };
    
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching network stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch network stats'
    });
  }
});

module.exports = router;
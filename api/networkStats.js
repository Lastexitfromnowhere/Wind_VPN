const express = require('express');
const Node = require('../models/Node');
const logger = require('../utils/logger');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Récupérer les statistiques depuis MongoDB
    const totalNodes = await Node.countDocuments();
    const activeNodes = await Node.countDocuments({ status: 'ACTIVE' });
    const hostNodes = await Node.countDocuments({ nodeType: 'HOST' });
    const userNodes = await Node.countDocuments({ nodeType: 'USER' });
    
    // Calculer la bande passante totale
    const bandwidthAggregation = await Node.aggregate([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: null, totalBandwidth: { $sum: '$performance.bandwidth' } } }
    ]);
    
    const totalBandwidth = bandwidthAggregation.length > 0 ? bandwidthAggregation[0].totalBandwidth : 0;
    
    // Calculer l'uptime moyen
    const uptimeAggregation = await Node.aggregate([
      { $group: { _id: null, totalUptime: { $avg: '$stats.connectionUptime' } } }
    ]);
    
    const averageUptime = uptimeAggregation.length > 0 ? uptimeAggregation[0].totalUptime : 0;
    
    // Calculer la latence moyenne
    const latencyAggregation = await Node.aggregate([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: null, averageLatency: { $avg: '$performance.latency' } } }
    ]);
    
    const averageLatency = latencyAggregation.length > 0 ? latencyAggregation[0].averageLatency : 0;
    
    // Récupérer les pays représentés
    const countriesAggregation = await Node.aggregate([
      { $match: { 'location.country': { $ne: null, $ne: '' } } },
      { $group: { _id: '$location.country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    const topCountries = countriesAggregation.map(item => ({
      country: item._id,
      count: item.count
    }));
    
    // Calculer la santé du réseau
    const networkHealth = activeNodes > 0 
      ? (activeNodes / totalNodes > 0.7 ? 'healthy' : 'degraded')
      : 'critical';
    
    const stats = {
      totalNodes,
      activeNodes,
      hostNodes,
      userNodes,
      totalBandwidth: parseFloat(totalBandwidth.toFixed(2)),
      averageUptime: parseFloat(averageUptime.toFixed(2)),
      averageLatency: parseFloat(averageLatency.toFixed(2)),
      topCountries,
      networkHealth,
      lastUpdated: new Date()
    };
    
    logger.info('Statistiques réseau récupérées');
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
// utils/rewardsUtils.js

const mongoose = require('mongoose');
const Node = require('../models/Node');
const logger = require('./logger');

let redisClient = null;

async function initRedis() {
  if (process.env.REDIS_URI) {
    try {
      const redis = require('redis');
      // Vérifier que l'URL commence par redis:// ou rediss://
      const redisUrl = process.env.REDIS_URI.startsWith('redis://') || process.env.REDIS_URI.startsWith('rediss://')
        ? process.env.REDIS_URI
        : `redis://${process.env.REDIS_URI}`;

      redisClient = redis.createClient({
        url: redisUrl
      });

      redisClient.on('error', (err) => {
        logger.error('Redis Client Error', err);
      });

      redisClient.on('connect', () => {
        logger.info('Connected to Redis');
      });

      await redisClient.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      redisClient = null;
    }
  } else {
    logger.warn('REDIS_URI not provided, running without Redis caching');
  }
}

// Initialiser Redis au démarrage
initRedis().catch(err => {
  logger.error('Redis initialization error:', err);
});

const REWARD_FACTORS = {
  bandwidth: 0.01,
  uptime: 0.005,
  quality: 1,
  location: 1.2,
  demand: 1.5
};

async function calculateLocationMultiplier(country) {
  const underservedRegions = ['AF', 'SA', 'AF']; // Africa, South America, etc.
  return underservedRegions.includes(country) ? REWARD_FACTORS.location : 1;
}

async function getDemandMultiplier(region) {
  if (redisClient && redisClient.isOpen) {
    try {
      const cachedDemand = await redisClient.get(`demand:${region}`);
      if (cachedDemand) {
        return parseFloat(cachedDemand);
      }
    } catch (error) {
      logger.error('Redis getDemandMultiplier error:', error);
    }
  }
  return REWARD_FACTORS.demand;
}

async function initNodeStats(walletAddress) {
  const existingNode = await Node.findOne({ walletAddress });
  if (existingNode) return existingNode;

  const newNode = new Node({
    walletAddress,
    stats: {
      bandwidthShared: 0,
      connectionUptime: 0,
      connectionQuality: 100,
      startTime: new Date()
    },
    rewards: {
      dailyReward: 0,
      totalEarned: 0,
      rewardTier: 'Starter',
      lastRewardCalculation: null
    }
  });

  await newNode.save();
  return newNode;
}

async function calculateVPNRewards(walletAddress) {
  try {
    // Utiliser le cache Redis si disponible
    if (redisClient) {
      const cachedRewards = await redisClient.get(`rewards:${walletAddress}`);
      if (cachedRewards) {
        logger.info(`Using cached rewards for ${walletAddress}`);
        return JSON.parse(cachedRewards);
      }
    }

    const node = await Node.findOne({ walletAddress });
    if (!node) {
      logger.warn(`Node not found for wallet: ${walletAddress}`);
      return {
        dailyReward: 0,
        nodeStats: null,
        error: 'Node not found'
      };
    }

    // Vérifier si le nœud est un hôte
    if (node.nodeType !== 'HOST') {
      logger.info(`Node ${walletAddress} is not a host, no rewards calculated`);
      return {
        dailyReward: 0,
        nodeStats: {
          uptime: node.stats.connectionUptime || 0,
          bandwidth: node.performance.bandwidth || 0,
          quality: node.stats.connectionQuality || 100
        },
        message: 'Node is not a host'
      };
    }

    const now = new Date();
    const lastCalculation = node.rewards.lastRewardCalculation || node.createdAt || now;
    
    // Calculer le temps écoulé depuis le dernier calcul (en heures)
    const hoursSinceLastCalculation = Math.max(0, (now - lastCalculation) / (1000 * 3600));
    
    // Si moins d'une heure s'est écoulée, retourner les récompenses actuelles
    if (hoursSinceLastCalculation < 1 && node.rewards.dailyReward > 0) {
      logger.info(`Less than 1 hour since last calculation for ${walletAddress}, returning current rewards`);
      return {
        dailyReward: node.rewards.dailyReward,
        nodeStats: {
          uptime: node.stats.connectionUptime || 0,
          bandwidth: node.performance.bandwidth || 0,
          quality: node.stats.connectionQuality || 100
        }
      };
    }
    
    // Calculer les récompenses
    const uptimeHours = node.stats.connectionUptime / 3600; // Convertir les secondes en heures
    const bandwidthShared = node.stats.bandwidthShared || node.performance.bandwidth || 0;
    
    const locationMultiplier = await calculateLocationMultiplier(node.location.country || 'Unknown');
    const demandMultiplier = await getDemandMultiplier(node.location.region || 'Unknown');
    
    const bandwidthReward = bandwidthShared * REWARD_FACTORS.bandwidth;
    const uptimeBonus = uptimeHours * REWARD_FACTORS.uptime;
    const qualityMultiplier = (node.stats.connectionQuality || 100) / 100;

    // Calculer la récompense quotidienne
    const dailyReward = (bandwidthReward + uptimeBonus) * 
                       qualityMultiplier * 
                       locationMultiplier * 
                       demandMultiplier;

    // Mettre à jour les récompenses du nœud
    node.rewards.dailyReward = dailyReward;
    node.rewards.totalEarned += dailyReward * (hoursSinceLastCalculation / 24); // Proportionnel au temps écoulé
    node.rewards.lastRewardCalculation = now;

    // Mettre à jour le niveau de récompense
    if (node.rewards.totalEarned > 5000) {
      node.rewards.rewardTier = 'ELITE';
    } else if (node.rewards.totalEarned > 1000) {
      node.rewards.rewardTier = 'PRO';
    } else {
      node.rewards.rewardTier = 'STARTER';
    }

    await node.save();
    
    const result = {
      dailyReward,
      totalEarned: node.rewards.totalEarned,
      rewardTier: node.rewards.rewardTier,
      nodeStats: {
        uptime: node.stats.connectionUptime || 0,
        bandwidth: node.performance.bandwidth || 0,
        quality: node.stats.connectionQuality || 100
      },
      lastCalculation: node.rewards.lastRewardCalculation
    };
    
    // Mettre en cache les résultats si Redis est disponible
    if (redisClient) {
      await redisClient.set(`rewards:${walletAddress}`, JSON.stringify(result), {
        EX: 300 // Expiration après 5 minutes
      });
    }

    logger.info(`Rewards calculated for node ${walletAddress}`, {
      dailyReward,
      totalEarned: node.rewards.totalEarned,
      tier: node.rewards.rewardTier
    });

    return result;
  } catch (error) {
    logger.error('Error calculating rewards', {
      walletAddress,
      error: error.message,
      stack: error.stack
    });
    
    return {
      dailyReward: 0,
      error: 'Error calculating rewards'
    };
  }
}

module.exports = {
  initNodeStats,
  calculateVPNRewards,
  calculateLocationMultiplier,
  getDemandMultiplier,
  REWARD_FACTORS,
  redisClient
};

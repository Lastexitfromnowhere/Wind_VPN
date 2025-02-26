// utils/rewardsUtils.js

const mongoose = require('mongoose');
const Node = require('../models/Node');
const logger = require('./logger');
const redis = require('redis');

const redisClient = redis.createClient({
  url: process.env.REDIS_URI
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));

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
  const cachedDemand = await redisClient.get(`demand:${region}`);
  if (cachedDemand) {
    return parseFloat(cachedDemand);
  }
  return REWARD_FACTORS.demand;
}

// Initialisation des stats d'un nœud
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

// Calcul des récompenses d'un nœud
async function calculateVPNRewards(walletAddress) {
  try {
    const node = await Node.findOne({ walletAddress });
    if (!node) {
      logger.warn(`Node not found for wallet: ${walletAddress}`);
      return undefined;
    }

    const now = Date.now();
    const uptimeHours = (now - node.stats.startTime) / (1000 * 3600);
    
    const locationMultiplier = await calculateLocationMultiplier(node.location.country);
    const demandMultiplier = await getDemandMultiplier(node.location.region);
    
    const bandwidthReward = node.stats.bandwidthShared * REWARD_FACTORS.bandwidth;
    const uptimeBonus = uptimeHours * REWARD_FACTORS.uptime;
    const qualityMultiplier = node.stats.connectionQuality / 100;

    const dailyReward = (bandwidthReward + uptimeBonus) * 
                       qualityMultiplier * 
                       locationMultiplier * 
                       demandMultiplier;

    // Update node rewards
    node.rewards.dailyReward = dailyReward;
    node.rewards.totalEarned += dailyReward;
    node.rewards.lastRewardCalculation = now;

    // Update reward tier
    if (node.rewards.totalEarned > 5000) {
      node.rewards.rewardTier = 'ELITE';
    } else if (node.rewards.totalEarned > 1000) {
      node.rewards.rewardTier = 'PRO';
    }

    await node.save();
    logger.info(`Rewards calculated for node ${walletAddress}`, {
      dailyReward,
      totalEarned: node.rewards.totalEarned,
      tier: node.rewards.rewardTier
    });

    return {
      dailyReward,
      nodeStats: node
    };
  } catch (error) {
    logger.error('Error calculating rewards', {
      walletAddress,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  initNodeStats,
  calculateVPNRewards,
  REWARD_FACTORS
};

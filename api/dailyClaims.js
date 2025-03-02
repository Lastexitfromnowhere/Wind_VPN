// api/dailyClaims.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Node = require('../models/Node');
const { calculateVPNRewards, calculateLocationMultiplier, getDemandMultiplier, redisClient } = require('../utils/rewardsUtils');

// Endpoint pour récupérer les informations de récompenses
router.get('/dailyClaims', auth, async (req, res) => {
  try {
    const walletAddress = req.walletAddress;
    
    if (!walletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Wallet address is required' 
      });
    }

    // Récupérer l'utilisateur depuis la base de données
    const user = await User.findOne({ walletAddress });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Calculer les récompenses disponibles
    const rewards = await calculateVPNRewards(walletAddress);
    
    // Vérifier si l'utilisateur peut réclamer des récompenses
    const lastClaimDate = user.lastRewardClaim;
    const now = new Date();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    
    // Déterminer si l'utilisateur peut réclamer (une fois par jour)
    let canClaim = false;
    let nextClaimTime = null;
    
    if (!lastClaimDate) {
      // Première réclamation possible immédiatement
      canClaim = true;
    } else {
      const timeSinceLastClaim = now.getTime() - new Date(lastClaimDate).getTime();
      if (timeSinceLastClaim >= oneDayInMs) {
        canClaim = true;
      } else {
        // Calculer le temps restant avant la prochaine réclamation
        const timeRemaining = oneDayInMs - timeSinceLastClaim;
        const nextClaim = new Date(now.getTime() + timeRemaining);
        nextClaimTime = nextClaim.toISOString();
      }
    }

    // Récupérer l'historique des réclamations
    const claimHistory = user.rewardClaims || [];

    return res.json({
      success: true,
      availableRewards: rewards.totalRewards,
      lastClaimDate: lastClaimDate,
      canClaim: canClaim,
      nextClaimTime: nextClaimTime,
      claimHistory: claimHistory,
      rewardDetails: {
        dailyReward: rewards.dailyReward,
        uptimeBonus: rewards.uptimeBonus,
        qualityMultiplier: rewards.qualityMultiplier,
        locationMultiplier: rewards.locationMultiplier,
        demandMultiplier: rewards.demandMultiplier
      }
    });

  } catch (error) {
    console.error('Error fetching rewards:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching rewards', 
      error: error.message 
    });
  }
});

// Endpoint pour réclamer les récompenses quotidiennes
router.post('/dailyClaims/claim', auth, async (req, res) => {
  try {
    const walletAddress = req.walletAddress;
    
    if (!walletAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Wallet address is required' 
      });
    }

    // Récupérer l'utilisateur depuis la base de données
    const user = await User.findOne({ walletAddress });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Vérifier si l'utilisateur peut réclamer des récompenses
    const lastClaimDate = user.lastRewardClaim;
    const now = new Date();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    
    if (lastClaimDate) {
      const timeSinceLastClaim = now.getTime() - new Date(lastClaimDate).getTime();
      if (timeSinceLastClaim < oneDayInMs) {
        const timeRemaining = oneDayInMs - timeSinceLastClaim;
        const nextClaim = new Date(now.getTime() + timeRemaining);
        
        return res.status(400).json({
          success: false,
          message: 'You can only claim rewards once per day',
          nextClaimTime: nextClaim.toISOString()
        });
      }
    }

    // Calculer les récompenses disponibles
    const rewards = await calculateVPNRewards(walletAddress);
    
    // Mettre à jour l'utilisateur avec les nouvelles récompenses
    const claimedAmount = rewards.totalRewards;
    
    await User.findOneAndUpdate(
      { walletAddress },
      { 
        $set: { lastRewardClaim: now },
        $inc: { totalRewardsClaimed: claimedAmount },
        $push: { 
          rewardClaims: {
            amount: claimedAmount,
            timestamp: now,
            status: 'success'
          }
        }
      },
      { new: true }
    );

    // Réinitialiser les récompenses accumulées dans Redis
    await redisClient.del(`rewards:${walletAddress}`);

    // Calculer le temps avant la prochaine réclamation
    const nextClaimTime = new Date(now.getTime() + oneDayInMs).toISOString();

    return res.json({
      success: true,
      message: 'Rewards claimed successfully',
      claimedAmount: claimedAmount,
      nextClaimTime: nextClaimTime
    });

  } catch (error) {
    console.error('Error claiming rewards:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error claiming rewards', 
      error: error.message 
    });
  }
});

module.exports = router;

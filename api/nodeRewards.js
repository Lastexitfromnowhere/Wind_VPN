const Node = require('../models/Node');
const logger = require('../utils/logger');
const { calculateVPNRewards } = require("../utils/rewardsUtils");

module.exports = async (req, res) => {
    try {
        const { walletAddress } = req.params;

        if (!walletAddress) {
            return res.status(400).json({ 
                success: false, 
                error: "Adresse de portefeuille manquante" 
            });
        }

        // Vérifier si le nœud existe dans la base de données
        const node = await Node.findOne({ walletAddress });
        
        if (!node) {
            return res.status(404).json({ 
                success: false, 
                error: "Nœud non trouvé" 
            });
        }

        // Calculer les récompenses actualisées
        const rewards = await calculateVPNRewards(walletAddress);

        // Mettre à jour les statistiques du nœud avec les récompenses calculées
        node.rewards.dailyReward = rewards.dailyReward;
        node.rewards.lastRewardCalculation = new Date();
        
        // Mettre à jour le niveau de récompense en fonction du total gagné
        if (node.rewards.totalEarned >= 1000) {
            node.rewards.rewardTier = 'ELITE';
        } else if (node.rewards.totalEarned >= 500) {
            node.rewards.rewardTier = 'PRO';
        } else {
            node.rewards.rewardTier = 'STARTER';
        }
        
        await node.save();
        
        logger.info(`Récompenses récupérées pour ${walletAddress}: ${rewards.dailyReward.toFixed(4)}`);

        res.json({
            success: true,
            dailyReward: rewards.dailyReward,
            totalEarned: node.rewards.totalEarned,
            rewardTier: node.rewards.rewardTier,
            nodeStats: {
                uptime: node.stats.connectionUptime,
                bandwidth: node.performance.bandwidth,
                quality: node.stats.connectionQuality || 100
            },
            lastCalculation: node.rewards.lastRewardCalculation
        });
    } catch (error) {
        logger.error('Erreur lors de la récupération des récompenses:', error);
        res.status(500).json({ 
            success: false, 
            error: "Erreur lors de la récupération des récompenses" 
        });
    }
};
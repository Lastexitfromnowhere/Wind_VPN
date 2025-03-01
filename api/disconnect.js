const Node = require('../models/Node');
const logger = require('../utils/logger');

module.exports = async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress) {
            return res.status(400).json({ success: false, error: "Adresse wallet manquante pour la déconnexion" });
        }

        // Trouver et mettre à jour le nœud dans la base de données
        const node = await Node.findOne({ walletAddress });
        
        if (!node) {
            return res.status(404).json({ 
                success: false, 
                error: "Nœud non trouvé" 
            });
        }
        
        // S'assurer que les objets stats et rewards existent
        if (!node.stats) {
            node.stats = {
                bandwidthShared: 0,
                connectionUptime: 0,
                connectionQuality: 100,
                startTime: new Date()
            };
        }
        
        if (!node.rewards) {
            node.rewards = {
                dailyReward: 0,
                totalEarned: 0,
                rewardTier: 'STARTER',
                lastRewardCalculation: new Date()
            };
        }
        
        // Calculer le temps d'activité
        const startTime = node.stats.startTime || new Date();
        const endTime = new Date();
        const uptimeSeconds = Math.floor((endTime - startTime) / 1000);
        
        // Mettre à jour les statistiques du nœud
        node.status = 'INACTIVE';
        node.active = false; // S'assurer que le champ active est explicitement mis à false
        node.stats.connectionUptime += uptimeSeconds;
        node.lastDisconnected = new Date(); // Ajouter un timestamp de déconnexion
        
        // Réinitialiser les informations de connexion
        node.connectedUsers = 0;
        node.performance = {
            bandwidth: 0,
            latency: 0,
            packetLoss: 0
        };
        
        // Mettre à jour les récompenses si c'est un nœud hôte
        let bandwidthReward = 0;
        if (node.nodeType === 'HOST') {
            // Calculer les récompenses basées sur le temps d'activité et la bande passante
            const bandwidth = node.performance?.bandwidth || 0;
            bandwidthReward = bandwidth * 0.01 * (uptimeSeconds / 3600); // Récompense par heure
            node.rewards.dailyReward += bandwidthReward;
            node.rewards.totalEarned += bandwidthReward;
            node.rewards.lastRewardCalculation = new Date();
            
            // Sauvegarder le nœud hébergeur
            await node.save();
        } else {
            // Si c'est un nœud utilisateur, le supprimer complètement
            await Node.deleteOne({ walletAddress });
            logger.info(`🗑️ Nœud utilisateur supprimé: ${walletAddress}`);
        }
        
        logger.info(`✅ Déconnexion du nœud VPN`);
        logger.info(`👤 Adresse Wallet: ${walletAddress}`);
        logger.info(`⏱️ Temps d'activité: ${uptimeSeconds} secondes`);
        
        if (node.nodeType === 'HOST') {
            logger.info(`💰 Récompenses ajoutées: ${bandwidthReward.toFixed(4)}`);
        }

        res.json({ 
            success: true, 
            message: "Nœud déconnecté avec succès",
            uptime: uptimeSeconds,
            rewards: node.nodeType === 'HOST' ? {
                daily: node.rewards.dailyReward,
                total: node.rewards.totalEarned
            } : null
        });
    } catch (error) {
        logger.error('Erreur lors de la déconnexion du nœud:', error);
        res.status(500).json({ 
            success: false, 
            error: "Erreur lors de la déconnexion du nœud" 
        });
    }
};
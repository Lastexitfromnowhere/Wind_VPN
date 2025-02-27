const Node = require('../models/Node');
const logger = require('../utils/logger');

module.exports = async (req, res) => {
    try {
        const { walletAddress, nodeInfo, isHost } = req.body;

        if (!walletAddress || !nodeInfo) {
            return res.status(400).json({ success: false, error: "Informations du nœud manquantes" });
        }

        // Déterminer l'IP publique (dans un environnement réel, vous utiliseriez req.ip ou un service externe)
        let publicIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "0.0.0.0";
        
        // En développement, si l'IP est localhost (::1 ou 127.0.0.1), utiliser une IP externe simulée
        if (publicIP === '::1' || publicIP === '127.0.0.1' || publicIP.includes('::ffff:127.0.0.1')) {
            // Générer une adresse IP aléatoire qui ressemble à une vraie adresse externe
            const octet1 = Math.floor(Math.random() * 223) + 1; // Éviter les adresses réservées
            const octet2 = Math.floor(Math.random() * 255);
            const octet3 = Math.floor(Math.random() * 255);
            const octet4 = Math.floor(Math.random() * 254) + 1;
            publicIP = `${octet1}.${octet2}.${octet3}.${octet4}`;
        }
        
        // Déterminer la bande passante (dans un environnement réel, cela serait basé sur des tests)
        const bandwidth = Math.floor(Math.random() * 100) + 10; // Simulation pour le moment
        
        // Générer un ID de connexion unique
        const connectionId = Math.random().toString(36).substr(2, 9);

        // Créer ou mettre à jour le nœud dans la base de données
        let node = await Node.findOne({ walletAddress });
        
        if (node) {
            // Mettre à jour le nœud existant
            node.status = 'ACTIVE';
            node.nodeType = isHost ? 'HOST' : 'USER';
            node.performance.bandwidth = bandwidth;
            node.stats.startTime = new Date();
            
            // Mettre à jour les informations supplémentaires si fournies
            if (nodeInfo.country) node.location.country = nodeInfo.country;
            if (nodeInfo.region) node.location.region = nodeInfo.region;
            if (nodeInfo.coordinates) node.location.coordinates = nodeInfo.coordinates;
            
            await node.save();
            logger.info(`Nœud existant activé: ${walletAddress}`);
        } else {
            // Créer un nouveau nœud
            node = new Node({
                walletAddress,
                nodeType: isHost ? 'HOST' : 'USER',
                status: 'ACTIVE',
                performance: {
                    bandwidth: bandwidth,
                    latency: 0,
                    uptime: 0
                },
                location: {
                    country: nodeInfo.country || 'Unknown',
                    region: nodeInfo.region || 'Unknown',
                    coordinates: nodeInfo.coordinates || { lat: 0, lng: 0 }
                }
            });
            
            await node.save();
            logger.info(`Nouveau nœud créé: ${walletAddress}`);
        }

        logger.info(`✅ Nouvel enregistrement de nœud VPN`);
        logger.info(`👤 Adresse Wallet: ${walletAddress}`);
        logger.info(`📡 Mode: ${isHost ? "Hébergeur" : "Utilisateur"}`);
        logger.info(`ℹ️ Infos du Nœud: ${JSON.stringify(nodeInfo)}`);
        logger.info(`📡 IP: ${publicIP}, 🚀 Bandwidth: ${bandwidth} MB`);

        res.json({ 
            success: true, 
            message: "Nœud enregistré avec succès", 
            connectionId, 
            ip: publicIP, 
            bandwidth,
            nodeId: node._id
        });
    } catch (error) {
        logger.error('Erreur lors de la connexion du nœud:', error);
        res.status(500).json({ 
            success: false, 
            error: "Erreur lors de l'enregistrement du nœud" 
        });
    }
};
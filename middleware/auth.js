const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const Node = require('../models/Node');

const auth = async (req, res, next) => {
  try {
    // Vérifier d'abord si un token JWT est présent
    const authHeader = req.header('Authorization');
    let token = null;
    let walletAddress = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    }
    
    // Vérifier si l'adresse du portefeuille est fournie dans les en-têtes
    const headerWalletAddress = req.header('X-Wallet-Address');
    
    if (token) {
      try {
        // Vérifier le token JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'vpn-network-secret-key');
        req.user = decoded;
        walletAddress = decoded.walletAddress;
        logger.info(`Authentification par JWT réussie pour ${walletAddress}`);
      } catch (jwtError) {
        logger.warn(`Erreur de vérification JWT: ${jwtError.message}`);
        
        // Si le token est invalide mais ressemble à une adresse de portefeuille (fallback)
        if (token.length > 30 && token.startsWith('0x')) {
          walletAddress = token;
          logger.info(`Utilisation du token comme adresse de portefeuille: ${walletAddress}`);
        } else if (headerWalletAddress) {
          walletAddress = headerWalletAddress;
          logger.info(`Utilisation de l'en-tête X-Wallet-Address: ${walletAddress}`);
        }
      }
    } else if (headerWalletAddress) {
      // Utiliser l'adresse du portefeuille comme authentification
      walletAddress = headerWalletAddress;
      logger.info(`Authentification par adresse de portefeuille: ${walletAddress}`);
    }
    
    // Si aucune méthode d'authentification n'est fournie
    if (!walletAddress) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentification requise' 
      });
    }
    
    // Vérifier si l'adresse du portefeuille existe dans la base de données
    const node = await Node.findOne({ walletAddress });
    
    if (!node) {
      logger.warn(`Tentative d'accès avec une adresse de portefeuille non enregistrée: ${walletAddress}`);
      return res.status(403).json({ 
        success: false, 
        error: 'Adresse de portefeuille non autorisée' 
      });
    }
    
    // Ajouter l'adresse du portefeuille et les informations du nœud à la requête
    req.walletAddress = walletAddress;
    req.nodeType = node.nodeType;
    req.nodeStatus = node.status;
    
    next();
  } catch (error) {
    logger.error(`Erreur d'authentification: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'authentification' 
    });
  }
};

module.exports = auth;

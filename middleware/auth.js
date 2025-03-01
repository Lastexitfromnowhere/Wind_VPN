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
        if (token.length > 30) {
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
      // En mode développement, utiliser une adresse de test
      if (process.env.NODE_ENV === 'development') {
        walletAddress = 'TEST_WALLET_ADDRESS';
        logger.info(`Mode développement: utilisation de l'adresse de test ${walletAddress}`);
      } else {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentification requise' 
        });
      }
    }
    
    // Vérifier si l'adresse du portefeuille existe dans la base de données
    let node = await Node.findOne({ walletAddress });
    
    // Si le nœud n'existe pas, ne pas le créer automatiquement
    if (!node) {
      logger.warn(`Tentative d'accès avec une adresse de portefeuille non enregistrée: ${walletAddress}`);
      // Ne pas bloquer l'accès, mais ne pas créer de nœud
      // L'utilisateur pourra toujours accéder aux nœuds disponibles
    }
    
    // Ajouter l'adresse du portefeuille à la requête
    req.walletAddress = walletAddress;
    
    // Ajouter les informations du nœud si disponible
    if (node) {
      req.nodeType = node.nodeType;
      req.nodeStatus = node.status;
    } else {
      req.nodeType = 'USER';
      req.nodeStatus = 'INACTIVE';
    }
    
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

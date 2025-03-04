const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WireGuardConfig = require('../models/WireGuardConfig');
const wireguardUtils = require('../utils/wireguardUtils');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/wireguard/config:
 *   get:
 *     summary: Obtenir la configuration WireGuard de l'utilisateur
 *     tags: [WireGuard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration WireGuard
 *       401:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 */
router.get('/config', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Vérifier si l'utilisateur a déjà une configuration
    let config = await WireGuardConfig.findOne({ userId });
    
    // Si non, créer une nouvelle configuration
    if (!config) {
      config = await wireguardUtils.createClientConfig(userId);
    }
    
    // Générer le fichier de configuration au format WireGuard
    const configFile = wireguardUtils.generateClientConfigFile(config);
    
    res.json({
      success: true,
      config: {
        id: config._id,
        clientIp: config.clientIp,
        serverEndpoint: config.serverEndpoint,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        isActive: config.isActive,
        configFile
      }
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération de la configuration WireGuard', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération de la configuration WireGuard' });
  }
});

/**
 * @swagger
 * /api/wireguard/config:
 *   post:
 *     summary: Créer ou régénérer la configuration WireGuard de l'utilisateur
 *     tags: [WireGuard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration WireGuard créée ou régénérée
 *       401:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 */
router.post('/config', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Supprimer la configuration existante si elle existe
    await WireGuardConfig.deleteOne({ userId });
    
    // Créer une nouvelle configuration
    const config = await wireguardUtils.createClientConfig(userId);
    
    // Générer le fichier de configuration au format WireGuard
    const configFile = wireguardUtils.generateClientConfigFile(config);
    
    res.json({
      success: true,
      config: {
        id: config._id,
        clientIp: config.clientIp,
        serverEndpoint: config.serverEndpoint,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
        isActive: config.isActive,
        configFile
      }
    });
  } catch (error) {
    logger.error('Erreur lors de la création de la configuration WireGuard', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la création de la configuration WireGuard' });
  }
});

/**
 * @swagger
 * /api/wireguard/config:
 *   delete:
 *     summary: Désactiver la configuration WireGuard de l'utilisateur
 *     tags: [WireGuard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration WireGuard désactivée
 *       401:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 */
router.delete('/config', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Désactiver la configuration
    await wireguardUtils.deactivateClientConfig(userId);
    
    res.json({ success: true, message: 'Configuration WireGuard désactivée' });
  } catch (error) {
    logger.error('Erreur lors de la désactivation de la configuration WireGuard', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la désactivation de la configuration WireGuard' });
  }
});

/**
 * @swagger
 * /api/wireguard/status:
 *   get:
 *     summary: Vérifier le statut de WireGuard
 *     tags: [WireGuard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statut de WireGuard
 *       401:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 */
router.get('/status', auth, async (req, res) => {
  try {
    const isAvailable = wireguardUtils.isWireGuardAvailable();
    
    res.json({
      success: true,
      status: {
        available: isAvailable,
        mode: process.env.NODE_ENV === 'development' && process.env.SIMULATE_WIREGUARD === 'true' ? 'simulation' : 'production'
      }
    });
  } catch (error) {
    logger.error('Erreur lors de la vérification du statut de WireGuard', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification du statut de WireGuard' });
  }
});

/**
 * @swagger
 * /api/wireguard/connected-clients:
 *   get:
 *     summary: Obtenir la liste des clients connectés (admin seulement)
 *     tags: [WireGuard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des clients connectés
 *       401:
 *         description: Non autorisé
 *       403:
 *         description: Accès refusé
 *       500:
 *         description: Erreur serveur
 */
router.get('/connected-clients', auth, async (req, res) => {
  try {
    // Vérifier si l'utilisateur est administrateur
    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }
    
    const clients = await wireguardUtils.getConnectedClients();
    
    res.json({
      success: true,
      clients
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des clients connectés', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des clients connectés' });
  }
});

module.exports = router;

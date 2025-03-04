const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const crypto = require('crypto');
const mongoose = require('mongoose');
const WireGuardConfig = require('../models/WireGuardConfig');
const logger = require('./logger');

const execPromise = util.promisify(exec);

// Configuration de base
const WG_INTERFACE = 'wg0';
const WG_PORT = 51820;
const WG_CONFIG_DIR = process.env.NODE_ENV === 'production' ? '/etc/wireguard' : path.join(__dirname, '../wireguard');
const WG_CONFIG_PATH = path.join(WG_CONFIG_DIR, `${WG_INTERFACE}.conf`);
const WG_SERVER_IP = '10.8.0.1/24';
const WG_CLIENT_IP_BASE = '10.8.0.';

// Vérifier si WireGuard est disponible
const isWireGuardAvailable = () => {
  try {
    if (process.env.NODE_ENV === 'development' && process.env.SIMULATE_WIREGUARD === 'true') {
      logger.info('Mode simulation WireGuard activé');
      return true;
    }
    
    const result = execSync('which wg').toString().trim();
    return !!result;
  } catch (error) {
    logger.error('WireGuard n\'est pas disponible sur ce système', error);
    return false;
  }
};

// Générer des clés WireGuard
const generateKeys = async () => {
  if (process.env.NODE_ENV === 'development' && process.env.SIMULATE_WIREGUARD === 'true') {
    // En mode simulation, générer des clés aléatoires
    const privateKey = crypto.randomBytes(32).toString('base64');
    const publicKey = crypto.randomBytes(32).toString('base64');
    return { privateKey, publicKey };
  }

  try {
    const { stdout: privateKey } = await execPromise('wg genkey');
    const { stdout: publicKey } = await execPromise(`echo "${privateKey.trim()}" | wg pubkey`);
    return {
      privateKey: privateKey.trim(),
      publicKey: publicKey.trim()
    };
  } catch (error) {
    logger.error('Erreur lors de la génération des clés WireGuard', error);
    throw new Error('Erreur lors de la génération des clés WireGuard');
  }
};

// Obtenir la prochaine adresse IP client disponible
const getNextClientIp = async () => {
  try {
    const configs = await WireGuardConfig.find().sort({ clientIp: -1 }).limit(1);
    if (configs.length === 0) {
      return `${WG_CLIENT_IP_BASE}2/24`; // Commencer à .2 car .1 est le serveur
    }
    
    const lastIp = configs[0].clientIp;
    const lastOctet = parseInt(lastIp.split('.')[3], 10);
    return `${WG_CLIENT_IP_BASE}${lastOctet + 1}/24`;
  } catch (error) {
    logger.error('Erreur lors de la récupération de la prochaine adresse IP client', error);
    throw new Error('Erreur lors de la récupération de la prochaine adresse IP client');
  }
};

// Créer une configuration client
const createClientConfig = async (userId) => {
  try {
    // Vérifier si l'utilisateur a déjà une configuration
    const existingConfig = await WireGuardConfig.findOne({ userId });
    if (existingConfig) {
      return existingConfig;
    }

    // Générer les clés pour le client
    const { privateKey, publicKey } = await generateKeys();
    
    // Obtenir la prochaine adresse IP disponible
    const clientIp = await getNextClientIp();
    
    // Obtenir les informations du serveur
    const serverConfig = await getServerConfig();
    
    // Créer et sauvegarder la configuration
    const config = new WireGuardConfig({
      userId,
      privateKey,
      publicKey,
      clientIp,
      serverPublicKey: serverConfig.publicKey,
      serverEndpoint: `${process.env.SERVER_PUBLIC_IP || 'localhost'}:${WG_PORT}`,
      serverIp: WG_SERVER_IP.split('/')[0]
    });
    
    await config.save();
    
    // Si WireGuard est disponible, mettre à jour la configuration du serveur
    if (isWireGuardAvailable() && process.env.NODE_ENV === 'production') {
      await updateServerConfig();
    }
    
    return config;
  } catch (error) {
    logger.error('Erreur lors de la création de la configuration client', error);
    throw new Error('Erreur lors de la création de la configuration client');
  }
};

// Obtenir la configuration du serveur
const getServerConfig = async () => {
  if (process.env.NODE_ENV === 'development' && process.env.SIMULATE_WIREGUARD === 'true') {
    // En mode simulation, retourner des valeurs fictives
    return {
      privateKey: 'server_private_key_simulated',
      publicKey: 'server_public_key_simulated',
      ip: WG_SERVER_IP
    };
  }

  try {
    // Vérifier si le fichier de configuration existe
    if (!fs.existsSync(WG_CONFIG_PATH)) {
      // Générer de nouvelles clés pour le serveur
      const { privateKey, publicKey } = await generateKeys();
      
      // Créer le répertoire de configuration si nécessaire
      if (!fs.existsSync(WG_CONFIG_DIR)) {
        fs.mkdirSync(WG_CONFIG_DIR, { recursive: true });
      }
      
      // Créer le fichier de configuration
      const config = `[Interface]
PrivateKey = ${privateKey}
Address = ${WG_SERVER_IP}
ListenPort = ${WG_PORT}
PostUp = iptables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
`;
      
      fs.writeFileSync(WG_CONFIG_PATH, config);
      
      return { privateKey, publicKey, ip: WG_SERVER_IP };
    } else {
      // Lire le fichier de configuration existant
      const config = fs.readFileSync(WG_CONFIG_PATH, 'utf8');
      const privateKeyMatch = config.match(/PrivateKey\s*=\s*([^\n]+)/);
      
      if (!privateKeyMatch) {
        throw new Error('Clé privée non trouvée dans la configuration du serveur');
      }
      
      const privateKey = privateKeyMatch[1].trim();
      const { stdout: publicKey } = await execPromise(`echo "${privateKey}" | wg pubkey`);
      
      return { privateKey, publicKey: publicKey.trim(), ip: WG_SERVER_IP };
    }
  } catch (error) {
    logger.error('Erreur lors de la récupération de la configuration du serveur', error);
    throw new Error('Erreur lors de la récupération de la configuration du serveur');
  }
};

// Mettre à jour la configuration du serveur avec tous les clients
const updateServerConfig = async () => {
  if (process.env.NODE_ENV === 'development' && process.env.SIMULATE_WIREGUARD === 'true') {
    logger.info('Mode simulation: mise à jour de la configuration du serveur simulée');
    return;
  }

  try {
    // Obtenir la configuration du serveur
    const serverConfig = await getServerConfig();
    
    // Obtenir tous les clients actifs
    const clients = await WireGuardConfig.find({ isActive: true });
    
    // Créer le contenu de la configuration
    let config = `[Interface]
PrivateKey = ${serverConfig.privateKey}
Address = ${WG_SERVER_IP}
ListenPort = ${WG_PORT}
PostUp = iptables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
`;
    
    // Ajouter chaque client
    clients.forEach(client => {
      config += `
[Peer]
PublicKey = ${client.publicKey}
AllowedIPs = ${client.clientIp.split('/')[0]}/32
`;
    });
    
    // Écrire la configuration
    fs.writeFileSync(WG_CONFIG_PATH, config);
    
    // Redémarrer l'interface si elle existe déjà
    try {
      await execPromise('wg-quick down wg0');
    } catch (error) {
      // Ignorer l'erreur si l'interface n'existe pas encore
    }
    
    await execPromise('wg-quick up wg0');
    
    logger.info('Configuration du serveur WireGuard mise à jour avec succès');
  } catch (error) {
    logger.error('Erreur lors de la mise à jour de la configuration du serveur', error);
    throw new Error('Erreur lors de la mise à jour de la configuration du serveur');
  }
};

// Générer un fichier de configuration client au format WireGuard
const generateClientConfigFile = (config) => {
  return `[Interface]
PrivateKey = ${config.privateKey}
Address = ${config.clientIp}
DNS = ${config.dns}

[Peer]
PublicKey = ${config.serverPublicKey}
Endpoint = ${config.serverEndpoint}
AllowedIPs = ${config.allowedIps}
PersistentKeepalive = ${config.persistentKeepalive}
`;
};

// Désactiver une configuration client
const deactivateClientConfig = async (userId) => {
  try {
    const config = await WireGuardConfig.findOne({ userId });
    if (!config) {
      throw new Error('Configuration non trouvée');
    }
    
    config.isActive = false;
    await config.save();
    
    // Mettre à jour la configuration du serveur si WireGuard est disponible
    if (isWireGuardAvailable() && process.env.NODE_ENV === 'production') {
      await updateServerConfig();
    }
    
    return { success: true };
  } catch (error) {
    logger.error('Erreur lors de la désactivation de la configuration client', error);
    throw new Error('Erreur lors de la désactivation de la configuration client');
  }
};

// Obtenir les clients connectés
const getConnectedClients = async () => {
  if (process.env.NODE_ENV === 'development' && process.env.SIMULATE_WIREGUARD === 'true') {
    // En mode simulation, retourner des données fictives
    return [];
  }

  try {
    if (!isWireGuardAvailable()) {
      return [];
    }
    
    const { stdout } = await execPromise('wg show wg0 dump');
    const lines = stdout.trim().split('\n');
    
    // Ignorer la première ligne (en-têtes)
    const peerLines = lines.slice(1);
    
    const connectedPeers = [];
    
    for (const line of peerLines) {
      const parts = line.split('\t');
      const publicKey = parts[0];
      const lastHandshake = parseInt(parts[4], 10);
      
      // Considérer un client comme connecté s'il a eu un handshake dans les 3 dernières minutes
      const isConnected = lastHandshake > 0 && (Date.now() / 1000 - lastHandshake) < 180;
      
      if (isConnected) {
        const client = await WireGuardConfig.findOne({ publicKey });
        if (client) {
          connectedPeers.push({
            userId: client.userId,
            clientIp: client.clientIp,
            lastHandshake: new Date(lastHandshake * 1000)
          });
        }
      }
    }
    
    return connectedPeers;
  } catch (error) {
    logger.error('Erreur lors de la récupération des clients connectés', error);
    return [];
  }
};

// Initialiser WireGuard au démarrage du serveur
const initializeWireGuard = async () => {
  if (process.env.NODE_ENV === 'development' && process.env.SIMULATE_WIREGUARD === 'true') {
    logger.info('Mode simulation: initialisation de WireGuard simulée');
    return;
  }

  if (!isWireGuardAvailable()) {
    logger.warn('WireGuard n\'est pas disponible, fonctionnement en mode limité');
    return;
  }

  try {
    logger.info('Initialisation de WireGuard...');
    
    // Vérifier si MongoDB est connecté
    if (mongoose.connection.readyState !== 1) {
      logger.error('MongoDB n\'est pas connecté, impossible d\'initialiser WireGuard');
      return;
    }
    
    // Mettre à jour la configuration du serveur
    await updateServerConfig();
    
    logger.info('WireGuard initialisé avec succès');
  } catch (error) {
    logger.error('Erreur lors de l\'initialisation de WireGuard', error);
  }
};

module.exports = {
  isWireGuardAvailable,
  generateKeys,
  createClientConfig,
  getServerConfig,
  updateServerConfig,
  generateClientConfigFile,
  deactivateClientConfig,
  getConnectedClients,
  initializeWireGuard
};

require('dotenv').config();
const mongoose = require('mongoose');
const Node = require('../models/Node');
const logger = require('../utils/logger');

// Fonction pour générer une adresse de portefeuille aléatoire
const generateRandomWallet = () => {
  return '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
};

// Fonction pour générer un nombre aléatoire dans une plage
const randomInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Fonction pour générer un nœud aléatoire
const generateRandomNode = (index, forceHost = false) => {
  // Pays et régions disponibles
  const countries = [
    { code: 'FR', region: 'EU', city: 'Paris', lat: 48.8566, lng: 2.3522 },
    { code: 'DE', region: 'EU', city: 'Berlin', lat: 52.5200, lng: 13.4050 },
    { code: 'GB', region: 'EU', city: 'London', lat: 51.5074, lng: -0.1278 },
    { code: 'US', region: 'NA', city: 'New York', lat: 40.7128, lng: -74.0060 },
    { code: 'CA', region: 'NA', city: 'Toronto', lat: 43.6532, lng: -79.3832 },
    { code: 'JP', region: 'AS', city: 'Tokyo', lat: 35.6762, lng: 139.6503 },
    { code: 'AU', region: 'OC', city: 'Sydney', lat: -33.8688, lng: 151.2093 },
    { code: 'BR', region: 'SA', city: 'São Paulo', lat: -23.5505, lng: -46.6333 },
    { code: 'ZA', region: 'AF', city: 'Cape Town', lat: -33.9249, lng: 18.4241 },
    { code: 'SG', region: 'AS', city: 'Singapore', lat: 1.3521, lng: 103.8198 }
  ];
  
  const country = countries[Math.floor(Math.random() * countries.length)];
  
  // Déterminer si c'est un hôte ou un utilisateur (30% d'hôtes, 70% d'utilisateurs)
  const nodeType = forceHost || Math.random() < 0.3 ? 'HOST' : 'USER';
  
  // Déterminer le statut (70% actifs, 30% inactifs)
  const status = Math.random() < 0.7 ? 'ACTIVE' : 'INACTIVE';
  
  // Générer des performances aléatoires
  const bandwidth = randomInRange(10, 200);
  const latency = randomInRange(10, 100);
  const uptime = randomInRange(80, 100);
  
  // Générer des statistiques aléatoires
  const bandwidthShared = 1024 * 1024 * randomInRange(100, 2000); // Entre 100 MB et 2 GB
  const connectionUptime = randomInRange(24, 720); // Entre 1 et 30 jours en heures
  const connectionQuality = randomInRange(70, 100);
  
  // Générer des récompenses aléatoires pour les hôtes
  const dailyReward = nodeType === 'HOST' ? randomInRange(1, 50) / 10 : 0;
  const totalEarned = nodeType === 'HOST' ? dailyReward * randomInRange(10, 100) : 0;
  
  // Déterminer le niveau de récompense
  let rewardTier = 'STARTER';
  if (totalEarned > 1000) {
    rewardTier = 'ELITE';
  } else if (totalEarned > 500) {
    rewardTier = 'PRO';
  }
  
  return {
    walletAddress: index < 3 ? testNodes[index].walletAddress : generateRandomWallet(),
    nodeType,
    status,
    location: {
      country: country.code,
      region: country.region,
      city: country.city,
      coordinates: {
        lat: country.lat + (Math.random() * 0.1 - 0.05), // Ajouter un peu de variation
        lng: country.lng + (Math.random() * 0.1 - 0.05)
      }
    },
    performance: {
      bandwidth,
      latency,
      uptime
    },
    stats: {
      bandwidthShared,
      connectionUptime,
      connectionQuality,
      startTime: new Date(Date.now() - connectionUptime * 3600 * 1000) // Calculer la date de début
    },
    rewards: {
      dailyReward,
      totalEarned,
      rewardTier,
      lastRewardCalculation: new Date()
    },
    createdAt: new Date(Date.now() - randomInRange(1, 90) * 24 * 3600 * 1000) // Entre 1 et 90 jours dans le passé
  };
};

// Nœuds de test fixes pour la compatibilité
const testNodes = [
  {
    walletAddress: '0x1234567890123456789012345678901234567890',
    nodeType: 'HOST',
    status: 'ACTIVE',
    location: {
      country: 'FR',
      region: 'EU',
      city: 'Paris',
      coordinates: {
        lat: 48.8566,
        lng: 2.3522
      }
    },
    performance: {
      bandwidth: 100,
      latency: 25,
      uptime: 99.9
    },
    stats: {
      bandwidthShared: 1024 * 1024 * 500, // 500 MB
      connectionUptime: 168, // 7 jours en heures
      connectionQuality: 95,
      startTime: new Date(Date.now() - 168 * 3600 * 1000)
    },
    rewards: {
      dailyReward: 5.2,
      totalEarned: 520,
      rewardTier: 'PRO',
      lastRewardCalculation: new Date()
    },
    createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) // 30 jours dans le passé
  },
  {
    walletAddress: '0x2345678901234567890123456789012345678901',
    nodeType: 'HOST',
    status: 'ACTIVE',
    location: {
      country: 'DE',
      region: 'EU',
      city: 'Berlin',
      coordinates: {
        lat: 52.5200,
        lng: 13.4050
      }
    },
    performance: {
      bandwidth: 75,
      latency: 30,
      uptime: 98.5
    },
    stats: {
      bandwidthShared: 1024 * 1024 * 300, // 300 MB
      connectionUptime: 72, // 3 jours en heures
      connectionQuality: 88,
      startTime: new Date(Date.now() - 72 * 3600 * 1000)
    },
    rewards: {
      dailyReward: 3.8,
      totalEarned: 380,
      rewardTier: 'STARTER',
      lastRewardCalculation: new Date()
    },
    createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000) // 20 jours dans le passé
  },
  {
    walletAddress: '0x3456789012345678901234567890123456789012',
    nodeType: 'USER',
    status: 'INACTIVE',
    location: {
      country: 'GB',
      region: 'EU',
      city: 'London',
      coordinates: {
        lat: 51.5074,
        lng: -0.1278
      }
    },
    performance: {
      bandwidth: 90,
      latency: 28,
      uptime: 95.0
    },
    stats: {
      bandwidthShared: 1024 * 1024 * 1000, // 1 GB
      connectionUptime: 240, // 10 jours en heures
      connectionQuality: 92,
      startTime: new Date(Date.now() - 240 * 3600 * 1000)
    },
    rewards: {
      dailyReward: 0,
      totalEarned: 0,
      rewardTier: 'STARTER',
      lastRewardCalculation: new Date()
    },
    createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000) // 15 jours dans le passé
  }
];

async function seedTestNodes() {
  try {
    // Se connecter à MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');

    // Supprimer les nœuds existants
    await Node.deleteMany({});
    logger.info('Cleared existing nodes');

    // Préparer les nœuds à insérer
    const nodesToInsert = [...testNodes];
    
    // Nombre total de nœuds à générer
    const totalNodes = 50;
    
    // Générer des nœuds aléatoires supplémentaires
    for (let i = 3; i < totalNodes; i++) {
      // Forcer quelques nœuds à être des hôtes
      const forceHost = i < 15; // Les 15 premiers nœuds seront des hôtes
      nodesToInsert.push(generateRandomNode(i, forceHost));
    }
    
    // Ajouter les nouveaux nœuds
    const result = await Node.insertMany(nodesToInsert);
    logger.info(`Added ${result.length} test nodes`);
    
    // Afficher quelques statistiques
    const hostCount = await Node.countDocuments({ nodeType: 'HOST' });
    const userCount = await Node.countDocuments({ nodeType: 'USER' });
    const activeCount = await Node.countDocuments({ status: 'ACTIVE' });
    
    logger.info(`Statistics: ${hostCount} hosts, ${userCount} users, ${activeCount} active nodes`);
    logger.info('Seeding completed successfully');
  } catch (error) {
    logger.error('Error seeding test nodes:', error);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

// Exécuter le script si appelé directement
if (require.main === module) {
  seedTestNodes().then(() => {
    process.exit(0);
  }).catch(err => {
    logger.error('Fatal error during seeding:', err);
    process.exit(1);
  });
}

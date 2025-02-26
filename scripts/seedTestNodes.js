require('dotenv').config();
const mongoose = require('mongoose');
const Node = require('../models/Node');

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
      connectionQuality: 95
    }
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
      connectionQuality: 88
    }
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
      connectionQuality: 92
    }
  }
];

async function seedTestNodes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Supprimer les nœuds existants
    await Node.deleteMany({});
    console.log('Cleared existing nodes');

    // Ajouter les nouveaux nœuds
    const result = await Node.insertMany(testNodes);
    console.log(`Added ${result.length} test nodes`);

    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Error seeding test nodes:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

seedTestNodes();

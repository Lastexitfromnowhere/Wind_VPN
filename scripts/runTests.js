require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_WALLET = '0x1234567890123456789012345678901234567890';

// Fonction pour attendre un certain temps
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fonction pour exécuter un test
const runTest = async (name, testFn) => {
  try {
    logger.info(`Running test: ${name}`);
    const startTime = Date.now();
    await testFn();
    const duration = Date.now() - startTime;
    logger.info(`✅ Test passed: ${name} (${duration}ms)`);
    return true;
  } catch (error) {
    logger.error(`❌ Test failed: ${name}`, error);
    return false;
  }
};

// Tests
const tests = [
  // Test de l'API Connect
  async () => {
    const response = await axios.post(`${API_URL}/connect`, {
      walletAddress: TEST_WALLET,
      nodeType: 'HOST',
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
      }
    }, {
      headers: {
        'X-Wallet-Address': TEST_WALLET
      }
    });
    
    if (!response.data.success || !response.data.connectionId) {
      throw new Error('Connect API failed: ' + JSON.stringify(response.data));
    }
    
    // Stocker l'ID de connexion pour les tests suivants
    global.connectionId = response.data.connectionId;
    logger.info(`Connection established with ID: ${global.connectionId}`);
  },
  
  // Test de l'API Network Stats
  async () => {
    const response = await axios.get(`${API_URL}/networkStats`, {
      headers: {
        'X-Wallet-Address': TEST_WALLET
      }
    });
    
    if (!response.data.success) {
      throw new Error('Network Stats API failed: ' + JSON.stringify(response.data));
    }
    
    logger.info(`Network stats: ${response.data.totalNodes} nodes, ${response.data.activeNodes} active`);
  },
  
  // Test de l'API Node Rewards
  async () => {
    const response = await axios.get(`${API_URL}/nodeRewards/${TEST_WALLET}`, {
      headers: {
        'X-Wallet-Address': TEST_WALLET
      }
    });
    
    if (!response.data.success) {
      throw new Error('Node Rewards API failed: ' + JSON.stringify(response.data));
    }
    
    logger.info(`Node rewards: ${response.data.dailyReward} daily, ${response.data.totalEarned} total, tier: ${response.data.rewardTier}`);
  },
  
  // Test de l'API Disconnect
  async () => {
    // Attendre un peu avant de se déconnecter pour simuler une session
    await sleep(2000);
    
    const response = await axios.post(`${API_URL}/disconnect`, {
      connectionId: global.connectionId,
      walletAddress: TEST_WALLET
    }, {
      headers: {
        'X-Wallet-Address': TEST_WALLET
      }
    });
    
    if (!response.data.success) {
      throw new Error('Disconnect API failed: ' + JSON.stringify(response.data));
    }
    
    logger.info(`Disconnected successfully, session duration: ${response.data.sessionDuration}s`);
  }
];

// Exécuter tous les tests
const runAllTests = async () => {
  logger.info('Starting API tests...');
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < tests.length; i++) {
    const success = await runTest(`Test ${i + 1}/${tests.length}`, tests[i]);
    if (success) {
      passed++;
    } else {
      failed++;
      // Si un test échoue, on peut décider d'arrêter les tests suivants
      // qui pourraient dépendre du test échoué
      if (i < tests.length - 1) {
        logger.warn('A test failed, but continuing with remaining tests...');
      }
    }
  }
  
  logger.info(`Tests completed: ${passed} passed, ${failed} failed`);
  
  return failed === 0;
};

// Exécuter les tests si le script est appelé directement
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    logger.error('Error running tests:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };

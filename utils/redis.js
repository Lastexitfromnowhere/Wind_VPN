// utils/redis.js
const redis = require('redis');
const { promisify } = require('util');
const logger = require('./logger');

// Créer un client Redis
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
  retry_strategy: function(options) {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      // Fin de la tentative de reconnexion, redémarrage du serveur
      logger.error('Redis error: ' + options.error.message);
      return new Error('The server refused the connection');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      // Fin de la tentative de reconnexion après 1 heure
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      // Fin de la tentative de reconnexion après 10 tentatives
      return undefined;
    }
    // Reconnexion après
    return Math.min(options.attempt * 100, 3000);
  }
});

// Gestion des erreurs
redisClient.on('error', (err) => {
  logger.error('Redis error: ' + err.message, { service: 'vpn-network', error: err });
});

// Gestion de la connexion réussie
redisClient.on('connect', () => {
  logger.info('Connected to Redis successfully', { service: 'vpn-network' });
});

// Promisify pour les méthodes Redis
const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);
const keysAsync = promisify(redisClient.keys).bind(redisClient);
const hgetAsync = promisify(redisClient.hget).bind(redisClient);
const hsetAsync = promisify(redisClient.hset).bind(redisClient);
const hgetallAsync = promisify(redisClient.hgetall).bind(redisClient);
const hmsetAsync = promisify(redisClient.hmset).bind(redisClient);
const expireAsync = promisify(redisClient.expire).bind(redisClient);

module.exports = {
  redisClient,
  getAsync,
  setAsync,
  delAsync,
  keysAsync,
  hgetAsync,
  hsetAsync,
  hgetallAsync,
  hmsetAsync,
  expireAsync
};

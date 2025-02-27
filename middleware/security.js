const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const express = require('express');
const logger = require('../utils/logger');

// Configuration du rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // limite chaque IP à 2000 requêtes par fenêtre
  standardHeaders: true, // Retourne les informations de limite dans les headers `RateLimit-*`
  legacyHeaders: false, // Désactive les headers `X-RateLimit-*`
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Trop de requêtes, veuillez réessayer plus tard'
    });
  }
});

// Rate limiter plus strict pour les routes d'authentification
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // limite chaque IP à 10 tentatives par heure
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Trop de tentatives d\'authentification, veuillez réessayer plus tard'
    });
  }
});

// Rate limiter spécifique pour les endpoints fréquemment utilisés (status, rewards)
const statusLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 2 requêtes par seconde en moyenne
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Status endpoint rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Trop de requêtes sur les endpoints de status, veuillez réduire la fréquence'
    });
  }
});

// Middleware pour vérifier l'origine des requêtes
const corsCheck = (req, res, next) => {
  // Accepter toutes les origines pendant la phase de développement
  next();
};

// Middleware de journalisation des requêtes
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel](`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  });
  
  next();
};

// Middleware pour détecter les attaques potentielles
const securityCheck = (req, res, next) => {
  // Vérifier les en-têtes suspects
  const suspiciousHeaders = ['x-forwarded-host', 'x-host'];
  for (const header of suspiciousHeaders) {
    if (req.headers[header]) {
      logger.warn(`En-tête suspect détecté: ${header}=${req.headers[header]}`);
    }
  }
  
  // Vérifier les paramètres de requête suspects
  const suspiciousParams = ['eval', 'exec', 'script', '<script'];
  const queryString = req.url.toLowerCase();
  for (const param of suspiciousParams) {
    if (queryString.includes(param)) {
      logger.warn(`Paramètre suspect détecté dans l'URL: ${param}`);
    }
  }
  
  next();
};

// Assembler tous les middlewares de sécurité
const securityMiddleware = [
  // Logging et vérifications
  requestLogger,
  corsCheck,
  securityCheck,
  
  // Helmet pour les en-têtes de sécurité
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://wind-frontend-rosy.vercel.app"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
  
  // Protection contre les attaques courantes
  helmet.hidePoweredBy(),
  helmet.noSniff(),
  helmet.xssFilter(),
  helmet.frameguard({ action: 'deny' }),
  helmet.hsts({
    maxAge: 15552000, // 180 jours en secondes
    includeSubDomains: true,
    preload: true
  }),
  
  // Rate limiters
  (req, res, next) => {
    if (req.path.includes('/auth/') || req.path.includes('/login')) {
      return authLimiter(req, res, next);
    } else if (req.path.includes('/status') || req.path.includes('/rewards')) {
      return statusLimiter(req, res, next);
    }
    return apiLimiter(req, res, next);
  },
  
  // Parser JSON avec limite de taille
  express.json({ limit: '1mb' })
];

module.exports = securityMiddleware;

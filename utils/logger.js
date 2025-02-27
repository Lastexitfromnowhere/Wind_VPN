const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Créer le dossier logs s'il n'existe pas
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Format personnalisé pour les logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Format pour la console
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let metaStr = '';
    if (Object.keys(metadata).length > 0 && metadata.stack) {
      metaStr = `\n${metadata.stack}`;
    } else if (Object.keys(metadata).length > 0) {
      metaStr = `\n${JSON.stringify(metadata, null, 2)}`;
    }
    
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Créer le logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: { service: 'vpn-network' },
  transports: [
    // Logs d'erreur
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Logs d'avertissement
    new winston.transports.File({ 
      filename: path.join(logDir, 'warn.log'), 
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Tous les logs
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    })
  ],
  // Ne pas quitter en cas d'erreur non gérée
  exitOnError: false
});

// Ajouter un transport console en développement
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
} else {
  // En production, ajouter quand même la console mais avec un niveau plus élevé
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'info'
  }));
}

// Capturer les exceptions et les rejets non gérés
logger.exceptions.handle(
  new winston.transports.File({ 
    filename: path.join(logDir, 'exceptions.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  })
);

// Ajouter une méthode pour les logs de débogage avec des objets
logger.debugObj = (message, obj) => {
  logger.debug(message, { data: obj });
};

// Ajouter une méthode pour les logs de performance
logger.perf = (message, startTime) => {
  const duration = Date.now() - startTime;
  logger.info(`${message} (${duration}ms)`, { duration });
};

// Intercepter les erreurs non gérées
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

module.exports = logger;

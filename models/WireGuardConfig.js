const mongoose = require('mongoose');

const wireGuardConfigSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  privateKey: {
    type: String,
    required: true
  },
  publicKey: {
    type: String,
    required: true
  },
  clientIp: {
    type: String,
    required: true
  },
  serverPublicKey: {
    type: String,
    required: true
  },
  serverEndpoint: {
    type: String,
    required: true
  },
  serverIp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  allowedIps: {
    type: String,
    default: '0.0.0.0/0, ::/0'
  },
  dns: {
    type: String,
    default: '1.1.1.1, 8.8.8.8'
  },
  persistentKeepalive: {
    type: Number,
    default: 25
  }
});

// Mise à jour automatique du champ updatedAt avant chaque sauvegarde
wireGuardConfigSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const WireGuardConfig = mongoose.model('WireGuardConfig', wireGuardConfigSchema);

module.exports = WireGuardConfig;

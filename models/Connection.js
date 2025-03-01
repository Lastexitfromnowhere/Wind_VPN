const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema({
  hostWalletAddress: {
    type: String,
    required: true,
    index: true
  },
  clientWalletAddress: {
    type: String,
    required: true,
    index: true
  },
  hostNode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Node'
  },
  clientNode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Node'
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'DISCONNECTED', 'FAILED'],
    default: 'ACTIVE'
  },
  connectedAt: {
    type: Date,
    default: Date.now
  },
  disconnectedAt: {
    type: Date,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  metrics: {
    totalBandwidth: {
      type: Number, // en MB
      default: 0
    },
    averageLatency: {
      type: Number, // en ms
      default: 0
    },
    packetLoss: {
      type: Number, // en pourcentage
      default: 0
    },
    connectionQuality: {
      type: Number, // score de 0 à 100
      default: 100
    }
  },
  sessionDuration: {
    type: Number, // en secondes
    default: 0
  }
}, { timestamps: true });

// Ajouter des index pour améliorer les performances
connectionSchema.index({ hostWalletAddress: 1, status: 1 });
connectionSchema.index({ clientWalletAddress: 1, status: 1 });
connectionSchema.index({ connectedAt: 1 });
connectionSchema.index({ status: 1, lastActivity: 1 });

// Méthode pour calculer la durée de la session
connectionSchema.methods.calculateSessionDuration = function() {
  if (this.status !== 'DISCONNECTED' || !this.disconnectedAt) {
    const now = new Date();
    return Math.floor((now.getTime() - this.connectedAt.getTime()) / 1000);
  }
  
  return Math.floor((this.disconnectedAt.getTime() - this.connectedAt.getTime()) / 1000);
};

// Middleware pre-save pour mettre à jour la durée de la session
connectionSchema.pre('save', function(next) {
  if (this.status === 'DISCONNECTED' && this.disconnectedAt) {
    this.sessionDuration = Math.floor((this.disconnectedAt.getTime() - this.connectedAt.getTime()) / 1000);
  }
  next();
});

const Connection = mongoose.model('Connection', connectionSchema);

module.exports = Connection;

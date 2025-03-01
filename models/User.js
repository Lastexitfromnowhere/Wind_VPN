const mongoose = require('mongoose');

const rewardClaimSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'success'
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  lastRewardClaim: {
    type: Date,
    default: null
  },
  totalRewardsClaimed: {
    type: Number,
    default: 0
  },
  rewardClaims: [rewardClaimSchema],
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  stats: {
    totalHostTime: {
      type: Number, // en secondes
      default: 0
    },
    totalClientTime: {
      type: Number, // en secondes
      default: 0
    },
    totalBandwidthProvided: {
      type: Number, // en MB
      default: 0
    },
    totalBandwidthUsed: {
      type: Number, // en MB
      default: 0
    }
  }
}, { timestamps: true });

// Ajouter des index pour améliorer les performances
userSchema.index({ walletAddress: 1 });
userSchema.index({ 'lastRewardClaim': 1 });

// Méthode pour vérifier si l'utilisateur peut réclamer des récompenses
userSchema.methods.canClaimRewards = function() {
  if (!this.lastRewardClaim) return true;
  
  const now = new Date();
  const lastClaim = new Date(this.lastRewardClaim);
  const oneDayInMs = 24 * 60 * 60 * 1000;
  
  return (now.getTime() - lastClaim.getTime()) >= oneDayInMs;
};

// Méthode pour obtenir le temps restant avant la prochaine réclamation
userSchema.methods.getTimeUntilNextClaim = function() {
  if (!this.lastRewardClaim) return 0;
  
  const now = new Date();
  const lastClaim = new Date(this.lastRewardClaim);
  const oneDayInMs = 24 * 60 * 60 * 1000;
  const timeSinceLastClaim = now.getTime() - lastClaim.getTime();
  
  if (timeSinceLastClaim >= oneDayInMs) return 0;
  
  return oneDayInMs - timeSinceLastClaim;
};

const User = mongoose.model('User', userSchema);

module.exports = User;

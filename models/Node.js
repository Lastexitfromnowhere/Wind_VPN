const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  nodeType: {
    type: String,
    enum: ['HOST', 'USER'],
    default: 'USER'
  },
  active: {
    type: Boolean,
    default: false
  },
  ip: {
    type: String,
    default: null
  },
  bandwidth: {
    type: Number,
    default: 0
  },
  connectedUsers: {
    type: Number,
    default: 0
  },
  uptime: {
    type: Number,
    default: 0
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    default: 'INACTIVE'
  },
  performance: {
    bandwidth: {
      type: Number,
      default: 0
    },
    latency: {
      type: Number,
      default: 0
    },
    uptime: {
      type: Number,
      default: 0
    }
  },
  location: {
    country: String,
    region: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  stats: {
    bandwidthShared: {
      type: Number,
      default: 0
    },
    connectionUptime: {
      type: Number,
      default: 0
    },
    connectionQuality: {
      type: Number,
      default: 100
    },
    startTime: {
      type: Date,
      default: Date.now
    }
  },
  rewards: {
    dailyReward: {
      type: Number,
      default: 0
    },
    totalEarned: {
      type: Number,
      default: 0
    },
    rewardTier: {
      type: String,
      enum: ['STARTER', 'PRO', 'ELITE'],
      default: 'STARTER'
    },
    lastRewardCalculation: {
      type: Date,
      default: Date.now
    }
  },
  connectedToHost: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

nodeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Node', nodeSchema);

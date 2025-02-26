const express = require('express');
const router = express.Router();
const getNetworkStats = require('./networkStats');

router.get('/network-stats', getNetworkStats);

module.exports = router;
const express = require('express');
const router = express.Router();
const getNetworkStats = require('./networkStats');

router.use('/network-stats', getNetworkStats);

module.exports = router;
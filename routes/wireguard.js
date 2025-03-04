const express = require('express');
const router = express.Router();
const wireguardApi = require('../api/wireguard');

router.use('/wireguard', wireguardApi);

module.exports = router;

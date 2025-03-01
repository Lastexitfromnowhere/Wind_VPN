
const express = require('express');
const router = express.Router();
const NodeStats = require('../utils/rewardsUtils').NodeStats;

router.post('/', async (req, res) => {
    const { walletAddress } = req.body;
    if (!walletAddress) {
        return res.status(400).json({ success: false, message: 'Wallet address is required' });
    }

    try {
        await NodeStats.deleteOne({ walletAddress });
        res.status(200).json({ success: true, message: 'Node disconnected' });
    } catch (error) {
        console.error('Error disconnecting node:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;

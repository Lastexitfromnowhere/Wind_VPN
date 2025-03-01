
const express = require('express');
const router = express.Router();
const { initNodeStats } = require('../utils/rewardsUtils');

router.post('/', async (req, res) => {
    const { walletAddress } = req.body;
    if (!walletAddress) {
        return res.status(400).json({ success: false, message: 'Wallet address is required' });
    }
    
    try {
        const node = await initNodeStats(walletAddress);
        res.status(200).json({ success: true, message: 'Node connected', node });
    } catch (error) {
        console.error('Error connecting node:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;

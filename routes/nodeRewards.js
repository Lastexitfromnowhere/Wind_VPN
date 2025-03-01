
const express = require('express');
const router = express.Router();
const { calculateVPNRewards } = require('../utils/rewardsUtils');

router.get('/:walletAddress', async (req, res) => {
    const { walletAddress } = req.params;
    if (!walletAddress) {
        return res.status(400).json({ success: false, message: 'Wallet address is required' });
    }

    try {
        const rewards = await calculateVPNRewards(walletAddress);
        res.status(200).json({ success: true, walletAddress, rewards });
    } catch (error) {
        console.error('Error fetching rewards:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { getTagSuggestions } = require('../utils/tagManager');

router.get('/suggestions', async (req, res) => {
    try {
        const suggestions = await getTagSuggestions();
        res.json({ success: true, data: suggestions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
const express = require('express');
const { getListings, getListing } = require('../controllers/listingController');

const router = express.Router();

// Public routes — no auth required
router.get('/', getListings);
router.get('/:id', getListing);

module.exports = router;

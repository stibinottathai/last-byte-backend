const express = require('express');
const { getListings, getListing } = require('../controllers/listingController');
const { reportListing } = require('../controllers/adminController');

const router = express.Router();

// Public routes — no auth required
router.get('/', getListings);
router.post('/:id/report', reportListing);
router.get('/:id', getListing);

module.exports = router;

const express = require('express');
const controller = require('../controllers/publicConfigController');
const router = express.Router();
router.get('/', controller.get);
module.exports = router;

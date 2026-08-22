const express = require('express');
const authController = require('../controllers/authController');
const authenticate = require('../middlewares/authenticate');

const router = express.Router();

router.post('/register',
     authController.register);

router.post('/login',
     authController.login);

router.post('/verify-otp', 
    authController.verifyOtp);

router.post('/resend-otp', 
    authController.resendOtp);

router.get('/me', 
    authenticate, 
    authController.me);
    
router.post('/logout', 
    authenticate, 
    authController.logout);

module.exports = router;

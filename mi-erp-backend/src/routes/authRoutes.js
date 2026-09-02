const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

//esta ruta sera POST, porque el usuario enviara datos (email y password)
router.post('/login', authController.login);

module.exports = router;
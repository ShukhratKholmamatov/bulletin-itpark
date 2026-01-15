const express = require('express');
const passport = require('passport');
const router = express.Router();

// --------------------
// Google OAuth login
// --------------------
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// --------------------
// Google OAuth callback
// --------------------
router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: 'http://localhost:3000' }),
  (req, res) => {
    // Redirect back to frontend after successful login
    res.redirect('http://localhost:3000');
  }
);

// --------------------
// Logout
// --------------------
router.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('http://localhost:3000'); // back to frontend
  });
});

// --------------------
// Get current logged-in user
// --------------------
router.get('/current', (req, res) => {
  if (req.user) {
    // Only send needed fields to frontend
    res.json({
      id: req.user.id,
      name: req.user.displayName,
      email: req.user.emails[0].value
    });
  } else {
    res.status(401).json({ user: null });
  }
});

module.exports = router;

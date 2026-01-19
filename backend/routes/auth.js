const express = require('express');
const passport = require('passport');
const router = express.Router();

// --------------------
// Google OAuth login
// --------------------
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// --------------------
// Google OAuth callback
// --------------------
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: 'http://localhost:3000'
  }),
  (req, res) => {
    // User is now authenticated
    res.redirect('http://localhost:3000');
  }
);

// --------------------
// Logout
// --------------------
router.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('http://localhost:3000');
    });
  });
});

// --------------------
// Get current logged-in user
// --------------------
router.get('/current', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ user: null });
  }

  res.json({
    id: req.user.id,
    name: req.user.displayName,
    email: req.user.emails?.[0]?.value
  });
});

module.exports = router;

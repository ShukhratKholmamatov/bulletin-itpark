const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./db'); 

module.exports = function(passport) {
  
  // =====================================
  // 1. GOOGLE STRATEGY
  // =====================================
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
    proxy: true
  },
  (accessToken, refreshToken, profile, done) => {
    const googleId = profile.id;
    const name = profile.displayName;
    const email = profile.emails[0].value;
    const photo_url = profile.photos[0].value;

    // First check if a user with this email already exists (e.g., registered manually)
    db.get("SELECT id, name, email, department, role, photo_url, google_id, approval_status, employment_status FROM users WHERE email = ?", [email], (err, existing) => {
      if (err) return done(err);

      if (existing) {
        // User exists with this email — update their record with Google info
        db.run("UPDATE users SET google_id = ?, name = ?, photo_url = ? WHERE id = ?",
          [googleId, name, photo_url, existing.id], (err) => {
            if (err) return done(err);
            return done(null, { ...existing, name, photo_url, google_id: googleId });
          });
      } else {
        // No existing user — insert new Google user
        const sql = `
          INSERT INTO users (id, name, email, photo_url, google_id)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            photo_url = excluded.photo_url,
            email = excluded.email,
            google_id = excluded.google_id
        `;
        db.run(sql, [googleId, name, email, photo_url, googleId], (err) => {
          if (err) return done(err);
          return done(null, { id: googleId, name, email, photo_url, approval_status: 'pending' });
        });
      }
    });
  }));

  // =====================================
  // 2. LOCAL STRATEGY (Manual Login)
  // =====================================
  passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
    db.get("SELECT id, name, email, password, department, role, photo_url, google_id, approval_status, employment_status FROM users WHERE email = ?", [email], (err, user) => {
      if (err) return done(err);
      if (!user) return done(null, false, { message: 'Email not registered' });

      // If user registered via Google, they might not have a password
      if (!user.password) return done(null, false, { message: 'Please login with Google' });

      // Check Password
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err) return done(err);
        if (isMatch) {
          // Strip password before passing to session
          const { password: _, ...safeUser } = user;
          return done(null, safeUser);
        }
        else return done(null, false, { message: 'Incorrect password' });
      });
    });
  }));

  // =====================================
  // SERIALIZATION
  // =====================================
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser((id, done) => {
    db.get("SELECT id, name, email, department, role, photo_url, google_id, approval_status, employment_status, trial_start_date, trial_end_date, target_department, phone FROM users WHERE id = ?", [id], (err, row) => {
      done(err, row);
    });
  });
};
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
    callbackURL: "/auth/google/callback"
  },
  (accessToken, refreshToken, profile, done) => {
    const user = {
      id: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value,
      photo_url: profile.photos[0].value
    };

    // Insert or Update Google User
    const sql = `
      INSERT INTO users (id, name, email, photo_url) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        name = excluded.name, 
        photo_url = excluded.photo_url, 
        email = excluded.email
    `;

    db.run(sql, [user.id, user.name, user.email, user.photo_url], (err) => {
      if (err) return done(err);
      return done(null, user);
    });
  }));

  // =====================================
  // 2. LOCAL STRATEGY (Manual Login)
  // =====================================
  passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
      if (err) return done(err);
      if (!user) return done(null, false, { message: 'Email not registered' });
      
      // If user registered via Google, they might not have a password
      if (!user.password) return done(null, false, { message: 'Please login with Google' });

      // Check Password
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err) return done(err);
        if (isMatch) return done(null, user);
        else return done(null, false, { message: 'Incorrect password' });
      });
    });
  }));

  // =====================================
  // SERIALIZATION
  // =====================================
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser((id, done) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      done(err, row);
    });
  });
};
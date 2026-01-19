// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // Check if user exists in DB
    db.get('SELECT * FROM users WHERE google_id = ?', [profile.id], (err, row) => {
      if (err) return done(err);

      if (row) {
        return done(null, row); // user exists
      } else {
        // Insert new user
        db.run(
          'INSERT INTO users (google_id, name, email) VALUES (?, ?, ?)',
          [profile.id, profile.displayName, profile.emails[0].value],
          function(err) {
            if (err) return done(err);
            // Fetch newly inserted user
            db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err2, newUser) => {
              return done(null, newUser);
            });
          }
        );
      }
    });
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.id); // use DB id
});

passport.deserializeUser(function(id, done) {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    done(err, row || null);
  });
});

module.exports = passport;

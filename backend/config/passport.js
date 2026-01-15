const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// For simplicity, store users in memory (you can move to DB later)
const users = [];

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:5000/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // Save or find user
    let user = users.find(u => u.id === profile.id);
    if (!user) {
      user = {
        id: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value
      };
      users.push(user);
    }
    return done(null, user);
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  const user = users.find(u => u.id === id);
  done(null, user || null);
});

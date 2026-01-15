require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const db = require('./config/db');
require('./config/passport'); // Google passport config

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Auth routes
app.use('/auth', require('./routes/auth'));

// API: fetch news
app.get('/news', (req, res) => {
  const { country, topic, keyword, userId } = req.query;
  let sql = 'SELECT * FROM news WHERE 1=1';
  const params = [];

  if (country) { sql += ' AND country = ?'; params.push(country); }
  if (topic) { sql += ' AND topic = ?'; params.push(topic); }
  if (keyword) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (userId) {
      db.all('SELECT news_id FROM saved_news WHERE user_id = ?', [userId], (err, savedRows) => {
        if (err) return res.status(500).json({ error: err.message });
        const savedIds = savedRows.map(r => r.news_id);
        rows.forEach(r => r.saved = savedIds.includes(r.id));
        res.json(rows);
      });
    } else res.json(rows);
  });
});

// API: save news
app.post('/news/save', (req, res) => {
  const { userId, newsId } = req.body;
  db.run('INSERT OR IGNORE INTO saved_news (user_id, news_id) VALUES (?, ?)', [userId, newsId], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: unsave news
app.post('/news/unsave', (req, res) => {
  const { userId, newsId } = req.body;
  db.run('DELETE FROM saved_news WHERE user_id = ? AND news_id = ?', [userId, newsId], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: current logged-in user
app.get('/auth/current', (req, res) => {
  if (req.user) return res.json(req.user);
  res.status(401).json({ user: null });
});

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Redirect root to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('./config/passport');
const path = require('path');
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   🔧 HELPERS
========================= */
function normalizeText(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* =========================
   🔑 DEPARTMENT KEYWORD ROOTS
========================= */
const departmentKeywordRoots = {
  "Startap, investitsiyalar va mahalliy IT xizmatlarni rivojlantirish": [
    // startup
    "startup", "startap", "стартап",

    // investment
    "invest", "investment", "investitsiya", "инвест",

    // IT & tech
    "it", "software", "digital", "cloud", "ai", "saas",
    "texnolog", "raqamli", "dastur",

    // business & innovation
    "entrepreneur", "biznes", "tadbirkor",
    "innovation", "innovatsiya", "инновац"
  ],

  "Investitsiyalar bilan ishlash bo‘limi": [
    "invest", "investment", "investitsiya", "инвест",
    "capital", "kapital",
    "investor", "инвестор",
    "finance", "moliyav", "финанс"
  ]
};

/* =========================
   ⚙️ MIDDLEWARE
========================= */
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboardcat',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, '../frontend')));

/* =========================
   🔐 AUTH ROUTES
========================= */
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/auth/current', (req, res) => {
  if (req.user) return res.json(req.user);
  res.status(401).json({ user: null });
});

/* =========================
   📰 NEWS ROUTES
========================= */
app.get('/news', (req, res) => {
  const { topic, department, keyword, userId } = req.query;

  let sql = 'SELECT * FROM news WHERE 1=1';
  const params = [];

  if (topic) {
    sql += ' AND topic = ?';
    params.push(topic);
  }

  if (department) {
    sql += ' AND department = ?';
    params.push(department);
  }

  if (keyword) {
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    rows.forEach(row => {
      const fullText = normalizeText(`${row.title} ${row.description}`);
      const titleText = normalizeText(row.title);

      let relevance = 0;

      // Department-based relevance
      if (department && departmentKeywordRoots[department]) {
        departmentKeywordRoots[department].forEach(root => {
          if (fullText.includes(root)) relevance += 2;
          if (titleText.includes(root)) relevance += 3; // title boost
        });
      }

      // User keyword boost
      if (keyword) {
        keyword
          .split(';')
          .map(k => k.trim().toLowerCase())
          .forEach(k => {
            if (fullText.includes(k)) relevance += 3;
          });
      }

      // Base relevance so news never disappears
      if (relevance === 0) relevance = 0.5;

      row.relevance = relevance;
    });

    // Sort by relevance
    rows.sort((a, b) => b.relevance - a.relevance);

    // Mark saved news if userId provided
    if (userId) {
      db.all(
        'SELECT news_id FROM saved_news WHERE user_id = ?',
        [userId],
        (err, savedRows) => {
          if (err) return res.status(500).json({ error: err.message });

          const savedIds = savedRows.map(r => r.news_id);
          rows.forEach(r => r.saved = savedIds.includes(r.id));

          res.json(rows);
        }
      );
    } else {
      res.json(rows);
    }
  });
});

/* =========================
   ⭐ SAVE / UNSAVE NEWS
========================= */
app.post('/news/save', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Login required' });

  db.run(
    'INSERT OR IGNORE INTO saved_news (user_id, news_id) VALUES (?, ?)',
    [req.user.id, req.body.newsId],
    err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.post('/news/unsave', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Login required' });

  db.run(
    'DELETE FROM saved_news WHERE user_id = ? AND news_id = ?',
    [req.user.id, req.body.newsId],
    err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

/* =========================
   🛠 ADMIN
========================= */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

app.get('/admin/data', (req, res) => {
  const sql = `
    SELECT u.id AS user_id, u.name, u.email, n.id AS news_id, n.title
    FROM users u
    LEFT JOIN saved_news s ON u.id = s.user_id
    LEFT JOIN news n ON s.news_id = n.id
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/* =========================
  FRONTEND
========================= */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

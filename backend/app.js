require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('./config/passport');
const path = require('path');
const fetch = require('node-fetch'); // npm install node-fetch@2
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
   🔑 DEPARTMENT KEYWORDS
========================= */
const departmentKeywordRoots = {
  "Startap, investitsiyalar va mahalliy IT xizmatlarni rivojlantirish": [
    "startup", "startap", "стартап",
    "invest", "investment", "investitsiya", "инвест",
    "it", "software", "digital", "cloud", "ai", "saas",
    "texnolog", "raqamli", "dastur",
    "entrepreneur", "biznes", "tadbirkor",
    "innovation", "innovatsiya", "инновац",
    "Miami", "Indiana"
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
   🔐 AUTH
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
   📰 NEWS ROUTE (MULTI-API + IMAGES + RELEVANCE)
========================= */
app.get('/news', async (req, res) => {
  const { topic = '', department = '', keyword = '', userId } = req.query;

  try {
    const gnewsKey = process.env.GNEWS_API_KEY;
    const currentsKey = process.env.CURRENTS_API_KEY;

    if (!gnewsKey && !currentsKey) {
      return res.status(500).json({ error: 'No API keys set in .env' });
    }

    const itKeywords = [
      'ai', 'artificial intelligence', 'iot', 'internet of things', 'cloud', 'software',
      'saas', 'startup', 'venture', 'tech', 'technology', 'digital', 'innovation',
      'usa', 'silicon valley', 'data', 'blockchain', 'cybersecurity', 'machine learning',
      'ml', 'deep learning', 'robotics', 'automation'
    ];

    const departmentKeywordRoots = {
      "Startap, investitsiyalar va mahalliy IT xizmatlarni rivojlantirish": [
        "startup", "startap", "стартап",
        "invest", "investment", "investitsiya", "инвест",
        "it", "software", "digital", "cloud", "ai", "saas",
        "texnolog", "raqamli", "dastur",
        "entrepreneur", "biznes", "tadbirkor",
        "innovation", "innovatsiya", "инновац",
        "Miami", "Indiana"
      ],
      "Investitsiyalar bilan ishlash bo‘limi": [
        "invest", "investment", "investitsiya", "инвест",
        "capital", "kapital",
        "investor", "инвестор",
        "finance", "moliyav", "финанс"
      ]
    };

    let allArticles = [];

    // ====== GNEWS ======
    if (gnewsKey) {
      const gQuery = encodeURIComponent(topic || 'IT');
      const gUrl = `https://gnews.io/api/v4/search?q=${gQuery}&token=${gnewsKey}&lang=en&max=50`;
      const gRes = await fetch(gUrl);
      const gData = await gRes.json();

      if (gData.articles) {
        allArticles.push(...gData.articles.map(a => ({
          id: a.url,
          title: a.title,
          description: a.description,
          url: a.url,
          image: a.image || null,
          source: a.source.name,
          topic: topic || 'General',
          department: department || 'External',
          content_type: 'article'
        })));
      }
    }

    // ====== CURRENTS ======
    if (currentsKey) {
      const cQuery = encodeURIComponent(topic || 'IT');
      const cUrl = `https://api.currentsapi.services/v1/search?keywords=${cQuery}&apiKey=${currentsKey}&language=en`;
      const cRes = await fetch(cUrl);
      const cData = await cRes.json();

      if (cData.news) {
        allArticles.push(...cData.news.map(a => ({
          id: a.url,
          title: a.title,
          description: a.description,
          url: a.url,
          image: a.image || null,
          source: a.author || 'Currents API',
          topic: topic || 'General',
          department: department || 'External',
          content_type: 'article'
        })));
      }
    }

    // ====== SCORING RELEVANCE ======
    const newsWithRelevance = allArticles.map(a => {
      const fullText = normalizeText(`${a.title} ${a.description}`);
      const titleText = normalizeText(a.title);

      let relevance = 0;

      // Department keywords
      if (department && departmentKeywordRoots[department]) {
        departmentKeywordRoots[department].forEach(root => {
          if (fullText.includes(root)) relevance += 2;
          if (titleText.includes(root)) relevance += 3;
        });
      }

      // General IT keywords
      itKeywords.forEach(k => {
        if (fullText.includes(k)) relevance += 2;
        if (titleText.includes(k)) relevance += 3;
      });

      // User keyword filter
      if (keyword) {
        keyword.split(';').map(k => k.trim().toLowerCase()).forEach(k => {
          if (fullText.includes(k)) relevance += 3;
        });
      }

      return { ...a, relevance };
    })
    .filter(n => n.relevance > 0) // ✅ remove irrelevant articles
    .sort((a, b) => b.relevance - a.relevance); // ✅ sort by highest relevance

    // ====== SAVED NEWS ======
    if (userId) {
      db.all('SELECT news_id FROM saved_news WHERE user_id = ?', [userId], (err, savedRows) => {
        if (err) return res.status(500).json({ error: err.message });
        const savedIds = savedRows.map(r => r.news_id);
        newsWithRelevance.forEach(n => n.saved = savedIds.includes(n.id));
        res.json(newsWithRelevance);
      });
    } else {
      res.json(newsWithRelevance);
    }

  } catch (err) {
    console.error('Failed to fetch news from APIs:', err);
    res.status(500).json({ error: 'Failed to fetch news from APIs', details: err.message });
  }
});



/* =========================
   🛠 ADMIN
========================= */
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));

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
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));

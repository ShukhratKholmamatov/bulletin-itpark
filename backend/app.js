require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('./config/passport');
const path = require('path');
const fetch = require('node-fetch'); // npm install node-fetch@2
const db = require('./config/db');
const PDFDocument = require('pdfkit');


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
   📄 GENERATE PDF REPORT
========================= */
app.post('/news/report', async (req, res) => {
  try {
    const { news, period, events } = req.body;
    if (!news || news.length === 0)
      return res.status(400).json({ error: 'No news selected' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Weekly-IT-Bulletin.pdf"',
        'Content-Length': pdfData.length,
      });
      res.send(pdfData);
    });

    // ===== LOAD FONTS =====
    doc.registerFont('Cambria', path.join(__dirname, 'fonts/CAMBRIAZ.TTF'));
    doc.registerFont('Cambria-Bold', path.join(__dirname, 'fonts/CAMBRIAB.TTF'));
    doc.registerFont('Cambria-Italic', path.join(__dirname, 'fonts/CAMBRIAI.TTF'));

    // ===== COVER PAGE =====
    doc.font('Cambria-Bold').fontSize(18).text('Weekly Bulletin of IT News', { align: 'center' });
    doc.font('Cambria-Bold').fontSize(16).text('and Articles', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Cambria').fontSize(12).text(`(${period?.from || 'N/A'} – ${period?.to || 'N/A'})`, { align: 'center' });
    doc.moveDown(0.3);
    doc.text('Department of Strategy and Analysis', { align: 'center' });
    doc.text('Tashkent, January 2026', { align: 'center' });
    doc.addPage();

    // ===== TABLE OF CONTENTS =====
    doc.font('Cambria-Bold').fontSize(14).text('Table of Contents', { underline: true });
    doc.moveDown(0.5);
    news.forEach((item, idx) => {
      doc.font('Cambria').fontSize(13).text(`${idx + 1}. ${item.title}`);
    });
    doc.addPage();

    // ===== NEWS SECTIONS =====
    for (let i = 0; i < news.length; i++) {
      const item = news[i];
      doc.font('Cambria-Bold').fontSize(14).fillColor('black').text(`${i + 1}. ${item.title}`);
      doc.moveDown(0.2);
      doc.font('Cambria').fontSize(10).fillColor('black')
         .text(`Source: ${item.source || 'Unknown'} | Topic: ${item.topic || 'General'} | Department: ${item.department || 'General'}`);
      doc.moveDown(0.3);

      const yStart = doc.y;

      // ===== IMAGE LEFT, TEXT RIGHT =====
      const textX = 180;
      if (item.image) {
        try {
          const imgRes = await fetch(item.image);
          if (imgRes.ok) {
            const imgBuffer = await imgRes.buffer();
            doc.image(imgBuffer, doc.x, doc.y, { width: 120, height: 80 });
          }
        } catch (err) {
          console.log('Image load failed:', err);
        }
      }

      // ===== TEXT STYLING =====
      function styleText(text) {
        const words = text.split(/(\s+)/);
        words.forEach(word => {
          if (/^\d+/.test(word)) doc.fillColor('red'); // numbers
          else if (/^[A-Z][a-zA-Z]+$/.test(word)) doc.fillColor('blue'); // names/companies/places
          else doc.fillColor('black');

          doc.font('Cambria').fontSize(13).text(word, { continued: true });
        });
        doc.text(''); // end line
      }

      doc.text('', textX, yStart, { width: 370, align: 'justify' });
      styleText(item.description || 'No description available.');

      // ===== FULL ARTICLE LINK =====
      if (item.url) {
        doc.moveDown(0.5);
        doc.font('Cambria-Italic').fontSize(12).fillColor('black')
           .text(`(Read full article at --> ${item.url})`);
      }

      doc.addPage();
    }

    // ===== EVENTS TABLE =====
    if (events && events.length) {
      doc.font('Cambria-Bold').fontSize(14).fillColor('black').text('Calendar of Upcoming Events', { underline: true });
      doc.moveDown(0.5);

      events.forEach((ev, idx) => {
        doc.font('Cambria-Bold').fontSize(12).fillColor('black')
           .text(`${idx + 1}. ${ev.name} | ${ev.date} | ${ev.location}`);
        doc.font('Cambria').fontSize(10).fillColor('black').text(`${ev.description}`);
        doc.fillColor('blue').text(ev.url, { link: ev.url });
        doc.moveDown(0.5);
      });
    }

    doc.end();
  } catch (err) {
    console.error('PDF generation failed:', err);
    res.status(500).json({ error: 'Failed to generate PDF report' });
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

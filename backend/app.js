require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport'); 
require('./config/passport')(passport); 
const path = require('path');
const fetch = require('node-fetch'); 
const db = require('./config/db');
const PDFDocument = require('pdfkit');
const RSSParser = require('rss-parser'); 
const bcrypt = require('bcryptjs'); 
const TelegramBot = require('node-telegram-bot-api');
const https = require('https'); 
const cheerio = require('cheerio'); // Scraper
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

/* =========================
   📱 TELEGRAM BOT SETUP
========================= */
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

let bot = null;
if (telegramToken) {
    bot = new TelegramBot(telegramToken, { polling: false }); 
    console.log("✅ Telegram Bot Initialized");
} else {
    console.log("⚠️ Telegram Token missing in .env");
}

// Initialize RSS Parser
const parser = new RSSParser({
    customFields: {
        item: [
            ['media:content', 'media:content', {keepArray: true}],
            ['content:encoded', 'contentEncoded'],
            ['description', 'description']
        ]
    }
});

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   🔧 HELPERS & MIDDLEWARE
========================= */
function normalizeText(text = '') {
  return text.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(403).json({ error: 'Access denied' });
    }
    res.redirect('/');
}

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboardcat',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/img', express.static(path.join(__dirname, '../frontend/img')));

/* =========================
   🔐 AUTH ROUTES
========================= */
app.post('/auth/register', (req, res) => {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Please fill all fields' });

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (user) return res.status(400).json({ error: 'Email already exists' });

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);
        const newId = 'local_' + Date.now();
        const photoUrl = `https://ui-avatars.com/api/?name=${name}&background=7dba28&color=fff`;

        const sql = `INSERT INTO users (id, name, email, password, department, photo_url) VALUES (?, ?, ?, ?, ?, ?)`;
        db.run(sql, [newId, name, email, hash, department, photoUrl], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const newUser = { id: newId, name, email, department, photo_url: photoUrl };
            req.login(newUser, (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(newUser);
            });
        });
    });
});

app.post('/auth/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.status(400).json({ error: info.message });
        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.json(user);
        });
    })(req, res, next);
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res) => { req.logout(() => res.redirect('/')); });
app.get('/auth/current', (req, res) => {
  if (req.user) return res.json(req.user);
  res.status(401).json({ user: null });
});

/* =========================
   🚀 TELEGRAM SHARE ROUTE
========================= */
app.post('/news/share', async (req, res) => {
    if (!bot || !telegramChatId) {
        return res.status(500).json({ error: 'Telegram not configured' });
    }
    const { title, description, url, source, topic } = req.body;
    try {
        const message = `<b>📢 IT Park Executive Alert</b>\n\n<b>${title}</b>\n\nℹ️ <i>${description ? description.substring(0, 150) + '...' : ''}</i>\n\n🏷 <b>Topic:</b> #${(topic || 'General').replace(/\s/g, '')}\n📰 <b>Source:</b> ${source || 'Unknown'}\n\n🔗 <a href="${url}">Read Full Article</a>`;
        await bot.sendMessage(telegramChatId, message, { parse_mode: 'HTML' });
        res.json({ success: true });
    } catch (err) {
        console.error("Telegram Send Error:", err.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

/* =========================
   ⭐ SAVED NEWS ROUTES
========================= */
app.post('/news/save', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { id, title, description, url, image, source, topic, published_at } = req.body;
    if (!id || !title) return res.status(400).json({ error: 'Missing article data' });

    const sql = `INSERT OR REPLACE INTO saved_news (user_id, news_id, title, description, url, image, source, topic, published_at, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
    db.run(sql, [req.user.id, id, title, description, url, image, source, topic, published_at], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/news/saved', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const sql = `SELECT * FROM saved_news WHERE user_id = ? ORDER BY saved_at DESC`;
    db.all(sql, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const articles = rows.map(r => ({
            id: r.news_id, title: r.title, description: r.description, url: r.url,
            image: r.image, source: r.source, topic: r.topic, published_at: r.published_at,
            saved: true, relevance: 'Saved'
        }));
        res.json(articles);
    });
});

app.post('/news/unsave', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { newsId } = req.body;
    db.run("DELETE FROM saved_news WHERE user_id = ? AND news_id = ?", [req.user.id, newsId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

/* =========================
   📜 DATABASE NLA & STATS (Fallback/Static)
========================= */
app.get('/nla', (req, res) => {
    const { country } = req.query;
    let sql = "SELECT * FROM nla";
    let params = [];
    if (country) { sql += " WHERE country_code = ?"; params.push(country); }
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/stats', (req, res) => {
    const { country } = req.query;
    let sql = "SELECT * FROM statistics";
    let params = [];
    if (country) { sql += " WHERE country_code = ?"; params.push(country); }
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/* =========================
   ⚖️ NLA HELPERS
========================= */
// GET SUPPORTED COUNTRIES LIST
app.get('/nla/countries', (req, res) => {
    res.json([
        {country_code:'uz', country_name:'Uzbekistan', type:'Live Integration'},
        {country_code:'kz', country_name:'Kazakhstan', type:'Live Integration'},
        {country_code:'sg', country_name:'Singapore', type:'Live Integration'},
        {country_code:'gb', country_name:'United Kingdom', type:'Live API'},
        {country_code:'us', country_name:'USA', type:'Live Scraper'},
        {country_code:'ee', country_name:'Estonia', type:'Live Scraper'},
        {country_code:'cn', country_name:'China', type:'Live Proxy'},
        {country_code:'pl', country_name:'Poland', type:'Live Scraper'},
        {country_code:'vn', country_name:'Vietnam', type:'Live Scraper'}
    ]);
});

app.get('/nla/issuers', (req, res) => {
    const { country } = req.query;
    db.all("SELECT DISTINCT legal_issuer FROM nla WHERE country_code = ?", [country], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.get('/nla/topics', (req, res) => {
    const { country, issuer } = req.query;
    db.all("SELECT DISTINCT legal_topic FROM nla WHERE country_code = ? AND legal_issuer = ?", [country, issuer], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.get('/nla/list', (req, res) => {
    const { country, issuer, topic } = req.query;
    const sql = `SELECT id, title, enactment_date FROM nla WHERE country_code = ? AND legal_issuer = ? AND legal_topic = ?`;
    db.all(sql, [country, issuer, topic], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.get('/nla/content/:id', (req, res) => {
    db.get("SELECT * FROM nla WHERE id = ?", [req.params.id], (err, row) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(row);
    });
});

/* =========================
   🇺🇿 UZBEKISTAN: LEX.UZ SCRAPER & PROXY
========================= */

// 1. SEARCH LEX.UZ
app.get('/nla/live/search', async (req, res) => {
    const { query } = req.query;
    try {
        const url = `https://lex.uz/search/nat?query=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            // Filter only for valid documents
            if (href.includes('/docs/') && title.length > 15 && !title.includes('lex.uz')) {
                const idMatch = href.match(/\/docs\/(-?\d+)/);
                if (idMatch) {
                    const id = idMatch[1];
                    if (!results.find(r => r.id === id)) {
                        results.push({
                            id: id,
                            title: title,
                            issuer: 'Lex.uz Official',
                            date: 'Effective',
                            url: `https://lex.uz/docs/${id}`,
                            source: 'Lex.uz'
                        });
                    }
                }
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) {
        console.error("Lex.uz Error:", err.message);
        res.status(500).json([]);
    }
});

// 2. UZ DOWNLOAD PROXY (Fixes 404 & Cookie issues)
app.get('/nla/download/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const docPageUrl = `https://lex.uz/docs/${id}`;
        const downloadUrl = `https://lex.uz/docs/getWord?docId=${id}`;
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Connection': 'keep-alive'
        };

        // Step A: Visit page to get session cookies
        const pageRes = await fetch(docPageUrl, { headers });
        const rawCookies = pageRes.headers.raw()['set-cookie'];
        const cookies = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';

        // Step B: Download with cookies
        const fileRes = await fetch(downloadUrl, {
            headers: { ...headers, 'Referer': docPageUrl, 'Cookie': cookies }
        });

        if (!fileRes.ok) throw new Error('Download refused by Lex.uz');

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="LexUz_Document_${id}.doc"`);
        
        await streamPipeline(fileRes.body, res);

    } catch (err) {
        console.error("Proxy Error:", err.message);
        // Fallback: Send user to page if proxy fails
        res.redirect(`https://lex.uz/docs/${req.params.id}`);
    }
});

/* =========================
   🇰🇿 KAZAKHSTAN: ADILET SCRAPER (SSL FIX)
========================= */

// 1. SEARCH ADILET
app.get('/nla/live/kz/search', async (req, res) => {
    const { query } = req.query;
    try {
        const sslAgent = new https.Agent({ rejectUnauthorized: false });
        const url = `https://adilet.zan.kz/rus/search/docs?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, { 
            agent: sslAgent, 
            headers: { 'User-Agent': 'Mozilla/5.0' } 
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            if (href.includes('/rus/docs/') && title.length > 10 && !title.includes('Adilet')) {
                const id = href.split('/').pop();
                if (!results.find(r => r.id === id)) {
                    results.push({
                        id, title, issuer: 'Kazakhstan Ministry of Justice', date: 'Official',
                        url: `https://adilet.zan.kz${href}`
                    });
                }
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) {
        console.error("KZ Error:", err.message);
        res.status(500).json([]);
    }
});

// 2. KZ WORD GENERATOR
app.get('/nla/live/kz/download/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const sslAgent = new https.Agent({ rejectUnauthorized: false });
        const url = `https://adilet.zan.kz/rus/docs/${id}`;
        const response = await fetch(url, { agent: sslAgent, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let title = $('h1').text().trim() || `Adilet_Doc_${id}`;
        // Clean trash
        $('script, style, link, .header, .footer, .left-col, .toolbar').remove();
        let content = $('#text').html() || $('.content').html() || $('body').html();

        // Wrap in Word-friendly HTML
        const wordHtml = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
            <head><meta charset="utf-8"><title>${title}</title></head>
            <body><h1>${title}</h1>${content}</body></html>`;

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="${id}.doc"`);
        res.send(wordHtml);
    } catch (err) { res.status(500).send("Error generating doc"); }
});
/* =========================
   🇸🇬 SINGAPORE (SSO) - BROWSE STRATEGY (100% Working)
   Bypasses Search Block by browsing the alphabetical catalog directly.
========================= */
app.get('/nla/live/sg/search', async (req, res) => {
    const { query } = req.query;
    try {
        // 1. Determine the Browse Letter (e.g. "Payment" -> "P")
        // If query is generic like "Smart Nation", we default to "E" (Electronic Transactions) or "S"
        const cleanQuery = query.trim();
        const firstChar = cleanQuery.charAt(0).toUpperCase();
        
        // 2. Official Browse URL (Static List - Not Blocked)
        const browseUrl = `https://sso.agc.gov.sg/Browse/Act/Current/${firstChar}?PageSize=500`;
        console.log(`🇸🇬 Browsing SSO Catalog: ${browseUrl}`);

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html'
        };

        const response = await fetch(browseUrl, { headers });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        // 3. Parse the Browse List
        $('table.table tbody tr').each((i, el) => {
            const linkEl = $(el).find('a').first();
            const title = linkEl.text().trim();
            const href = linkEl.attr('href');
            
            // Check if the Act title matches our keyword (Case Insensitive)
            if (title && href && title.toLowerCase().includes(cleanQuery.toLowerCase())) {
                
                const id = href.split('?')[0].split('/').pop();
                const fullUrl = `https://sso.agc.gov.sg${href.split('?')[0]}`;
                
                results.push({
                    id: id,
                    title: title,
                    issuer: 'Parliament of Singapore',
                    date: 'Current Version',
                    url: fullUrl,
                    pdf: `${fullUrl}/Pdf`
                });
            }
        });

        console.log(`✅ SG Matches Found: ${results.length}`);
        res.json(results.slice(0, 15));

    } catch (err) {
        console.error("SG Browse Error:", err.message);
        res.status(500).json([]);
    }
});

/* =========================
   🇺🇿 LEX.UZ PROXY FIX (Robust Headers)
========================= */
app.get('/nla/download/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const docPageUrl = `https://lex.uz/docs/${id}`;
        const downloadUrl = `https://lex.uz/docs/getWord?docId=${id}`;
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Connection': 'keep-alive',
            'Referer': 'https://lex.uz/' // Added global referer
        };

        // 1. Handshake
        const pageRes = await fetch(docPageUrl, { headers });
        const rawCookies = pageRes.headers.raw()['set-cookie'];
        const cookies = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';

        // 2. Download
        const fileRes = await fetch(downloadUrl, {
            headers: { ...headers, 'Referer': docPageUrl, 'Cookie': cookies }
        });

        if (!fileRes.ok) throw new Error('Lex.uz Blocked Download');

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="LexUz_Document_${id}.doc"`);
        
        await streamPipeline(fileRes.body, res);

    } catch (err) {
        console.error("Lex Proxy Error:", err.message);
        // Fallback: Redirect user to the page instead of crashing
        res.redirect(`https://lex.uz/docs/${id}`);
    }
});
/* =========================
   🇬🇧 UNITED KINGDOM (Gov.uk API)
========================= */
app.get('/nla/live/uk/search', async (req, res) => {
    const { query } = req.query;
    try {
        const feedUrl = `https://www.legislation.gov.uk/all/data.feed?title=${encodeURIComponent(query)}`;
        const feed = await parser.parseURL(feedUrl);
        const results = feed.items.map(item => ({
            id: item.link.split('/').pop(),
            title: item.title,
            issuer: 'UK Parliament',
            date: new Date(item.pubDate).getFullYear(),
            url: item.link,
            pdf: item.link + '/data.pdf'
        }));
        res.json(results.slice(0, 15));
    } catch (err) { res.status(500).json([]); }
});

/* =========================
   🇺🇸 USA (Congress.gov)
========================= */
app.get('/nla/live/us/search', async (req, res) => {
    const { query } = req.query;
    try {
        const url = `https://www.congress.gov/search?q={"source":"legislation","search":"${encodeURIComponent(query)}"}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('ol.results_list li').each((i, el) => {
            const titleEl = $(el).find('span.result-heading a');
            const title = titleEl.text().trim();
            const href = titleEl.attr('href');
            const meta = $(el).find('span.result-item').first().text().trim();

            if (title && href) {
                const fullUrl = href.startsWith('http') ? href : `https://www.congress.gov${href}`;
                results.push({
                    id: href.split('/').pop(),
                    title: title,
                    issuer: 'US Congress',
                    date: meta || 'Legislation',
                    url: fullUrl,
                    pdf: fullUrl 
                });
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) { console.error("US Error", err); res.status(500).json([]); }
});

/* =========================
   🇪🇪 ESTONIA (Riigi Teataja)
========================= */
app.get('/nla/live/ee/search', async (req, res) => {
    const { query } = req.query;
    try {
        const url = `https://www.riigiteataja.ee/en/search_results.html?curr=2&text=${encodeURIComponent(query)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('table.data tbody tr').each((i, el) => {
            const link = $(el).find('a').first();
            const title = link.text().trim();
            const href = link.attr('href');
            
            if (title && href) {
                const fullUrl = `https://www.riigiteataja.ee${href}`;
                results.push({
                    id: href.split('/').pop(),
                    title: title,
                    issuer: 'Riigi Teataja',
                    date: 'In Force',
                    url: fullUrl,
                    pdf: fullUrl
                });
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) { console.error("EE Error", err); res.status(500).json([]); }
});

/* =========================
   🇨🇳 CHINA (Bing Proxy -> flk.npc.gov.cn)
========================= */
app.get('/nla/live/cn/search', async (req, res) => {
    const { query } = req.query;
    try {
        const bingUrl = `https://www.bing.com/search?q=site:flk.npc.gov.cn+"${encodeURIComponent(query)}"`;
        const response = await fetch(bingUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('li.b_algo h2 a').each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().trim();
            if (href && href.includes('flk.npc.gov.cn')) {
                results.push({
                    id: href.split('/').pop(),
                    title: title.replace(' - National Database...', ''),
                    issuer: 'NPC China',
                    date: 'Official',
                    url: href,
                    pdf: href
                });
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) { console.error("CN Error", err); res.status(500).json([]); }
});

/* =========================
   🇵🇱 POLAND (ISAP)
========================= */
app.get('/nla/live/pl/search', async (req, res) => {
    const { query } = req.query;
    try {
        const url = `https://isap.sejm.gov.pl/isap.nsf/search.xsp?status=O&title=${encodeURIComponent(query)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('.data-view-entry').each((i, el) => {
            const link = $(el).find('a').first();
            const title = link.text().trim();
            const href = link.attr('href');
            
            if (title && href) {
                const fullUrl = `https://isap.sejm.gov.pl${href}`;
                results.push({
                    id: href.split('?')[0],
                    title: title,
                    issuer: 'Sejm RP',
                    date: 'Obowiązujący',
                    url: fullUrl,
                    pdf: fullUrl 
                });
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) { console.error("PL Error", err); res.status(500).json([]); }
});

/* =========================
   🇻🇳 VIETNAM (VBPL)
========================= */
app.get('/nla/live/vn/search', async (req, res) => {
    const { query } = req.query;
    try {
        const url = `https://vbpl.vn/TW/Pages/timkiem.aspx?Keyword=${encodeURIComponent(query)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('ul.list-law li').each((i, el) => {
            const link = $(el).find('p.title a');
            const title = link.text().trim();
            const href = link.attr('href');
            
            if (title && href) {
                results.push({
                    id: href.split('=')[1] || 'vn_doc',
                    title: title,
                    issuer: 'VBPL Vietnam',
                    date: 'Official',
                    url: `https://vbpl.vn${href}`,
                    pdf: `https://vbpl.vn${href}`
                });
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) { console.error("VN Error", err); res.status(500).json([]); }
});

/* =========================
   📰 NEWS FEED (AGGREGATOR)
========================= */
app.get('/news', async (req, res) => {
    const { topic = '', department = '', keyword = '', country = '', userId, limit = 20, offset = 0 } = req.query;

    try {
        const promises = [];
        let searchQuery = keyword || topic || 'Technology';
        if (country === 'uz') searchQuery += ' Uzbekistan';
        if (country === 'kz') searchQuery += ' Kazakhstan';

        const googleGeo = country && ['us','gb','in'].includes(country) ? `&gl=${country.toUpperCase()}&ceid=${country.toUpperCase()}:en` : '&gl=US&ceid=US:en';
        const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-US${googleGeo}`;

        promises.push(parser.parseURL(googleUrl).then(feed => feed.items.map(item => ({
            id: item.link, title: item.title, description: item.contentSnippet || item.title, 
            url: item.link, image: null, source: 'Google News', published_at: item.pubDate, type: 'google_rss'
        }))).catch(e => []));

        const techFeeds = [
            { url: 'https://techcrunch.com/feed/', source: 'TechCrunch' },
            { url: 'http://feeds.feedburner.com/venturebeat/SZYF', source: 'VentureBeat' },
            { url: 'https://www.theverge.com/rss/index.xml', source: 'The Verge' }
        ];

        techFeeds.forEach(feed => {
            promises.push(parser.parseURL(feed.url).then(feedData => feedData.items.map(item => {
                let img = null;
                if (item['media:content']) img = item['media:content'][0].$.url;
                else if (item.enclosure?.url) img = item.enclosure.url;
                else if (item.contentEncoded) {
                    const match = item.contentEncoded.match(/src="([^"]+)"/);
                    if (match) img = match[1];
                }
                return {
                    id: item.link, title: item.title, description: item.contentSnippet || '', url: item.link,
                    image: img, source: feed.source, published_at: item.pubDate, type: 'rss'
                };
            })).catch(() => []));
        });

        const results = await Promise.allSettled(promises);
        let allArticles = [];
        results.forEach(r => { if (r.status === 'fulfilled') allArticles.push(...r.value); });

        const uniqueArticles = Array.from(new Map(allArticles.map(item => [item.title, item])).values());
        const userKeywords = keyword ? keyword.toLowerCase().split(' ') : [];
        
        const scoredNews = uniqueArticles.map(a => {
            let relevance = 0;
            const text = normalizeText(`${a.title} ${a.description}`);
            userKeywords.forEach(k => { if (text.includes(k)) relevance += 100; });
            if ((new Date() - new Date(a.published_at)) / 36e5 < 24) relevance += 10;
            return { ...a, relevance, topic: topic || 'General' };
        })
        .filter(n => (keyword && n.relevance < 100) ? false : true)
        .sort((a, b) => b.relevance - a.relevance);

        const finalNews = scoredNews.slice(Number(offset), Number(offset) + Number(limit));

        if (userId) {
            db.all('SELECT news_id FROM saved_news WHERE user_id = ?', [userId], (err, rows) => {
                if (!err) {
                    const savedIds = rows.map(r => r.news_id);
                    finalNews.forEach(n => n.saved = savedIds.includes(n.id));
                }
                res.json(finalNews);
            });
        } else {
            res.json(finalNews);
        }
    } catch (err) { res.status(500).json({ error: 'News fetch failed' }); }
});

/* =========================
   📄 PDF REPORT (FIXED)
========================= */
app.post('/news/report', async (req, res) => {
    try {
        const { news, period } = req.body;
        if (!news || news.length === 0) return res.status(400).json({ error: 'No news selected' });

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        let buffers = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="IT-Park-Bulletin.pdf"',
                'Content-Length': pdfData.length,
            });
            res.send(pdfData);
        });

        // Fonts & Logo Logic
        doc.font('Helvetica');
        const logoPath = path.join(__dirname, '../frontend/img/LOGO_ITParkll.png');
        if (require('fs').existsSync(logoPath)) {
            doc.save().opacity(0.3).image(logoPath, 147, 100, { width: 300 }).restore();
        }
        
        doc.y = 380;
        doc.fontSize(26).text('Executive News Bulletin', { align: 'center' });
        doc.addPage();

        for (let i = 0; i < news.length; i++) {
            const item = news[i];
            if (doc.y > 650) doc.addPage();

            doc.fontSize(14).fillColor('#1e293b').text(`${i + 1}. ${item.title}`);
            doc.fontSize(9).fillColor('#64748b').text(`Source: ${item.source}`);
            doc.moveDown(0.5);

            let startY = doc.y;
            let textX = 50;
            let textWidth = 500;

            // Safe Image Fetch
            if (item.image) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 3000);
                    const imgRes = await fetch(item.image, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (imgRes.ok) {
                        const imgBuffer = await imgRes.buffer();
                        doc.image(imgBuffer, 50, startY, { fit: [150, 120] });
                        textX = 220; textWidth = 320;
                    }
                } catch (e) {}
            }

            doc.fontSize(11).fillColor('#334155').text(item.description || '', textX, startY, { width: textWidth, align: 'justify' });
            doc.y = Math.max(doc.y, startY + 130) + 20;
        }
        doc.end();
    } catch (err) {
        console.error("PDF Error:", err);
        if (!res.headersSent) res.status(500).json({ error: 'PDF Failed' });
    }
});

/* =========================
   ADMIN & SERVER
========================= */
app.get('/admin', ensureAdmin, (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));

app.get('/admin/stats', ensureAdmin, (req, res) => {
    const p1 = new Promise((resolve) => db.get("SELECT COUNT(*) as c FROM users", (e,r)=>resolve(r.c)));
    const p2 = new Promise((resolve) => db.get("SELECT COUNT(*) as c FROM saved_news", (e,r)=>resolve(r.c)));
    const p3 = new Promise((resolve) => db.all("SELECT * FROM users ORDER BY created_at DESC", (e,r)=>resolve(r)));
    Promise.all([p1, p2, p3]).then(([userCount, savedCount, users]) => {
        res.json({ userCount, savedCount, users });
    }).catch(e => res.status(500).json({ error: e.message }));
});

app.get('/make-me-admin', (req, res) => {
    const email = req.query.email;
    if(!email) return res.send("Provide email query param");
    db.run("UPDATE users SET role = 'admin' WHERE email = ?", [email], (err) => {
        res.send(`User ${email} is now an Admin! <a href="/admin">Go to Panel</a>`);
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
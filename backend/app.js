/* =========================
   📦 IMPORTS
========================= */
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session'); // Replaced express-session
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
const axios = require('axios');     // HTTP Client
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));



/* =========================
   📱 TELEGRAM BOT SETUP
========================= */
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

// Reusable SSL agent for scrapers that need to skip cert verification (e.g. adilet.zan.kz)
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

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
function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    res.redirect('/');
}

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* =========================
   🍪 SESSION SETUP (Vercel Compatible)
   ========================= */
// 1. Trust Vercel's Proxy (Required for HTTPS cookies)
app.set('trust proxy', 1);

// 2. Configure Cookie Session (Client-Side Storage)
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'fallback_secret'],
    
    // Cookie Options
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production', // True on Vercel, False on Localhost
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' for Vercel
    httpOnly: true
}));

// 3. CRITICAL FIX: "Polyfill" for Passport.js
// This prevents the "req.session.regenerate is not a function" crash
app.use((req, res, next) => {
    if (req.session && !req.session.regenerate) {
        req.session.regenerate = (cb) => { cb(); };
    }
    if (req.session && !req.session.save) {
        req.session.save = (cb) => { cb(); };
    }
    next();
});

// 4. Initialize Passport (MUST come after the fix above)
app.use(passport.initialize());
app.use(passport.session());

// 5. Static Files (Frontend)
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/img', express.static(path.join(__dirname, '../frontend/img')));

/* =========================
   🔐 AUTH ROUTES
========================= */
app.post('/auth/register', async (req, res) => {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Please fill all fields' });

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (user) return res.status(400).json({ error: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
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
        if (!user) return res.status(400).json({ error: (info && info.message) || 'Invalid credentials' });
        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.json(user);
        });
    })(req, res, next);
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));

// Logout Fix for Cookie Session
app.get('/auth/logout', (req, res) => {
    req.logout(() => {
        req.session = null; // Clear the cookie manually
        res.redirect('/');
    });
});

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
   📜 DATABASE NLA & STATS
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
   📊 ADVANCED ANALYTICS API
========================= */
app.get('/analytics/data', ensureAdmin, (req, res) => {
    const p1 = new Promise((resolve, reject) => {
        db.all("SELECT department, COUNT(*) as count FROM users GROUP BY department", [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });

    const p2 = new Promise((resolve, reject) => {
        db.all("SELECT topic, COUNT(*) as count FROM saved_news GROUP BY topic ORDER BY count DESC LIMIT 5", [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });

    const p3 = new Promise((resolve, reject) => {
        db.all(`SELECT date(saved_at) as date, COUNT(*) as count FROM saved_news 
                WHERE saved_at >= date('now', '-7 days') 
                GROUP BY date(saved_at) ORDER BY date ASC`, [], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });

    Promise.all([p1, p2, p3])
        .then(([deptData, topicData, timelineData]) => {
            res.json({ deptData, topicData, timelineData });
        })
        .catch(err => res.status(500).json({ error: err.message }));
});

/* =========================
   ⚖️ NLA HELPERS
========================= */
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
        if(!row) return res.status(404).json({error: 'Document not found'});
        res.json(row);
    });
});

/* =========================
   🇺🇿 UZBEKISTAN: LEX.UZ SCRAPER
========================= */
app.get('/nla/live/search', async (req, res) => {
    const { query } = req.query;
    try {
        const url = `https://lex.uz/search/nat?query=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            if (href.includes('/docs/') && title.length > 15 && !title.includes('lex.uz')) {
                const idMatch = href.match(/\/docs\/(-?\d+)/);
                if (idMatch) {
                    const id = idMatch[1];
                    if (!results.find(r => r.id === id)) {
                        results.push({
                            id: id, title: title, issuer: 'Lex.uz Official',
                            date: 'Effective', url: `https://lex.uz/docs/${id}`, source: 'Lex.uz'
                        });
                    }
                }
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) { res.status(500).json([]); }
});

app.get('/nla/download/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const docPageUrl = `https://lex.uz/docs/${id}`;
        const downloadUrl = `https://lex.uz/docs/getWord?docId=${id}`;
        
        const headers = { 'User-Agent': 'Mozilla/5.0' };
        const pageRes = await fetch(docPageUrl, { headers });
        const rawCookies = pageRes.headers.raw()['set-cookie'];
        const cookies = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';

        const fileRes = await fetch(downloadUrl, {
            headers: { ...headers, 'Referer': docPageUrl, 'Cookie': cookies }
        });

        if (!fileRes.ok) throw new Error('Lex.uz Blocked Download');

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="LexUz_Document_${id}.doc"`);
        await streamPipeline(fileRes.body, res);

    } catch (err) {
        res.redirect(`https://lex.uz/docs/${req.params.id}`);
    }
});

/* =========================
   🇰🇿 KAZAKHSTAN: ADILET SCRAPER
========================= */
app.get('/nla/live/kz/search', async (req, res) => {
    const { query } = req.query;
    try {
        const url = `https://adilet.zan.kz/rus/search/docs?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, { agent: insecureAgent, headers: { 'User-Agent': 'Mozilla/5.0' } });
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
    } catch (err) { res.status(500).json([]); }
});

app.get('/nla/live/kz/download/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const url = `https://adilet.zan.kz/rus/docs/${id}`;
        const response = await fetch(url, { agent: insecureAgent, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let title = $('h1').text().trim() || `Adilet_Doc_${id}`;
        $('script, style, link, .header, .footer, .left-col, .toolbar').remove();
        let content = $('#text').html() || $('.content').html() || $('body').html();

        const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${content}</body></html>`;

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="${id}.doc"`);
        res.send(wordHtml);
    } catch (err) { res.status(500).send("Error generating doc"); }
});

/* =========================
   🇸🇬 SINGAPORE (SSO)
========================= */
app.get('/nla/live/sg/search', async (req, res) => {
    const { query } = req.query;
    try {
        const cleanQuery = query.trim();
        const firstChar = cleanQuery.charAt(0).toUpperCase();
        const browseUrl = `https://sso.agc.gov.sg/Browse/Act/Current/${firstChar}?PageSize=500`;
        const headers = { 'User-Agent': 'Mozilla/5.0' };

        const response = await fetch(browseUrl, { headers });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('table.table tbody tr').each((i, el) => {
            const linkEl = $(el).find('a').first();
            const title = linkEl.text().trim();
            const href = linkEl.attr('href');
            if (title && href && title.toLowerCase().includes(cleanQuery.toLowerCase())) {
                const id = href.split('?')[0].split('/').pop();
                const fullUrl = `https://sso.agc.gov.sg${href.split('?')[0]}`;
                results.push({
                    id: id, title: title, issuer: 'Parliament of Singapore',
                    date: 'Current Version', url: fullUrl, pdf: `${fullUrl}/Pdf`
                });
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) { res.status(500).json([]); }
});

/* =========================
   🇬🇧 UNITED KINGDOM (Gov.uk)
========================= */
app.get('/nla/live/uk/search', async (req, res) => {
    const { query } = req.query;
    try {
        const feedUrl = `https://www.legislation.gov.uk/all/data.feed?title=${encodeURIComponent(query)}`;
        const feed = await parser.parseURL(feedUrl);
        const results = feed.items.map(item => ({
            id: item.link.split('/').pop(), title: item.title, issuer: 'UK Parliament',
            date: new Date(item.pubDate).getFullYear(), url: item.link, pdf: item.link + '/data.pdf'
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
            if (title && href) {
                const fullUrl = href.startsWith('http') ? href : `https://www.congress.gov${href}`;
                results.push({
                    id: href.split('/').pop(), title: title, issuer: 'US Congress',
                    date: 'Legislation', url: fullUrl, pdf: fullUrl 
                });
            }
        });
        res.json(results.slice(0, 15));
    } catch (err) { res.status(500).json([]); }
});

/* =========================
   🇪🇪 ESTONIA, 🇨🇳 CHINA, 🇵🇱 POLAND, 🇻🇳 VIETNAM
========================= */
app.get('/nla/live/ee/search', async (req, res) => { res.status(501).json({ error: 'Estonia search not yet implemented' }); });
app.get('/nla/live/cn/search', async (req, res) => { res.status(501).json({ error: 'China search not yet implemented' }); });
app.get('/nla/live/pl/search', async (req, res) => { res.status(501).json({ error: 'Poland search not yet implemented' }); });
app.get('/nla/live/vn/search', async (req, res) => { res.status(501).json({ error: 'Vietnam search not yet implemented' }); });


/* =========================
   MARKET INTELLIGENCE & SCRAPERS (UPDATED)
========================= */

// 1. FMP PROXY (Global Public Companies)
app.get('/api/company-intel', async (req, res) => {
    const query = req.query.q;
    const API_KEY = process.env.FMP_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'FMP API key not configured' });

    try {
        const searchRes = await axios.get(`https://financialmodelingprep.com/api/v3/search?query=${query}&limit=1&apikey=${API_KEY}`);
        if (!searchRes.data.length) return res.status(404).json({ error: "Not found" });

        const symbol = searchRes.data[0].symbol;
        const profileRes = await axios.get(`https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${API_KEY}`);
        const incomeRes = await axios.get(`https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=5&apikey=${API_KEY}`);

        res.json({ profile: profileRes.data[0], financials: incomeRes.data });
    } catch (error) {
        res.status(500).json({ error: "API connection failed" });
    }
});

/* =========================
   🕵️ UZBEKISTAN PARSER (Bing Backdoor Strategy)
   ========================= */
app.get('/api/uz-company-parser', async (req, res) => {
    if (!req.query.q) return res.status(400).json({ error: "No query provided" });
    const query = req.query.q.trim();
    if (!query) return res.status(400).json({ error: "No query provided" });

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html'
        };

        // 1. Search BING for the profile page
        // "site:orginfo.uz Artel"
        const bingUrl = `https://www.bing.com/search?q=site:orginfo.uz+"${encodeURIComponent(query)}"`;
        console.log(`🔎 Asking Bing: ${bingUrl}`);
        
        const bingRes = await axios.get(bingUrl, { headers });
        const $ = cheerio.load(bingRes.data);

        // 2. Find the first result that is a Profile Link
        let profileUrl = null;
        
        // Bing results are usually in 'li.b_algo h2 a'
        $('li.b_algo h2 a').each((i, el) => {
            const href = $(el).attr('href');
            // We only want /organization/ links, no PDF downloads or other junk
            if (href && href.includes('orginfo.uz/organization/') && !profileUrl) {
                profileUrl = href;
            }
        });

        if (!profileUrl) {
            console.log("❌ Bing found no Orginfo profiles.");
            return res.status(404).json({ error: "Company not found via Bing" });
        }

        console.log(`✅ Direct Hit: ${profileUrl}`);

        // 3. Visit the Profile Page Directly
        const profileRes = await axios.get(profileUrl, { headers });
        const $$ = cheerio.load(profileRes.data);

        // 4. Extract Data (Robust Selectors)
        // Orginfo titles often include " - Orginfo.uz", strip that out
        let name = $$('h1').text().trim(); 
        
        // If H1 is empty (sometimes happens on mobile view), try Title tag
        if (!name) name = $$('title').text().replace(' - Orginfo.uz', '').trim();

        // Extract using "contains" because classes change, but labels don't
        let director = $$('span:contains("Руководитель")').parent().next().text().trim();
        if (!director) director = $$('.row:contains("Руководитель")').find('.col-md-8').text().trim();
        if (!director) director = "Restricted";

        let address = $$('span:contains("Адрес")').parent().next().text().trim();
        if (!address) address = $$('.row:contains("Адрес")').find('.col-md-8').text().trim();
        if (!address) address = "Uzbekistan";

        let status = $$('.badge').first().text().trim();
        if (!status) status = "Active";

        let inn = $$('span:contains("ИНН")').parent().next().text().trim();
        if (!inn) inn = "Unknown";
        
        // Capital
        const capitalText = $$('span:contains("Уставной фонд")').parent().next().text().trim();
        const capital = parseInt(capitalText.replace(/[^0-9]/g, '')) || 50000000;

        res.json({ name, director, address, status, inn, capital });

    } catch (error) {
        console.error("Scraper Error:", error.message);
        res.status(404).json({ error: "Parsing failed" });
    }
});


/* =========================
   📰 NEWS FEED
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

        promises.push(parser.parseURL(googleUrl).then(feed => feed.items.map(item => {
            // Try to extract image from all possible RSS fields
            let image = null;
            if (item['media:content'] && item['media:content'].length) {
                const media = item['media:content'].find(m => m.$ && m.$.url);
                if (media) image = media.$.url;
            }
            if (!image && item.enclosure && item.enclosure.url) {
                image = item.enclosure.url;
            }
            // Check content, description, and contentEncoded for <img> tags
            const htmlFields = [item.content, item.description, item.contentEncoded, item.summary].filter(Boolean);
            if (!image) {
                for (const html of htmlFields) {
                    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/);
                    if (imgMatch && !imgMatch[1].includes('google.com/logos')) {
                        image = imgMatch[1];
                        break;
                    }
                }
            }
            // Extract actual source name from title (Google News format: "Title - Source")
            let source = 'Google News';
            const srcMatch = item.title && item.title.match(/ - ([^-]+)$/);
            if (srcMatch) source = srcMatch[1].trim();

            return {
                id: item.link, title: item.title, description: item.contentSnippet || item.title,
                url: item.link, image, source, published_at: item.pubDate, type: 'google_rss'
            };
        })).catch(e => []));

        const results = await Promise.allSettled(promises);
        let allArticles = [];
        results.forEach(r => { if (r.status === 'fulfilled') allArticles.push(...r.value); });

        const uniqueArticles = Array.from(new Map(allArticles.map(item => [item.title, item])).values());
        const finalNews = uniqueArticles.slice(Number(offset), Number(offset) + Number(limit));

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
   🖼️ OG:IMAGE PROXY (for news card images)
========================= */
app.get('/api/og-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'No url provided' });
    try {
        // Resolve Google News redirect to actual article URL first
        const realUrl = await resolveGoogleNewsUrl(url);
        const imgUrl = await scrapeOgImage(realUrl);
        if (imgUrl) return res.json({ image: imgUrl });
        res.json({ image: null });
    } catch (e) {
        res.json({ image: null });
    }
});

/* =========================
   PDF REPORT: Image Helpers
========================= */

// Resolve Google News redirect URLs to the actual article URL
async function resolveGoogleNewsUrl(url) {
    if (!url || !url.includes('news.google.com')) return url;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            redirect: 'follow'
        });
        clearTimeout(timeout);
        // After redirect, response.url is the actual article URL
        if (response.url && !response.url.includes('news.google.com')) {
            return response.url;
        }
        // Fallback: parse the page for the actual link
        const html = await response.text();
        const $ = cheerio.load(html);
        const link = $('a[data-n-au]').attr('href') || $('c-wiz a[href^="http"]').attr('href');
        return link || url;
    } catch (e) { return url; }
}

async function scrapeOgImage(articleUrl) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(articleUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            redirect: 'follow'
        });
        clearTimeout(timeout);
        if (!response.ok) return null;
        const html = await response.text();
        const $ = cheerio.load(html);

        // 1. Try standard og:image / twitter:image meta tags
        let img = $('meta[property="og:image"]').attr('content')
            || $('meta[name="twitter:image"]').attr('content')
            || $('meta[name="twitter:image:src"]').attr('content');

        // Filter out Google logo / tiny placeholder images
        if (img && (img.includes('google.com/logos') || img.includes('gstatic.com/images/branding'))) {
            img = null;
        }
        if (img) return img;

        // 2. Fallback: find the first large article image in the page
        const candidates = $('article img[src], .article img[src], .post img[src], figure img[src], .story img[src], [role="main"] img[src]');
        for (let i = 0; i < candidates.length && i < 5; i++) {
            const src = $(candidates[i]).attr('src');
            const width = parseInt($(candidates[i]).attr('width')) || 0;
            if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('avatar') && (width === 0 || width >= 200)) {
                return src.startsWith('//') ? 'https:' + src : src;
            }
        }
        return null;
    } catch (e) { return null; }
}

async function fetchImageBuffer(imgUrl) {
    if (!imgUrl) return null;
    try {
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(imgUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        clearTimeout(timeout);
        if (!response.ok) return null;
        const ct = response.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) return null;
        const buffer = await response.buffer();
        return buffer.length >= 500 ? buffer : null;
    } catch (e) { return null; }
}

/* =========================
   PDF REPORT: Bulletin Generator
========================= */
app.post('/news/report', async (req, res) => {
    try {
        const { news } = req.body;
        if (!news || news.length === 0) return res.status(400).json({ error: 'No news selected' });

        // ---- Colors & Layout Constants ----
        const TEAL = '#005F73';
        const RED = '#C00000';
        const BLACK = '#1a1a1a';
        const GRAY = '#666666';
        const M = 60;            // margin
        const PW = 595.28;       // A4 width
        const PH = 841.89;       // A4 height
        const CW = PW - M * 2;   // content width
        const fontsDir = path.join(__dirname, 'fonts');

        // ---- Compute date range from articles ----
        const dates = news.map(n => new Date(n.published_at)).filter(d => !isNaN(d));
        const minDate = dates.length ? new Date(Math.min(...dates)) : new Date();
        const maxDate = dates.length ? new Date(Math.max(...dates)) : new Date();
        const fmtDate = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

        // ---- Fetch article images in parallel (resolve Google News URLs + scrape og:image) ----
        const imageBuffers = await Promise.all(news.map(async (item) => {
            try {
                let imgUrl = item.image;
                if (!imgUrl && item.url) {
                    const realUrl = await resolveGoogleNewsUrl(item.url);
                    imgUrl = await scrapeOgImage(realUrl);
                }
                return imgUrl ? await fetchImageBuffer(imgUrl) : null;
            } catch (e) { return null; }
        }));

        // ---- Create PDF Document ----
        const doc = new PDFDocument({
            margin: M, size: 'A4', bufferPages: true,
            info: { Title: 'Weekly Bulletin of IT News and Articles', Author: 'IT Park' }
        });
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

        // ---- Register Cambria fonts ----
        doc.registerFont('Cambria', path.join(fontsDir, 'CAMBRIA.TTC'), 'Cambria');
        doc.registerFont('Cambria-Bold', path.join(fontsDir, 'CAMBRIAB.TTF'));
        doc.registerFont('Cambria-Italic', path.join(fontsDir, 'CAMBRIAI.TTF'));
        doc.registerFont('Cambria-BoldItalic', path.join(fontsDir, 'CAMBRIAZ.TTF'));

        // =============================================
        // PAGE 1: COVER PAGE
        // =============================================
        doc.y = 120;
        doc.font('Cambria-Bold').fontSize(28).fillColor(TEAL)
           .text('Weekly Bulletin of IT News\nand Articles', M, doc.y, { align: 'center', width: CW });
        doc.moveDown(0.8);
        doc.font('Cambria-Italic').fontSize(14).fillColor(RED)
           .text(`(${fmtDate(minDate)} – ${fmtDate(maxDate)})`, M, doc.y, { align: 'center', width: CW });

        // Bottom: Department + Tashkent line
        doc.font('Cambria-Bold').fontSize(13).fillColor(BLACK)
           .text('Department of Strategy and Analysis', M, PH - 180, { align: 'center', width: CW });
        const monthName = maxDate.toLocaleDateString('en-US', { month: 'long' });
        const yearStr = maxDate.getFullYear().toString();
        const tashStr = `Tashkent, ${monthName} `;
        doc.font('Cambria').fontSize(13);
        const tashW = doc.widthOfString(tashStr);
        const yearW = doc.widthOfString(yearStr);
        const bX = (PW - tashW - yearW) / 2;
        doc.fillColor(BLACK).text(tashStr, bX, PH - 155, { continued: true })
           .fillColor(RED).text(yearStr);

        // =============================================
        // RESERVE TOC PAGES (filled in later)
        // =============================================
        const tocPagesNeeded = Math.max(1, Math.ceil(news.length / 25));
        const tocPageIndices = [];
        for (let t = 0; t < tocPagesNeeded; t++) {
            doc.addPage();
            tocPageIndices.push(doc.bufferedPageRange().count - 1);
        }

        // =============================================
        // ARTICLE PAGES
        // =============================================
        doc.addPage();

        // Section header on first article page
        doc.font('Cambria-Bold').fontSize(14).fillColor(RED)
           .text('NEWS', M, 50, { align: 'center', width: CW });
        doc.moveDown(1);

        const articlePageNums = []; // 1-indexed page number per article

        for (let i = 0; i < news.length; i++) {
            const item = news[i];
            const imgBuf = imageBuffers[i];

            // New page if not enough room
            if (doc.y > PH - 180) {
                doc.addPage();
                doc.y = 50;
            }

            // Record this article's page number (1-indexed)
            articlePageNums.push(doc.bufferedPageRange().count);

            // -- Article Title (bold) --
            doc.font('Cambria-Bold').fontSize(12).fillColor(BLACK)
               .text(`${i + 1}.  ${item.title}`, M, doc.y, { width: CW });

            // -- Source (italic, centered) --
            doc.font('Cambria-Italic').fontSize(10).fillColor(GRAY)
               .text(`(${item.source || 'Unknown source'})`, M, doc.y, { align: 'center', width: CW });
            doc.moveDown(0.5);

            // -- Body text with optional image floated right --
            const bodyY = doc.y;
            const IMG_W = 160, IMG_H = 110;
            let imgRendered = false;

            if (imgBuf) {
                try {
                    doc.image(imgBuf, PW - M - IMG_W, bodyY, { fit: [IMG_W, IMG_H] });
                    imgRendered = true;
                } catch (e) { /* image decode failed */ }
            }

            const bodyW = imgRendered ? (CW - IMG_W - 15) : CW;
            doc.font('Cambria').fontSize(11).fillColor(BLACK)
               .text(item.description || 'No description available.', M, bodyY, {
                   width: bodyW, align: 'justify'
               });

            // Ensure cursor is past the image
            if (imgRendered && doc.y < bodyY + IMG_H + 5) {
                doc.y = bodyY + IMG_H + 5;
            }

            // -- Read full article link --
            if (item.url) {
                doc.moveDown(0.3);
                doc.font('Cambria-Italic').fontSize(9).fillColor(GRAY)
                   .text('(Read full article at ', M, doc.y, { continued: true, width: CW });
                doc.fillColor('#1155CC').text(item.url, { link: item.url, continued: true, underline: true });
                doc.fillColor(GRAY).text(')');
            }
            doc.moveDown(1.5);
        }

        // =============================================
        // FILL IN TABLE OF CONTENTS (switchToPage)
        // =============================================
        const NUM_W = 35, PAGE_W = 35;
        const TITLE_W = CW - NUM_W - PAGE_W;
        const ROW_PAD = 4;

        let tocItemIdx = 0;
        for (let tp = 0; tp < tocPagesNeeded; tp++) {
            doc.switchToPage(tocPageIndices[tp]);
            let ty;

            if (tp === 0) {
                // ToC title
                doc.font('Cambria-Bold').fontSize(16).fillColor(TEAL)
                   .text('Table of Contents', M, 55, { align: 'center', width: CW });
                ty = 90;
                // Section header row
                doc.strokeColor('#999').lineWidth(0.8);
                doc.moveTo(M, ty).lineTo(M + CW, ty).stroke();
                ty += 3;
                doc.font('Cambria-Bold').fontSize(11).fillColor(RED)
                   .text('NEWS', M, ty, { align: 'center', width: CW });
                ty += 18;
                doc.moveTo(M, ty).lineTo(M + CW, ty).stroke();
                ty += 3;
            } else {
                ty = 55;
            }

            while (tocItemIdx < news.length && ty < PH - 70) {
                const i = tocItemIdx;
                doc.font('Cambria-Bold').fontSize(10);
                const titleH = doc.heightOfString(news[i].title, { width: TITLE_W - 10 });
                const rowH = Math.max(titleH + ROW_PAD * 2, 22);

                if (ty + rowH > PH - 70) break;

                // Cell borders
                doc.strokeColor('#bbb').lineWidth(0.4);
                doc.moveTo(M, ty).lineTo(M, ty + rowH).stroke();
                doc.moveTo(M + NUM_W, ty).lineTo(M + NUM_W, ty + rowH).stroke();
                doc.moveTo(M + NUM_W + TITLE_W, ty).lineTo(M + NUM_W + TITLE_W, ty + rowH).stroke();
                doc.moveTo(M + CW, ty).lineTo(M + CW, ty + rowH).stroke();
                doc.moveTo(M, ty + rowH).lineTo(M + CW, ty + rowH).stroke();

                // Number
                doc.font('Cambria-Bold').fontSize(10).fillColor(BLACK)
                   .text(`${i + 1}`, M, ty + ROW_PAD, { width: NUM_W, align: 'center' });
                // Title
                doc.font('Cambria-Bold').fontSize(10).fillColor(BLACK)
                   .text(news[i].title, M + NUM_W + 5, ty + ROW_PAD, { width: TITLE_W - 10 });
                // Page number (red)
                doc.font('Cambria').fontSize(10).fillColor(RED)
                   .text(`${articlePageNums[i]}`, M + NUM_W + TITLE_W, ty + ROW_PAD, { width: PAGE_W, align: 'center' });

                ty += rowH;
                tocItemIdx++;
            }
        }

        // =============================================
        // ADD PAGE NUMBERS (centered top, skip cover)
        // =============================================
        const totalPages = doc.bufferedPageRange().count;
        for (let p = 1; p < totalPages; p++) {
            doc.switchToPage(p);
            doc.font('Cambria').fontSize(10).fillColor(GRAY)
               .text(`${p + 1}`, 0, 25, { align: 'center', width: PW });
        }

        doc.end();
    } catch (err) {
        console.error("PDF Error:", err);
        if (!res.headersSent) res.status(500).json({ error: 'PDF Failed' });
    }
});

// Admin Maker (protected — only existing admins can promote users)
app.get('/make-me-admin', ensureAdmin, (req, res) => {
    const email = req.query.email;
    if(!email) return res.status(400).json({ error: "Provide email" });
    db.run("UPDATE users SET role = 'admin' WHERE email = ?", [email], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, message: `User ${email} is now an Admin.` });
    });
});

// Serves the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
// ----------------------------------------------------
// 🚀 VERCEL CONFIGURATION (Keep this at the bottom)
// ----------------------------------------------------

// Export the Express API for Vercel
module.exports = app;

// Only listen if running locally (not on Vercel)
if (require.main === module) {
    app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
}
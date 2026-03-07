/* =========================
   📦 IMPORTS
========================= */
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session'); // Replaced express-session
const passport = require('passport');
require('./config/passport')(passport);
const path = require('path');
const crypto = require('crypto');
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
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
const multer = require('multer'); // File uploads
const fs = require('fs');
const { Jimp } = require('jimp'); // Image compression (pure JS, no native deps)
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mailer = require('./config/mailer');

// --- Security: Validate session secret ---
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
    console.error('❌ FATAL: SESSION_SECRET must be set in .env and be at least 16 characters');
    process.exit(1);
}

// --- Upload Directories ---
const avatarsDir = path.join(__dirname, 'uploads', 'avatars');
const announcementsDir = path.join(__dirname, 'uploads', 'announcements');
const documentsDir = path.join(__dirname, 'uploads', 'documents');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
if (!fs.existsSync(announcementsDir)) fs.mkdirSync(announcementsDir, { recursive: true });
if (!fs.existsSync(documentsDir)) fs.mkdirSync(documentsDir, { recursive: true });
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar-${req.user.id}${ext}`);
    }
});
const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 1 * 1024 * 1024 }, // 1MB for avatars (compressed after upload)
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only image files (JPG, PNG, GIF, WEBP) are allowed'));
    }
});

// --- Announcement Image Upload Setup ---
const announcementStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, announcementsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const randomName = crypto.randomBytes(16).toString('hex') + ext;
        cb(null, randomName);
    }
});
const announcementUpload = multer({
    storage: announcementStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB for announcements (compressed after upload)
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

// --- Document Upload Setup (PDFs + images for HR documents & certificates) ---
const documentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userId = req.user ? req.user.id : 'unknown';
        const userDir = path.join(documentsDir, userId);
        if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const docType = req.body.doc_type || 'document';
        const timestamp = Date.now();
        cb(null, `${docType}-${timestamp}${ext}`);
    }
});
const documentUpload = multer({
    storage: documentStorage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB for documents
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only PDF and image files (JPG, PNG) are allowed'));
    }
});


// --- Image Compression Helper ---
async function compressImage(filePath, options = {}) {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) return; // Skip non-images (PDFs)
    const { maxWidth = 1200, quality = 75 } = options;
    try {
        const image = await Jimp.read(filePath);
        if (image.width > maxWidth) {
            image.resize({ w: maxWidth });
        }
        image.quality = quality;
        const tempPath = filePath + '.tmp';
        await image.write(tempPath);
        const origSize = fs.statSync(filePath).size;
        const newSize = fs.statSync(tempPath).size;
        if (newSize < origSize) {
            fs.unlinkSync(filePath);
            fs.renameSync(tempPath, filePath);
        } else {
            fs.unlinkSync(tempPath); // Keep original if already smaller
        }
    } catch (e) {
        console.error('Image compression error:', e.message);
        // If compression fails, keep original file
        try { fs.unlinkSync(filePath + '.tmp'); } catch(_) {}
    }
}

/* =========================
   📱 TELEGRAM BOT SETUP
========================= */
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
// Telegram groups are managed via Admin Panel (telegram_groups table)

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

// Trust proxy (cPanel/Passenger runs behind a reverse proxy)
app.set('trust proxy', 1);

/* =========================
   🛡️ SECURITY MIDDLEWARE
========================= */
// Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow inline scripts in frontend
    crossOriginEmbedderPolicy: false
}));

// General rate limiter: 500 requests per minute per IP
app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
}));

// Stricter rate limiter for auth routes
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts, please try again later' }
});

/* =========================
   🔧 HELPERS & MIDDLEWARE
========================= */
// HTML sanitization helper to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function ensureAuth(req, res, next) {
    if (!req.isAuthenticated() || !req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.approval_status !== 'approved') return res.status(403).json({ error: 'Account pending approval' });
    return next();
}

function ensureAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin' && req.user.approval_status === 'approved') {
        return next();
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    res.redirect('/');
}

function ensureHead(req, res, next) {
    if (req.isAuthenticated() && (req.user.role === 'head' || req.user.role === 'admin')) {
        return next();
    }
    return res.status(403).json({ error: 'Access denied. Head role required.' });
}

function ensureHR(req, res, next) {
    if (req.isAuthenticated() && (req.user.department === 'HR' || req.user.role === 'admin')) {
        return next();
    }
    return res.status(403).json({ error: 'HR access required.' });
}

function ensureAdminAffairs(req, res, next) {
    if (req.isAuthenticated() && (
        req.user.department === 'Administrative Affairs' ||
        req.user.department === 'HR' ||
        req.user.role === 'admin'
    )) {
        return next();
    }
    return res.status(403).json({ error: 'Administrative Affairs access required.' });
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
    keys: [process.env.SESSION_SECRET],
    
    // Cookie Options
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false,   // Set to true once SSL/HTTPS is configured
    sameSite: 'lax',
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
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')));
app.use('/uploads/announcements', express.static(path.join(__dirname, 'uploads', 'announcements')));

// Workspace routes (department-specific tools)
app.use('/workspace', require('./routes/workspace'));

/* =========================
   🔐 AUTH ROUTES
========================= */
app.post('/auth/register', authLimiter, async (req, res) => {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Please fill all fields' });

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (user) return res.status(400).json({ error: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const newId = 'local_' + Date.now();
        const photoUrl = `https://ui-avatars.com/api/?name=${name}&background=7dba28&color=fff`;

        const sql = `INSERT INTO users (id, name, email, password, department, photo_url, approval_status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`;
        db.run(sql, [newId, name, email, hash, department, photoUrl], function(err) {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            const newUser = { id: newId, name, email, department, photo_url: photoUrl, approval_status: 'pending' };
            // Email: welcome to user + notify admins
            mailer.sendMail(email, 'Welcome to IT Park Bulletin', mailer.welcomeEmail(name));
            db.all("SELECT email FROM users WHERE role = 'admin' AND approval_status = 'approved'", [], (e, admins) => {
                if (admins && admins.length) mailer.sendMailToMany(admins.map(a => a.email), 'New User Registration', mailer.newUserAdminEmail(name, email, department));
            });
            req.login(newUser, (err) => {
                if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
                res.json(newUser);
            });
        });
    });
});

app.post('/auth/login', authLimiter, (req, res, next) => {
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

// Update profile (name, department)
app.put('/auth/profile', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { name, department } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const allowedDepts = ['Product Export','Startup Ecosystem','Western Markets','Eastern Markets','GovTech','Venture Capital','Analytics','BPO Monitoring','Residents Relations','Residents Registration','Residents Monitoring','Softlanding','Legal Ecosystem','AI Infrastructure','AI Research','Inclusive Projects','Regional Development','Freelancers & Youth','Infrastructure','Infrastructure Dev','PPP Investors','IT Outsourcing','Global Marketing','Multimedia','Public Relations','Marketing','Event Management','International Relations','HR','Administrative Affairs'];
    const dept = allowedDepts.includes(department) ? department : department || 'Analytics';

    db.run(`UPDATE users SET name = ?, department = ? WHERE id = ?`, [name.trim(), dept, req.user.id], function(err) {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        res.json({ success: true, name: name.trim(), department: dept });
    });
});

// Upload avatar
app.post('/auth/avatar', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    avatarUpload.single('avatar')(req, res, (uploadErr) => {
        if (uploadErr) {
            if (uploadErr.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image must be under 1MB' });
            return res.status(400).json({ error: uploadErr.message });
        }
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // Compress avatar image (resize to 400px, 70% quality)
        compressImage(req.file.path, { maxWidth: 400, quality: 70 }).then(() => {
            // Clean up previous avatar files with different extensions
            const files = fs.readdirSync(avatarsDir);
            files.forEach(f => {
                if (f.startsWith(`avatar-${req.user.id}`) && f !== req.file.filename) {
                    try { fs.unlinkSync(path.join(avatarsDir, f)); } catch(e) {}
                }
            });

            const photoUrl = `/uploads/avatars/${req.file.filename}`;
            db.run(`UPDATE users SET photo_url = ? WHERE id = ?`, [photoUrl, req.user.id], function(err) {
                if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
                res.json({ success: true, photo_url: photoUrl });
            });
        });
    });
});

/* =========================
   🚀 TELEGRAM SHARE ROUTE
========================= */
app.post('/news/share', async (req, res) => {
    if (!bot) {
        return res.status(500).json({ error: 'Telegram bot not configured' });
    }
    const { title, description, url, source, topic } = req.body;
    const message = `<b>📢 IT Park Executive Alert</b>\n\n<b>${title}</b>\n\nℹ️ <i>${description ? description.substring(0, 150) + '...' : ''}</i>\n\n🏷 <b>Topic:</b> #${(topic || 'General').replace(/\s/g, '')}\n📰 <b>Source:</b> ${source || 'Unknown'}\n\n🔗 <a href="${url}">Read Full Article</a>`;

    try {
        // Collect all chat IDs from DB
        const dbGroups = await new Promise((resolve, reject) => {
            db.all("SELECT chat_id, name FROM telegram_groups", (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
        const chatIds = dbGroups.map(g => g.chat_id);

        if (chatIds.length === 0) {
            return res.status(400).json({ error: 'No Telegram groups configured. Add groups in Admin Panel.' });
        }

        const results = await Promise.allSettled(
            chatIds.map(id => bot.sendMessage(id, message, { parse_mode: 'HTML' }))
        );
        const sent = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
            results.forEach((r, i) => {
                if (r.status === 'rejected') console.error(`Telegram send failed for ${chatIds[i]}:`, r.reason.message);
            });
        }
        res.json({ success: true, sent, failed, total: chatIds.length });
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
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        res.json({ success: true });
    });
});

app.get('/news/saved', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const sql = `SELECT * FROM saved_news WHERE user_id = ? ORDER BY saved_at DESC`;
    db.all(sql, [req.user.id], (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
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
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
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
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        res.json(rows);
    });
});

app.get('/stats', (req, res) => {
    const { country } = req.query;
    let sql = "SELECT * FROM statistics";
    let params = [];
    if (country) { sql += " WHERE country_code = ?"; params.push(country); }
    db.all(sql, params, (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
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
        .catch(err => { console.error('DB Error:', err); res.status(500).json({ error: 'Internal server error' }); });
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
   📢 ANNOUNCEMENTS
========================= */

// List all announcements with read status for current user
app.get('/announcements', ensureAuth, (req, res) => {
    const userId = req.user.id;
    db.all(`SELECT a.*, u.name as author_name, u.photo_url as author_photo,
            CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END as is_read
            FROM announcements a
            LEFT JOIN users u ON a.created_by = u.id
            LEFT JOIN announcement_reads ar ON a.id = ar.announcement_id AND ar.user_id = ?
            ORDER BY a.created_at DESC`,
        [userId], (err, rows) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json(rows);
        });
});

// Unread count for notification badge
app.get('/announcements/unread-count', ensureAuth, (req, res) => {
    db.get(`SELECT COUNT(*) as count FROM announcements a
            WHERE a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)`,
        [req.user.id], (err, row) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ count: row ? row.count : 0 });
        });
});

// Create announcement (HR or admin only)
app.post('/announcements', ensureAuth, ensureHR, (req, res) => {
    announcementUpload.single('image')(req, res, async (uploadErr) => {
        if (uploadErr) return res.status(400).json({ error: uploadErr.message });
        const { title, content } = req.body;
        if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });

        // Compress announcement image (resize to 800px, 75% quality)
        if (req.file) await compressImage(req.file.path, { maxWidth: 800, quality: 75 });

        const imageUrl = req.file ? `/uploads/announcements/${req.file.filename}` : null;
        db.run(`INSERT INTO announcements (title, content, image_url, created_by, department) VALUES (?, ?, ?, ?, ?)`,
            [title, content, imageUrl, req.user.id, 'HR'],
            function(err) {
                if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
                // Email: notify all approved users about announcement
                db.all("SELECT email FROM users WHERE approval_status = 'approved'", [], (e, users) => {
                    if (users && users.length) mailer.sendMailToMany(users.map(u => u.email), `Announcement: ${title}`, mailer.announcementEmail(title, content, req.user.name));
                });
                res.json({ success: true, id: this.lastID });
            });
    });
});

// Mark announcement as read
app.post('/announcements/:id/read', ensureAuth, (req, res) => {
    db.run(`INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)`,
        [req.params.id, req.user.id], (err) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ success: true });
        });
});

// Delete announcement (HR or admin only)
app.delete('/announcements/:id', ensureAuth, ensureHR, (req, res) => {
    db.get('SELECT image_url FROM announcements WHERE id = ?', [req.params.id], (err, row) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        db.run('DELETE FROM announcement_reads WHERE announcement_id = ?', [req.params.id], () => {
            db.run('DELETE FROM announcements WHERE id = ?', [req.params.id], function(delErr) {
                if (delErr) return res.status(500).json({ error: delErr.message });
                if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
                // Clean up image file
                if (row && row.image_url) {
                    const filePath = path.join(__dirname, row.image_url.replace(/^\//, ''));
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }
                res.json({ success: true });
            });
        });
    });
});

/* =========================
   💬 PERSONAL CHAT (1-on-1)
========================= */

// Get all users grouped by department (contacts list)
app.get('/chat/contacts', ensureAuth, (req, res) => {
    const me = req.user.id;
    // Get all users except current, plus last message info per conversation
    db.all(`SELECT u.id, u.name, u.photo_url, u.department, u.role,
            lm.message as last_message, lm.created_at as last_message_at, lm.sender_id as last_sender_id,
            COALESCE(unread.count, 0) as unread_count
            FROM users u
            LEFT JOIN (
                SELECT * FROM chat_messages WHERE id IN (
                    SELECT MAX(id) FROM chat_messages
                    WHERE sender_id = ? OR receiver_id = ?
                    GROUP BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
                )
            ) lm ON (lm.sender_id = u.id OR lm.receiver_id = u.id) AND (lm.sender_id = ? OR lm.receiver_id = ?)
            LEFT JOIN (
                SELECT sender_id, COUNT(*) as count FROM chat_messages
                WHERE receiver_id = ? AND is_read = 0
                GROUP BY sender_id
            ) unread ON unread.sender_id = u.id
            WHERE u.id != ?
            ORDER BY lm.created_at DESC, u.name ASC`,
        [me, me, me, me, me, me, me], (err, rows) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json(rows || []);
        });
});

// Get messages between current user and another user
app.get('/chat/messages/:userId', ensureAuth, (req, res) => {
    const me = req.user.id;
    const other = req.params.userId;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 100);
    const before = parseInt(req.query.before) || 0;

    let sql = `SELECT id, sender_id, receiver_id, message, is_read, created_at
               FROM chat_messages
               WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`;
    const params = [me, other, other, me];

    if (before > 0) {
        sql += ` AND id < ?`;
        params.push(before);
    }

    sql += ` ORDER BY id DESC LIMIT ?`;
    params.push(limit);

    db.all(sql, params, (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        // Mark received messages as read
        db.run(`UPDATE chat_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`,
            [other, me]);
        res.json((rows || []).reverse());
    });
});

// Send a personal message
app.post('/chat/messages', ensureAuth, (req, res) => {
    const { receiver_id, message } = req.body;
    if (!receiver_id || !message || !message.trim()) {
        return res.status(400).json({ error: 'Receiver and message are required' });
    }
    if (message.length > 2000) {
        return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    }
    const sanitizedMsg = escapeHtml(message.trim());

    db.run(`INSERT INTO chat_messages (sender_id, receiver_id, message) VALUES (?, ?, ?)`,
        [req.user.id, receiver_id, sanitizedMsg],
        function(err) {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ id: this.lastID, sender_id: req.user.id, receiver_id, message: sanitizedMsg, is_read: 0, created_at: new Date().toISOString() });
        });
});

// Poll for new messages in a conversation
app.get('/chat/new-messages/:userId', ensureAuth, (req, res) => {
    const me = req.user.id;
    const other = req.params.userId;
    const after = parseInt(req.query.after) || 0;

    db.all(`SELECT id, sender_id, receiver_id, message, is_read, created_at
            FROM chat_messages
            WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND id > ?
            ORDER BY id ASC`,
        [me, other, other, me, after], (err, rows) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            // Mark received as read
            db.run(`UPDATE chat_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`,
                [other, me]);
            res.json(rows || []);
        });
});

// Count total unread messages for badge
app.get('/chat/unread-count', ensureAuth, (req, res) => {
    db.get(`SELECT COUNT(*) as count FROM chat_messages WHERE receiver_id = ? AND is_read = 0`,
        [req.user.id], (err, row) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ count: row ? row.count : 0 });
        });
});

/* =========================
   📰 NEWS FEED
========================= */
app.get('/news', async (req, res) => {
    const { topic = '', department = '', keyword = '', country = '', userId, limit = 20, offset = 0 } = req.query;

    try {
        const promises = [];

        // Build a combined search query from all active filters
        const queryParts = [];
        if (keyword) queryParts.push(keyword);
        if (topic) queryParts.push(topic);
        if (department) queryParts.push(department);

        // Map country codes to names for better search results
        const countryNames = { us: 'USA', gb: 'United Kingdom', in: 'India', de: 'Germany', kr: 'South Korea', jp: 'Japan', ru: 'Russia', kz: 'Kazakhstan', uz: 'Uzbekistan' };
        if (country && countryNames[country]) queryParts.push(countryNames[country]);

        let searchQuery = queryParts.length ? queryParts.join(' ') : 'Technology';

        const googleGeo = country && ['us','gb','in','de','kr','jp','ru'].includes(country) ? `&gl=${country.toUpperCase()}&ceid=${country.toUpperCase()}:en` : '&gl=US&ceid=US:en';
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

        // ---- Use today's date for the report ----
        const today = new Date();
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
           .text(`(${fmtDate(today)})`, M, doc.y, { align: 'center', width: CW });

        // Bottom: Department + Tashkent line
        doc.font('Cambria-Bold').fontSize(13).fillColor(BLACK)
           .text('Department of Strategy and Analysis', M, PH - 180, { align: 'center', width: CW });
        const monthName = today.toLocaleDateString('en-US', { month: 'long' });
        const yearStr = today.getFullYear().toString();
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

/* =========================
   🛡️ ADMIN PANEL API
========================= */

// Dashboard overview stats
app.get('/admin/dashboard', ensureAdmin, (req, res) => {
    const result = {};
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        result.totalUsers = row ? row.count : 0;
        db.get("SELECT COUNT(*) as count FROM saved_news", (err2, row2) => {
            result.totalSaved = row2 ? row2.count : 0;
            db.get("SELECT COUNT(*) as count FROM users WHERE created_at >= date('now', '-7 days')", (err4, row4) => {
                result.recentUsers = row4 ? row4.count : 0;
                db.all("SELECT department, COUNT(*) as count FROM users GROUP BY department ORDER BY count DESC", (err5, rows) => {
                    result.usersByDept = rows || [];
                    res.json(result);
                });
            });
        });
    });
});

// List all users with search/filter
app.get('/admin/users', ensureAdmin, (req, res) => {
    const { search, department, role } = req.query;
    let sql = "SELECT id, email, name, photo_url, department, role, approval_status, created_at FROM users WHERE 1=1";
    const params = [];

    if (search) {
        sql += " AND (name LIKE ? OR email LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }
    if (department) {
        sql += " AND department = ?";
        params.push(department);
    }
    if (role) {
        sql += " AND role = ?";
        params.push(role);
    }

    sql += " ORDER BY created_at DESC";

    db.all(sql, params, (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        res.json({ users: rows || [], total: (rows || []).length });
    });
});

// Change user role
app.put('/admin/users/:id/role', ensureAdmin, (req, res) => {
    const { role } = req.body;
    const validRoles = ['admin', 'head', 'viewer'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be "admin", "head", or "viewer".' });
    }
    if (req.user.id === req.params.id) {
        return res.status(400).json({ error: 'You cannot change your own role.' });
    }
    db.run("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id], function(err) {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'User not found.' });
        res.json({ success: true, id: req.params.id, role });
    });
});

// Approve user
app.put('/admin/users/:id/approve', ensureAdmin, (req, res) => {
    db.run("UPDATE users SET approval_status = 'approved' WHERE id = ?", [req.params.id], function(err) {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'User not found.' });
        // Email: notify user they're approved
        db.get("SELECT name, email FROM users WHERE id = ?", [req.params.id], (e, user) => {
            if (user) mailer.sendMail(user.email, 'Account Approved — IT Park Bulletin', mailer.approvalEmail(user.name, true));
        });
        res.json({ success: true, id: req.params.id, approval_status: 'approved' });
    });
});

// Reject user
app.put('/admin/users/:id/reject', ensureAdmin, (req, res) => {
    db.run("UPDATE users SET approval_status = 'rejected' WHERE id = ?", [req.params.id], function(err) {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'User not found.' });
        // Email: notify user they're rejected
        db.get("SELECT name, email FROM users WHERE id = ?", [req.params.id], (e, user) => {
            if (user) mailer.sendMail(user.email, 'Account Update — IT Park Bulletin', mailer.approvalEmail(user.name, false));
        });
        res.json({ success: true, id: req.params.id, approval_status: 'rejected' });
    });
});

// Change user department
app.put('/admin/users/:id/department', ensureAdmin, (req, res) => {
    const { department } = req.body;
    const validDepts = ['Product Export','Startup Ecosystem','Western Markets','Eastern Markets','GovTech','Venture Capital','Analytics','BPO Monitoring','Residents Relations','Residents Registration','Residents Monitoring','Softlanding','Legal Ecosystem','AI Infrastructure','AI Research','Inclusive Projects','Regional Development','Freelancers & Youth','Infrastructure','Infrastructure Dev','PPP Investors','IT Outsourcing','Global Marketing','Multimedia','Public Relations','Marketing','Event Management','International Relations','HR','Administrative Affairs'];
    if (!validDepts.includes(department)) {
        return res.status(400).json({ error: 'Invalid department.' });
    }
    db.run("UPDATE users SET department = ? WHERE id = ?", [department, req.params.id], function(err) {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'User not found.' });
        res.json({ success: true, id: req.params.id, department });
    });
});

// Delete user
app.delete('/admin/users/:id', ensureAdmin, (req, res) => {
    const userId = req.params.id;
    if (String(req.user.id) === String(userId)) {
        return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    db.get("SELECT id, name, email FROM users WHERE id = ?", [userId], (err, user) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (!user) return res.status(404).json({ error: 'User not found.' });
        db.run("DELETE FROM saved_news WHERE user_id = ?", [userId], (err2) => {
            db.run("DELETE FROM users WHERE id = ?", [userId], function(err3) {
                if (err3) return res.status(500).json({ error: err3.message });
                res.json({ success: true, message: `User ${user.name || user.email} deleted.` });
            });
        });
    });
});

// Content overview stats
app.get('/admin/content', ensureAdmin, (req, res) => {
    const result = {};
    db.all(`SELECT news_id, title, source, url, COUNT(*) as save_count
            FROM saved_news GROUP BY news_id
            ORDER BY save_count DESC LIMIT 10`, (err, rows) => {
        result.popularArticles = rows || [];
        res.json(result);
    });
});

// Delete saved article (removes from all users)
app.delete('/admin/articles/:newsId', ensureAdmin, (req, res) => {
    const newsId = req.params.newsId;
    db.run("DELETE FROM saved_news WHERE news_id = ?", [newsId], function(err) {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'Article not found.' });
        res.json({ success: true, deleted: this.changes });
    });
});

// ── Admin Telegram Groups ──
app.get('/admin/telegram-groups', ensureAdmin, (req, res) => {
    db.all("SELECT id, chat_id, name, created_at FROM telegram_groups ORDER BY created_at DESC", (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        res.json(rows || []);
    });
});

app.post('/admin/telegram-groups', ensureAdmin, (req, res) => {
    const { chat_id, name } = req.body;
    if (!chat_id || !name) return res.status(400).json({ error: 'Chat ID and name are required' });
    db.run("INSERT INTO telegram_groups (chat_id, name, added_by) VALUES (?, ?, ?)",
        [chat_id.trim(), name.trim(), req.user.id], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'This chat ID already exists' });
                console.error('DB Error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            res.json({ success: true, id: this.lastID });
        });
});

app.delete('/admin/telegram-groups/:id', ensureAdmin, (req, res) => {
    db.run("DELETE FROM telegram_groups WHERE id = ?", [req.params.id], function(err) {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (this.changes === 0) return res.status(404).json({ error: 'Group not found' });
        res.json({ success: true });
    });
});

// ── Admin Activity KPI ──
app.get('/admin/activity', ensureAdmin, (req, res) => {
    const { range, from, to, dept } = req.query;
    let dateFrom;
    const now = new Date();
    if (range === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        dateFrom = d.toISOString();
    } else if (range === 'month') {
        const d = new Date(now); d.setMonth(d.getMonth() - 1);
        dateFrom = d.toISOString();
    } else if (range === 'custom' && from) {
        dateFrom = new Date(from).toISOString();
    } else {
        // Default: today
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
    const dateTo = (range === 'custom' && to) ? new Date(to + 'T23:59:59').toISOString() : now.toISOString();

    const deptFilter = dept && dept !== 'all' ? dept : null;

    const sql = `
        SELECT u.id, u.name, u.email, u.photo_url, u.department,
            (SELECT COUNT(*) FROM call_log WHERE user_id=u.id AND created_at >= ? AND created_at <= ?) as calls,
            (SELECT COUNT(*) FROM workspace_tracked_items WHERE user_id=u.id AND created_at >= ? AND created_at <= ?) as items_added,
            (SELECT COUNT(*) FROM workspace_tracked_items WHERE user_id=u.id AND status='completed' AND updated_at >= ? AND updated_at <= ?) as items_completed,
            (SELECT COUNT(*) FROM workspace_notes WHERE user_id=u.id AND created_at >= ? AND created_at <= ?) as notes,
            (SELECT COUNT(*) FROM saved_news WHERE user_id=u.id AND saved_at >= ? AND saved_at <= ?) as articles_saved,
            (SELECT COUNT(*) FROM spravochnik WHERE created_by=u.id AND created_at >= ? AND created_at <= ?) as spravochnik_entries
        FROM users u
        ${deptFilter ? "WHERE u.department = ?" : ""}
        ORDER BY u.name
    `;
    const params = [
        dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo,
        dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo
    ];
    if (deptFilter) params.push(deptFilter);

    db.all(sql, params, (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }

        const users = rows.map(r => ({
            ...r,
            total_actions: r.calls + r.items_added + r.items_completed + r.notes + r.articles_saved + r.spravochnik_entries
        }));
        users.sort((a, b) => b.total_actions - a.total_actions);

        const activeUsers = users.filter(u => u.total_actions > 0);
        const totalActions = users.reduce((s, u) => s + u.total_actions, 0);
        const summary = {
            total_actions: totalActions,
            most_active_user: activeUsers.length ? activeUsers[0].name : 'N/A',
            avg_actions: users.length ? (totalActions / users.length).toFixed(1) : '0',
            active_users_count: activeUsers.length
        };

        res.json({ users, summary });
    });
});

app.get('/admin/activity/export', ensureAdmin, (req, res) => {
    const { range, from, to, dept } = req.query;
    let dateFrom;
    const now = new Date();
    if (range === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        dateFrom = d.toISOString();
    } else if (range === 'month') {
        const d = new Date(now); d.setMonth(d.getMonth() - 1);
        dateFrom = d.toISOString();
    } else if (range === 'custom' && from) {
        dateFrom = new Date(from).toISOString();
    } else {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
    const dateTo = (range === 'custom' && to) ? new Date(to + 'T23:59:59').toISOString() : now.toISOString();
    const deptFilter = dept && dept !== 'all' ? dept : null;

    const sql = `
        SELECT u.name, u.email, u.department,
            (SELECT COUNT(*) FROM call_log WHERE user_id=u.id AND created_at >= ? AND created_at <= ?) as calls,
            (SELECT COUNT(*) FROM workspace_tracked_items WHERE user_id=u.id AND created_at >= ? AND created_at <= ?) as items_added,
            (SELECT COUNT(*) FROM workspace_tracked_items WHERE user_id=u.id AND status='completed' AND updated_at >= ? AND updated_at <= ?) as items_completed,
            (SELECT COUNT(*) FROM workspace_notes WHERE user_id=u.id AND created_at >= ? AND created_at <= ?) as notes,
            (SELECT COUNT(*) FROM saved_news WHERE user_id=u.id AND saved_at >= ? AND saved_at <= ?) as articles_saved,
            (SELECT COUNT(*) FROM spravochnik WHERE created_by=u.id AND created_at >= ? AND created_at <= ?) as spravochnik_entries
        FROM users u
        ${deptFilter ? "WHERE u.department = ?" : ""}
        ORDER BY u.name
    `;
    const params = [
        dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo,
        dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo
    ];
    if (deptFilter) params.push(deptFilter);

    db.all(sql, params, (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }

        let csv = 'Name,Email,Department,Calls,Items Added,Items Completed,Notes,Articles Saved,Spravochnik,Total\n';
        rows.forEach(r => {
            const total = r.calls + r.items_added + r.items_completed + r.notes + r.articles_saved + r.spravochnik_entries;
            csv += `"${r.name}","${r.email}","${r.department}",${r.calls},${r.items_added},${r.items_completed},${r.notes},${r.articles_saved},${r.spravochnik_entries},${total}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="activity_${range || 'today'}_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
    });
});

/* =========================
   👥 HR MODULE ROUTES
========================= */

// --- Intern Application (public, rate-limited) ---
app.post('/hr/intern-apply', authLimiter, (req, res) => {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const id = 'intern_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const hashedPw = bcrypt.hashSync(password, 10);
    const photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=128`;

    db.run(
        `INSERT INTO users (id, email, name, photo_url, password, department, role, approval_status, employment_status, phone)
         VALUES (?, ?, ?, ?, ?, 'General', 'viewer', 'pending', 'intern', ?)`,
        [id, email, name, photoUrl, hashedPw, phone || null],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered.' });
                console.error('DB Error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }
            // Notify HR about new intern application
            db.run(
                `INSERT INTO notifications (target_department, type, title, message, related_user_id)
                 VALUES ('HR', 'intern_application', 'New Intern Application', ?, ?)`,
                [`${name} (${email}) has applied as an intern.`, id]
            );
            // Email: notify HR about new intern
            db.all("SELECT email FROM users WHERE department = 'HR' AND approval_status = 'approved'", [], (e, hrs) => {
                if (hrs && hrs.length) mailer.sendMailToMany(hrs.map(h => h.email), 'New Intern Application', mailer.internApplyHREmail(name, email, phone));
            });
            res.json({ success: true, message: 'Application submitted. HR will review it shortly.' });
        }
    );
});

// --- HR Dashboard ---
app.get('/hr/dashboard', ensureHR, (req, res) => {
    const stats = {};
    db.serialize(() => {
        db.get("SELECT COUNT(*) as total FROM users WHERE approval_status = 'approved'", (err, r) => { stats.totalUsers = r ? r.total : 0; });
        db.get("SELECT COUNT(*) as total FROM users WHERE employment_status = 'intern'", (err, r) => { stats.interns = r ? r.total : 0; });
        db.get("SELECT COUNT(*) as total FROM users WHERE employment_status = 'on_hold'", (err, r) => { stats.onHold = r ? r.total : 0; });
        db.get("SELECT COUNT(*) as total FROM users WHERE employment_status = 'employee' AND approval_status = 'approved'", (err, r) => { stats.employees = r ? r.total : 0; });
        db.get("SELECT COUNT(*) as total FROM users WHERE approval_status = 'pending' AND employment_status = 'intern'", (err, r) => { stats.pendingInterns = r ? r.total : 0; });
        db.all(
            `SELECT u.id, u.name, u.email, u.employment_status, u.trial_end_date,
                    CAST(julianday(u.trial_end_date) - julianday('now') AS INTEGER) as days_left
             FROM users u
             WHERE u.employment_status = 'on_hold' AND u.trial_end_date IS NOT NULL
             AND julianday(u.trial_end_date) - julianday('now') <= 14
             ORDER BY u.trial_end_date ASC`,
            (err, rows) => {
                stats.trialWarnings = rows || [];
                res.json(stats);
            }
        );
    });
});

// --- HR Users List ---
app.get('/hr/users', ensureHR, (req, res) => {
    const { status, department, search } = req.query;
    let sql = `SELECT u.id, u.name, u.email, u.photo_url, u.department, u.role,
                      u.approval_status, u.employment_status, u.phone,
                      u.trial_start_date, u.trial_end_date, u.target_department, u.created_at,
                      (SELECT COUNT(*) FROM user_documents d WHERE d.user_id = u.id AND d.doc_type != 'certificate') as doc_count,
                      (SELECT COUNT(*) FROM user_documents d WHERE d.user_id = u.id AND d.doc_type = 'certificate') as cert_count
               FROM users u WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND u.employment_status = ?`; params.push(status); }
    if (department) { sql += ` AND u.department = ?`; params.push(department); }
    if (search) { sql += ` AND (u.name LIKE ? OR u.email LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    sql += ` ORDER BY u.created_at DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        res.json({ users: rows || [] });
    });
});

// --- User Documents ---
app.get('/hr/users/:id/documents', ensureAuth, (req, res) => {
    const userId = req.params.id;
    // HR can view anyone's docs; users can view their own
    if (req.user.department !== 'HR' && req.user.role !== 'admin' && req.user.id !== userId) {
        return res.status(403).json({ error: 'Access denied.' });
    }
    db.all("SELECT * FROM user_documents WHERE user_id = ? ORDER BY created_at DESC", [userId], (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        res.json({ documents: rows || [] });
    });
});

// --- My Document Status (for interns to check upload progress) ---
app.get('/hr/documents/my-status', ensureAuth, (req, res) => {
    db.all("SELECT doc_type, id, original_name, created_at FROM user_documents WHERE user_id = ?", [req.user.id], (err, rows) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        const uploaded = {};
        (rows || []).forEach(r => { uploaded[r.doc_type] = { id: r.id, name: r.original_name, date: r.created_at }; });
        res.json({ uploaded });
    });
});

// --- Upload Document ---
app.post('/hr/documents/upload', ensureAuth, documentUpload.single('document'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    // Compress uploaded images (photo_3x4, passport scans, etc.) — PDFs are skipped automatically
    await compressImage(req.file.path, { maxWidth: 1200, quality: 75 });

    const docType = req.body.doc_type || 'certificate';
    const label = req.body.label || null;
    const actualSize = fs.statSync(req.file.path).size; // Get size after compression
    const filePath = `/uploads/documents/${req.user.id}/${req.file.filename}`;

    db.run(
        `INSERT INTO user_documents (user_id, doc_type, original_name, file_path, file_size, mime_type, label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, docType, req.file.originalname, filePath, actualSize, req.file.mimetype, label],
        function(err) {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }

            // Check if intern has all required docs uploaded
            if (req.user.employment_status === 'intern') {
                const requiredTypes = ['photo_3x4', 'passport', 'inn', 'diploma', 'resume'];
                db.all("SELECT DISTINCT doc_type FROM user_documents WHERE user_id = ? AND doc_type IN ('photo_3x4','passport','inn','diploma','resume')",
                    [req.user.id], (err2, rows) => {
                        const uploadedTypes = (rows || []).map(r => r.doc_type);
                        if (requiredTypes.every(t => uploadedTypes.includes(t))) {
                            db.run(
                                `INSERT INTO notifications (target_department, type, title, message, related_user_id)
                                 VALUES ('HR', 'intern_docs_uploaded', 'Documents Uploaded', ?, ?)`,
                                [`${req.user.name} has uploaded all required documents.`, req.user.id]
                            );
                            // Email: notify HR that intern docs are ready
                            db.all("SELECT email FROM users WHERE department = 'HR' AND approval_status = 'approved'", [], (e, hrs) => {
                                if (hrs && hrs.length) mailer.sendMailToMany(hrs.map(h => h.email), 'Intern Documents Uploaded', mailer.docsUploadedHREmail(req.user.name));
                            });
                        }
                    }
                );
            }

            res.json({ success: true, id: this.lastID, file_path: filePath, doc_type: docType });
        }
    );
});

// --- Serve document files (authenticated) ---
app.get('/uploads/documents/:userId/:filename', ensureAuth, (req, res) => {
    const { userId, filename } = req.params;
    // Allow: HR, admin, self, or assigned mentor
    if (req.user.department === 'HR' || req.user.role === 'admin' || req.user.id === userId) {
        const filePath = path.join(documentsDir, userId, filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
        return res.sendFile(filePath);
    }
    // Check if the requesting user is assigned as mentor for this intern
    db.get("SELECT id FROM intern_assignments WHERE intern_id = ? AND assigned_to = ? AND status = 'active'",
        [userId, req.user.id], (err, assignment) => {
            if (err || !assignment) return res.status(403).json({ error: 'Access denied.' });
            const filePath = path.join(documentsDir, userId, filename);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
            res.sendFile(filePath);
        }
    );
});

// --- Delete Document ---
app.delete('/hr/documents/:docId', ensureAuth, (req, res) => {
    db.get("SELECT * FROM user_documents WHERE id = ?", [req.params.docId], (err, doc) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (!doc) return res.status(404).json({ error: 'Document not found.' });
        if (req.user.department !== 'HR' && req.user.role !== 'admin' && req.user.id !== doc.user_id) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        // Delete file from disk
        const fullPath = path.join(__dirname, doc.file_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        db.run("DELETE FROM user_documents WHERE id = ?", [req.params.docId], (err2) => {
            if (err2) { console.error('DB Error:', err2); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ success: true });
        });
    });
});

// --- Approve Intern ---
app.put('/hr/users/:id/approve-intern', ensureHR, (req, res) => {
    db.run("UPDATE users SET approval_status = 'approved' WHERE id = ? AND employment_status = 'intern'",
        [req.params.id], function(err) {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            if (this.changes === 0) return res.status(404).json({ error: 'Intern not found.' });
            db.run(
                `INSERT INTO notifications (target_user_id, type, title, message, related_user_id)
                 VALUES (?, 'intern_approved', 'Application Approved', 'Your intern application has been approved! Please upload your required documents.', ?)`,
                [req.params.id, req.params.id]
            );
            // Email: notify intern they're approved
            db.get("SELECT name, email FROM users WHERE id = ?", [req.params.id], (e, intern) => {
                if (intern) mailer.sendMail(intern.email, 'Internship Approved!', mailer.internApprovedEmail(intern.name));
            });
            res.json({ success: true });
        }
    );
});

// --- Change Employment Status ---
app.put('/hr/users/:id/status', ensureHR, (req, res) => {
    const { employment_status, target_department } = req.body;
    const validStatuses = ['intern', 'on_hold', 'employee'];
    if (!validStatuses.includes(employment_status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }

    db.get("SELECT * FROM users WHERE id = ?", [req.params.id], (err, user) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (!user) return res.status(404).json({ error: 'User not found.' });

        let updates = "employment_status = ?";
        const params = [employment_status];

        if (employment_status === 'on_hold') {
            const now = new Date();
            const trialEnd = new Date(now);
            trialEnd.setMonth(trialEnd.getMonth() + 3);
            updates += ", trial_start_date = ?, trial_end_date = ?";
            params.push(now.toISOString().split('T')[0], trialEnd.toISOString().split('T')[0]);

            if (target_department) {
                updates += ", target_department = ?, department = ?";
                params.push(target_department, target_department);
            }
        } else if (employment_status === 'employee') {
            updates += ", trial_start_date = NULL, trial_end_date = NULL";
        }

        params.push(req.params.id);
        db.run(`UPDATE users SET ${updates} WHERE id = ?`, params, function(err2) {
            if (err2) { console.error('DB Error:', err2); return res.status(500).json({ error: 'Internal server error' }); }

            // Create notifications based on status change
            if (employment_status === 'on_hold' && target_department) {
                // Notify Administrative Affairs
                db.run(
                    `INSERT INTO notifications (target_department, type, title, message, related_user_id)
                     VALUES ('Administrative Affairs', 'admin_affairs_prep', 'New Staff Incoming', ?, ?)`,
                    [`${user.name} is joining ${target_department}. Please prepare workspace (computer, desk, chair, keyboard).`, req.params.id]
                );
                // Notify target department head
                db.run(
                    `INSERT INTO notifications (target_department, target_role, type, title, message, related_user_id)
                     VALUES (?, 'head', 'new_team_member', 'New Team Member', ?, ?)`,
                    [target_department, `${user.name} has been assigned to your department as a trial member.`, req.params.id]
                );
            } else if (employment_status === 'employee') {
                db.run(
                    `INSERT INTO notifications (target_user_id, type, title, message, related_user_id)
                     VALUES (?, 'status_change', 'Congratulations!', 'You are now an official employee of IT Park.', ?)`,
                    [req.params.id, req.params.id]
                );
            }

            // Email: notify user about status change
            mailer.sendMail(user.email, employment_status === 'employee' ? 'Welcome Aboard!' : 'Trial Period Started', mailer.statusChangeEmail(user.name, employment_status, target_department));

            res.json({ success: true, employment_status });
        });
    });
});

// --- Assign Intern to Team Member ---
app.post('/hr/users/:id/assign', ensureHR, (req, res) => {
    const { assigned_to, notes } = req.body;
    if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required.' });

    db.get("SELECT * FROM users WHERE id = ?", [req.params.id], (err, intern) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (!intern) return res.status(404).json({ error: 'Intern not found.' });

        // Fetch intern's uploaded documents to include in the task
        db.all("SELECT doc_type, original_name, file_path, label FROM user_documents WHERE user_id = ?", [req.params.id], (errDocs, docs) => {
            // Build document list with download links
            const docList = (docs || []).map(d => {
                const typeName = (d.label || d.doc_type).replace(/_/g, ' ');
                return `- ${typeName}: ${d.original_name} [DOWNLOAD:${d.file_path}]`;
            }).join('\n');

            const description = [
                `HR has assigned intern ${intern.name} (${intern.email}) to you for mentoring.`,
                intern.phone ? `Phone: ${intern.phone}` : '',
                intern.department ? `Department: ${intern.department}` : '',
                intern.trial_start_date ? `Trial Period: ${intern.trial_start_date} — ${intern.trial_end_date}` : '',
                notes ? `\nHR Notes: ${notes}` : '',
                docList ? `\nUploaded Documents:\n${docList}` : '\nNo documents uploaded yet.'
            ].filter(Boolean).join('\n');

            db.run(
                `INSERT INTO intern_assignments (intern_id, assigned_to, assigned_by, department, notes)
                 VALUES (?, ?, ?, ?, ?)`,
                [req.params.id, assigned_to, req.user.id, intern.department, notes || null],
                function(err2) {
                    if (err2) { console.error('DB Error:', err2); return res.status(500).json({ error: 'Internal server error' }); }

                    // Create task with full intern info + documents + metadata
                    db.run(
                        `INSERT INTO tasks (title, description, assigned_to, assigned_by, department, priority, status, deadline)
                         VALUES (?, ?, ?, ?, ?, 'high', 'pending', ?)`,
                        [
                            `Mentor Intern: ${intern.name}`,
                            description,
                            assigned_to, req.user.id, intern.department,
                            intern.trial_end_date || null
                        ]
                    );

                    // Notify the assigned member with document info
                    const notifMsg = `HR assigned intern ${intern.name} (${intern.email}) to you for mentoring.` +
                        (docList ? ` Documents: ${(docs || []).length} file(s) uploaded.` : ' No documents yet.');
                    db.run(
                        `INSERT INTO notifications (target_user_id, type, title, message, related_user_id)
                         VALUES (?, 'intern_assigned', 'Intern Assigned to You', ?, ?)`,
                        [assigned_to, notifMsg, req.params.id]
                    );

                    // Email: notify mentor about assignment
                    db.get("SELECT name, email FROM users WHERE id = ?", [assigned_to], (e, mentor) => {
                        if (mentor) mailer.sendMail(mentor.email, 'New Intern Assignment', mailer.assignmentEmail(intern.name, mentor.name, intern.department, notes));
                    });

                    res.json({ success: true, id: this.lastID, documents: (docs || []).map(d => ({ type: (d.label || d.doc_type).replace(/_/g, ' '), name: d.original_name, path: d.file_path })) });
                }
            );
        });
    });
});

// --- HR Notifications ---
app.get('/hr/notifications', ensureAuth, (req, res) => {
    db.all(
        `SELECT * FROM notifications
         WHERE target_user_id = ?
            OR (target_department = ? AND (target_role IS NULL OR target_role = ?))
            OR (target_department IS NULL AND target_user_id IS NULL AND target_role = ?)
         ORDER BY created_at DESC LIMIT 50`,
        [req.user.id, req.user.department, req.user.role, req.user.role],
        (err, rows) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ notifications: rows || [] });
        }
    );
});

app.put('/hr/notifications/:id/read', ensureAuth, (req, res) => {
    db.run("UPDATE notifications SET is_read = 1 WHERE id = ?", [req.params.id], (err) => {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        res.json({ success: true });
    });
});

app.get('/hr/notifications/unread-count', ensureAuth, (req, res) => {
    db.get(
        `SELECT COUNT(*) as count FROM notifications
         WHERE is_read = 0 AND (
            target_user_id = ?
            OR (target_department = ? AND (target_role IS NULL OR target_role = ?))
         )`,
        [req.user.id, req.user.department, req.user.role],
        (err, row) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ count: row ? row.count : 0 });
        }
    );
});

// --- Administrative Affairs: Incoming staff preparations ---
app.get('/hr/admin-affairs/preparations', ensureAdminAffairs, (req, res) => {
    db.all(
        `SELECT id, name, email, phone, target_department, trial_start_date, trial_end_date, employment_status
         FROM users WHERE employment_status = 'on_hold' ORDER BY trial_start_date DESC`,
        (err, rows) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ preparations: rows || [] });
        }
    );
});

// --- Get department members (for intern assignment dropdown) ---
app.get('/hr/department-members', ensureHR, (req, res) => {
    const { department } = req.query;
    if (!department) return res.status(400).json({ error: 'Department required.' });
    db.all(
        "SELECT id, name, email, role FROM users WHERE department = ? AND approval_status = 'approved' ORDER BY name",
        [department],
        (err, rows) => {
            if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
            res.json({ members: rows || [] });
        }
    );
});

// Admin Maker (protected — only existing admins can promote users)
app.get('/make-me-admin', ensureAdmin, (req, res) => {
    const email = req.query.email;
    if(!email) return res.status(400).json({ error: "Provide email" });
    db.run("UPDATE users SET role = 'admin' WHERE email = ?", [email], function(err) {
        if (err) { console.error('DB Error:', err); return res.status(500).json({ error: 'Internal server error' }); }
        if (this.changes === 0) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, message: `User ${email} is now an Admin.` });
    });
});

/* =========================
   ⏰ TRIAL PERIOD CRON
========================= */
function checkTrialWarnings() {
    const now = new Date();
    const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const in5d = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 14-day warning
    db.all("SELECT * FROM users WHERE employment_status = 'on_hold' AND trial_end_date = ?", [in14d], (err, users) => {
        if (err || !users) return;
        users.forEach(u => {
            db.get("SELECT id FROM notifications WHERE related_user_id = ? AND type = 'trial_warning_14d' AND DATE(created_at) = DATE('now')",
                [u.id], (err2, existing) => {
                    if (!existing) {
                        db.run(`INSERT INTO notifications (target_department, type, title, message, related_user_id)
                                VALUES ('HR', 'trial_warning_14d', 'Trial Period Warning', ?, ?)`,
                            [`${u.name}'s trial period ends in 14 days (${u.trial_end_date}).`, u.id]);
                        // Email: 14-day trial warning to HR
                        db.all("SELECT email FROM users WHERE department = 'HR' AND approval_status = 'approved'", [], (e, hrs) => {
                            if (hrs && hrs.length) mailer.sendMailToMany(hrs.map(h => h.email), 'Trial Period Warning: ' + u.name, mailer.trialWarningEmail(u.name, 14));
                        });
                    }
                });
        });
    });

    // 5-day warning
    db.all("SELECT * FROM users WHERE employment_status = 'on_hold' AND trial_end_date = ?", [in5d], (err, users) => {
        if (err || !users) return;
        users.forEach(u => {
            db.get("SELECT id FROM notifications WHERE related_user_id = ? AND type = 'trial_warning_5d' AND DATE(created_at) = DATE('now')",
                [u.id], (err2, existing) => {
                    if (!existing) {
                        db.run(`INSERT INTO notifications (target_department, type, title, message, related_user_id)
                                VALUES ('HR', 'trial_warning_5d', 'URGENT: Trial Period Ending Soon', ?, ?)`,
                            [`${u.name}'s trial period ends in 5 days (${u.trial_end_date})!`, u.id]);
                        // Email: 5-day urgent trial warning to HR
                        db.all("SELECT email FROM users WHERE department = 'HR' AND approval_status = 'approved'", [], (e, hrs) => {
                            if (hrs && hrs.length) mailer.sendMailToMany(hrs.map(h => h.email), 'URGENT: Trial Ending Soon — ' + u.name, mailer.trialWarningEmail(u.name, 5));
                        });
                    }
                });
        });
    });
}
// Run daily (every 24h) + once on startup
setTimeout(checkTrialWarnings, 5000);
setInterval(checkTrialWarnings, 24 * 60 * 60 * 1000);

// Serves the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- Storage Monitoring (HR/Admin only) ---
function getDirSize(dirPath) {
    let totalSize = 0;
    if (!fs.existsSync(dirPath)) return 0;
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        if (item.isDirectory()) totalSize += getDirSize(fullPath);
        else totalSize += fs.statSync(fullPath).size;
    }
    return totalSize;
}

app.get('/hr/storage', ensureHR, (req, res) => {
    const avatarsSize = getDirSize(avatarsDir);
    const announcementsSize = getDirSize(announcementsDir);
    const documentsSize = getDirSize(documentsDir);
    const totalSize = avatarsSize + announcementsSize + documentsSize;
    const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2);

    db.get("SELECT COUNT(*) as count FROM user_documents", [], (err, docRow) => {
        res.json({
            total_mb: formatMB(totalSize),
            avatars_mb: formatMB(avatarsSize),
            announcements_mb: formatMB(announcementsSize),
            documents_mb: formatMB(documentsSize),
            total_documents: docRow ? docRow.count : 0,
            limit_mb: 2048, // 2GB
            usage_percent: ((totalSize / (2048 * 1024 * 1024)) * 100).toFixed(1)
        });
    });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Multer error handler (file too large, wrong type, etc.)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
    }
    if (err && err.message && err.message.includes('Only PDF')) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

// ----------------------------------------------------
// 🚀 VERCEL CONFIGURATION (Keep this at the bottom)
// ----------------------------------------------------

// Export the Express API for Vercel
module.exports = app;

// Phusion Passenger (cPanel hosting)
if (typeof(PhusionPassenger) !== 'undefined') {
    PhusionPassenger.configure({ autoInstall: false });
    app.listen('passenger', () => console.log('🚀 App started via Passenger'));
} else if (require.main === module) {
    // Local development
    app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
}
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/* =========================================
   📂 DATABASE PATH SETUP
   ========================================= */
const dbDir = path.join(__dirname, '../database');
const dbSource = path.join(dbDir, 'news.db');
let dbPath = dbSource;

// Ensure the database directory exists (critical for fresh deployments like Render)
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('📁 Created database directory:', dbDir);
}

// If running on Vercel, swap to /tmp (Vercel filesystem is read-only)
if (process.env.VERCEL) {
    const tmpDbPath = '/tmp/news.db';
    if (!fs.existsSync(tmpDbPath) && fs.existsSync(dbSource)) {
        fs.writeFileSync(tmpDbPath, fs.readFileSync(dbSource));
        console.log('✅ Database copied to /tmp for Vercel write access');
    }
    dbPath = tmpDbPath;
}

/* =========================================
   🔌 DATABASE CONNECTION
   ========================================= */
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database Connection Error:', err.message);
    } else {
        console.log('✅ Connected to SQLite at:', dbPath);
        initializeTables(); // Ensure tables & data exist
    }
});

/* =========================================
   🛠️ SCHEMA & SEEDING
   ========================================= */
function initializeTables() {
    db.serialize(() => {
        // 1. USERS TABLE
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, 
            email TEXT UNIQUE,
            name TEXT, 
            photo_url TEXT, 
            password TEXT, 
            department TEXT DEFAULT 'General', 
            role TEXT DEFAULT 'viewer', 
            google_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. SAVED NEWS TABLE
        db.run(`CREATE TABLE IF NOT EXISTS saved_news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT, 
            news_id TEXT, 
            title TEXT, 
            description TEXT, 
            url TEXT, 
            image TEXT, 
            source TEXT, 
            topic TEXT, 
            published_at TEXT, 
            saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, news_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // 3. NLA (Legislation) TABLE
        db.run(`CREATE TABLE IF NOT EXISTS nla (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            country_code TEXT, 
            country_name TEXT, 
            title TEXT, 
            legal_issuer TEXT, 
            legal_topic TEXT, 
            enactment_date TEXT,
            full_text TEXT, 
            source_url TEXT
        )`, () => seedNLA());

        // 4. STATISTICS TABLE
        db.run(`CREATE TABLE IF NOT EXISTS statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            country_code TEXT, country_name TEXT, entity_name TEXT, 
            metric_name TEXT, metric_value TEXT, source TEXT, url TEXT
        )`, () => seedStats());
    });
}

// --- 🌱 SEEDERS (Only runs if tables are empty) ---

function seedNLA() {
    db.get("SELECT count(*) as count FROM nla", (err, row) => {
        if (err || row.count > 0) return; // Skip if data exists

        const data = [
            // 🇺🇿 UZBEKISTAN
            { c: 'uz', cn: 'Uzbekistan', t: 'Decree UP-6079 "Digital Uzbekistan 2030"', i: 'President', top: 'Strategy', date: '2020-10-05', txt: 'The national strategy approved by the President. Key Goals:\n- 100% digitalization of public services.\n- Introduction of Digital ID.\n- 2% of local budgets allocated to digital development.', u: 'https://lex.uz/docs/5030957' },
            { c: 'uz', cn: 'Uzbekistan', t: 'Decree PF-5099 "On Measures to Improve IT Industry"', i: 'President', top: 'Tax', date: '2017-06-30', txt: 'Established the 0% tax regime for residents until 2028 and defined the list of permitted activities.', u: 'https://lex.uz/docs/3252608' },
            { c: 'uz', cn: 'Uzbekistan', t: 'Resolution PP-4699 "Digital Economy and E-Government"', i: 'President', top: 'E-Gov', date: '2020-04-28', txt: 'Mandates the integration of AI into public administration.', u: 'https://lex.uz/docs/4800657' },
            
            // 🇰🇿 KAZAKHSTAN
            { c: 'kz', cn: 'Kazakhstan', t: 'Entrepreneurial Code (Article 294)', i: 'Parliament', top: 'Tax', date: '2015-10-29', txt: 'Legal basis for the "Special Economic Zone" status of Astana Hub.', u: 'https://adilet.zan.kz' },
            { c: 'kz', cn: 'Kazakhstan', t: 'Law "On Digital Assets"', i: 'Parliament', top: 'Crypto', date: '2023-02-06', txt: 'Regulates mining and the circulation of secured and unsecured digital assets.', u: 'https://adilet.zan.kz' },

            // 🇬🇧 UK
            { c: 'gb', cn: 'UK', t: 'Online Safety Act 2023', i: 'Parliament', top: 'AI', date: '2023-10-26', txt: 'Imposes duties on providers of user-to-user services to prevent illegal content.', u: 'https://legislation.gov.uk' }
        ];

        const stmt = db.prepare("INSERT INTO nla (country_code, country_name, title, legal_issuer, legal_topic, enactment_date, full_text, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        data.forEach(item => stmt.run(item.c, item.cn, item.t, item.i, item.top, item.date, item.txt, item.u));
        stmt.finalize();
        console.log("✅ NLA Data Seeded");
    });
}

function seedStats() {
    db.get("SELECT count(*) as count FROM statistics", (err, row) => {
        if (err || row.count > 0) return;

        const data = [
            { c: 'uz', cn: 'Uzbekistan', e: 'IT Park', m: 'Residents', v: '1,800+', s: 'IT Park', u: 'https://it-park.uz' },
            { c: 'uz', cn: 'Uzbekistan', e: 'IT Park', m: 'Export Volume', v: '$344 Million (2023)', s: 'IT Park', u: '' },
            { c: 'kz', cn: 'Kazakhstan', e: 'Astana Hub', m: 'Residents', v: '2,000+ (Jan 2025)', s: 'Astana Hub', u: 'https://astanahub.com' },
            { c: 'kz', cn: 'Kazakhstan', e: 'Astana Hub', m: 'IT Exports', v: '$500 Million (2024)', s: 'Astana Hub', u: '' },
            { c: 'sg', cn: 'Singapore', e: 'Startups', m: 'Total Funded', v: '4,000+', s: 'SingStat', u: '' },
            { c: 'ee', cn: 'Estonia', e: 'e-Residency', m: 'Tax Revenue', v: '€66.8M (2024)', s: 'Dashboard', u: '' }
        ];

        const stmt = db.prepare("INSERT INTO statistics (country_code, country_name, entity_name, metric_name, metric_value, source, url) VALUES (?, ?, ?, ?, ?, ?, ?)");
        data.forEach(item => stmt.run(item.c, item.cn, item.e, item.m, item.v, item.s, item.u));
        stmt.finalize();
        console.log("✅ Stats Data Seeded");
    });
}

module.exports = db;
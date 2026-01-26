const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../database/news.db');
const dbFolder = path.dirname(dbPath);

if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err.message);
    else console.log("✅ Connected to the SQLite database at:", dbPath);
});

db.serialize(() => {
    // 1. USERS TABLE
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, email TEXT, photo_url TEXT, 
        password TEXT, department TEXT DEFAULT 'General', role TEXT DEFAULT 'viewer', 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. SAVED NEWS TABLE
    db.run(`CREATE TABLE IF NOT EXISTS saved_news (
        user_id TEXT, news_id TEXT, title TEXT, description TEXT, url TEXT, 
        image TEXT, source TEXT, topic TEXT, published_at TEXT, 
        saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, news_id), FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // 3. NLA (Legislation) TABLE - RICH SCHEMA
    db.run(`CREATE TABLE IF NOT EXISTS nla (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        country_code TEXT, 
        country_name TEXT, 
        title TEXT, 
        legal_issuer TEXT,  -- 'President', 'Parliament', 'Cabinet', 'Ministry', 'Agency'
        legal_topic TEXT,   -- 'Grants', 'Budget', 'Tax', 'AI', 'Crypto', 'Visa'
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

// --- 🌍 MASSIVE LEGISLATIVE DATABASE SEEDING ---

// ... inside db.js ...

function seedNLA() {
    db.get("SELECT count(*) as count FROM nla", (err, row) => {
        if (row.count > 0) return; 

        const data = [
            // ============================================================
            // 🇺🇿 UZBEKISTAN - PRESIDENT (O'zbekiston Respublikasi Prezidenti)
            // ============================================================
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Decree UP-6079 "Digital Uzbekistan 2030"', 
                i: 'President', top: 'Strategy', date: '2020-10-05',
                txt: 'The national strategy approved by the President. Key Goals:\n- 100% digitalization of public services.\n- Introduction of Digital ID.\n- 2% of local budgets allocated to digital development.\n- Creation of IT Park branches in every region.',
                u: 'https://lex.uz/docs/5030957'
            },
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Decree PF-5099 "On Measures to Radically Improve the Conditions for the Development of the IT Industry"', 
                i: 'President', top: 'Tax', date: '2017-06-30',
                txt: 'The foundational decree creating "Mirzo Ulugbek Innovation Center" (precursor to IT Park). Established the 0% tax regime for residents until 2028 and defined the list of permitted activities.',
                u: 'https://lex.uz/docs/3252608'
            },
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Resolution PP-4699 "On Measures for the Further Development of the Digital Economy and E-Government"', 
                i: 'President', top: 'E-Gov', date: '2020-04-28',
                txt: 'Mandates the integration of AI into public administration. Defines the role of the Ministry of Digital Technologies (formerly MITC) as the authorized body for e-government.',
                u: 'https://lex.uz/docs/4800657'
            },
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Decree UP-165 "On Strategy of Development of New Uzbekistan for 2022-2026"', 
                i: 'President', top: 'Strategy', date: '2022-01-28',
                txt: 'Goal 25: Increase the volume of the digital economy by at least 2.5 times. Increase software export volume to $500 million. Bring the level of digitalization of production processes to 70%.',
                u: 'https://lex.uz/docs/5841063'
            },

            // ============================================================
            // 🇺🇿 UZBEKISTAN - CABINET OF MINISTERS (Vazirlar Mahkamasi)
            // ============================================================
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Resolution No. 402 "On Measures to Create the IT Park"', 
                i: 'Cabinet', top: 'Infrastructure', date: '2019-01-10',
                txt: 'Officially establishes the "IT Park" Directorate. Defines the procedure for residency, the list of required documents, and the mechanism for paying the 1% revenue contribution to the IT Park Directorate.',
                u: 'https://lex.uz/docs/4143188'
            },
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Resolution No. 562 "On Measures to Support Youth in IT"', 
                i: 'Cabinet', top: 'Grants', date: '2021-08-31',
                txt: 'Introduces the mechanism for compensating up to 50% of the cost of obtaining international IT certificates (CISCO, Oracle, Microsoft) for young citizens.',
                u: 'https://lex.uz/docs/5612453'
            },
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Resolution No. 466 "Digital Startup Support Program"', 
                i: 'Cabinet', top: 'Grants', date: '2023-08-15',
                txt: 'Approves the regulation on allocating state grants to startups. Includes criteria for selection: innovation, scalability, and local team composition (51% residents).',
                u: 'https://lex.uz/docs/4971932'
            },

            // ============================================================
            // 🇺🇿 UZBEKISTAN - PARLIAMENT (Oliy Majlis)
            // ============================================================
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Law ZRU-547 "On Personal Data"', 
                i: 'Parliament', top: 'Data', date: '2019-07-02',
                txt: 'Article 27-1 (Data Localization): Requires owners and operators to ensure the collection, systematization, and storage of personal data of Uzbek citizens takes place physically on servers located within Uzbekistan.',
                u: 'https://lex.uz/docs/4396428'
            },
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Law ZRU-660 "On Investments and Investment Activities"', 
                i: 'Parliament', top: 'Investment', date: '2019-12-25',
                txt: 'Guarantees protection for foreign investors. Article 19 specifically allows investors to repatriate profits freely in foreign currency after paying taxes.',
                u: 'https://lex.uz/docs/4664142'
            },
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Tax Code of the Republic of Uzbekistan (Special Part)', 
                i: 'Parliament', top: 'Tax', date: '2020-01-01',
                txt: 'Section on Special Tax Regimes. Validates the exemptions granted by Presidential decrees for IT Park residents, overriding general tax rates.',
                u: 'https://lex.uz/docs/4674902'
            },

            // ============================================================
            // 🇺🇿 UZBEKISTAN - AGENCY (NAPP / Digital Ministry)
            // ============================================================
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'NAPP Order No. 3205 "On Licensing Crypto-Asset Turnover"', 
                i: 'Agency (NAPP)', top: 'Crypto', date: '2022-08-15',
                txt: 'Detailed regulation on how to open a Crypto Exchange or Store in Uzbekistan. Sets capital requirements and fees. Bans the use of crypto as a means of payment for goods/services within the country.',
                u: 'https://lex.uz/docs/6166548'
            },
            { 
                c: 'uz', cn: 'Uzbekistan', t: 'Ministry Order "On Requirements for Data Centers"', 
                i: 'Ministry', top: 'Infrastructure', date: '2021-04-12',
                txt: 'Technical requirements for data centers hosting government data. Mandates Tier III equivalent reliability and physical security protocols.',
                u: 'https://lex.uz'
            },

            // ============================================================
            // 🇰🇿 KAZAKHSTAN (Competitor Analysis)
            // ============================================================
            { 
                c: 'kz', cn: 'Kazakhstan', t: 'Entrepreneurial Code (Article 294)', 
                i: 'Parliament', top: 'Tax', date: '2015-10-29',
                txt: 'Legal basis for the "Special Economic Zone" status of Astana Hub. Defines the "Exterritoriality" principle allowing residents to work from any city.',
                u: 'https://adilet.zan.kz'
            },
            { 
                c: 'kz', cn: 'Kazakhstan', t: 'Law "On Digital Assets"', 
                i: 'Parliament', top: 'Crypto', date: '2023-02-06',
                txt: 'Regulates mining and the circulation of secured and unsecured digital assets. Introduces licensing for miners and energy quotas.',
                u: 'https://adilet.zan.kz'
            },

            // ============================================================
            // 🇬🇧 UNITED KINGDOM (Global Best Practice)
            // ============================================================
            { 
                c: 'gb', cn: 'UK', t: 'Online Safety Act 2023', 
                i: 'Parliament', top: 'AI', date: '2023-10-26',
                txt: 'Imposes duties on providers of user-to-user services to prevent illegal content and protect children. Relevant for IT Park residents exporting social apps to the UK.',
                u: 'https://legislation.gov.uk'
            }
        ];

        const stmt = db.prepare("INSERT INTO nla (country_code, country_name, title, legal_issuer, legal_topic, enactment_date, full_text, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        data.forEach(item => stmt.run(item.c, item.cn, item.t, item.i, item.top, item.date, item.txt, item.u));
        stmt.finalize();
        console.log("✅ NLA Enriched Database Seeded (Lex.uz Integrated)");
    });
}

function seedStats() {
    db.get("SELECT count(*) as count FROM statistics", (err, row) => {
        if (row.count > 0) return;

        const data = [
            // KAZAKHSTAN
            { c: 'kz', cn: 'Kazakhstan', e: 'Astana Hub', m: 'Residents', v: '2,000+ (Jan 2025)', s: 'Astana Hub Reports', u: 'https://astanahub.com' },
            { c: 'kz', cn: 'Kazakhstan', e: 'Astana Hub', m: 'IT Exports', v: '$500 Million (2024)', s: 'Astana Hub Reports', u: '' },
            { c: 'kz', cn: 'Kazakhstan', e: 'Venture Capital', m: 'Deal Volume', v: '$80M (2024)', s: 'MOST Ventures', u: '' },
            // UZBEKISTAN
            { c: 'uz', cn: 'Uzbekistan', e: 'IT Park', m: 'Residents', v: '1,800+', s: 'IT Park', u: 'https://it-park.uz' },
            { c: 'uz', cn: 'Uzbekistan', e: 'IT Park', m: 'Export Volume', v: '$344 Million (2023)', s: 'IT Park', u: '' },
            { c: 'uz', cn: 'Uzbekistan', e: 'Digital Gov', m: 'MyGov Users', v: '8 Million+', s: 'Digital Ministry', u: '' },
            // SINGAPORE
            { c: 'sg', cn: 'Singapore', e: 'Startups', m: 'Total Funded', v: '4,000+', s: 'SingStat', u: '' },
            { c: 'sg', cn: 'Singapore', e: 'AI Sector', m: 'Gov Investment', v: '$1 Billion (thru 2030)', s: 'Budget 2026', u: '' },
            // ESTONIA
            { c: 'ee', cn: 'Estonia', e: 'e-Residency', m: 'Total e-Residents', v: '130,000+', s: 'Dashboard', u: 'https://e-resident.gov.ee' },
            { c: 'ee', cn: 'Estonia', e: 'e-Residency', m: 'Tax Revenue', v: '€66.8M (2024)', s: 'Dashboard', u: '' },
            // BELARUS
            { c: 'by', cn: 'Belarus', e: 'Hi-Tech Park', m: 'Exports', v: '$2.5 Billion+', s: 'National Bank', u: '' },
            { c: 'by', cn: 'Belarus', e: 'Hi-Tech Park', m: 'GDP Share', v: '4.5%', s: 'BelStat', u: '' }
        ];

        const stmt = db.prepare("INSERT INTO statistics (country_code, country_name, entity_name, metric_name, metric_value, source, url) VALUES (?, ?, ?, ?, ?, ?, ?)");
        data.forEach(item => stmt.run(item.c, item.cn, item.e, item.m, item.v, item.s, item.u));
        stmt.finalize();
        console.log("✅ Stats Data Seeded");
    });
}

module.exports = db;
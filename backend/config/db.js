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
            approval_status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Migration: add google_id column if missing
        db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`, (err) => {
            // ignore "duplicate column" error — means it already exists
        });

        // Migration: add approval_status column if missing
        db.run(`ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'pending'`, (err) => {
            if (!err) {
                // New column added — auto-approve existing admins
                db.run(`UPDATE users SET approval_status = 'approved' WHERE role = 'admin'`);
            }
        });

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

        // 5. WORKSPACE TRACKED ITEMS
        db.run(`CREATE TABLE IF NOT EXISTS workspace_tracked_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            department TEXT NOT NULL,
            item_type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active',
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // 7. WORKSPACE NOTES
        db.run(`CREATE TABLE IF NOT EXISTS workspace_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tracked_item_id INTEGER,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(tracked_item_id) REFERENCES workspace_tracked_items(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // 8. SPRAVOCHNIK (department knowledge base / call scripts)
        db.run(`CREATE TABLE IF NOT EXISTS spravochnik (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            department TEXT NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(created_by) REFERENCES users(id)
        )`);

        // 9. OFFICE DIRECTORY
        db.run(`CREATE TABLE IF NOT EXISTS office_directory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            name TEXT NOT NULL,
            city TEXT NOT NULL,
            address TEXT,
            capacity TEXT,
            price_range TEXT,
            amenities TEXT,
            contact_phone TEXT,
            contact_email TEXT,
            website TEXT,
            status TEXT DEFAULT 'available',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => seedOffices());

        // 10. CALL LOG (for tracking client outreach)
        db.run(`CREATE TABLE IF NOT EXISTS call_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            lead_name TEXT NOT NULL,
            company_name TEXT,
            phone TEXT,
            email TEXT,
            call_result TEXT NOT NULL,
            interest_level TEXT DEFAULT 'medium',
            preferred_office TEXT,
            notes TEXT,
            follow_up_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // 11. AI SUMMARY CACHE
        db.run(`CREATE TABLE IF NOT EXISTS ai_summary_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT UNIQUE NOT NULL,
            department TEXT NOT NULL,
            summary_type TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL
        )`);

        // 12. ANNOUNCEMENTS TABLE (HR → all users)
        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            image_url TEXT,
            created_by TEXT NOT NULL,
            department TEXT DEFAULT 'HR',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(created_by) REFERENCES users(id)
        )`);

        // 13. ANNOUNCEMENT READ TRACKING
        db.run(`CREATE TABLE IF NOT EXISTS announcement_reads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            announcement_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(announcement_id, user_id),
            FOREIGN KEY(announcement_id) REFERENCES announcements(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // 14. TASKS TABLE (head → viewer task assignment)
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            assigned_to TEXT NOT NULL,
            assigned_by TEXT NOT NULL,
            department TEXT NOT NULL,
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'pending',
            deadline TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(assigned_to) REFERENCES users(id),
            FOREIGN KEY(assigned_by) REFERENCES users(id)
        )`);

        // 15. CHAT MESSAGES TABLE (personal 1-on-1) — migrate from old department schema
        db.run(`DROP TABLE IF EXISTS chat_messages`);
        db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id TEXT NOT NULL,
            receiver_id TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sender_id) REFERENCES users(id),
            FOREIGN KEY(receiver_id) REFERENCES users(id)
        )`);

        // 16. TELEGRAM GROUPS TABLE (for multi-group sharing)
        db.run(`CREATE TABLE IF NOT EXISTS telegram_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            added_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(added_by) REFERENCES users(id)
        )`);

        // 17. USER DOCUMENTS TABLE (intern docs + certificates)
        db.run(`CREATE TABLE IF NOT EXISTS user_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            doc_type TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            mime_type TEXT,
            label TEXT,
            verified_by TEXT,
            verified_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(verified_by) REFERENCES users(id)
        )`);

        // 18. NOTIFICATIONS TABLE (HR alerts, trial warnings, etc.)
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_user_id TEXT,
            target_department TEXT,
            target_role TEXT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            related_user_id TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(target_user_id) REFERENCES users(id),
            FOREIGN KEY(related_user_id) REFERENCES users(id)
        )`);

        // 19. INTERN ASSIGNMENTS TABLE (HR assigns intern to team member)
        db.run(`CREATE TABLE IF NOT EXISTS intern_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intern_id TEXT NOT NULL,
            assigned_to TEXT NOT NULL,
            assigned_by TEXT NOT NULL,
            department TEXT NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(intern_id) REFERENCES users(id),
            FOREIGN KEY(assigned_to) REFERENCES users(id),
            FOREIGN KEY(assigned_by) REFERENCES users(id)
        )`);

        // Migrations: add HR columns to users table
        db.run(`ALTER TABLE users ADD COLUMN employment_status TEXT DEFAULT 'employee'`, (err) => {
            if (!err) {
                db.run(`UPDATE users SET employment_status = 'employee' WHERE approval_status = 'approved' AND employment_status IS NULL`);
            }
        });
        db.run(`ALTER TABLE users ADD COLUMN trial_start_date TEXT`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN trial_end_date TEXT`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN target_department TEXT`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN phone TEXT`, () => {});
    });
}

// --- 🌱 SEEDERS (Only runs if tables are empty) ---

function seedNLA() {
    db.get("SELECT count(*) as count FROM nla", (err, row) => {
        if (err || row.count > 0) return; // Skip if data exists

        const data = [
            // 🇺🇿 UZBEKISTAN
            { c: 'uz', cn: 'Uzbekistan', t: 'Decree UP-6079 "Digital Uzbekistan 2030"', i: 'President', top: 'Strategy', date: '2020-10-05', txt: 'The national strategy approved by the President. Key Goals:\n- 100% digitalization of public services.\n- Introduction of Digital ID.\n- 2% of local budgets allocated to digital development.', u: 'https://lex.uz/docs/7008256' },
            { c: 'uz', cn: 'Uzbekistan', t: 'Decree PF-5099 "On Measures to Improve IT Industry"', i: 'President', top: 'Tax', date: '2017-06-30', txt: 'Established the 0% tax regime for residents until 2028 and defined the list of permitted activities.', u: 'https://lex.uz/docs/3249654' },
            { c: 'uz', cn: 'Uzbekistan', t: 'Resolution PP-4699 "Digital Economy and E-Government"', i: 'President', top: 'E-Gov', date: '2020-04-28', txt: 'Mandates the integration of AI into public administration.', u: 'https://lex.uz/docs/4800661' },

            // 🇰🇿 KAZAKHSTAN
            { c: 'kz', cn: 'Kazakhstan', t: 'Entrepreneurial Code (Article 294)', i: 'Parliament', top: 'Tax', date: '2015-10-29', txt: 'Legal basis for the "Special Economic Zone" status of Astana Hub.', u: 'https://adilet.zan.kz/eng/docs/K1500000375' },
            { c: 'kz', cn: 'Kazakhstan', t: 'Law "On Digital Assets"', i: 'Parliament', top: 'Crypto', date: '2023-02-06', txt: 'Regulates mining and the circulation of secured and unsecured digital assets.', u: 'https://adilet.zan.kz/eng/docs/Z2300000193' },

            // 🇬🇧 UK
            { c: 'gb', cn: 'UK', t: 'Online Safety Act 2023', i: 'Parliament', top: 'AI', date: '2023-10-26', txt: 'Imposes duties on providers of user-to-user services to prevent illegal content.', u: 'https://www.legislation.gov.uk/ukpga/2023/50' }
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

function seedOffices() {
    db.get("SELECT count(*) as count FROM office_directory", (err, row) => {
        if (err || row.count > 0) return;
        const offices = [
            // Shake&Pear
            { provider: 'Shake&Pear', name: 'Shake&Pear Coworking', city: 'Tashkent', address: 'A. Navoiy str. 11A, Tashkent, Uzbekistan 100000', capacity: 'Coworking desks, private offices, meeting rooms', price_range: '', amenities: 'High-speed WiFi, meeting rooms, lounge area', contact_phone: '+998 99 140 55 99', contact_email: '', website: '', status: 'available', notes: '' },

            // CSpace
            { provider: 'CSpace', name: 'CSpace Coworking', city: 'Tashkent', address: 'Ahmad Donish str. 20A, Tashkent 100180', capacity: '7 branches across Tashkent', price_range: '', amenities: 'High-speed WiFi, lounge, kitchen, printers, event space, community events', contact_phone: '+998 88 484 20 22', contact_email: 'info@cspace.uz', website: '', status: 'available', notes: '7 branches across Tashkent.' },

            // Groundzero
            { provider: 'Groundzero', name: 'Groundzero Coworking', city: 'Tashkent', address: '2nd Taraqqiyot passage 33, Tashkent', capacity: '3 branches across Tashkent', price_range: '', amenities: 'High-speed internet, conference rooms, kitchen, 24/7 access', contact_phone: '+998 90 830 30 35', contact_email: '', website: '', status: 'available', notes: '3 branches across Tashkent.' }
        ];

        const stmt = db.prepare("INSERT INTO office_directory (provider, name, city, address, capacity, price_range, amenities, contact_phone, contact_email, website, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        offices.forEach(o => stmt.run(o.provider, o.name, o.city, o.address, o.capacity, o.price_range, o.amenities, o.contact_phone, o.contact_email, o.website, o.status, o.notes));
        stmt.finalize();
        console.log("✅ Office Directory Seeded");
    });

    // Also seed default Softlanding spravochnik entries
    db.get("SELECT count(*) as count FROM spravochnik WHERE department = 'Softlanding'", (err, row) => {
        if (err || (row && row.count > 0)) return;
        const entries = [
            {
                cat: 'Call Script',
                title: 'Initial Outreach — New Lead',
                content: `GREETING:
"Assalomu alaykum! / Hello! My name is [YOUR NAME], I'm calling from IT Park Uzbekistan, Soft Landing Department. Am I speaking with [LEAD NAME]?"

CONFIRM INTEREST:
"We received your application regarding becoming an IT Park resident. Thank you for your interest! I'd like to tell you about the benefits and help you with the next steps."

KEY BENEFITS TO MENTION:
• 0% income tax, 0% property tax, 0% social fund contributions until 2028
• Simplified visa and work permit process for foreign employees
• Access to modern office spaces in Tashkent, Samarkand, Nukus, and Bukhara
• Dedicated account manager for your company
• Networking with 1,800+ tech companies already resident

OFFICE OPTIONS:
"We have several office options for you:
1. IT Park HQ in Tashkent — subsidized offices with full amenities
2. Partner coworkings: CSpace, Shakespeare, Ground Zero — flexible plans
3. Regional offices in Samarkand, Bukhara, Nukus"

QUALIFICATION QUESTIONS:
1. "What type of IT services does your company provide?"
2. "How many employees do you currently have?"
3. "When are you looking to start operations in Uzbekistan?"
4. "Do you need office space or can you operate remotely initially?"
5. "Are you looking at any specific city in Uzbekistan?"

NEXT STEPS:
"Based on our conversation, here is what happens next:
1. I'll send you the registration form and requirements via email
2. You submit the application with required documents
3. Our team reviews it within 5-10 business days
4. Once approved, we help with office setup and work permits"

CLOSING:
"Do you have any questions? Great, I'll send the details to your email. When would be a good time for a follow-up call?"

NOTE: Always log the call outcome and schedule follow-up!`
            },
            {
                cat: 'Call Script',
                title: 'Follow-Up Call — Pending Application',
                content: `GREETING:
"Hello [LEAD NAME], this is [YOUR NAME] from IT Park Soft Landing. We spoke on [DATE] about your company becoming an IT Park resident."

CHECK STATUS:
"I'm calling to check if you've had a chance to review the registration materials we sent?"

IF THEY HAVEN'T STARTED:
"No problem! Would you like me to walk you through the process now? It takes about 10-15 minutes to complete the application."

IF THEY HAVE QUESTIONS:
"Of course, I'm happy to help. What questions do you have?"

COMMON QUESTIONS TO PREPARE FOR:
Q: "What documents are needed?"
A: "Company registration docs, founders' ID copies, description of IT activities, and a brief business plan."

Q: "How long does the approval take?"
A: "Typically 5-10 business days after submitting a complete application."

Q: "Can we start with remote work?"
A: "Yes! You can register as a resident and start remotely. Office space can be arranged when you're ready."

Q: "What are the tax benefits?"
A: "0% income tax, 0% property tax, 0% social fund contributions. This regime is guaranteed until 2028 by Presidential Decree."

PUSH TO ACTION:
"I can schedule a video call with our registration team to walk you through the application step by step. Would [DAY] at [TIME] work for you?"

CLOSING:
"Great, I'll send a calendar invite. Looking forward to welcoming your company to IT Park!"

NOTE: Update lead status and set next follow-up date.`
            },
            {
                cat: 'Call Script',
                title: 'Office Tour Invitation Script',
                content: `GREETING:
"Hello [LEAD NAME], this is [YOUR NAME] from IT Park. Congratulations on your application being approved! / I'd like to invite you to see our office spaces."

OFFER TOUR:
"We'd love to give you a tour of our facilities so you can choose the best space for your team. We have options ranging from hot desks to private offices."

AVAILABLE LOCATIONS:
1. "IT Park HQ on Shahrisabz — our flagship location with conference halls, event space, and full amenities"
2. "CSpace — modern coworking on Amir Temur, very popular with startups"
3. "Shakespeare — creative workspace in Mirzo Ulugbek, great for small teams"
4. "Ground Zero — tech-focused space on Shota Rustaveli, hosts community events"

SCHEDULE:
"Tours are available Monday-Friday, 10:00-17:00. Which location interests you most? I can schedule a visit for you."

WHAT TO BRING:
"For the tour, just bring your ID. If you'd like to sign a lease the same day, bring your company documents."

CLOSING:
"See you on [DATE] at [TIME]! I'll meet you at reception. Call me if anything changes: [YOUR PHONE]."

NOTE: Log the tour appointment and preferred office in the system.`
            },
            {
                cat: 'FAQ',
                title: 'Resident Benefits Summary',
                content: `IT PARK RESIDENT BENEFITS:

TAX ADVANTAGES (until 2028):
• 0% Corporate Income Tax
• 0% Property Tax
• 0% Social Fund contributions (replaced by 1% turnover tax)
• Reduced personal income tax (7.5%) for employees
• No customs duties on imported equipment

OPERATIONAL BENEFITS:
• Simplified visa/work permits for foreign staff
• Access to subsidized office space
• Dedicated account manager
• IT Park brand association — trusted by 1,800+ companies
• Networking events, hackathons, demo days
• Government lobbying — IT Park advocates for residents

ELIGIBLE ACTIVITIES (OKED codes):
• Software development
• IT consulting
• Data processing
• Web/mobile app development
• AI/ML services
• Cloud computing services
• IT education/training
• E-commerce platform development
• Game development
• Cybersecurity services

APPLICATION REQUIREMENTS:
1. Company must be registered in Uzbekistan (or willing to register)
2. At least 80% of revenue from IT activities
3. Application form + business plan
4. Founders' passport copies
5. Company charter and registration documents`
            },
            {
                cat: 'FAQ',
                title: 'Registration Process Step-by-Step',
                content: `STEP 1: INITIAL APPLICATION
- Fill out online form at register.it-park.uz
- Attach required documents (charter, IDs, business plan)
- Submit for review

STEP 2: PRELIMINARY REVIEW (2-3 days)
- Soft Landing team checks document completeness
- May contact you for clarifications

STEP 3: EXPERT COMMISSION REVIEW (5-7 days)
- Commission evaluates the application
- Checks OKED codes eligibility
- Verifies IT activity focus (80% rule)

STEP 4: DECISION
- Approved: Welcome letter + next steps sent
- Rejected: Feedback provided, can reapply

STEP 5: ONBOARDING
- Assign account manager
- Office space selection (if needed)
- Work permit assistance (for foreign staff)
- Introduction to IT Park community

TIMELINE: Total ~10-15 business days from application to onboarding

COMMON REJECTION REASONS:
• Activity not in eligible OKED list
• Less than 80% IT revenue
• Incomplete documents
• Company already has tax violations`
            },
            {
                cat: 'Procedures',
                title: 'Lead Follow-Up Schedule',
                content: `STANDARD FOLLOW-UP PROTOCOL:

DAY 0: Initial contact — introduce IT Park, qualify the lead
DAY 1: Send welcome email with registration links and benefits PDF
DAY 3: First follow-up call — check if they reviewed materials
DAY 7: Second follow-up — offer assistance with application
DAY 14: Third follow-up — re-engage or mark as "cold"
DAY 30: Final attempt — special offer or event invitation

LEAD STATUS CATEGORIES:
• HOT — Actively filling application, needs help
• WARM — Interested, asked for info, hasn't started yet
• COLD — No response after 2+ follow-ups
• CONVERTED — Submitted application
• RESIDENT — Approved and onboarded
• LOST — Declined or went elsewhere

PRIORITY RULES:
1. Always call HOT leads first
2. Follow-up calls before 12:00 get better response rates
3. If lead asks for call-back, ALWAYS honor the time
4. Log every interaction in the call log
5. Escalate to manager if lead has > $1M annual revenue`
            }
        ];

        const stmt = db.prepare("INSERT INTO spravochnik (department, category, title, content, created_by) VALUES (?, ?, ?, ?, ?)");
        entries.forEach(e => stmt.run('Softlanding', e.cat, e.title, e.content, null));
        stmt.finalize();
        console.log("✅ Softlanding Spravochnik Seeded");
    });
}

module.exports = db;
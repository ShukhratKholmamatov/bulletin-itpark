const express = require('express');
const router = express.Router();
const db = require('../config/db');
const fetch = require('node-fetch');
const { getDepartmentConfig, getDepartmentGroup, WIDGET_REGISTRY } = require('../config/departments');
const RSSParser = require('rss-parser');

const parser = new RSSParser({
    customFields: { item: [['media:content', 'media:content', { keepArray: true }]] }
});

// Auth middleware
function ensureAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated() && req.user) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(ensureAuth);

// ── GET /workspace/config ──
router.get('/config', (req, res) => {
    const dept = req.user.department || 'Analytics';
    const config = getDepartmentConfig(dept);
    const group = getDepartmentGroup(dept);

    // Build widget definitions for the widgets this department uses
    const widgetDefs = {};
    (config.widgets || []).forEach(wId => {
        if (WIDGET_REGISTRY[wId]) widgetDefs[wId] = WIDGET_REGISTRY[wId];
    });

    // Always include task/team widget definitions (auto-injected by frontend based on role)
    const role = req.user.role;
    if (role === 'head' || role === 'admin') {
        widgetDefs.my_team = WIDGET_REGISTRY.my_team;
        widgetDefs.assigned_tasks = WIDGET_REGISTRY.assigned_tasks;
    }
    widgetDefs.my_tasks = WIDGET_REGISTRY.my_tasks;

    res.json({
        department: dept,
        group,
        widgets: config.widgets || [],
        widgetDefinitions: widgetDefs,
        newsPresets: config.newsPresets || {},
        trackedItemTypes: config.trackedItemTypes || [],
        aiPromptContext: config.aiPromptContext || ''
    });
});

// ── GET /workspace/news ──
router.get('/news', async (req, res) => {
    const dept = req.user.department || 'Analytics';
    const config = getDepartmentConfig(dept);
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const presets = config.newsPresets || {};
    const searchQuery = (presets.keywords || ['Technology']).slice(0, 3).join(' OR ');
    const country = (presets.countries || [])[0] || '';

    const countryNames = { us: 'USA', gb: 'United Kingdom', in: 'India', de: 'Germany', kr: 'South Korea', jp: 'Japan', ru: 'Russia', kz: 'Kazakhstan', uz: 'Uzbekistan' };
    let finalQuery = searchQuery;
    if (country && countryNames[country] && !searchQuery.toLowerCase().includes(countryNames[country].toLowerCase())) {
        finalQuery += ' ' + countryNames[country];
    }

    const googleGeo = country && ['us', 'gb', 'in', 'de', 'kr', 'jp', 'ru'].includes(country)
        ? `&gl=${country.toUpperCase()}&ceid=${country.toUpperCase()}:en`
        : '&gl=US&ceid=US:en';

    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(finalQuery)}&hl=en-US${googleGeo}`;

    try {
        const feed = await parser.parseURL(googleUrl);
        const articles = feed.items.map(item => {
            let image = null;
            if (item['media:content'] && item['media:content'].length) {
                const media = item['media:content'].find(m => m.$ && m.$.url);
                if (media) image = media.$.url;
            }
            if (!image && item.enclosure && item.enclosure.url) image = item.enclosure.url;
            const htmlFields = [item.content, item.description, item.contentEncoded, item.summary].filter(Boolean);
            if (!image) {
                for (const html of htmlFields) {
                    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/);
                    if (imgMatch && !imgMatch[1].includes('google.com/logos')) { image = imgMatch[1]; break; }
                }
            }
            let source = 'Google News';
            const srcMatch = item.title && item.title.match(/ - ([^-]+)$/);
            if (srcMatch) source = srcMatch[1].trim();

            return {
                id: item.link, title: item.title, description: item.contentSnippet || item.title,
                url: item.link, image, source, published_at: item.pubDate, type: 'google_rss'
            };
        });

        const unique = Array.from(new Map(articles.map(a => [a.title, a])).values());
        res.json(unique.slice(offset, offset + limit));
    } catch (e) {
        res.json([]);
    }
});

// ── TRACKED ITEMS CRUD ──

router.get('/items', (req, res) => {
    const userId = req.user.id;
    const { type, status } = req.query;
    let sql = 'SELECT * FROM workspace_tracked_items WHERE user_id = ?';
    const params = [userId];
    if (type) { sql += ' AND item_type = ?'; params.push(type); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC';
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse metadata JSON
        const items = (rows || []).map(r => {
            try { r.metadata = JSON.parse(r.metadata); } catch { r.metadata = {}; }
            return r;
        });
        res.json(items);
    });
});

router.post('/items', (req, res) => {
    const { item_type, title, description, metadata } = req.body;
    if (!item_type || !title) return res.status(400).json({ error: 'item_type and title required' });
    const dept = req.user.department || 'Analytics';
    const metaStr = metadata ? JSON.stringify(metadata) : '{}';
    db.run(
        'INSERT INTO workspace_tracked_items (user_id, department, item_type, title, description, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, dept, item_type, title.trim(), description || '', metaStr],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

router.put('/items/:id', (req, res) => {
    const { title, description, status, metadata } = req.body;
    const sets = [];
    const params = [];
    if (title !== undefined) { sets.push('title = ?'); params.push(title.trim()); }
    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (status !== undefined) {
        if (!['active', 'completed', 'archived'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
        sets.push('status = ?'); params.push(status);
    }
    if (metadata !== undefined) { sets.push('metadata = ?'); params.push(JSON.stringify(metadata)); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push("updated_at = datetime('now')");
    params.push(req.params.id, req.user.id);
    db.run(`UPDATE workspace_tracked_items SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    });
});

router.delete('/items/:id', (req, res) => {
    // Delete notes first, then the item
    db.run('DELETE FROM workspace_notes WHERE tracked_item_id = ?', [req.params.id], () => {
        db.run('DELETE FROM workspace_tracked_items WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
            res.json({ success: true });
        });
    });
});

// ── NOTES ──

router.get('/items/:id/notes', (req, res) => {
    db.all(
        'SELECT n.*, u.name as author_name FROM workspace_notes n LEFT JOIN users u ON n.user_id = u.id WHERE n.tracked_item_id = ? ORDER BY n.created_at DESC',
        [req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

router.post('/items/:id/notes', (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
    db.run(
        'INSERT INTO workspace_notes (tracked_item_id, user_id, content) VALUES (?, ?, ?)',
        [req.params.id, req.user.id, content.trim()],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// ── METRICS ──

router.get('/metrics', (req, res) => {
    const userId = req.user.id;
    const dept = req.user.department || 'Analytics';

    const metrics = {};
    db.get('SELECT COUNT(*) as count FROM workspace_tracked_items WHERE user_id = ? AND status = ?', [userId, 'active'], (err, row) => {
        metrics.activeItems = row ? row.count : 0;
        db.get('SELECT COUNT(*) as count FROM workspace_tracked_items WHERE user_id = ? AND status = ?', [userId, 'completed'], (err2, row2) => {
            metrics.completedItems = row2 ? row2.count : 0;
            db.get('SELECT COUNT(*) as count FROM workspace_tracked_items WHERE user_id = ?', [userId], (err3, row3) => {
                metrics.totalItems = row3 ? row3.count : 0;
                db.get('SELECT COUNT(*) as count FROM workspace_notes WHERE user_id = ?', [userId], (err4, row4) => {
                    metrics.totalNotes = row4 ? row4.count : 0;
                    res.json(metrics);
                });
            });
        });
    });
});

// ── AI BRIEF ──

router.get('/ai-brief', async (req, res) => {
    const dept = req.user.department || 'Analytics';
    const userId = req.user.id;
    const userName = req.user.name || 'User';
    const config = getDepartmentConfig(dept);
    const force = req.query.force === 'true';
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${userId}_${today}_daily_brief`;

    // Check cache first (unless force refresh)
    if (!force) {
        try {
            const cached = await new Promise((resolve, reject) => {
                db.get("SELECT content FROM ai_summary_cache WHERE cache_key = ? AND expires_at > datetime('now')", [cacheKey], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });
            if (cached) return res.json(JSON.parse(cached.content));
        } catch (e) { /* continue to generate */ }
    }

    // Helper to run db queries as promises
    const dbGet = (sql, params) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });

    // Fetch user activity data
    const todayStart = new Date(new Date().setHours(0,0,0,0)).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    let activitySection = '';
    try {
        const [callsToday, callsWeek, recentCalls, itemsActive, itemsCompleted, noteCount, savedCount] = await Promise.all([
            dbGet("SELECT COUNT(*) as c FROM call_log WHERE user_id=? AND created_at >= ?", [userId, todayStart]),
            dbGet("SELECT COUNT(*) as c FROM call_log WHERE user_id=? AND created_at >= ?", [userId, weekAgo]),
            dbGet("SELECT lead_name, company_name, call_result, notes FROM call_log WHERE user_id=? ORDER BY created_at DESC LIMIT 5", [userId]),
            dbGet("SELECT COUNT(*) as c FROM workspace_tracked_items WHERE user_id=? AND status='active'", [userId]),
            dbGet("SELECT COUNT(*) as c FROM workspace_tracked_items WHERE user_id=? AND status='completed' AND updated_at >= ?", [userId, weekAgo]),
            dbGet("SELECT COUNT(*) as c FROM workspace_notes WHERE user_id=? AND created_at >= ?", [userId, weekAgo]),
            dbGet("SELECT COUNT(*) as c FROM saved_news WHERE user_id=? AND saved_at >= ?", [userId, weekAgo]),
        ]);

        const callsTodayNum = callsToday[0]?.c || 0;
        const callsWeekNum = callsWeek[0]?.c || 0;
        const activeItems = itemsActive[0]?.c || 0;
        const completedItems = itemsCompleted[0]?.c || 0;
        const notes = noteCount[0]?.c || 0;
        const saved = savedCount[0]?.c || 0;

        activitySection = `\n\nYour Work Activity (${userName}, ${dept} department):
- Calls made today: ${callsTodayNum}, this week: ${callsWeekNum}
- Active tracked items: ${activeItems}, completed this week: ${completedItems}
- Notes written this week: ${notes}
- Articles saved this week: ${saved}`;

        if (recentCalls.length) {
            activitySection += `\nRecent calls:`;
            recentCalls.forEach(c => {
                activitySection += `\n  - ${c.lead_name}${c.company_name ? ' (' + c.company_name + ')' : ''}: ${c.call_result}${c.notes ? ' — ' + c.notes.substring(0, 80) : ''}`;
            });
        }
    } catch (e) { /* activity fetch failed, continue without it */ }

    // Check if GROQ_API_KEY is set
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        try {
            const presets = config.newsPresets || {};
            const sq = (presets.keywords || ['Technology']).slice(0, 2).join(' OR ');
            const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(sq)}&hl=en-US&gl=US&ceid=US:en`;
            const f = await parser.parseURL(gUrl);
            const fallbackArticles = f.items.slice(0, 8).map(item => ({
                title: item.title,
                source: (item.title.match(/ - ([^-]+)$/) || [])[1] || 'Unknown'
            }));
            return res.json({ unavailable: true, message: 'AI summary not configured. Add GROQ_API_KEY to .env file.', fallbackArticles });
        } catch (e) {
            return res.json({ unavailable: true, message: 'AI summary not configured. Add GROQ_API_KEY to .env file.' });
        }
    }

    // Fetch recent news for this department
    try {
        const presets = config.newsPresets || {};
        const searchQuery = (presets.keywords || ['Technology']).slice(0, 2).join(' OR ');
        const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-US&gl=US&ceid=US:en`;
        const feed = await parser.parseURL(googleUrl);
        const articles = feed.items.slice(0, 10).map(item => ({
            title: item.title,
            description: item.contentSnippet || '',
            source: (item.title.match(/ - ([^-]+)$/) || [])[1] || 'Unknown'
        }));

        if (!articles.length) {
            return res.json({ unavailable: true, message: 'No recent articles found for summary.' });
        }

        const articleList = articles.map((a, i) => `${i + 1}. "${a.title}" (${a.source})`).join('\n');
        const prompt = `You are a personal work assistant at IT Park Uzbekistan, helping ${userName} from the ${dept} department.
Department focus: ${config.aiPromptContext}
${activitySection}

Recent industry news:
${articleList}

Based on BOTH the user's work activity AND the news, provide:
1. A personalized work summary (2-3 sentences): what the user accomplished, their productivity, and any patterns
2. A news brief (2-3 sentences): the most relevant industry developments for their department
3. 3 actionable recommendations combining their work priorities with news insights (e.g., "You had 3 calls with interested leads — the new tax incentive news could help convert them")
4. 1 priority action for today

Respond in valid JSON only: {"work_summary":"...","news_summary":"...","recommendations":["...","...","..."],"priority":"..."}`;

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 700
            })
        });

        if (!groqRes.ok) {
            const errText = await groqRes.text();
            console.error('Groq API error:', groqRes.status, errText);
            return res.json({ unavailable: true, message: 'AI service temporarily unavailable.', fallbackArticles: articles });
        }

        const groqData = await groqRes.json();
        const content = groqData.choices[0].message.content;
        let parsed;
        try { parsed = JSON.parse(content); }
        catch {
            // Fallback: try to extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = null; } }
            if (!parsed) parsed = { work_summary: content, news_summary: '', recommendations: [], priority: '' };
        }

        // Cache per user for 3 hours (shorter since it's personalized)
        db.run(
            "INSERT OR REPLACE INTO ai_summary_cache (cache_key, department, summary_type, content, created_at, expires_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+3 hours'))",
            [cacheKey, dept, 'daily_brief', JSON.stringify(parsed)]
        );

        res.json(parsed);
    } catch (e) {
        console.error('AI brief error:', e.message);
        res.json({ unavailable: true, message: 'Failed to generate AI summary.' });
    }
});

// ── SPRAVOCHNIK (Department Knowledge Base) ──

router.get('/spravochnik', (req, res) => {
    const dept = req.query.department || req.user.department || 'Softlanding';
    const category = req.query.category || '';
    let sql = 'SELECT * FROM spravochnik WHERE department = ?';
    const params = [dept];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY category, title';
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

router.post('/spravochnik', (req, res) => {
    const { category, title, content, department } = req.body;
    if (!category || !title || !content) return res.status(400).json({ error: 'category, title, and content required' });
    const dept = department || req.user.department || 'Softlanding';
    db.run(
        'INSERT INTO spravochnik (department, category, title, content, created_by) VALUES (?, ?, ?, ?, ?)',
        [dept, category.trim(), title.trim(), content.trim(), req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

router.put('/spravochnik/:id', (req, res) => {
    const { category, title, content } = req.body;
    const sets = [];
    const params = [];
    if (category) { sets.push('category = ?'); params.push(category.trim()); }
    if (title) { sets.push('title = ?'); params.push(title.trim()); }
    if (content) { sets.push('content = ?'); params.push(content.trim()); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push("updated_at = datetime('now')");
    params.push(req.params.id);
    db.run(`UPDATE spravochnik SET ${sets.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    });
});

router.delete('/spravochnik/:id', (req, res) => {
    db.run('DELETE FROM spravochnik WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    });
});

// ── OFFICE DIRECTORY ──

router.get('/offices', (req, res) => {
    const { provider, city, status } = req.query;
    let sql = 'SELECT * FROM office_directory WHERE 1=1';
    const params = [];
    if (provider) { sql += ' AND provider = ?'; params.push(provider); }
    if (city) { sql += ' AND city = ?'; params.push(city); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY provider, city, name';
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ── CALL LOG ──

router.get('/calls', (req, res) => {
    const userId = req.user.id;
    const { result, interest } = req.query;
    let sql = 'SELECT * FROM call_log WHERE user_id = ?';
    const params = [userId];
    if (result) { sql += ' AND call_result = ?'; params.push(result); }
    if (interest) { sql += ' AND interest_level = ?'; params.push(interest); }
    sql += ' ORDER BY created_at DESC';
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

router.post('/calls', (req, res) => {
    const { lead_name, company_name, phone, email, call_result, interest_level, preferred_office, notes, follow_up_date } = req.body;
    if (!lead_name || !call_result) return res.status(400).json({ error: 'lead_name and call_result required' });
    db.run(
        'INSERT INTO call_log (user_id, lead_name, company_name, phone, email, call_result, interest_level, preferred_office, notes, follow_up_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, lead_name.trim(), company_name || '', phone || '', email || '', call_result, interest_level || 'medium', preferred_office || '', notes || '', follow_up_date || ''],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

router.delete('/calls/:id', (req, res) => {
    db.run('DELETE FROM call_log WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    });
});

// Call log stats
router.get('/calls/stats', (req, res) => {
    const userId = req.user.id;
    const stats = {};
    db.get('SELECT COUNT(*) as count FROM call_log WHERE user_id = ?', [userId], (err, row) => {
        stats.totalCalls = row ? row.count : 0;
        db.get("SELECT COUNT(*) as count FROM call_log WHERE user_id = ? AND date(created_at) = date('now')", [userId], (err2, row2) => {
            stats.todayCalls = row2 ? row2.count : 0;
            db.get("SELECT COUNT(*) as count FROM call_log WHERE user_id = ? AND follow_up_date != '' AND follow_up_date >= date('now')", [userId], (err3, row3) => {
                stats.pendingFollowUps = row3 ? row3.count : 0;
                db.get("SELECT COUNT(*) as count FROM call_log WHERE user_id = ? AND call_result = 'converted'", [userId], (err4, row4) => {
                    stats.converted = row4 ? row4.count : 0;
                    res.json(stats);
                });
            });
        });
    });
});

// ── Team & Task Management ──

function ensureHead(req, res, next) {
    if (req.user.role === 'head' || req.user.role === 'admin') return next();
    res.status(403).json({ error: 'Head role required' });
}

// Get team members (same department as head)
router.get('/team', ensureAuth, ensureHead, (req, res) => {
    const dept = req.user.department || 'General';
    db.all("SELECT id, name, email, photo_url, department, role FROM users WHERE department = ? AND id != ?",
        [dept, req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

// Get tasks — head sees assigned tasks, viewer sees their tasks
router.get('/tasks', ensureAuth, (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;
    const status = req.query.status;

    let sql, params;
    if (role === 'head' || role === 'admin') {
        // Head sees tasks they assigned + tasks assigned to them
        sql = `SELECT t.*,
                u1.name as assignee_name, u1.photo_url as assignee_photo,
                u2.name as assigner_name
               FROM tasks t
               LEFT JOIN users u1 ON t.assigned_to = u1.id
               LEFT JOIN users u2 ON t.assigned_by = u2.id
               WHERE t.assigned_by = ? OR t.assigned_to = ?`;
        params = [userId, userId];
    } else {
        // Viewer sees only tasks assigned to them
        sql = `SELECT t.*,
                u2.name as assigner_name, u2.photo_url as assigner_photo
               FROM tasks t
               LEFT JOIN users u2 ON t.assigned_by = u2.id
               WHERE t.assigned_to = ?`;
        params = [userId];
    }

    if (status) {
        sql += ` AND t.status = ?`;
        params.push(status);
    }
    sql += ` ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create task (head only)
router.post('/tasks', ensureAuth, ensureHead, (req, res) => {
    const { title, description, assigned_to, priority, deadline } = req.body;
    if (!title || !assigned_to) return res.status(400).json({ error: 'Title and assignee required' });

    const dept = req.user.department || 'General';
    db.run(`INSERT INTO tasks (title, description, assigned_to, assigned_by, department, priority, deadline)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, description || '', assigned_to, req.user.id, dept, priority || 'medium', deadline || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

// Update task
router.put('/tasks/:id', ensureAuth, (req, res) => {
    const taskId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;

    db.get("SELECT * FROM tasks WHERE id = ?", [taskId], (err, task) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        // Head can edit any field on tasks they assigned, viewer can only update status
        if (role === 'head' || role === 'admin') {
            if (task.assigned_by !== userId && task.assigned_to !== userId) {
                return res.status(403).json({ error: 'Not your task' });
            }
            const { title, description, status, priority, deadline } = req.body;
            db.run(`UPDATE tasks SET title=?, description=?, status=?, priority=?, deadline=?, updated_at=datetime('now') WHERE id=?`,
                [title || task.title, description !== undefined ? description : task.description, status || task.status, priority || task.priority, deadline !== undefined ? deadline : task.deadline, taskId],
                function(err2) {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ success: true });
                });
        } else {
            // Viewer can only update status on tasks assigned to them
            if (task.assigned_to !== userId) return res.status(403).json({ error: 'Not your task' });
            const { status } = req.body;
            if (!status) return res.status(400).json({ error: 'Status required' });
            db.run(`UPDATE tasks SET status=?, updated_at=datetime('now') WHERE id=?`, [status, taskId], function(err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ success: true });
            });
        }
    });
});

// Delete task (head only, tasks they assigned)
router.delete('/tasks/:id', ensureAuth, ensureHead, (req, res) => {
    db.run("DELETE FROM tasks WHERE id = ? AND assigned_by = ?", [req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found or not yours' });
        res.json({ success: true });
    });
});

module.exports = router;

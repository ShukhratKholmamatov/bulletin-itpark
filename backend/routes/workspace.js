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
    const config = getDepartmentConfig(dept);
    const force = req.query.force === 'true';
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${dept}_${today}_daily_brief`;

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

    // Check if GROQ_API_KEY is set
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        // Still fetch news headlines as fallback
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
        const prompt = `You are an analyst at IT Park Uzbekistan, ${dept} department.
Focus: ${config.aiPromptContext}

Based on these recent news articles, provide:
1. A 3-sentence executive summary of the most important developments
2. 3 key takeaways relevant to ${dept}
3. 1 recommended action item

Articles:
${articleList}

Respond in valid JSON only: {"summary":"...","takeaways":["...","...","..."],"action":"..."}`;

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 500
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
        catch { parsed = { summary: content, takeaways: [], action: '' }; }

        // Cache for 6 hours
        db.run(
            "INSERT OR REPLACE INTO ai_summary_cache (cache_key, department, summary_type, content, created_at, expires_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+6 hours'))",
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

module.exports = router;

/* =========================
   RESTORE SAVED PREFERENCES (runs immediately)
========================= */
(function() {
    const savedTheme = localStorage.getItem('bulletin-theme');
    if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    const savedFont = localStorage.getItem('bulletin-font-size');
    if (savedFont && ['small', 'medium', 'large'].includes(savedFont)) {
        document.documentElement.classList.add('font-' + savedFont);
    }
})();

/* =========================
   GLOBAL STATE
========================= */
let currentTab = 'all';
let currentUser = null;

// Pagination state
let limit = 20;
let offset = 0;
let isLoading = false;

let selectedNews = [];
const AUTO_REFRESH_MS = 10 * 60 * 1000;

/* =========================
   📊 CHARTS VARS
========================= */
let topicChartInstance = null;
let sourceChartInstance = null;


/* =========================
   👤 AUTHENTICATION
========================= */
async function fetchCurrentUser() {
    try {
        const res = await fetch('/auth/current', { credentials: 'include' });
        if (res.ok) {
            const user = await res.json();
            currentUser = user;
            
            // Update UI
            if(document.getElementById('user-name')) document.getElementById('user-name').innerText = user.name;
            if(document.getElementById('user-dept')) document.getElementById('user-dept').innerText = user.department || 'General';
            
            const avatarEl = document.getElementById('user-avatar');
            if(avatarEl) avatarEl.src = user.photo_url || `https://ui-avatars.com/api/?name=${user.name}&background=7dba28&color=fff`;
            
            if(document.getElementById('user-info')) document.getElementById('user-info').style.display = 'flex';
            if(document.getElementById('login-overlay')) document.getElementById('login-overlay').classList.add('hidden');
            document.body.classList.remove('auth-required');

            // Show admin sidebar button if admin
            const adminTabBtn = document.getElementById('tab-admin');
            if (adminTabBtn) adminTabBtn.style.display = (user.role === 'admin') ? 'flex' : 'none';

            loadNews();
        } else {
            showLoginWall();
        }
    } catch (err) {
        showLoginWall();
    }
}

function showLoginWall() {
    currentUser = null;
    document.body.classList.add('auth-required');
    if(document.getElementById('user-info')) document.getElementById('user-info').style.display = 'none';
    if(document.getElementById('login-overlay')) document.getElementById('login-overlay').classList.remove('hidden');
}

/* =========================
   🔐 AUTH UI LOGIC
========================= */
function toggleAuthMode(mode) {
    const loginForm = document.getElementById('form-login');
    const regForm = document.getElementById('form-register');
    const btnLogin = document.getElementById('btn-show-login');
    const btnReg = document.getElementById('btn-show-register');

    if (mode === 'login') {
        loginForm.style.display = 'block';
        regForm.style.display = 'none';
        btnLogin.classList.add('active');
        btnReg.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        regForm.style.display = 'block';
        btnLogin.classList.remove('active');
        btnReg.classList.add('active');
    }
}

async function handleManualLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if(!email || !password) return alert("Please fill all fields");

    const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if(res.ok) window.location.reload();
    else {
        const data = await res.json();
        alert(data.error || 'Login failed');
    }
}

async function handleRegister() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const department = document.getElementById('reg-dept').value;
    const password = document.getElementById('reg-password').value;

    if(!name || !email || !password) return alert("Please fill all fields");

    const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, department, password })
    });

    if(res.ok) {
        alert("Account Created! Logging in...");
        window.location.reload();
    } else {
        const data = await res.json();
        alert(data.error || 'Registration failed');
    }
}
function loginWithGoogle() { window.location.href = '/auth/google'; }
function logout() { window.location.href = '/auth/logout'; }


/* =========================
   ⚙️ SETTINGS PANEL
========================= */
function openSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (!overlay) return;

    if (currentUser) {
        document.getElementById('settings-name').value = currentUser.name || '';
        document.getElementById('settings-dept').value = currentUser.department || 'General';
        const preview = document.getElementById('settings-avatar-preview');
        if (preview) preview.src = currentUser.photo_url || `https://ui-avatars.com/api/?name=${currentUser.name}&background=7dba28&color=fff`;
    }

    const darkToggle = document.getElementById('settings-dark-toggle');
    if (darkToggle) darkToggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';

    const currentSize = localStorage.getItem('bulletin-font-size') || 'medium';
    document.querySelectorAll('.settings-toggle-group button').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`font-btn-${currentSize}`);
    if (activeBtn) activeBtn.classList.add('active');

    overlay.classList.add('open');
}

function closeSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.remove('open');
}

function closeSettingsOnOverlay(event) {
    if (event.target === event.currentTarget) closeSettings();
}

function toggleDarkMode(enabled) {
    if (enabled) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('bulletin-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('bulletin-theme', 'light');
    }
}

function setFontSize(size) {
    document.documentElement.classList.remove('font-small', 'font-medium', 'font-large');
    document.documentElement.classList.add(`font-${size}`);
    localStorage.setItem('bulletin-font-size', size);

    document.querySelectorAll('.settings-toggle-group button').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`font-btn-${size}`);
    if (btn) btn.classList.add('active');
}

async function saveProfile() {
    const name = document.getElementById('settings-name').value.trim();
    const department = document.getElementById('settings-dept').value;
    const statusEl = document.getElementById('settings-profile-status');

    if (!name) {
        if (statusEl) { statusEl.style.color = 'var(--accent-red)'; statusEl.textContent = 'Name is required'; }
        return;
    }

    try {
        const res = await fetch('/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, department })
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch(e) {
            if (statusEl) { statusEl.style.color = 'var(--accent-red)'; statusEl.textContent = 'Server error — please restart the backend'; }
            console.error('Profile save response:', text);
            return;
        }

        if (res.ok) {
            currentUser.name = data.name;
            currentUser.department = data.department;
            if (document.getElementById('user-name')) document.getElementById('user-name').innerText = data.name;
            if (document.getElementById('user-dept')) document.getElementById('user-dept').innerText = data.department;
            // Update avatar if it's from ui-avatars (name-based)
            if (currentUser.photo_url && currentUser.photo_url.includes('ui-avatars.com')) {
                const newAvatarUrl = `https://ui-avatars.com/api/?name=${data.name}&background=7dba28&color=fff`;
                currentUser.photo_url = newAvatarUrl;
                const headerAvatar = document.getElementById('user-avatar');
                if (headerAvatar) headerAvatar.src = newAvatarUrl;
                const previewAvatar = document.getElementById('settings-avatar-preview');
                if (previewAvatar) previewAvatar.src = newAvatarUrl;
            }
            if (statusEl) { statusEl.style.color = 'var(--primary)'; statusEl.textContent = 'Profile saved!'; }
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        } else {
            if (statusEl) { statusEl.style.color = 'var(--accent-red)'; statusEl.textContent = data.error || 'Save failed'; }
        }
    } catch (e) {
        console.error('Profile save error:', e);
        if (statusEl) { statusEl.style.color = 'var(--accent-red)'; statusEl.textContent = 'Network error — is the server running?'; }
    }
}

async function handleAvatarUpload(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const res = await fetch('/auth/avatar', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
            body: formData
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch(e) {
            alert('Server returned unexpected response. Please restart the backend server.');
            console.error('Avatar upload response:', text);
            return;
        }

        if (res.ok) {
            const newUrl = data.photo_url + '?t=' + Date.now();
            currentUser.photo_url = data.photo_url;
            const headerAvatar = document.getElementById('user-avatar');
            if (headerAvatar) headerAvatar.src = newUrl;
            const preview = document.getElementById('settings-avatar-preview');
            if (preview) preview.src = newUrl;
        } else {
            alert(data.error || 'Upload failed');
        }
    } catch (e) {
        console.error('Avatar upload error:', e);
        alert('Network error — is the server running?');
    }
    input.value = '';
}


/* =========================
   🛡️ ADMIN PANEL
========================= */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

let adminCurrentSection = 'overview';
let adminUserSearchTimer = null;

function showAdminSection(section) {
    adminCurrentSection = section;
    document.querySelectorAll('.admin-subnav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`admin-sub-${section}`);
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
    const target = document.getElementById(`admin-${section}`);
    if (target) target.style.display = 'block';

    if (section === 'overview') loadAdminOverview();
    else if (section === 'users') loadAdminUsers();
    else if (section === 'content') loadAdminContent();
    else if (section === 'activity') loadAdminActivity();
}

async function loadAdminOverview() {
    const statsBar = document.getElementById('admin-stats-bar');
    const deptBars = document.getElementById('admin-dept-bars');
    if (!statsBar) return;

    statsBar.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    if (deptBars) deptBars.innerHTML = '';

    try {
        const res = await fetch('/admin/dashboard', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        statsBar.innerHTML = `
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:var(--primary-light); color:var(--primary);"><i class="fa-solid fa-users"></i></div>
                <div><div class="admin-stat-value">${data.totalUsers}</div><div class="admin-stat-label">Total Users</div></div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:#e0f2fe; color:#0284c7;"><i class="fa-solid fa-bookmark"></i></div>
                <div><div class="admin-stat-value">${data.totalSaved}</div><div class="admin-stat-label">Saved Articles</div></div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:#ede9fe; color:#7c3aed;"><i class="fa-solid fa-book"></i></div>
                <div><div class="admin-stat-value">${data.totalResearch}</div><div class="admin-stat-label">Research Items</div></div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:#fef3c7; color:#d97706;"><i class="fa-solid fa-user-plus"></i></div>
                <div><div class="admin-stat-value">${data.recentUsers}</div><div class="admin-stat-label">New This Week</div></div>
            </div>
        `;

        if (deptBars && data.usersByDept.length) {
            const maxCount = Math.max(...data.usersByDept.map(d => d.count), 1);
            deptBars.innerHTML = data.usersByDept.map(d => `
                <div class="admin-dept-bar-row">
                    <div class="admin-dept-bar-label">${escapeHtml(d.department || 'Unknown')}</div>
                    <div class="admin-dept-bar-track">
                        <div class="admin-dept-bar-fill" style="width:${(d.count / maxCount * 100)}%">${d.count}</div>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        statsBar.innerHTML = '<div style="text-align:center; padding:20px; color:var(--accent-red);">Failed to load dashboard data.</div>';
    }
}

function debounceAdminUserSearch() {
    clearTimeout(adminUserSearchTimer);
    adminUserSearchTimer = setTimeout(loadAdminUsers, 300);
}

async function loadAdminUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    const countEl = document.getElementById('admin-users-count');
    if (!tbody) return;

    const search = document.getElementById('admin-user-search')?.value || '';
    const department = document.getElementById('admin-dept-filter')?.value || '';
    const role = document.getElementById('admin-role-filter')?.value || '';
    const params = new URLSearchParams({ search, department, role });

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const res = await fetch(`/admin/users?${params}`, { credentials: 'include', headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
            const text = await res.text();
            console.error('Admin users error:', res.status, text);
            throw new Error(text || `HTTP ${res.status}`);
        }
        const data = await res.json();

        if (countEl) countEl.textContent = `${data.total} user${data.total !== 1 ? 's' : ''} found`;

        if (!data.users.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">No users match your filters.</td></tr>';
            return;
        }

        tbody.innerHTML = data.users.map(u => {
            const avatar = u.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'U')}&background=7dba28&color=fff&size=34`;
            const date = u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            const isSelf = currentUser && currentUser.id === u.id;

            return `<tr>
                <td>
                    <div class="admin-user-cell">
                        <img src="${escapeHtml(avatar)}" class="admin-user-avatar" alt="" onerror="this.src='https://ui-avatars.com/api/?name=U&background=7dba28&color=fff&size=34'">
                        <span>${escapeHtml(u.name)}${isSelf ? ' <small style="color:var(--primary);">(you)</small>' : ''}</span>
                    </div>
                </td>
                <td>${escapeHtml(u.email)}</td>
                <td>
                    <select onchange="changeUserDept('${escapeHtml(u.id)}', this.value)" class="admin-dept-inline">
                        ${['Product Export','Startup Ecosystem','Western Markets','Eastern Markets','GovTech','Venture Capital','Analytics','BPO Monitoring','Residents Relations','Residents Registration','Residents Monitoring','Softlanding','Legal Ecosystem','AI Infrastructure','AI Research','Inclusive Projects','Regional Development','Freelancers & Youth','Infrastructure','Infrastructure Dev','PPP Investors','IT Outsourcing','Global Marketing','Multimedia','Public Relations','Marketing','Event Management'].map(d =>
                            `<option value="${d}" ${u.department === d ? 'selected' : ''}>${d}</option>`
                        ).join('')}
                    </select>
                </td>
                <td><span class="admin-role-badge ${u.role === 'admin' ? 'admin' : 'viewer'}">${escapeHtml(u.role)}</span></td>
                <td style="white-space:nowrap;">${date}</td>
                <td>
                    ${isSelf ? '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>' :
                    `<div class="admin-actions-group">
                        <button class="admin-action-btn" onclick="toggleUserRole('${escapeHtml(u.id)}', '${escapeHtml(u.role)}')">
                            ${u.role === 'admin' ? '<i class="fa-solid fa-arrow-down"></i> Demote' : '<i class="fa-solid fa-arrow-up"></i> Promote'}
                        </button>
                        <button class="admin-action-btn delete" onclick="deleteUser('${escapeHtml(u.id)}', '${escapeHtml(u.name || u.email)}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>`}
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--accent-red);">Failed to load users.</td></tr>';
    }
}

async function toggleUserRole(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'viewer' : 'admin';
    const action = newRole === 'admin' ? 'promote to Admin' : 'demote to Viewer';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
        const res = await fetch(`/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role: newRole })
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { error: text }; }
        if (!res.ok) throw new Error(data.error || 'Failed');
        loadAdminUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteUser(userId, userName) {
    if (!confirm(`Are you sure you want to permanently delete "${userName}"? This cannot be undone.`)) return;

    try {
        const res = await fetch(`/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete user');
        loadAdminUsers();
        loadAdminOverview();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function changeUserDept(userId, newDept) {
    try {
        const res = await fetch(`/admin/users/${userId}/department`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ department: newDept })
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { error: text }; }
        if (!res.ok) {
            alert('Error: ' + (data.error || 'Failed'));
            loadAdminUsers();
        }
    } catch (err) {
        alert('Error: ' + err.message);
        loadAdminUsers();
    }
}

async function loadAdminContent() {
    const statsEl = document.getElementById('admin-content-stats');
    const typesEl = document.getElementById('admin-research-types');
    const articlesEl = document.getElementById('admin-popular-articles');
    if (!statsEl) return;

    statsEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch('/admin/content', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();

        const totalResearch = data.researchByType.reduce((s, r) => s + r.count, 0);
        const totalTopics = data.researchByTopic.length;

        statsEl.innerHTML = `
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:var(--primary-light); color:var(--primary);"><i class="fa-solid fa-file-lines"></i></div>
                <div><div class="admin-stat-value">${totalResearch}</div><div class="admin-stat-label">Research Documents</div></div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:#e0f2fe; color:#0284c7;"><i class="fa-solid fa-tags"></i></div>
                <div><div class="admin-stat-value">${totalTopics}</div><div class="admin-stat-label">Research Topics</div></div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:#fce7f3; color:#db2777;"><i class="fa-solid fa-fire"></i></div>
                <div><div class="admin-stat-value">${data.popularArticles.length}</div><div class="admin-stat-label">Trending Articles</div></div>
            </div>
        `;

        if (typesEl) {
            const maxType = Math.max(...data.researchByType.map(r => r.count), 1);
            typesEl.innerHTML = data.researchByType.length ? data.researchByType.map(r => `
                <div class="admin-dept-bar-row">
                    <div class="admin-dept-bar-label" style="text-transform:capitalize;">${escapeHtml(r.doc_type)}</div>
                    <div class="admin-dept-bar-track">
                        <div class="admin-dept-bar-fill" style="width:${(r.count / maxType * 100)}%; background:#7c3aed;">${r.count}</div>
                    </div>
                </div>
            `).join('') : '<p style="color:var(--text-muted); text-align:center;">No research data yet.</p>';
        }

        if (articlesEl) {
            articlesEl.innerHTML = data.popularArticles.length ? data.popularArticles.map((a, i) => `
                <div class="admin-popular-item">
                    <div class="admin-popular-rank">${i + 1}</div>
                    <div class="admin-popular-info">
                        <div class="admin-popular-title">${escapeHtml(a.title)}</div>
                        <div class="admin-popular-meta">${escapeHtml(a.source || 'Unknown source')}</div>
                    </div>
                    <div class="admin-popular-count">${a.save_count} saves</div>
                    <button class="admin-action-btn delete" onclick="deleteArticle('${escapeHtml(a.news_id)}', '${escapeHtml(a.title)}')" title="Delete from all users">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `).join('') : '<p style="color:var(--text-muted); text-align:center;">No saved articles yet.</p>';
        }
    } catch (err) {
        statsEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--accent-red);">Failed to load content data.</div>';
    }
    loadAdminArchive();
}

async function deleteArticle(newsId, title) {
    if (!confirm(`Delete "${title}" from all users' saved articles? This cannot be undone.`)) return;

    try {
        const res = await fetch(`/admin/articles/${encodeURIComponent(newsId)}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete article');
        loadAdminContent();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}


let _archiveSearchTimer;
function debounceAdminArchiveSearch() {
    clearTimeout(_archiveSearchTimer);
    _archiveSearchTimer = setTimeout(loadAdminArchive, 300);
}

async function loadAdminArchive() {
    const tbody = document.getElementById('admin-archive-tbody');
    if (!tbody) return;
    const search = (document.getElementById('admin-archive-search')?.value || '').trim();

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>';

    try {
        const res = await fetch(`/admin/archive?search=${encodeURIComponent(search)}`, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();

        if (!data.archives.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">No archive documents found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.archives.map(a => {
            const date = a.created_at ? new Date(a.created_at).toLocaleDateString() : '—';
            return `<tr>
                <td style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(a.title)}</td>
                <td><span style="text-transform:capitalize;">${escapeHtml(a.doc_type || '—')}</span></td>
                <td>${escapeHtml(a.topic || '—')}</td>
                <td>${escapeHtml(a.author || '—')}</td>
                <td style="white-space:nowrap;">${date}</td>
                <td>
                    <button class="admin-action-btn delete" onclick="deleteArchiveDoc(${a.id}, '${escapeHtml(a.title).replace(/'/g, "\\'")}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--accent-red);">Failed to load archive.</td></tr>';
    }
}

async function deleteArchiveDoc(id, title) {
    if (!confirm(`Delete "${title}" from the archive? This cannot be undone.`)) return;

    try {
        const res = await fetch(`/archive/${id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete');
        loadAdminArchive();
        loadAdminContent();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

/* =========================
   ADMIN ACTIVITY KPI
========================= */
let activityData = [];
let activityRange = 'today';
let activitySortCol = 'total_actions';
let activitySortAsc = false;

function setActivityRange(range, btn) {
    activityRange = range;
    document.querySelectorAll('.activity-range-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const customDates = document.getElementById('activity-custom-dates');
    if (customDates) customDates.style.display = range === 'custom' ? 'flex' : 'none';
    if (range !== 'custom') loadAdminActivity();
}

function getActivityParams() {
    const dept = document.getElementById('activity-dept-filter')?.value || 'all';
    let params = `range=${activityRange}&dept=${encodeURIComponent(dept)}`;
    if (activityRange === 'custom') {
        const from = document.getElementById('activity-from')?.value || '';
        const to = document.getElementById('activity-to')?.value || '';
        params += `&from=${from}&to=${to}`;
    }
    return params;
}

async function loadAdminActivity() {
    const tbody = document.getElementById('activity-tbody');
    const statsBar = document.getElementById('activity-stats-bar');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Loading activity data...</td></tr>';

    try {
        const res = await fetch(`/admin/activity?${getActivityParams()}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');

        activityData = data.users;

        // Render summary stats
        if (statsBar) {
            const s = data.summary;
            statsBar.innerHTML = `
                <div class="admin-stat-card"><div class="admin-stat-num">${s.total_actions}</div><div class="admin-stat-label">Total Actions</div></div>
                <div class="admin-stat-card"><div class="admin-stat-num">${escapeHtml(s.most_active_user)}</div><div class="admin-stat-label">Most Active</div></div>
                <div class="admin-stat-card"><div class="admin-stat-num">${s.avg_actions}</div><div class="admin-stat-label">Avg per User</div></div>
                <div class="admin-stat-card"><div class="admin-stat-num">${s.active_users_count}</div><div class="admin-stat-label">Active Users</div></div>
            `;
        }

        renderActivityTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#ef4444;">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderActivityTable() {
    const tbody = document.getElementById('activity-tbody');
    if (!tbody) return;

    const sorted = [...activityData].sort((a, b) => {
        let va = a[activitySortCol], vb = b[activitySortCol];
        if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
        if (va < vb) return activitySortAsc ? -1 : 1;
        if (va > vb) return activitySortAsc ? 1 : -1;
        return 0;
    });

    if (!sorted.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(u => {
        const totalClass = u.total_actions === 0 ? 'activity-zero' : u.total_actions <= 5 ? 'activity-low' : u.total_actions >= 16 ? 'activity-high' : 'activity-med';
        const avatar = u.photo_url ? `<img src="${escapeHtml(u.photo_url)}" class="admin-user-avatar" alt="">` : `<div class="admin-user-avatar" style="background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.75rem;">${escapeHtml((u.name || '?')[0])}</div>`;
        return `<tr>
            <td><div class="admin-user-cell">${avatar}<span>${escapeHtml(u.name || 'Unknown')}</span></div></td>
            <td>${escapeHtml(u.department || '—')}</td>
            <td class="activity-num">${u.calls}</td>
            <td class="activity-num">${u.items_added}</td>
            <td class="activity-num">${u.items_completed}</td>
            <td class="activity-num">${u.notes}</td>
            <td class="activity-num">${u.articles_saved}</td>
            <td class="activity-total ${totalClass}">${u.total_actions}</td>
        </tr>`;
    }).join('');
}

function sortActivityTable(col) {
    if (activitySortCol === col) {
        activitySortAsc = !activitySortAsc;
    } else {
        activitySortCol = col;
        activitySortAsc = col === 'name' || col === 'department';
    }
    renderActivityTable();
}

function exportActivityCSV() {
    const params = getActivityParams();
    window.open(`/admin/activity/export?${params}`, '_blank');
}

/* =========================
   WORKSPACE (Department Tools)
========================= */
let workspaceConfig = null;

const WIDGET_RENDERERS = {
    news_feed: renderNewsFeedWidget,
    tech_trends: renderNewsFeedWidget,
    media_mentions: renderNewsFeedWidget,
    tracked_companies: renderTrackedItemsWidget,
    deal_pipeline: renderTrackedItemsWidget,
    startup_tracker: renderTrackedItemsWidget,
    project_tracker: renderTrackedItemsWidget,
    event_planner: renderTrackedItemsWidget,
    registration_pipeline: renderTrackedItemsWidget,
    export_metrics: renderMetricsWidget,
    investment_metrics: renderMetricsWidget,
    resident_kpis: renderMetricsWidget,
    community_metrics: renderMetricsWidget,
    country_comparison: renderCountryComparisonWidget,
    regulatory_tracker: renderRegulatoryWidget,
    ai_brief: renderAiBriefWidget,
    call_script: renderSpravochnikWidget,
    spravochnik: renderSpravochnikWidget,
    office_directory: renderOfficeDirectoryWidget,
    call_log: renderCallLogWidget,
    lead_pipeline: renderTrackedItemsWidget
};

async function loadWorkspace() {
    const header = document.getElementById('workspace-header');
    const metricsEl = document.getElementById('workspace-metrics');
    const grid = document.getElementById('workspace-widgets');
    if (!header) return;

    header.innerHTML = '';
    metricsEl.innerHTML = '';
    grid.innerHTML = '<div class="widget-loading"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--primary);"></i><p style="margin-top:12px;">Loading workspace...</p></div>';

    try {
        const res = await fetch('/workspace/config', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load config');
        workspaceConfig = await res.json();

        renderWorkspaceHeader(workspaceConfig);
        await loadWorkspaceMetrics();
        renderWorkspaceWidgets(workspaceConfig.widgets);
    } catch (err) {
        grid.innerHTML = '<div class="widget-error">Failed to load workspace. Please try again.</div>';
    }
}

function renderWorkspaceHeader(config) {
    const header = document.getElementById('workspace-header');
    header.innerHTML = `
        <div class="workspace-dept-badge" style="--dept-color: ${escapeHtml(config.group.color)}">
            <i class="${escapeHtml(config.group.icon)}"></i>
            <div>
                <h3>${escapeHtml(config.department)}</h3>
                <span>${escapeHtml(config.group.name)}</span>
            </div>
        </div>
        <div class="workspace-actions">
            <button onclick="refreshWorkspace()" class="workspace-action-btn">
                <i class="fa-solid fa-arrows-rotate"></i> Refresh
            </button>
        </div>
    `;
}

async function loadWorkspaceMetrics() {
    const el = document.getElementById('workspace-metrics');
    try {
        const res = await fetch('/workspace/metrics', { credentials: 'include' });
        const m = await res.json();
        el.innerHTML = `
            <div class="workspace-metric-card">
                <div class="workspace-metric-value">${m.activeItems || 0}</div>
                <div class="workspace-metric-label">Active Items</div>
            </div>
            <div class="workspace-metric-card">
                <div class="workspace-metric-value">${m.completedItems || 0}</div>
                <div class="workspace-metric-label">Completed</div>
            </div>
            <div class="workspace-metric-card">
                <div class="workspace-metric-value">${m.totalItems || 0}</div>
                <div class="workspace-metric-label">Total Tracked</div>
            </div>
            <div class="workspace-metric-card">
                <div class="workspace-metric-value">${m.totalNotes || 0}</div>
                <div class="workspace-metric-label">Notes</div>
            </div>
        `;
    } catch { el.innerHTML = ''; }
}

function renderWorkspaceWidgets(widgetIds) {
    const grid = document.getElementById('workspace-widgets');
    grid.innerHTML = '';

    widgetIds.forEach(wId => {
        const wDef = workspaceConfig.widgetDefinitions[wId];
        if (!wDef) return;

        const sizeClass = wDef.size === 'full' ? 'workspace-widget-full' : wDef.size === 'third' ? 'workspace-widget-third' : '';
        const el = document.createElement('div');
        el.className = `workspace-widget ${sizeClass}`;
        el.id = `widget-${wId}`;
        el.innerHTML = `
            <div class="widget-header">
                <h4><i class="${escapeHtml(wDef.icon)}"></i> ${escapeHtml(wDef.title)}</h4>
                <button onclick="refreshWidget('${wId}')" title="Refresh"><i class="fa-solid fa-arrows-rotate"></i></button>
            </div>
            <div class="widget-body" id="widget-body-${wId}">
                <div class="widget-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        `;
        grid.appendChild(el);

        const renderer = WIDGET_RENDERERS[wId];
        if (renderer) renderer(wId, wDef);
    });
}

function refreshWidget(wId) {
    const wDef = workspaceConfig?.widgetDefinitions[wId];
    const renderer = WIDGET_RENDERERS[wId];
    if (wDef && renderer) {
        const body = document.getElementById(`widget-body-${wId}`);
        if (body) body.innerHTML = '<div class="widget-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
        renderer(wId, wDef);
    }
}

function refreshWorkspace() {
    loadWorkspace();
}

// ── News Feed Widget ──
async function renderNewsFeedWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const res = await fetch('/workspace/news?limit=8', { credentials: 'include' });
        const articles = await res.json();
        if (!articles.length) {
            body.innerHTML = '<div class="widget-empty"><i class="fa-solid fa-newspaper" style="font-size:1.5rem;"></i><p>No articles found</p></div>';
            return;
        }
        body.innerHTML = articles.map(a => {
            const date = a.published_at ? new Date(a.published_at).toLocaleDateString() : '';
            return `<div class="ws-news-item">
                <div class="ws-news-info">
                    <div class="ws-news-title"><a href="${escapeHtml(a.url)}" target="_blank">${escapeHtml(a.title)}</a></div>
                    <div class="ws-news-meta">${escapeHtml(a.source)} ${date ? '&middot; ' + date : ''}</div>
                </div>
            </div>`;
        }).join('');
    } catch { body.innerHTML = '<div class="widget-error">Failed to load news</div>'; }
}

// ── Tracked Items Widget ──
async function renderTrackedItemsWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    const itemType = wDef.itemType || wId;

    try {
        const res = await fetch(`/workspace/items?type=${encodeURIComponent(itemType)}`, { credentials: 'include' });
        const items = await res.json();

        if (!items.length) {
            body.innerHTML = `
                <div class="widget-empty">
                    <i class="${escapeHtml(wDef.icon)}" style="font-size:1.5rem;"></i>
                    <p>No ${escapeHtml(wDef.title.toLowerCase())} yet</p>
                </div>
                <button onclick="showAddItemModal('${escapeHtml(itemType)}')" class="widget-add-btn">
                    <i class="fa-solid fa-plus"></i> Add New
                </button>`;
            return;
        }

        body.innerHTML = `
            <div class="tracked-items-list">
                ${items.map(item => `
                    <div class="tracked-item">
                        <div class="tracked-item-status status-${escapeHtml(item.status)}"></div>
                        <div class="tracked-item-info">
                            <strong>${escapeHtml(item.title)}</strong>
                            <small>${escapeHtml(item.description || '')}</small>
                        </div>
                        <div class="tracked-item-actions">
                            <button onclick="editTrackedItem(${item.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                            <button class="delete-btn" onclick="deleteTrackedItem(${item.id}, '${escapeHtml(item.title).replace(/'/g, "\\'")}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button onclick="showAddItemModal('${escapeHtml(itemType)}')" class="widget-add-btn">
                <i class="fa-solid fa-plus"></i> Add New
            </button>
        `;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load items</div>'; }
}

// ── Metrics Widget ──
async function renderMetricsWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const res = await fetch('/workspace/metrics', { credentials: 'include' });
        const m = await res.json();
        body.innerHTML = `
            <div style="display:flex; gap:16px; flex-wrap:wrap; justify-content:center;">
                <div style="text-align:center; flex:1; min-width:80px;">
                    <div style="font-size:1.4rem; font-weight:700; color:var(--primary);">${m.activeItems || 0}</div>
                    <div style="font-size:0.78rem; color:var(--text-muted);">Active</div>
                </div>
                <div style="text-align:center; flex:1; min-width:80px;">
                    <div style="font-size:1.4rem; font-weight:700; color:#3b82f6;">${m.completedItems || 0}</div>
                    <div style="font-size:0.78rem; color:var(--text-muted);">Completed</div>
                </div>
                <div style="text-align:center; flex:1; min-width:80px;">
                    <div style="font-size:1.4rem; font-weight:700; color:#f59e0b;">${m.totalNotes || 0}</div>
                    <div style="font-size:0.78rem; color:var(--text-muted);">Notes</div>
                </div>
            </div>
        `;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load metrics</div>'; }
}

// ── Country Comparison Widget ──
async function renderCountryComparisonWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const countries = ['uz', 'kz', 'sg', 'ee'];
        const results = await Promise.all(countries.map(c =>
            fetch(`/stats?country=${c}`, { credentials: 'include' }).then(r => r.json()).catch(() => [])
        ));
        const countryNames = { uz: 'Uzbekistan', kz: 'Kazakhstan', sg: 'Singapore', ee: 'Estonia' };
        let html = '';
        countries.forEach((c, i) => {
            const stats = results[i];
            if (!stats || !stats.length) return;
            const residents = stats.find(s => s.metric_name === 'Residents');
            html += `<div class="ws-country-row">
                <span class="ws-country-name">${countryNames[c]}</span>
                <span class="ws-country-value">${residents ? escapeHtml(residents.metric_value) : '—'}</span>
            </div>`;
        });
        body.innerHTML = html || '<div class="widget-empty"><p>No statistics data available</p></div>';
    } catch { body.innerHTML = '<div class="widget-error">Failed to load stats</div>'; }
}

// ── Regulatory Widget ──
async function renderRegulatoryWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const res = await fetch('/nla/list', { credentials: 'include' });
        const items = await res.json();
        if (!items || !items.length) {
            body.innerHTML = '<div class="widget-empty"><p>No legislation data</p></div>';
            return;
        }
        body.innerHTML = items.slice(0, 6).map(item => `
            <div class="ws-news-item">
                <div class="ws-news-info">
                    <div class="ws-news-title">${escapeHtml(item.title)}</div>
                    <div class="ws-news-meta">${escapeHtml(item.country_name || '')} &middot; ${escapeHtml(item.legal_topic || '')} &middot; ${escapeHtml(item.enactment_date || '')}</div>
                </div>
            </div>
        `).join('');
    } catch { body.innerHTML = '<div class="widget-error">Failed to load legislation</div>'; }
}

// ── AI Brief Widget ──
async function renderAiBriefWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    body.innerHTML = '<div class="widget-loading"><i class="fa-solid fa-robot fa-spin" style="color:var(--primary);"></i> Generating AI brief...</div>';
    try {
        const res = await fetch('/workspace/ai-brief', { credentials: 'include' });
        const data = await res.json();

        if (data.unavailable) {
            let fallbackHtml = `<div class="ai-unavailable"><i class="fa-solid fa-robot" style="font-size:1.5rem; margin-bottom:8px; display:block;"></i>${escapeHtml(data.message)}</div>`;
            if (data.fallbackArticles && data.fallbackArticles.length) {
                fallbackHtml += '<div class="ai-fallback-news"><div class="ai-fallback-label"><i class="fa-solid fa-newspaper"></i> Latest Headlines for Your Department</div>';
                data.fallbackArticles.forEach(a => {
                    fallbackHtml += `<div class="ai-fallback-item"><span class="ai-fallback-title">${escapeHtml(a.title)}</span></div>`;
                });
                fallbackHtml += '</div>';
            }
            body.innerHTML = fallbackHtml;
            return;
        }

        let html = '';
        if (data.summary) html += `<div class="ai-brief-summary">${escapeHtml(data.summary)}</div>`;
        if (data.takeaways && data.takeaways.length) {
            html += '<div class="ai-brief-takeaways">';
            data.takeaways.forEach(t => {
                html += `<div class="ai-brief-takeaway"><i class="fa-solid fa-lightbulb"></i> <span>${escapeHtml(t)}</span></div>`;
            });
            html += '</div>';
        }
        if (data.action) {
            html += `<div class="ai-brief-action"><strong><i class="fa-solid fa-bolt"></i> Recommended Action</strong>${escapeHtml(data.action)}</div>`;
        }
        body.innerHTML = html || '<div class="ai-unavailable">No AI summary available.</div>';
    } catch { body.innerHTML = '<div class="widget-error">Failed to generate AI brief</div>'; }
}

// ── Spravochnik Widget ──
async function renderSpravochnikWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    const category = wDef.category || '';
    const url = category ? `/workspace/spravochnik?category=${encodeURIComponent(category)}` : '/workspace/spravochnik';
    try {
        const res = await fetch(url, { credentials: 'include' });
        const entries = await res.json();
        if (!entries.length) {
            body.innerHTML = `<div class="widget-empty"><i class="${escapeHtml(wDef.icon)}" style="font-size:1.5rem;"></i><p>No entries yet</p></div>
                <button onclick="showAddSpravochnikModal('${escapeHtml(category)}')" class="widget-add-btn"><i class="fa-solid fa-plus"></i> Add Entry</button>`;
            return;
        }
        // Group by category
        const grouped = {};
        entries.forEach(e => { (grouped[e.category] = grouped[e.category] || []).push(e); });

        let html = '<div class="spravochnik-list">';
        for (const [cat, items] of Object.entries(grouped)) {
            html += `<div class="spravochnik-category"><span class="spravochnik-cat-label">${escapeHtml(cat)}</span></div>`;
            items.forEach(item => {
                html += `<div class="spravochnik-item" onclick="toggleSpravochnikItem(this)">
                    <div class="spravochnik-item-header">
                        <i class="fa-solid fa-chevron-right spravochnik-chevron"></i>
                        <strong>${escapeHtml(item.title)}</strong>
                        <button class="spravochnik-delete-btn" onclick="event.stopPropagation(); deleteSpravochnikEntry(${item.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="spravochnik-item-content" style="display:none;">
                        <pre class="spravochnik-text">${escapeHtml(item.content)}</pre>
                    </div>
                </div>`;
            });
        }
        html += '</div>';
        html += `<button onclick="showAddSpravochnikModal('${escapeHtml(category)}')" class="widget-add-btn"><i class="fa-solid fa-plus"></i> Add Entry</button>`;
        body.innerHTML = html;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load spravochnik</div>'; }
}

function toggleSpravochnikItem(el) {
    const content = el.querySelector('.spravochnik-item-content');
    const chevron = el.querySelector('.spravochnik-chevron');
    if (!content) return;
    const open = content.style.display !== 'none';
    content.style.display = open ? 'none' : 'block';
    if (chevron) chevron.style.transform = open ? '' : 'rotate(90deg)';
}

function showAddSpravochnikModal(defaultCategory) {
    const modal = document.getElementById('workspace-modal');
    const form = document.getElementById('workspace-item-form');
    document.getElementById('workspace-modal-title').innerText = 'Add Spravochnik Entry';
    // Repurpose the form for spravochnik
    form.onsubmit = (e) => saveSpravochnikEntry(e);
    document.getElementById('ws-item-id').value = '';
    document.getElementById('ws-item-type').value = 'spravochnik';
    document.getElementById('ws-item-title').value = '';
    document.getElementById('ws-item-desc').value = '';
    document.getElementById('ws-item-status').parentElement.querySelector('label').textContent = 'Category';
    const statusSel = document.getElementById('ws-item-status');
    statusSel.innerHTML = `<option value="Call Script">Call Script</option><option value="FAQ">FAQ</option><option value="Procedures">Procedures</option><option value="Other">Other</option>`;
    if (defaultCategory) statusSel.value = defaultCategory;
    document.getElementById('ws-meta-fields').innerHTML = '';
    // Change desc label
    document.getElementById('ws-item-desc').setAttribute('rows', '12');
    document.getElementById('ws-item-desc').parentElement.querySelector('label').textContent = 'Content';
    document.getElementById('ws-item-desc').setAttribute('placeholder', 'Enter script, FAQ answer, or procedure...');
    modal.style.display = 'flex';
}

async function saveSpravochnikEntry(e) {
    e.preventDefault();
    const title = document.getElementById('ws-item-title').value.trim();
    const content = document.getElementById('ws-item-desc').value.trim();
    const category = document.getElementById('ws-item-status').value;
    if (!title || !content) return alert('Title and content required');
    try {
        const res = await fetch('/workspace/spravochnik', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ category, title, content })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        closeWorkspaceModal();
        // Reset form handlers
        document.getElementById('workspace-item-form').onsubmit = (ev) => saveTrackedItem(ev);
        // Refresh spravochnik widgets
        if (workspaceConfig) {
            workspaceConfig.widgets.forEach(wId => {
                const wDef = workspaceConfig.widgetDefinitions[wId];
                if (wDef && wDef.dataSource === 'spravochnik') renderSpravochnikWidget(wId, wDef);
            });
        }
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteSpravochnikEntry(id) {
    if (!confirm('Delete this spravochnik entry?')) return;
    try {
        const res = await fetch(`/workspace/spravochnik/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        if (workspaceConfig) {
            workspaceConfig.widgets.forEach(wId => {
                const wDef = workspaceConfig.widgetDefinitions[wId];
                if (wDef && wDef.dataSource === 'spravochnik') renderSpravochnikWidget(wId, wDef);
            });
        }
    } catch (err) { alert('Error: ' + err.message); }
}

// ── Office Directory Widget ──
async function renderOfficeDirectoryWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const res = await fetch('/workspace/offices', { credentials: 'include' });
        const offices = await res.json();
        if (!offices.length) {
            body.innerHTML = '<div class="widget-empty"><p>No offices listed</p></div>';
            return;
        }
        // Group by provider
        const grouped = {};
        offices.forEach(o => { (grouped[o.provider] = grouped[o.provider] || []).push(o); });
        const providerColors = { 'IT Park': '#7dba28', 'CSpace': '#3b82f6', 'Shakespeare': '#8b5cf6', 'Ground Zero': '#ef4444' };

        let html = '<div class="office-filter-row"><button class="office-filter-btn active" onclick="filterOffices(this, \'all\')">All</button>';
        Object.keys(grouped).forEach(p => {
            html += `<button class="office-filter-btn" onclick="filterOffices(this, '${escapeHtml(p)}')">${escapeHtml(p)}</button>`;
        });
        html += '</div><div class="office-list" id="office-list-inner">';

        offices.forEach(o => {
            const color = providerColors[o.provider] || '#64748b';
            const statusClass = o.status === 'available' ? 'status-active' : o.status === 'full' ? 'status-archived' : 'status-completed';
            html += `<div class="office-card" data-provider="${escapeHtml(o.provider)}">
                <div class="office-card-header">
                    <span class="office-provider-badge" style="background:${color}20; color:${color};">${escapeHtml(o.provider)}</span>
                    <span class="tracked-item-status ${statusClass}" title="${escapeHtml(o.status)}"></span>
                </div>
                <h4 class="office-name">${escapeHtml(o.name)}</h4>
                <div class="office-details">
                    <div><i class="fa-solid fa-map-pin"></i> ${escapeHtml(o.address || o.city)}</div>
                    <div><i class="fa-solid fa-users"></i> ${escapeHtml(o.capacity || '—')}</div>
                    <div><i class="fa-solid fa-tag"></i> ${escapeHtml(o.price_range || '—')}</div>
                    <div><i class="fa-solid fa-wifi"></i> ${escapeHtml(o.amenities || '—')}</div>
                </div>
                <div class="office-contacts">
                    ${o.contact_phone ? `<a href="tel:${escapeHtml(o.contact_phone)}"><i class="fa-solid fa-phone"></i> ${escapeHtml(o.contact_phone)}</a>` : ''}
                    ${o.contact_email ? `<a href="mailto:${escapeHtml(o.contact_email)}"><i class="fa-solid fa-envelope"></i> ${escapeHtml(o.contact_email)}</a>` : ''}
                    ${o.website ? `<a href="${escapeHtml(o.website)}" target="_blank"><i class="fa-solid fa-globe"></i> Website</a>` : ''}
                </div>
                ${o.notes ? `<div class="office-notes"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(o.notes)}</div>` : ''}
            </div>`;
        });
        html += '</div>';
        body.innerHTML = html;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load offices</div>'; }
}

function filterOffices(btn, provider) {
    btn.parentElement.querySelectorAll('.office-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.office-card').forEach(card => {
        card.style.display = (provider === 'all' || card.dataset.provider === provider) ? '' : 'none';
    });
}

// ── Call Log Widget ──
async function renderCallLogWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const [callsRes, statsRes] = await Promise.all([
            fetch('/workspace/calls', { credentials: 'include' }),
            fetch('/workspace/calls/stats', { credentials: 'include' })
        ]);
        const calls = await callsRes.json();
        const stats = await statsRes.json();

        let html = `<div class="call-stats-row">
            <div class="call-stat"><span class="call-stat-num">${stats.todayCalls || 0}</span><span class="call-stat-label">Today</span></div>
            <div class="call-stat"><span class="call-stat-num">${stats.totalCalls || 0}</span><span class="call-stat-label">Total</span></div>
            <div class="call-stat"><span class="call-stat-num">${stats.pendingFollowUps || 0}</span><span class="call-stat-label">Follow-ups</span></div>
            <div class="call-stat"><span class="call-stat-num">${stats.converted || 0}</span><span class="call-stat-label">Converted</span></div>
        </div>`;

        html += `<button onclick="showLogCallModal()" class="widget-add-btn" style="margin-bottom:12px;"><i class="fa-solid fa-plus"></i> Log New Call</button>`;

        if (calls.length) {
            html += '<div class="call-log-list">';
            calls.slice(0, 20).forEach(c => {
                const resultColors = { answered: '#22c55e', no_answer: '#f59e0b', callback: '#3b82f6', converted: '#7dba28', rejected: '#ef4444' };
                const color = resultColors[c.call_result] || '#64748b';
                const interestIcons = { high: 'fa-fire', medium: 'fa-minus', low: 'fa-arrow-down' };
                const date = c.created_at ? new Date(c.created_at).toLocaleDateString() : '';
                html += `<div class="call-log-item">
                    <div class="call-log-result" style="background:${color}20; color:${color};" title="${escapeHtml(c.call_result)}">${escapeHtml(c.call_result)}</div>
                    <div class="call-log-info">
                        <strong>${escapeHtml(c.lead_name)}${c.company_name ? ' — ' + escapeHtml(c.company_name) : ''}</strong>
                        <small>
                            ${c.phone ? '<i class="fa-solid fa-phone"></i> ' + escapeHtml(c.phone) + ' ' : ''}
                            ${c.interest_level ? '<i class="fa-solid ' + (interestIcons[c.interest_level] || 'fa-minus') + '"></i> ' + escapeHtml(c.interest_level) + ' ' : ''}
                            ${c.follow_up_date ? '<i class="fa-solid fa-calendar"></i> Follow-up: ' + escapeHtml(c.follow_up_date) + ' ' : ''}
                            &middot; ${date}
                        </small>
                        ${c.notes ? `<small class="call-log-notes">${escapeHtml(c.notes)}</small>` : ''}
                    </div>
                    <button class="delete-btn" onclick="deleteCallLog(${c.id})" title="Delete" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:4px;"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            });
            html += '</div>';
        } else {
            html += '<div style="text-align:center; padding:10px; color:var(--text-muted);">No calls logged yet. Start by logging your first call!</div>';
        }
        body.innerHTML = html;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load call log</div>'; }
}

function showLogCallModal() {
    const modal = document.getElementById('workspace-modal');
    const form = document.getElementById('workspace-item-form');
    document.getElementById('workspace-modal-title').innerText = 'Log Call';
    form.onsubmit = (e) => saveCallLog(e);
    document.getElementById('ws-item-id').value = '';
    document.getElementById('ws-item-type').value = 'call';

    // Repurpose fields
    document.getElementById('ws-item-title').value = '';
    document.getElementById('ws-item-title').setAttribute('placeholder', 'Lead name...');
    document.getElementById('ws-item-title').parentElement.querySelector('label').textContent = 'Lead Name *';

    document.getElementById('ws-item-desc').value = '';
    document.getElementById('ws-item-desc').setAttribute('rows', '3');
    document.getElementById('ws-item-desc').setAttribute('placeholder', 'Call notes...');
    document.getElementById('ws-item-desc').parentElement.querySelector('label').textContent = 'Notes';

    document.getElementById('ws-item-status').parentElement.querySelector('label').textContent = 'Call Result *';
    const statusSel = document.getElementById('ws-item-status');
    statusSel.innerHTML = `<option value="answered">Answered</option><option value="no_answer">No Answer</option><option value="callback">Callback Requested</option><option value="converted">Converted</option><option value="rejected">Rejected</option>`;

    // Extra fields
    document.getElementById('ws-meta-fields').innerHTML = `
        <div class="ws-form-group"><label>Company Name</label><input type="text" id="ws-call-company" placeholder="Company name..."></div>
        <div class="ws-form-group"><label>Phone</label><input type="text" id="ws-call-phone" placeholder="+998 ..."></div>
        <div class="ws-form-group"><label>Email</label><input type="email" id="ws-call-email" placeholder="email@company.com"></div>
        <div class="ws-form-group"><label>Interest Level</label><select id="ws-call-interest"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></div>
        <div class="ws-form-group"><label>Preferred Office</label><select id="ws-call-office"><option value="">Not discussed</option><option value="IT Park HQ">IT Park HQ — Tashkent</option><option value="IT Park Samarkand">IT Park — Samarkand</option><option value="CSpace">CSpace</option><option value="Shakespeare">Shakespeare</option><option value="Ground Zero">Ground Zero</option></select></div>
        <div class="ws-form-group"><label>Follow-up Date</label><input type="date" id="ws-call-followup"></div>
    `;
    modal.style.display = 'flex';
}

async function saveCallLog(e) {
    e.preventDefault();
    const lead_name = document.getElementById('ws-item-title').value.trim();
    const call_result = document.getElementById('ws-item-status').value;
    const notes = document.getElementById('ws-item-desc').value.trim();
    const company_name = document.getElementById('ws-call-company')?.value.trim() || '';
    const phone = document.getElementById('ws-call-phone')?.value.trim() || '';
    const email = document.getElementById('ws-call-email')?.value.trim() || '';
    const interest_level = document.getElementById('ws-call-interest')?.value || 'medium';
    const preferred_office = document.getElementById('ws-call-office')?.value || '';
    const follow_up_date = document.getElementById('ws-call-followup')?.value || '';

    if (!lead_name || !call_result) return alert('Lead name and call result are required');

    try {
        const res = await fetch('/workspace/calls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ lead_name, company_name, phone, email, call_result, interest_level, preferred_office, notes, follow_up_date })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        closeWorkspaceModal();
        document.getElementById('workspace-item-form').onsubmit = (ev) => saveTrackedItem(ev);
        // Refresh call log widget
        if (workspaceConfig) {
            workspaceConfig.widgets.forEach(wId => {
                const wDef = workspaceConfig.widgetDefinitions[wId];
                if (wDef && wDef.dataSource === 'calls') renderCallLogWidget(wId, wDef);
            });
        }
        loadWorkspaceMetrics();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteCallLog(id) {
    if (!confirm('Delete this call log entry?')) return;
    try {
        const res = await fetch(`/workspace/calls/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        if (workspaceConfig) {
            workspaceConfig.widgets.forEach(wId => {
                const wDef = workspaceConfig.widgetDefinitions[wId];
                if (wDef && wDef.dataSource === 'calls') renderCallLogWidget(wId, wDef);
            });
        }
    } catch (err) { alert('Error: ' + err.message); }
}

// ── Tracked Item CRUD ──
let _editingItemId = null;
let _currentItemType = '';

function showAddItemModal(itemType) {
    _editingItemId = null;
    _currentItemType = itemType;
    document.getElementById('workspace-modal-title').innerText = `Add ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`;
    document.getElementById('ws-item-id').value = '';
    document.getElementById('ws-item-type').value = itemType;
    document.getElementById('ws-item-title').value = '';
    document.getElementById('ws-item-desc').value = '';
    document.getElementById('ws-item-status').value = 'active';
    document.getElementById('ws-meta-fields').innerHTML = '';
    document.getElementById('workspace-modal').style.display = 'flex';
}

async function editTrackedItem(id) {
    try {
        const res = await fetch(`/workspace/items`, { credentials: 'include' });
        const items = await res.json();
        const item = items.find(i => i.id === id);
        if (!item) return alert('Item not found');

        _editingItemId = id;
        _currentItemType = item.item_type;
        document.getElementById('workspace-modal-title').innerText = `Edit ${item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1)}`;
        document.getElementById('ws-item-id').value = id;
        document.getElementById('ws-item-type').value = item.item_type;
        document.getElementById('ws-item-title').value = item.title;
        document.getElementById('ws-item-desc').value = item.description || '';
        document.getElementById('ws-item-status').value = item.status;
        document.getElementById('ws-meta-fields').innerHTML = '';
        document.getElementById('workspace-modal').style.display = 'flex';
    } catch (err) { alert('Error loading item'); }
}

function closeWorkspaceModal() {
    document.getElementById('workspace-modal').style.display = 'none';
}

async function saveTrackedItem(e) {
    e.preventDefault();
    const id = document.getElementById('ws-item-id').value;
    const itemType = document.getElementById('ws-item-type').value;
    const title = document.getElementById('ws-item-title').value.trim();
    const description = document.getElementById('ws-item-desc').value.trim();
    const status = document.getElementById('ws-item-status').value;

    if (!title) return alert('Title is required');

    const payload = { title, description, status };
    if (!id) payload.item_type = itemType;

    try {
        const url = id ? `/workspace/items/${id}` : '/workspace/items';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        closeWorkspaceModal();
        loadWorkspaceMetrics();
        // Re-render all tracked item widgets
        if (workspaceConfig) {
            workspaceConfig.widgets.forEach(wId => {
                const wDef = workspaceConfig.widgetDefinitions[wId];
                if (wDef && wDef.dataSource === 'items') renderTrackedItemsWidget(wId, wDef);
            });
        }
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteTrackedItem(id, title) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`/workspace/items/${id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        loadWorkspaceMetrics();
        if (workspaceConfig) {
            workspaceConfig.widgets.forEach(wId => {
                const wDef = workspaceConfig.widgetDefinitions[wId];
                if (wDef && wDef.dataSource === 'items') renderTrackedItemsWidget(wId, wDef);
            });
        }
    } catch (err) { alert('Error: ' + err.message); }
}

/* =========================
   📊 DASHBOARD CHARTS
========================= */
function renderDashboard(newsData) {
    const canvasTopic = document.getElementById('topicChart');
    const canvasSource = document.getElementById('sourceChart');
    if (!canvasTopic || !canvasSource) return;

    const ctxTopic = canvasTopic.getContext('2d');
    const ctxSource = canvasSource.getContext('2d');

    const topics = {};
    const sources = {};
    
    newsData.forEach(item => {
        const t = item.topic || 'General';
        topics[t] = (topics[t] || 0) + 1;
        
        const s = item.source || 'Unknown';
        sources[s] = (sources[s] || 0) + 1;
    });

    const sortedSources = Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (topicChartInstance) topicChartInstance.destroy();
    if (sourceChartInstance) sourceChartInstance.destroy();

    topicChartInstance = new Chart(ctxTopic, {
        type: 'doughnut',
        data: {
            labels: Object.keys(topics),
            datasets: [{
                data: Object.values(topics),
                backgroundColor: ['#7dba28', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });

    sourceChartInstance = new Chart(ctxSource, {
        type: 'bar',
        data: {
            labels: sortedSources.map(s => s[0]),
            datasets: [{
                label: 'Articles Count',
                data: sortedSources.map(s => s[1]),
                backgroundColor: '#64748b',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

/* =========================
   📑 TAB LOGIC
========================= */
function showTab(tab) {
  currentTab = tab;
  
  // UI Update
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tab-${tab}`);
  if(btn) btn.classList.add('active');

  // Get Containers
  const newsContainer = document.getElementById('news-container');
  const dashContainer = document.getElementById('dashboard-container');
  const nlaContainer = document.getElementById('nla-container');
  const statsContainer = document.getElementById('stats-container');
  const archiveContainer = document.getElementById('archive-container');
  const adminContainer = document.getElementById('admin-container');
  const workspaceContainer = document.getElementById('workspace-container');

  const filters = document.getElementById('filters');
  const tabTitle = document.getElementById('tab-title');
  const loadMore = document.getElementById('load-more-container');

  // Hide All
  if(newsContainer) newsContainer.style.display = 'none';
  if(dashContainer) dashContainer.style.display = 'none';
  if(nlaContainer) nlaContainer.style.display = 'none';
  if(statsContainer) statsContainer.style.display = 'none';
  if(archiveContainer) archiveContainer.style.display = 'none';
  if(adminContainer) adminContainer.style.display = 'none';
  if(workspaceContainer) workspaceContainer.style.display = 'none';
  if(filters) filters.style.display = 'flex';
  if(loadMore) loadMore.style.display = 'none';

  // --- LOGIC PER TAB ---

  if (tab === 'dashboard') {
    if(tabTitle) tabTitle.innerText = 'Market Analytics';
    if(dashContainer) dashContainer.style.display = 'block';
    if(filters) filters.style.display = 'none';
    const topic = document.getElementById('topic-filter')?.value || '';
    const query = new URLSearchParams({ limit: 50, topic });
    fetch(`/news?${query.toString()}`).then(r => r.json()).then(data => renderDashboard(data));

  } else if (tab === 'saved') {
    if(tabTitle) tabTitle.innerText = 'Saved Bookmarks';
    if(newsContainer) newsContainer.style.display = 'grid';
    resetNews();
    loadNews();

  } else if (tab === 'nla') {
    if(tabTitle) tabTitle.innerText = 'Normative Legal Acts';
    if(nlaContainer) nlaContainer.style.display = 'block';
    if(nlaState.step === 0) renderNLA(); 
    else renderNLA(); 

  } else if (tab === 'stats') {
    if(tabTitle) tabTitle.innerText = 'IT Ecosystem Statistics';
    if(statsContainer) statsContainer.style.display = 'block';
    loadStats();

  } else if (tab === 'archive') {
    if(tabTitle) tabTitle.innerText = 'Research Archive';
    if(archiveContainer) archiveContainer.style.display = 'block';
    if(filters) filters.style.display = 'none';
    loadArchive();

  } else if (tab === 'workspace') {
    if(tabTitle) tabTitle.innerText = 'My Workspace';
    if(workspaceContainer) workspaceContainer.style.display = 'block';
    if(filters) filters.style.display = 'none';
    loadWorkspace();

  } else if (tab === 'admin') {
    if (!currentUser || currentUser.role !== 'admin') { showTab('all'); return; }
    if(tabTitle) tabTitle.innerText = 'Admin Panel';
    if(adminContainer) adminContainer.style.display = 'block';
    if(filters) filters.style.display = 'none';
    loadAdminOverview();

  } else {
    // 'all' (News Feed)
    if(tabTitle) tabTitle.innerText = 'News Feed';
    if(newsContainer) newsContainer.style.display = 'grid';
    if(loadMore) loadMore.style.display = 'block';
    
    if(newsContainer && newsContainer.children.length === 0) {
        resetNews();
        loadNews();
    }
  }
}

function resetNews() {
  offset = 0;
  selectedNews = [];
  toggleGenerateButton();
  const container = document.getElementById('news-container');
  if (container) container.innerHTML = '';
}

/* =========================
   📰 LOAD NEWS
========================= */
async function loadNews() {
  if (currentTab === 'dashboard' || currentTab === 'archive') return;
  if (isLoading) return;
  isLoading = true;

  const loader = document.getElementById('loader');
  if(loader) loader.style.display = 'block';

  const container = document.getElementById('news-container');
  if(offset === 0 && container) container.innerHTML = '';

  try {
    let url = '';
    
    if (currentTab === 'saved') {
        url = '/news/saved';
    } else {
        const topic = document.getElementById('topic-filter')?.value || '';
        const department = document.getElementById('department-filter')?.value || '';
        const keyword = document.getElementById('keyword')?.value || '';
        const country = document.getElementById('country-filter')?.value || '';

        const query = new URLSearchParams({ topic, department, keyword, country, limit, offset });
        if(currentUser) query.append('userId', currentUser.id);
        
        url = `/news?${query.toString()}`;
    }

    const res = await fetch(url, { credentials: 'include' });
    const news = await res.json();

    if (!news.length && offset === 0) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#64748b;">No items found.</div>`;
      toggleLoadMore(false);
      return;
    }

    news.forEach(item => createCard(container, item));
    
    if(currentTab !== 'saved') {
        offset += limit;
        toggleLoadMore(news.length === limit);
    } else {
        toggleLoadMore(false);
    }

  } catch (err) {
    console.error(err);
  } finally {
    isLoading = false;
    if(loader) loader.style.display = 'none';
  }
}

/* =========================
   ⚖️ LOAD NLA
========================= */
async function loadNLA() {
    renderNLA();
}

/* =========================
   📈 LOAD STATS
========================= */
async function loadStats() {
    const container = document.getElementById('stats-grid');
    const country = document.getElementById('country-filter')?.value || '';
    container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    const res = await fetch(`/stats?country=${country}`);
    const data = await res.json();

    container.innerHTML = '';
    if(data.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:#64748b;">No ecosystem stats found for this country.</div>';
        return;
    }

    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'stat-card-display';
        div.innerHTML = `
            <div class="stat-main">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                     <div class="stat-entity">${item.entity_name}</div>
                     <span style="font-size:0.8rem; color:#94a3b8;">${item.country_name}</span>
                </div>
                <div class="stat-value">${item.metric_value}</div>
                <div class="stat-metric">${item.metric_name}</div>
                <div style="margin-top:5px; font-size:0.8rem; color:#cbd5e1;">Source: ${item.source}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

/* =========================
   🧱 CREATE CARD
========================= */
function createCard(container, item) {
  const card = document.createElement('div');
  card.className = 'news-card';

  const placeholderHTML = `<div style="width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;
  const noImageHTML = `<div style="width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;"><i class="fa-solid fa-image fa-2x"></i></div>`;
  let imageHTML = `<div class="card-image-wrapper">`;
  if (item.image) {
    imageHTML += `<img src="${item.image}" onerror="this.onerror=null;this.parentElement.innerHTML=\`${noImageHTML}\`">`;
  } else {
    // Show loading spinner, then lazy-load og:image from article URL
    imageHTML += placeholderHTML;
  }
  imageHTML += `</div>`;

  const isSaved = item.saved === true;
  const saveBtnClass = isSaved ? 'save-btn active' : 'save-btn';
  const saveBtnText = isSaved ? '<i class="fa-solid fa-bookmark"></i> Saved' : '<i class="fa-regular fa-bookmark"></i> Save';
  
  const linkText = item.type === 'rss' ? 'Read (RSS)' : 'Read Full Story';
  const mediaLink = `<a href="${item.url}" target="_blank" style="color:var(--primary);font-size:0.9rem;text-decoration:none;">${linkText} &rarr;</a>`;

  const telegramBtn = currentUser 
    ? `<button class="share-btn" title="Send to Telegram Group"><i class="fa-brands fa-telegram"></i></button>` 
    : '';

  const dateStr = item.published_at ? new Date(item.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  card.innerHTML = `
    ${imageHTML}
    <div class="card-body">
      <div class="card-meta">
        <span class="badge">${item.topic || 'General'}</span>
        <span>• ${item.source || 'Unknown'}</span>
        ${dateStr ? `<span>• <i class="fa-regular fa-calendar"></i> ${dateStr}</span>` : ''}
      </div>
      <h3 class="card-title">${item.title}</h3>
      <p class="card-desc">${item.description || 'No description available.'}</p>
      <div style="margin-bottom:10px;">${mediaLink}</div>
      <div class="card-footer">
        <div style="display:flex; gap:10px; align-items:center;">
             ${currentUser ? `<button class="${saveBtnClass}">${saveBtnText}</button>` : ''}
             ${telegramBtn} 
        </div>
        <span class="relevance-score">Match: ${item.relevance || 'N/A'}</span>
      </div>
    </div>
  `;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'card-select-check';
  checkbox.onchange = () => {
    if(checkbox.checked) selectedNews.push(item);
    else selectedNews = selectedNews.filter(n => n.id !== item.id);
    toggleGenerateButton();
  };
  card.prepend(checkbox);

  const saveBtn = card.querySelector('.save-btn');
  if(saveBtn) {
      saveBtn.onclick = async () => {
        if(saveBtn.classList.contains('active')) {
            await fetch('/news/unsave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newsId: item.id })
            });
            saveBtn.classList.remove('active');
            saveBtn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Save';
            item.saved = false;
            if(currentTab === 'saved') card.remove();
        } else {
            await fetch('/news/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            saveBtn.classList.add('active');
            saveBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Saved';
            item.saved = true;
        }
      };
  }

  const shareBtn = card.querySelector('.share-btn');
  if(shareBtn) {
      shareBtn.onclick = () => shareToTelegram(item, shareBtn);
  }

  container.appendChild(card);

  // Lazy-load og:image if no image was provided
  if (!item.image && item.url) {
    const wrapper = card.querySelector('.card-image-wrapper');
    fetch(`/api/og-image?url=${encodeURIComponent(item.url)}`)
      .then(r => r.json())
      .then(data => {
        if (data.image) {
          item.image = data.image;
          wrapper.innerHTML = `<img src="${data.image}" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;\\'><i class=\\'fa-solid fa-image fa-2x\\'></i></div>'">`;
        } else {
          wrapper.innerHTML = `<div style="width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;"><i class="fa-solid fa-image fa-2x"></i></div>`;
        }
      })
      .catch(() => {
        wrapper.innerHTML = `<div style="width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;"><i class="fa-solid fa-image fa-2x"></i></div>`;
      });
  }
}

function toggleLoadMore(show) {
  const btn = document.getElementById('load-more-btn');
  if (btn) btn.style.display = show ? 'block' : 'none';
}

function toggleGenerateButton() {
  const box = document.getElementById('report-actions');
  if (box) box.style.display = selectedNews.length > 0 ? 'block' : 'none';
}

/* =========================
   🚀 INIT
========================= */
window.onload = async () => {
  await fetchCurrentUser();
  showTab('all');

  const genBtn = document.getElementById('generate-report-btn');
  if(genBtn) {
      genBtn.onclick = async () => {
          if(!selectedNews.length) return alert("Select news first");
          genBtn.innerText = "Generating...";
          try {
              const res = await fetch('/news/report', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({ news: selectedNews, period: { from: '2026', to: '2026'} })
              });
              
              if(!res.ok) throw new Error("Failed to generate PDF");
              
              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'IT-Park-Bulletin.pdf';
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              a.remove();
          } catch(e) { 
              alert("Error generating PDF. Please try selecting fewer items or items without large images."); 
              console.error(e);
          } finally { 
              genBtn.innerText = "Generate PDF"; 
          }
      };
  }
};

/* =========================
   ✈️ TELEGRAM SHARE
========================= */
async function shareToTelegram(item, btn) {
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; 
    btn.disabled = true;

    try {
        const res = await fetch('/news/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });

        if (res.ok) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i>'; 
            setTimeout(() => {
                btn.innerHTML = originalIcon;
                btn.disabled = false;
            }, 2000);
        } else {
            throw new Error('Failed');
        }
    } catch (e) {
        alert('Failed to send notification. Check server logs.');
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}

/* =========================
   ⚖️ NLA LOGIC (MULTI-COUNTRY LIVE & DOWNLOADS)
========================= */

let nlaState = {
    step: 0, 
    selectedCountry: null,
    selectedCategory: null,
    selectedIssuer: null,
    selectedTopic: null
};

// 🇺🇿 UZBEKISTAN SECTORS (Lex.uz)
const UZ_SECTORS = [
    { name: "Digital Economy", query: "raqamli iqtisodiyot", icon: "fa-chart-line" },
    { name: "IT & Startups", query: "startap", icon: "fa-rocket" },
    { name: "Crypto Assets", query: "kripto-aktiv", icon: "fa-bitcoin-sign" },
    { name: "Artificial Intelligence", query: "sun'iy intellekt", icon: "fa-brain" },
    { name: "E-Government", query: "elektron hukumat", icon: "fa-building-columns" },
    { name: "Cybersecurity", query: "kiberxavfsizlik", icon: "fa-shield-halved" },
    { name: "IT Education", query: "axborot texnologiyalari ta'lim", icon: "fa-graduation-cap" }
];

// 🇰🇿 KAZAKHSTAN SECTORS (Adilet)
const KZ_SECTORS = [
    { name: "Astana Hub", query: "Astana Hub", icon: "fa-hubspot" },
    { name: "Digital Assets", query: "цифровые активы", icon: "fa-coins" },
    { name: "Informatization", query: "информатизация", icon: "fa-network-wired" },
    { name: "Venture Capital", query: "венчурное финансирование", icon: "fa-hand-holding-dollar" },
    { name: "Cybersecurity", query: "кибербезопасность", icon: "fa-user-shield" }
];

// 🇸🇬 SINGAPORE SECTORS (SSO)
const SG_SECTORS = [
    { name: "Smart Nation", query: "Smart Nation", icon: "fa-city" },
    { name: "Fintech & Payments", query: "Payment Services", icon: "fa-wallet" },
    { name: "Artificial Intelligence", query: "Computer Misuse", icon: "fa-brain" },
    { name: "Cybersecurity", query: "Cybersecurity", icon: "fa-user-shield" },
    { name: "Personal Data (PDPA)", query: "Personal Data Protection", icon: "fa-id-card" }
];

// 🇬🇧 UNITED KINGDOM SECTORS (Legislation.gov.uk)
const UK_SECTORS = [
    { name: "Online Safety", query: "Online Safety", icon: "fa-child-reaching" },
    { name: "Data Protection", query: "Data Protection", icon: "fa-database" },
    { name: "Digital Markets", query: "Digital Markets", icon: "fa-shop" },
    { name: "Artificial Intelligence", query: "Artificial Intelligence", icon: "fa-robot" }
];

// 🇺🇸 USA SECTORS
const US_SECTORS = [
    { name: "Artificial Intelligence", query: "Artificial Intelligence", icon: "fa-brain" },
    { name: "Cybersecurity", query: "Cybersecurity", icon: "fa-user-shield" },
    { name: "CHIPS Act", query: "CHIPS Act", icon: "fa-microchip" },
    { name: "Data Privacy", query: "Data Privacy", icon: "fa-user-lock" }
];

// 🇪🇪 ESTONIA SECTORS
const EE_SECTORS = [
    { name: "Electronic ID", query: "Electronic Identification", icon: "fa-id-card-clip" },
    { name: "Cybersecurity", query: "Cybersecurity Act", icon: "fa-shield-virus" },
    { name: "Digital Signature", query: "Digital Signature", icon: "fa-file-signature" },
    { name: "Public Information", query: "Public Information Act", icon: "fa-users-viewfinder" }
];

// 🇨🇳 CHINA SECTORS (Queries in English -> Found via Bing)
const CN_SECTORS = [
    { name: "Personal Information", query: "Personal Information Protection", icon: "fa-id-badge" },
    { name: "Data Security", query: "Data Security Law", icon: "fa-database" },
    { name: "Cybersecurity", query: "Cybersecurity Law", icon: "fa-shield-halved" },
    { name: "E-Commerce", query: "E-Commerce Law", icon: "fa-cart-shopping" }
];

// 🇵🇱 POLAND SECTORS (Queries in Polish)
const PL_SECTORS = [
    { name: "Cybersecurity (KSC)", query: "krajowym systemie cyberbezpieczeństwa", icon: "fa-shield" },
    { name: "Informatization", query: "informatyzacji działalności", icon: "fa-computer" },
    { name: "Data Protection", query: "ochronie danych osobowych", icon: "fa-user-shield" }
];

// 🇻🇳 VIETNAM SECTORS (Queries in Vietnamese)
const VN_SECTORS = [
    { name: "E-Transactions", query: "giao dịch điện tử", icon: "fa-comments-dollar" },
    { name: "Cybersecurity", query: "an ninh mạng", icon: "fa-user-secret" },
    { name: "Information Tech", query: "công nghệ thông tin", icon: "fa-laptop" }
];

/* =========================
   ⚖️ MAIN RENDER FUNCTION
========================= */
async function renderNLA() {
    const container = document.getElementById('nla-grid');
    const breadcrumbs = document.getElementById('nla-breadcrumbs');
    container.innerHTML = '<div class="spinner"></div>';

    // ------------------------------------------
    // STEP 0: SELECT COUNTRY
    // ------------------------------------------
    if (nlaState.step === 0) {
        if(breadcrumbs) breadcrumbs.innerHTML = 'Select Jurisdiction';
        
        const res = await fetch('/nla/countries');
        const countries = await res.json();
        
        container.className = 'nla-grid-countries';
        container.innerHTML = '';

        countries.forEach(c => {
            const div = document.createElement('div');
            div.className = 'nla-country-card';
            div.innerHTML = `
                <img src="https://flagcdn.com/${c.country_code}.svg" width="60">
                <h3>${c.country_name}</h3>
                <small style="color:#64748b;">${c.type}</small>
            `;
            div.onclick = () => {
                nlaState.selectedCountry = c.country_code;
                nlaState.step = 1;
                renderNLA();
            };
            container.appendChild(div);
        });
    }

    // ------------------------------------------
    // STEP 1: SELECT CATEGORY
    // ------------------------------------------
    else if (nlaState.step === 1) {
        if(breadcrumbs) breadcrumbs.innerHTML = `<span onclick="resetNLA()" style="cursor:pointer; color:#2563eb;">Countries</span> > Select Topic`;
        
        let sectors = [];
        const c = nlaState.selectedCountry;

        if (c === 'uz') sectors = UZ_SECTORS;
        else if (c === 'kz') sectors = KZ_SECTORS;
        else if (c === 'sg') sectors = SG_SECTORS;
        else if (c === 'gb') sectors = UK_SECTORS;
        else if (c === 'us') sectors = US_SECTORS;
        else if (c === 'ee') sectors = EE_SECTORS;
        else if (c === 'cn') sectors = CN_SECTORS;
        else if (c === 'pl') sectors = PL_SECTORS;
        else if (c === 'vn') sectors = VN_SECTORS;

        container.className = 'nla-grid-countries';
        container.innerHTML = '';

        sectors.forEach(sector => {
            const div = document.createElement('div');
            div.className = 'nla-country-card';
            div.innerHTML = `
                <div style="font-size:2rem; color:var(--primary); margin-bottom:10px;">
                    <i class="fa-solid ${sector.icon} fa-fw"></i>
                </div>
                <h3>${sector.name}</h3>
                <small style="color:#64748b;">Search Official DB</small>
            `;
            div.onclick = () => {
                nlaState.selectedCategory = sector.query;
                nlaState.step = 2;
                renderNLA();
            };
            container.appendChild(div);
        });
    }

    // ------------------------------------------
    // STEP 2: SHOW RESULTS
    // ------------------------------------------
    else if (nlaState.step === 2) {
        if(breadcrumbs) breadcrumbs.innerHTML = `<span onclick="backToStep(1)" style="cursor:pointer; color:#2563eb;">Topics</span> > Results`;
        
        const c = nlaState.selectedCountry;
        let apiEndpoint = `/nla/live/search?query=${nlaState.selectedCategory}`; // Default UZ
        
        if (c === 'kz') apiEndpoint = `/nla/live/kz/search?query=${nlaState.selectedCategory}`;
        else if (c === 'sg') apiEndpoint = `/nla/live/sg/search?query=${nlaState.selectedCategory}`;
        else if (c === 'gb') apiEndpoint = `/nla/live/uk/search?query=${nlaState.selectedCategory}`;
        else if (c === 'us') apiEndpoint = `/nla/live/us/search?query=${nlaState.selectedCategory}`;
        else if (c === 'ee') apiEndpoint = `/nla/live/ee/search?query=${nlaState.selectedCategory}`;
        else if (c === 'cn') apiEndpoint = `/nla/live/cn/search?query=${nlaState.selectedCategory}`;
        else if (c === 'pl') apiEndpoint = `/nla/live/pl/search?query=${nlaState.selectedCategory}`;
        else if (c === 'vn') apiEndpoint = `/nla/live/vn/search?query=${nlaState.selectedCategory}`;

        container.innerHTML = `<div class="spinner"></div><p style="text-align:center">Connecting to official database...</p>`;
        container.className = 'nla-list-view';

        try {
            const res = await fetch(apiEndpoint);
            const results = await res.json();

            container.innerHTML = '';
            if (!results || results.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:20px;">No direct matches found.</div>';
                return;
            }

            results.forEach(doc => {
                const div = document.createElement('div');
                div.className = 'nla-law-card'; 
                
                let btns = '';
                
                // --- Download/Link Logic based on Country ---
                if (c === 'uz') {
                    btns = `<a href="/nla/download/${doc.id}" target="_blank" class="btn-lang btn-uz"><b>Download (UZ)</b></a>
                            <a href="https://lex.uz/ru/docs/${doc.id}" target="_blank" class="btn-lang btn-ru"><b>View RU</b></a>`;
                }
                else if (c === 'kz') {
                    btns = `<a href="/nla/live/kz/download/${doc.id}" target="_blank" class="btn-lang btn-ru"><i class="fa-solid fa-file-word"></i> <b>Download</b></a>
                            <a href="${doc.url}" target="_blank" class="btn-lang btn-en"><b>Adilet</b></a>`;
                }
                else if (c === 'sg') {
                    btns = `<a href="${doc.pdf}" target="_blank" class="btn-lang btn-en" style="background:#e0f2fe; color:#0284c7;"><i class="fa-solid fa-file-pdf"></i> <b>PDF</b></a>
                            <a href="${doc.url}" target="_blank" class="btn-lang btn-en"><b>View SSO</b></a>`;
                }
                else if (c === 'gb') {
                    btns = `<a href="${doc.pdf}" target="_blank" class="btn-lang btn-en" style="background:#fce7f3; color:#831843;"><i class="fa-solid fa-file-pdf"></i> <b>PDF</b></a>
                            <a href="${doc.url}" target="_blank" class="btn-lang btn-en"><b>Legislation.gov.uk</b></a>`;
                }
                else if (c === 'us') {
                    btns = `<a href="${doc.url}" target="_blank" class="btn-lang btn-en" style="background:#1e3a8a; color:white;"><i class="fa-solid fa-landmark"></i> <b>Congress.gov</b></a>`;
                }
                else if (c === 'ee') {
                    btns = `<a href="${doc.url}" target="_blank" class="btn-lang btn-en" style="background:#0072CE; color:white;"><i class="fa-solid fa-scale-balanced"></i> <b>Riigi Teataja</b></a>`;
                }
                else if (c === 'cn') {
                    btns = `<a href="${doc.url}" target="_blank" class="btn-lang btn-en" style="background:#de2910; color:#ffde00;"><i class="fa-solid fa-gavel"></i> <b>Official DB</b></a>`;
                }
                else if (c === 'pl') {
                    btns = `<a href="${doc.url}" target="_blank" class="btn-lang btn-en" style="background:#dc143c; color:white;"><b>ISAP Sejm</b></a>`;
                }
                else if (c === 'vn') {
                    btns = `<a href="${doc.url}" target="_blank" class="btn-lang btn-en" style="background:#da251d; color:#ffcd00;"><b>VBPL</b></a>`;
                }

                div.innerHTML = `
                    <div class="nla-card-header">
                        <div class="nla-icon-box"><i class="fa-solid fa-scale-balanced"></i></div>
                        <div>
                            <h4 class="nla-card-title">${doc.title}</h4>
                            <div class="nla-card-meta"><span>${doc.date}</span> • <span>${doc.issuer}</span></div>
                        </div>
                    </div>
                    <div class="nla-download-group">${btns}</div>
                `;
                container.appendChild(div);
            });
        } catch (e) {
            container.innerHTML = '<div style="color:red; text-align:center;">Connection Error.</div>';
        }
    }
}

// --- HELPER FUNCTIONS ---

function resetNLA() {
    nlaState.step = 0;
    renderNLA();
}

function backToStep(s) {
    nlaState.step = s;
    renderNLA();
}

// --- DATABASE READER (FOR OTHER COUNTRIES) ---
async function loadLawContent(id) {
    const reader = document.getElementById('nla-reader-modal');
    const contentBox = document.getElementById('nla-reader-content');
    reader.style.display = 'flex';
    contentBox.innerHTML = '<div class="spinner"></div>';
    
    const res = await fetch(`/nla/content/${id}`);
    const doc = await res.json();
    
    const domain = new URL(doc.source_url).hostname;
    
    contentBox.innerHTML = `
        <h1 style="font-size:1.8rem; margin:5px 0 15px 0; line-height:1.3;">${doc.title}</h1>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-bottom:25px;">
            <div class="meta-box"><span class="label">Issuer</span><span class="val">${doc.legal_issuer}</span></div>
            <div class="meta-box"><span class="label">Topic</span><span class="val">${doc.legal_topic}</span></div>
            <div class="meta-box"><span class="label">Date</span><span class="val">${doc.enactment_date}</span></div>
        </div>
        <div style="font-family: 'Georgia', serif; font-size: 1.15rem; line-height: 1.8; color:#334155; white-space: pre-wrap; border-top:1px solid #e2e8f0; padding-top:20px;">
            ${doc.full_text}
        </div>
        <div style="margin-top:40px; text-align:center;">
            <a href="${doc.source_url}" target="_blank" class="primary-btn">View Original on ${domain}</a>
        </div>
    `;
}

/* =========================================
   RESEARCH ARCHIVE
   ========================================= */

let archiveData = [];
let archiveTopics = [];
let activeArchiveTopic = '';
let archiveViewMode = 'list';

const DOC_TYPE_ICONS = {
    article: 'fa-file-lines',
    report: 'fa-chart-bar',
    brief: 'fa-file-contract',
    presentation: 'fa-file-powerpoint',
    analysis: 'fa-magnifying-glass-chart'
};

const DOC_TYPE_COLORS = {
    article: '#3b82f6',
    report: '#8b5cf6',
    brief: '#f59e0b',
    presentation: '#ef4444',
    analysis: '#10b981'
};

const DOC_TYPE_LABELS = {
    article: 'Articles',
    report: 'Reports',
    brief: 'Briefs',
    presentation: 'Presentations',
    analysis: 'Analyses'
};

async function loadArchive() {
    const list = document.getElementById('archive-list');
    const topicsBar = document.getElementById('archive-topics');
    const statsBar = document.getElementById('archive-stats-bar');
    const addBtn = document.getElementById('archive-add-btn');

    // Show skeleton loading
    list.innerHTML = Array(3).fill(`
        <div class=”archive-skeleton”>
            <div class=”archive-skeleton-icon”></div>
            <div class=”archive-skeleton-body”>
                <div class=”archive-skeleton-line”></div>
                <div class=”archive-skeleton-line short”></div>
                <div class=”archive-skeleton-line shorter”></div>
            </div>
        </div>
    `).join('');

    if (currentUser && currentUser.role === 'admin') addBtn.style.display = 'inline-flex';
    else addBtn.style.display = 'none';

    try {
        const [topicsRes, itemsRes] = await Promise.all([
            fetch('/archive-topics'),
            fetch(activeArchiveTopic ? `/archive?topic=${encodeURIComponent(activeArchiveTopic)}` : '/archive')
        ]);
        archiveTopics = await topicsRes.json();
        archiveData = await itemsRes.json();

        // Render stats bar
        const total = archiveTopics.reduce((s, t) => s + t.count, 0);
        const withFiles = archiveData.filter(i => i.file_name).length;
        const typeCounts = {};
        archiveData.forEach(i => { typeCounts[i.doc_type] = (typeCounts[i.doc_type] || 0) + 1; });
        const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

        statsBar.innerHTML = `
            <div class=”archive-stat-card”>
                <div class=”archive-stat-icon” style=”background:var(--primary-light); color:var(--primary);”><i class=”fa-solid fa-book”></i></div>
                <div><div class=”archive-stat-value”>${total}</div><div class=”archive-stat-label”>Total Documents</div></div>
            </div>
            <div class=”archive-stat-card”>
                <div class=”archive-stat-icon” style=”background:#ede9fe; color:#7c3aed;”><i class=”fa-solid fa-tags”></i></div>
                <div><div class=”archive-stat-value”>${archiveTopics.length}</div><div class=”archive-stat-label”>Topics</div></div>
            </div>
            <div class=”archive-stat-card”>
                <div class=”archive-stat-icon” style=”background:#e0f2fe; color:#0284c7;”><i class=”fa-solid fa-paperclip”></i></div>
                <div><div class=”archive-stat-value”>${withFiles}</div><div class=”archive-stat-label”>With Files</div></div>
            </div>
            ${topType ? `<div class=”archive-stat-card”>
                <div class=”archive-stat-icon” style=”background:${DOC_TYPE_COLORS[topType[0]]}15; color:${DOC_TYPE_COLORS[topType[0]]};”><i class=”fa-solid ${DOC_TYPE_ICONS[topType[0]] || 'fa-file'}”></i></div>
                <div><div class=”archive-stat-value”>${topType[1]}</div><div class=”archive-stat-label”>Most: ${DOC_TYPE_LABELS[topType[0]] || topType[0]}</div></div>
            </div>` : ''}
        `;

        // Render topic chips
        topicsBar.innerHTML = `<button onclick=”setArchiveTopic('')” class=”archive-chip ${!activeArchiveTopic ? 'active' : ''}”>All (${total})</button>` +
            archiveTopics.map(t =>
                `<button onclick=”setArchiveTopic('${t.topic}')” class=”archive-chip ${activeArchiveTopic === t.topic ? 'active' : ''}”>${t.topic} (${t.count})</button>`
            ).join('');

        renderArchiveList(archiveData);
    } catch (err) {
        console.error('Archive load error:', err);
        list.innerHTML = '<div style=”text-align:center; padding:40px; color:#ef4444;”>Failed to load archive.</div>';
    }
}

function setArchiveTopic(topic) {
    activeArchiveTopic = topic;
    loadArchive();
}

function filterArchive() {
    const q = (document.getElementById('archive-search').value || '').toLowerCase().trim();
    let filtered = archiveData;
    if (q) {
        filtered = archiveData.filter(item =>
            item.title.toLowerCase().includes(q) ||
            item.topic.toLowerCase().includes(q) ||
            (item.summary || '').toLowerCase().includes(q) ||
            (item.author || '').toLowerCase().includes(q) ||
            (item.doc_type || '').toLowerCase().includes(q)
        );
    }
    // Apply current sort
    const sortBy = document.getElementById('archive-sort')?.value || 'newest';
    if (sortBy === 'newest') filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sortBy === 'oldest') filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sortBy === 'title') filtered.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'type') filtered.sort((a, b) => (a.doc_type || '').localeCompare(b.doc_type || ''));
    renderArchiveList(filtered);
}

function renderArchiveList(items) {
    const list = document.getElementById('archive-list');
    const reader = document.getElementById('archive-reader');
    reader.style.display = 'none';

    if (!items.length) {
        list.className = '';
        list.innerHTML = `
            <div class=”archive-empty”>
                <div class=”archive-empty-icon”><i class=”fa-solid fa-folder-open”></i></div>
                <h3>No research found</h3>
                <p>${activeArchiveTopic || document.getElementById('archive-search').value
                    ? 'Try adjusting your filters or search terms.'
                    : 'Research articles, reports, and analyses will appear here once published.'}</p>
            </div>`;
        return;
    }

    list.className = archiveViewMode === 'grid' ? 'archive-grid-view' : '';

    list.innerHTML = items.map((item, idx) => {
        const icon = DOC_TYPE_ICONS[item.doc_type] || 'fa-file';
        const color = DOC_TYPE_COLORS[item.doc_type] || '#64748b';
        const date = new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const isAdmin = currentUser && currentUser.role === 'admin';
        const fileExt = item.file_name ? item.file_name.split('.').pop().toUpperCase() : '';

        return `
        <div class=”archive-item” style=”animation-delay:${idx * 0.04}s” onclick=”openArchiveItem(${item.id})”>
            <div class=”archive-item-main”>
                <div class=”archive-item-icon” style=”background:${color}15;”>
                    <i class=”fa-solid ${icon}” style=”color:${color};”></i>
                </div>
                <div class=”archive-item-body”>
                    <div class=”archive-item-title”>${item.title}</div>
                    ${item.summary ? `<p class=”archive-item-summary”>${item.summary}</p>` : ''}
                </div>
            </div>
            <div class=”archive-item-footer”>
                <div class=”archive-item-tags”>
                    <span class=”archive-badge” style=”background:${color}15; color:${color};”>${item.doc_type}</span>
                    <span class=”archive-badge-topic”>${item.topic}</span>
                    ${item.file_name ? `<span class=”archive-badge-file”><i class=”fa-solid fa-paperclip”></i>${fileExt}</span>` : ''}
                    ${item.author ? `<span class=”archive-item-meta-text”><i class=”fa-solid fa-user”></i> ${item.author}</span>` : ''}
                    <span class=”archive-item-meta-text”><i class=”fa-regular fa-calendar”></i> ${date}</span>
                </div>
                ${isAdmin ? `<div class=”archive-item-actions”>
                    <button onclick=”event.stopPropagation(); editArchiveItem(${item.id})” title=”Edit” class=”archive-edit-btn-sm”><i class=”fa-solid fa-pen”></i> Edit</button>
                    <button onclick=”event.stopPropagation(); deleteArchiveItem(${item.id})” title=”Delete” class=”archive-delete-btn”><i class=”fa-solid fa-trash-can”></i> Delete</button>
                </div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function setArchiveView(mode) {
    archiveViewMode = mode;
    document.getElementById('archive-view-list').classList.toggle('active', mode === 'list');
    document.getElementById('archive-view-grid').classList.toggle('active', mode === 'grid');
    renderArchiveList(archiveData);
}

function sortArchive() {
    const sortBy = document.getElementById('archive-sort').value;
    let sorted = [...archiveData];
    if (sortBy === 'newest') sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sortBy === 'oldest') sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sortBy === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'type') sorted.sort((a, b) => (a.doc_type || '').localeCompare(b.doc_type || ''));
    renderArchiveList(sorted);
}

async function openArchiveItem(id) {
    const reader = document.getElementById('archive-reader');
    reader.style.display = 'block';
    reader.innerHTML = `
        <button class=”archive-reader-back” onclick=”closeArchiveReader()”>
            <i class=”fa-solid fa-arrow-left”></i> Back to archive
        </button>
        <div class=”archive-reader-body” style=”text-align:center; padding:40px;”>
            <i class=”fa-solid fa-spinner fa-spin fa-2x” style=”color:#94a3b8;”></i>
        </div>`;
    reader.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const res = await fetch(`/archive/${id}`);
        const item = await res.json();
        const color = DOC_TYPE_COLORS[item.doc_type] || '#64748b';
        const icon = DOC_TYPE_ICONS[item.doc_type] || 'fa-file';
        const date = new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const isAdmin = currentUser && currentUser.role === 'admin';
        const fileExt = item.file_name ? item.file_name.split('.').pop().toUpperCase() : '';
        const fileIcon = fileExt === 'PDF' ? 'fa-file-pdf' : fileExt === 'PPTX' || fileExt === 'PPT' ? 'fa-file-powerpoint' : fileExt === 'XLSX' || fileExt === 'XLS' ? 'fa-file-excel' : 'fa-file-word';
        const wordCount = item.content ? item.content.split(/\s+/).length : 0;
        const readTime = Math.max(1, Math.ceil(wordCount / 200));

        reader.innerHTML = `
            <button class=”archive-reader-back” onclick=”closeArchiveReader()”>
                <i class=”fa-solid fa-arrow-left”></i> Back to archive
            </button>
            <div class=”archive-reader-body”>
                <div class=”archive-reader-header”>
                    <div>
                        <h2 class=”archive-reader-title”>${item.title}</h2>
                        <div class=”archive-reader-meta”>
                            <span class=”archive-badge” style=”background:${color}15; color:${color}; padding:4px 10px; border-radius:6px; font-size:0.8rem;”>
                                <i class=”fa-solid ${icon}” style=”margin-right:4px;”></i>${item.doc_type}
                            </span>
                            <span class=”archive-badge-topic” style=”padding:4px 10px; border-radius:6px; font-size:0.8rem;”>${item.topic}</span>
                            ${item.author ? `<span class=”archive-item-meta-text” style=”font-size:0.85rem;”><i class=”fa-solid fa-user”></i> ${item.author}</span>` : ''}
                            <span class=”archive-item-meta-text” style=”font-size:0.85rem;”><i class=”fa-regular fa-calendar”></i> ${date}</span>
                            ${wordCount > 0 ? `<span class=”archive-item-meta-text” style=”font-size:0.85rem;”><i class=”fa-regular fa-clock”></i> ${readTime} min read</span>` : ''}
                        </div>
                    </div>
                    <div class=”archive-reader-actions”>
                        ${isAdmin ? `<button onclick=”editArchiveItem(${item.id})” class=”archive-btn-sm”><i class=”fa-solid fa-pen”></i> Edit</button>` : ''}
                        <button onclick=”closeArchiveReader()” class=”archive-btn-sm”><i class=”fa-solid fa-xmark”></i> Close</button>
                    </div>
                </div>
                ${item.file_name ? `
                <div class=”archive-file-card”>
                    <div class=”archive-file-icon”><i class=”fa-solid ${fileIcon}”></i></div>
                    <div class=”archive-file-info”>
                        <div class=”archive-file-name”>${item.file_name}</div>
                        <div class=”archive-file-hint”>${fileExt} document — click to download</div>
                    </div>
                    <a href=”/archive/${item.id}/download” class=”archive-download-btn”><i class=”fa-solid fa-download”></i> Download</a>
                </div>` : ''}
                ${item.summary ? `<div class=”archive-summary-box”>${item.summary}</div>` : ''}
                <div class=”archive-content”>${item.content || '<span style=”color:#94a3b8; font-style:italic;”>No written content — see attached document above.</span>'}</div>
                ${item.source_url ? `<div class=”archive-source-link”><a href=”${item.source_url}” target=”_blank”><i class=”fa-solid fa-arrow-up-right-from-square”></i> View original source</a></div>` : ''}
            </div>
        `;
    } catch (err) {
        reader.innerHTML = `
            <button class=”archive-reader-back” onclick=”closeArchiveReader()”>
                <i class=”fa-solid fa-arrow-left”></i> Back to archive
            </button>
            <div class=”archive-reader-body” style=”text-align:center; padding:30px; color:#ef4444;”>Failed to load article.</div>`;
    }
}

function closeArchiveReader() {
    const reader = document.getElementById('archive-reader');
    reader.style.display = 'none';
    document.getElementById('archive-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showArchiveForm(item) {
    const form = document.getElementById('archive-form');
    form.style.display = 'block';
    document.getElementById('archive-form-title').textContent = item ? 'Edit Research' : 'New Research';
    document.getElementById('archive-edit-id').value = item ? item.id : '';
    document.getElementById('arch-title').value = item ? item.title : '';
    document.getElementById('arch-topic').value = item ? item.topic : '';
    document.getElementById('arch-doctype').value = item ? item.doc_type : 'article';
    document.getElementById('arch-author').value = item ? (item.author || '') : (currentUser ? currentUser.name : '');
    document.getElementById('arch-source').value = item ? (item.source_url || '') : '';
    document.getElementById('arch-summary').value = item ? (item.summary || '') : '';
    document.getElementById('arch-content').value = item ? (item.content || '') : '';
    // Reset file input
    const fileInput = document.getElementById('arch-file');
    if (fileInput) fileInput.value = '';
    const fileInfo = document.getElementById('arch-file-info');
    if (item && item.file_name) {
        fileInfo.classList.add('show');
        fileInfo.innerHTML = `<i class="fa-solid fa-file" style="color:var(--primary);"></i> Current: <strong>${item.file_name}</strong> <span style="color:#94a3b8; margin-left:4px;">(upload new to replace)</span>`;
    } else {
        fileInfo.classList.remove('show');
        fileInfo.innerHTML = '';
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateFileLabel(input) {
    const fileInfo = document.getElementById('arch-file-info');
    if (input.files.length > 0) {
        const file = input.files[0];
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        const ext = file.name.split('.').pop().toUpperCase();
        fileInfo.classList.add('show');
        fileInfo.innerHTML = `<i class="fa-solid fa-file-circle-check" style="color:var(--primary);"></i> <strong>${file.name}</strong> <span style="color:#94a3b8;">(${ext}, ${sizeMB} MB)</span> <button onclick="event.stopPropagation(); clearFileInput()" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:2px 6px; margin-left:auto;"><i class="fa-solid fa-xmark"></i></button>`;
    } else {
        fileInfo.classList.remove('show');
        fileInfo.innerHTML = '';
    }
}

function clearFileInput() {
    const fileInput = document.getElementById('arch-file');
    if (fileInput) fileInput.value = '';
    const fileInfo = document.getElementById('arch-file-info');
    fileInfo.classList.remove('show');
    fileInfo.innerHTML = '';
}

function hideArchiveForm() {
    document.getElementById('archive-form').style.display = 'none';
}

async function saveArchiveItem() {
    const editId = document.getElementById('archive-edit-id').value;
    const title = document.getElementById('arch-title').value.trim();
    const topic = document.getElementById('arch-topic').value.trim();

    if (!title || !topic) return alert('Title and Topic are required.');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('topic', topic);
    formData.append('doc_type', document.getElementById('arch-doctype').value);
    formData.append('author', document.getElementById('arch-author').value.trim());
    formData.append('source_url', document.getElementById('arch-source').value.trim());
    formData.append('summary', document.getElementById('arch-summary').value.trim());
    formData.append('content', document.getElementById('arch-content').value);

    const fileInput = document.getElementById('arch-file');
    if (fileInput && fileInput.files.length > 0) {
        formData.append('file', fileInput.files[0]);
    }

    try {
        const url = editId ? `/archive/${editId}` : '/archive';
        const method = editId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
            body: formData
        });
        if (!res.ok) {
            const text = await res.text();
            try { const err = JSON.parse(text); throw new Error(err.error || 'Save failed'); }
            catch (e) { if (e.message) throw e; throw new Error('Server error'); }
        }
        hideArchiveForm();
        loadArchive();
    } catch (err) {
        alert('Save failed: ' + err.message);
    }
}

async function editArchiveItem(id) {
    try {
        const res = await fetch(`/archive/${id}`);
        const item = await res.json();
        showArchiveForm(item);
    } catch (err) {
        alert('Could not load item for editing.');
    }
}

async function deleteArchiveItem(id) {
    if (!confirm('Delete this research item?')) return;
    try {
        const res = await fetch(`/archive/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error();
        loadArchive();
    } catch (err) {
        alert('Delete failed.');
    }
}
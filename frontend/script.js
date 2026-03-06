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

// Chat state
let _chatPanelOpen = false;
let _chatMessages = [];
let _chatLastMessageId = 0;
let _chatPollInterval = null;

/* =========================
   📱 MOBILE SIDEBAR
========================= */
function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('active');
}
function closeMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
}

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

            // Check approval status
            if (user.approval_status === 'pending') {
                showPendingApproval(user);
                return;
            }
            if (user.approval_status === 'rejected') {
                showRejectedScreen(user);
                return;
            }

            // Approved — show app
            hidePendingOverlay();

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

            // Show HR tab for HR department or admin
            const hrTabBtn = document.getElementById('tab-hr');
            if (hrTabBtn) hrTabBtn.style.display = (user.department === 'HR' || user.role === 'admin') ? 'flex' : 'none';

            // If intern with approved status, show document upload prompt
            if (user.employment_status === 'intern' && user.approval_status === 'approved') {
                showTab('workspace'); // Will render intern doc upload form
                return;
            }

            loadNews();
        } else {
            showLoginWall();
        }
    } catch (err) {
        showLoginWall();
    }
}

function showPendingApproval(user) {
    const overlay = document.getElementById('pending-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden', 'rejected');
    document.getElementById('pending-name').textContent = user.name || '';
    document.getElementById('pending-email').textContent = user.email || '';
    document.getElementById('pending-message').textContent = 'Your account has been created and is waiting for administrator approval. Please check back later.';
    if(document.getElementById('login-overlay')) document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app-wrapper').style.display = 'none';
}

function showRejectedScreen(user) {
    const overlay = document.getElementById('pending-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.add('rejected');
    document.getElementById('pending-name').textContent = user.name || '';
    document.getElementById('pending-email').textContent = user.email || '';
    document.querySelector('.pending-icon i').className = 'fa-solid fa-circle-xmark';
    document.querySelector('.pending-card h2').textContent = 'Account Rejected';
    document.getElementById('pending-message').textContent = 'Your account registration has been rejected by an administrator. Please contact support for more information.';
    if(document.getElementById('login-overlay')) document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app-wrapper').style.display = 'none';
}

function hidePendingOverlay() {
    const overlay = document.getElementById('pending-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.getElementById('app-wrapper').style.display = '';
}

function showLoginWall() {
    currentUser = null;
    document.body.classList.add('auth-required');
    hidePendingOverlay();
    if(document.getElementById('user-info')) document.getElementById('user-info').style.display = 'none';
    if(document.getElementById('login-overlay')) document.getElementById('login-overlay').classList.remove('hidden');
}

/* =========================
   🔐 AUTH UI LOGIC
========================= */
function toggleAuthMode(mode) {
    const loginForm = document.getElementById('form-login');
    const regForm = document.getElementById('form-register');
    const internForm = document.getElementById('form-intern');
    const btnLogin = document.getElementById('btn-show-login');
    const btnReg = document.getElementById('btn-show-register');
    const btnIntern = document.getElementById('btn-show-intern');

    loginForm.style.display = 'none';
    regForm.style.display = 'none';
    internForm.style.display = 'none';
    btnLogin.classList.remove('active');
    btnReg.classList.remove('active');
    btnIntern.classList.remove('active');

    if (mode === 'login') {
        loginForm.style.display = 'block';
        btnLogin.classList.add('active');
    } else if (mode === 'register') {
        regForm.style.display = 'block';
        btnReg.classList.add('active');
    } else if (mode === 'intern') {
        internForm.style.display = 'block';
        btnIntern.classList.add('active');
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
    if(!department) return alert("Please select a department");

    const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, department, password })
    });

    if(res.ok) {
        alert("Account created! Your account is pending admin approval.");
        window.location.reload();
    } else {
        const data = await res.json();
        alert(data.error || 'Registration failed');
    }
}
async function handleInternApply() {
    const name = document.getElementById('intern-name').value.trim();
    const email = document.getElementById('intern-email').value.trim();
    const phone = document.getElementById('intern-phone').value.trim();
    const password = document.getElementById('intern-password').value;
    const statusEl = document.getElementById('intern-apply-status');

    if (!name || !email || !password) return alert('Please fill all required fields');

    try {
        const res = await fetch('/hr/intern-apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();
        if (res.ok) {
            statusEl.innerHTML = '<span style="color:#10b981;">Application submitted! HR will review it shortly.</span>';
            document.getElementById('intern-name').value = '';
            document.getElementById('intern-email').value = '';
            document.getElementById('intern-phone').value = '';
            document.getElementById('intern-password').value = '';
        } else {
            statusEl.innerHTML = `<span style="color:#ef4444;">${data.error || 'Failed to submit'}</span>`;
        }
    } catch (e) {
        statusEl.innerHTML = '<span style="color:#ef4444;">Network error. Try again.</span>';
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
    else if (section === 'telegram') loadTelegramGroups();
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

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';

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
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No users match your filters.</td></tr>';
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
                        ${['Product Export','Startup Ecosystem','Western Markets','Eastern Markets','GovTech','Venture Capital','Analytics','BPO Monitoring','Residents Relations','Residents Registration','Residents Monitoring','Softlanding','Legal Ecosystem','AI Infrastructure','AI Research','Inclusive Projects','Regional Development','Freelancers & Youth','Infrastructure','Infrastructure Dev','PPP Investors','IT Outsourcing','Global Marketing','Multimedia','Public Relations','Marketing','Event Management','HR'].map(d =>
                            `<option value="${d}" ${u.department === d ? 'selected' : ''}>${d}</option>`
                        ).join('')}
                    </select>
                </td>
                <td>
                    ${isSelf ? `<span class="admin-role-badge ${u.role}">${escapeHtml(u.role)}</span>` :
                    `<select onchange="changeUserRole('${escapeHtml(u.id)}', this.value)" class="admin-role-select">
                        <option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option>
                        <option value="head" ${u.role==='head'?'selected':''}>Head</option>
                        <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                    </select>`}
                </td>
                <td>
                    ${u.approval_status === 'approved'
                        ? '<span class="approval-badge approved"><i class="fa-solid fa-check-circle"></i> Approved</span>'
                        : u.approval_status === 'rejected'
                        ? '<span class="approval-badge rejected"><i class="fa-solid fa-times-circle"></i> Rejected</span>'
                        : `<span class="approval-badge pending"><i class="fa-solid fa-clock"></i> Pending</span>`}
                    ${!isSelf && u.approval_status !== 'approved' ? `<button class="admin-action-btn approve" onclick="approveUser('${escapeHtml(u.id)}')" title="Approve"><i class="fa-solid fa-check"></i></button>` : ''}
                    ${!isSelf && u.approval_status === 'pending' ? `<button class="admin-action-btn reject" onclick="rejectUser('${escapeHtml(u.id)}')" title="Reject"><i class="fa-solid fa-xmark"></i></button>` : ''}
                </td>
                <td style="white-space:nowrap;">${date}</td>
                <td>
                    ${isSelf ? '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>' :
                    `<button class="admin-action-btn delete" onclick="deleteUser('${escapeHtml(u.id)}', '${escapeHtml(u.name || u.email)}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>`}
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--accent-red);">Failed to load users.</td></tr>';
    }
}

async function changeUserRole(userId, newRole) {
    const labels = { admin: 'Admin', head: 'Dept Head', viewer: 'Viewer' };
    if (!confirm(`Change this user's role to "${labels[newRole]}"?`)) return;

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

async function approveUser(userId) {
    if (!confirm('Approve this user? They will gain access to the platform.')) return;
    try {
        const res = await fetch(`/admin/users/${userId}/approve`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        loadAdminUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function rejectUser(userId) {
    if (!confirm('Reject this user? They will not be able to access the platform.')) return;
    try {
        const res = await fetch(`/admin/users/${userId}/reject`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        loadAdminUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function loadAdminContent() {
    const statsEl = document.getElementById('admin-content-stats');
    const articlesEl = document.getElementById('admin-popular-articles');
    if (!statsEl) return;

    statsEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch('/admin/content', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();

        statsEl.innerHTML = `
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:#fce7f3; color:#db2777;"><i class="fa-solid fa-fire"></i></div>
                <div><div class="admin-stat-value">${data.popularArticles.length}</div><div class="admin-stat-label">Trending Articles</div></div>
            </div>
        `;

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
   ADMIN: TELEGRAM GROUPS
========================= */
async function loadTelegramGroups() {
    const list = document.getElementById('tg-groups-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const res = await fetch('/admin/telegram-groups', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const groups = await res.json();
        if (groups.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8;">No Telegram groups configured yet. Add one above.</div>';
            return;
        }
        list.innerHTML = '<table class="admin-table"><thead><tr><th>Group Name</th><th>Chat ID</th><th>Added</th><th>Actions</th></tr></thead><tbody>' +
            groups.map(g => `<tr>
                <td><i class="fa-brands fa-telegram" style="color:#229ED9; margin-right:8px;"></i>${escapeHtml(g.name)}</td>
                <td><code style="background:#f1f5f9; padding:3px 8px; border-radius:4px; font-size:0.85rem;">${escapeHtml(g.chat_id)}</code></td>
                <td>${new Date(g.created_at).toLocaleDateString()}</td>
                <td><button class="admin-action-btn reject" onclick="removeTelegramGroup(${g.id})" title="Remove"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`).join('') + '</tbody></table>';
    } catch (e) {
        list.innerHTML = '<div style="color:#ef4444; padding:20px;">Failed to load groups.</div>';
    }
}

async function addTelegramGroup() {
    const nameInput = document.getElementById('tg-group-name');
    const chatIdInput = document.getElementById('tg-group-chatid');
    const name = nameInput.value.trim();
    const chat_id = chatIdInput.value.trim();
    if (!name || !chat_id) return alert('Please enter both group name and chat ID.');

    try {
        const res = await fetch('/admin/telegram-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, chat_id })
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error || 'Failed to add group');
        nameInput.value = '';
        chatIdInput.value = '';
        loadTelegramGroups();
    } catch (e) {
        alert('Failed to add group.');
    }
}

async function removeTelegramGroup(id) {
    if (!confirm('Remove this Telegram group?')) return;
    try {
        const res = await fetch(`/admin/telegram-groups/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!res.ok) throw new Error('Failed');
        loadTelegramGroups();
    } catch (e) {
        alert('Failed to remove group.');
    }
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
    lead_pipeline: renderTrackedItemsWidget,
    my_team: renderTeamWidget,
    assigned_tasks: renderAssignedTasksWidget,
    my_tasks: renderMyTasksWidget,
    announcements: renderAnnouncementsWidget
};

async function loadWorkspace() {
    const header = document.getElementById('workspace-header');
    const metricsEl = document.getElementById('workspace-metrics');
    const grid = document.getElementById('workspace-widgets');
    if (!header) return;

    // If user is an approved intern, show document upload form instead
    if (currentUser && currentUser.employment_status === 'intern' && currentUser.approval_status === 'approved') {
        header.innerHTML = '';
        metricsEl.innerHTML = '';
        renderInternDocUpload(grid);
        return;
    }

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

    // Auto-inject task widgets based on role
    const role = currentUser?.role;
    const injected = [...widgetIds];
    if (role === 'head' || role === 'admin') {
        if (!injected.includes('my_team')) injected.unshift('my_team');
        if (!injected.includes('assigned_tasks')) injected.splice(1, 0, 'assigned_tasks');
    }
    if (!injected.includes('my_tasks')) injected.splice(role === 'head' ? 2 : 0, 0, 'my_tasks');

    injected.forEach(wId => {
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
        // New format: work_summary + news_summary + recommendations + priority
        if (data.work_summary) {
            html += `<div class="ai-brief-section"><div class="ai-brief-section-label"><i class="fa-solid fa-user-check"></i> Your Work</div><div class="ai-brief-summary">${escapeHtml(data.work_summary)}</div></div>`;
        }
        if (data.news_summary) {
            html += `<div class="ai-brief-section"><div class="ai-brief-section-label"><i class="fa-solid fa-newspaper"></i> Industry News</div><div class="ai-brief-summary">${escapeHtml(data.news_summary)}</div></div>`;
        }
        if (data.recommendations && data.recommendations.length) {
            html += '<div class="ai-brief-section"><div class="ai-brief-section-label"><i class="fa-solid fa-lightbulb"></i> Recommendations</div><div class="ai-brief-takeaways">';
            data.recommendations.forEach(t => {
                html += `<div class="ai-brief-takeaway"><i class="fa-solid fa-arrow-right"></i> <span>${escapeHtml(t)}</span></div>`;
            });
            html += '</div></div>';
        }
        if (data.priority) {
            html += `<div class="ai-brief-action"><strong><i class="fa-solid fa-bolt"></i> Today's Priority</strong>${escapeHtml(data.priority)}</div>`;
        }
        // Backward compatibility with old format
        if (!data.work_summary && data.summary) {
            html += `<div class="ai-brief-summary">${escapeHtml(data.summary)}</div>`;
        }
        if (!data.recommendations && data.takeaways && data.takeaways.length) {
            html += '<div class="ai-brief-takeaways">';
            data.takeaways.forEach(t => { html += `<div class="ai-brief-takeaway"><i class="fa-solid fa-lightbulb"></i> <span>${escapeHtml(t)}</span></div>`; });
            html += '</div>';
        }
        if (!data.priority && data.action) {
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

// ── Team Widget (head only) ──
async function renderTeamWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const res = await fetch('/workspace/team', { credentials: 'include' });
        if (!res.ok) { body.innerHTML = '<div class="widget-empty"><p>Team view requires Head role</p></div>'; return; }
        const members = await res.json();
        if (!members.length) { body.innerHTML = '<div class="widget-empty"><i class="fa-solid fa-users" style="font-size:1.5rem;"></i><p>No team members in your department</p></div>'; return; }

        body.innerHTML = `<div class="team-list">${members.map(m => {
            const avatar = m.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name || 'U')}&background=7dba28&color=fff&size=34`;
            return `<div class="team-member-row">
                <img src="${escapeHtml(avatar)}" class="team-avatar" onerror="this.src='https://ui-avatars.com/api/?name=U&background=7dba28&color=fff&size=34'">
                <div class="team-info"><strong>${escapeHtml(m.name || 'Unknown')}</strong><small>${escapeHtml(m.email)}</small></div>
                <span class="admin-role-badge ${m.role}">${escapeHtml(m.role)}</span>
                <button class="team-assign-btn" onclick="showAssignTaskModal('${escapeHtml(m.id)}', '${escapeHtml(m.name || '')}')"><i class="fa-solid fa-plus"></i> Assign Task</button>
            </div>`;
        }).join('')}</div>`;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load team</div>'; }
}

// ── Assigned Tasks Widget (head sees tasks they assigned) ──
async function renderAssignedTasksWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const res = await fetch('/workspace/tasks', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const tasks = await res.json();
        const assigned = tasks.filter(t => t.assigned_by === currentUser?.id);
        if (!assigned.length) {
            body.innerHTML = '<div class="widget-empty"><i class="fa-solid fa-list-check" style="font-size:1.5rem;"></i><p>No tasks assigned yet</p></div>';
            return;
        }
        body.innerHTML = `<div class="task-list">${assigned.map(t => renderTaskCard(t, 'head')).join('')}</div>`;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load tasks</div>'; }
}

// ── My Tasks Widget (viewer sees tasks assigned to them) ──
async function renderMyTasksWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    try {
        const res = await fetch('/workspace/tasks', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const tasks = await res.json();
        const myTasks = tasks.filter(t => t.assigned_to === currentUser?.id);
        if (!myTasks.length) {
            body.innerHTML = '<div class="widget-empty"><i class="fa-solid fa-clipboard-check" style="font-size:1.5rem;"></i><p>No tasks assigned to you</p></div>';
            return;
        }
        body.innerHTML = `<div class="task-list">${myTasks.map(t => renderTaskCard(t, 'viewer')).join('')}</div>`;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load tasks</div>'; }
}

function renderTaskCard(t, viewMode) {
    const priorityColors = { urgent: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#94a3b8' };
    const statusIcons = { pending: 'fa-clock', in_progress: 'fa-spinner', completed: 'fa-check-circle' };
    const borderColor = priorityColors[t.priority] || '#3b82f6';
    const isOverdue = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed';
    const deadlineStr = t.deadline ? new Date(t.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

    let personInfo = '';
    if (viewMode === 'head' && t.assignee_name) {
        personInfo = `<span class="task-person"><i class="fa-solid fa-user"></i> ${escapeHtml(t.assignee_name)}</span>`;
    } else if (viewMode === 'viewer' && t.assigner_name) {
        personInfo = `<span class="task-person"><i class="fa-solid fa-user-tie"></i> from ${escapeHtml(t.assigner_name)}</span>`;
    }

    let actions = '';
    if (viewMode === 'head') {
        actions = `<button class="task-delete-btn" onclick="deleteTask(${t.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>`;
    }
    if (viewMode === 'viewer' || t.assigned_to === currentUser?.id) {
        const nextStatus = t.status === 'pending' ? 'in_progress' : t.status === 'in_progress' ? 'completed' : '';
        const nextLabel = t.status === 'pending' ? 'Start' : t.status === 'in_progress' ? 'Done' : '';
        if (nextStatus) {
            actions = `<button class="task-status-btn ${nextStatus}" onclick="updateTaskStatus(${t.id}, '${nextStatus}')">${nextLabel}</button>` + actions;
        }
    }

    return `<div class="task-card" style="border-left-color: ${borderColor};">
        <div class="task-card-top">
            <span class="priority-badge priority-${t.priority}">${t.priority}</span>
            <span class="task-status task-status-${t.status}"><i class="fa-solid ${statusIcons[t.status] || 'fa-clock'}"></i> ${t.status.replace('_', ' ')}</span>
        </div>
        <div class="task-card-title">${escapeHtml(t.title)}</div>
        ${t.description ? `<div class="task-card-desc">${formatTaskDescription(t.description)}</div>` : ''}
        <div class="task-card-footer">
            ${personInfo}
            ${deadlineStr ? `<span class="task-deadline ${isOverdue ? 'overdue' : ''}"><i class="fa-solid fa-calendar"></i> ${deadlineStr}</span>` : ''}
            <div class="task-card-actions">${actions}</div>
        </div>
    </div>`;
}

function formatTaskDescription(desc) {
    // Escape HTML first, then convert [DOWNLOAD:path] to clickable links and preserve newlines
    let safe = escapeHtml(desc);
    // Convert [DOWNLOAD:/uploads/documents/userId/filename] to download links
    safe = safe.replace(/\[DOWNLOAD:(\/uploads\/documents\/[^\]]+)\]/g, (match, path) => {
        const fileName = path.split('/').pop();
        return `<a href="${path}" target="_blank" class="task-doc-link"><i class="fa-solid fa-download"></i> Download</a>`;
    });
    // Preserve newlines
    safe = safe.replace(/\n/g, '<br>');
    return safe;
}

// Task assignment modal
let _taskTeamMembers = [];
async function showAssignTaskModal(userId, userName) {
    const modal = document.getElementById('workspace-modal');
    const title = document.getElementById('workspace-modal-title');
    const form = document.getElementById('workspace-item-form');
    const metaFields = document.getElementById('ws-meta-fields');
    if (!modal || !form) return;

    title.textContent = userName ? `Assign Task to ${userName}` : 'Assign Task';

    // Load team if not assigning to specific user
    if (!userId) {
        try {
            const res = await fetch('/workspace/team', { credentials: 'include' });
            _taskTeamMembers = await res.json();
        } catch { _taskTeamMembers = []; }
    }

    document.getElementById('ws-item-id').value = '';
    document.getElementById('ws-item-type').value = '__task__';
    document.getElementById('ws-item-title').value = '';
    document.getElementById('ws-item-desc').value = '';
    document.getElementById('ws-item-status').closest('.ws-form-group').style.display = 'none';

    metaFields.innerHTML = `
        ${!userId ? `<div class="ws-form-group"><label>Assign To</label>
            <select id="ws-task-assignee" required>
                <option value="">Select team member...</option>
                ${_taskTeamMembers.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join('')}
            </select></div>` : `<input type="hidden" id="ws-task-assignee" value="${escapeHtml(userId)}">`}
        <div class="ws-form-group"><label>Priority</label>
            <select id="ws-task-priority">
                <option value="low">Low</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
            </select>
        </div>
        <div class="ws-form-group"><label>Deadline</label>
            <input type="date" id="ws-task-deadline">
        </div>
    `;
    modal.style.display = 'flex';
}

async function updateTaskStatus(taskId, newStatus) {
    try {
        const res = await fetch(`/workspace/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error('Failed');
        refreshTaskWidgets();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    try {
        const res = await fetch(`/workspace/tasks/${taskId}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        refreshTaskWidgets();
    } catch (err) { alert('Error: ' + err.message); }
}

function refreshTaskWidgets() {
    if (!workspaceConfig) return;
    ['my_team', 'assigned_tasks', 'my_tasks'].forEach(wId => {
        const wDef = workspaceConfig.widgetDefinitions?.[wId];
        const renderer = WIDGET_RENDERERS[wId];
        if (renderer && document.getElementById(`widget-body-${wId}`)) renderer(wId, wDef || {});
    });
}

// ── Announcements Widget (HR workspace) ──
async function renderAnnouncementsWidget(wId, wDef) {
    const body = document.getElementById(`widget-body-${wId}`);
    if (!body) return;
    const isHR = currentUser?.department === 'HR' || currentUser?.role === 'admin';

    try {
        const res = await fetch('/announcements', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const announcements = await res.json();

        let html = '';
        if (isHR) {
            html += `<button class="announcement-create-btn" onclick="showAnnouncementForm()"><i class="fa-solid fa-plus"></i> New Announcement</button>`;
        }

        if (!announcements.length) {
            html += '<div class="widget-empty"><i class="fa-solid fa-bullhorn" style="font-size:1.5rem;"></i><p>No announcements yet</p></div>';
        } else {
            html += `<div class="announcement-list">${announcements.map(a => {
                const date = new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                const preview = a.content.length > 120 ? a.content.substring(0, 120) + '...' : a.content;
                return `<div class="announcement-card ${a.is_read ? '' : 'unread'}" onclick="openAnnouncementPopup(${a.id})">
                    ${a.image_url ? `<img src="${a.image_url}" class="announcement-card-img" onerror="this.style.display='none'">` : ''}
                    <div class="announcement-card-body">
                        <div class="announcement-card-title">${escapeHtml(a.title)}</div>
                        <div class="announcement-card-preview">${escapeHtml(preview)}</div>
                        <div class="announcement-card-meta">
                            <span><i class="fa-solid fa-user"></i> ${escapeHtml(a.author_name || 'HR')}</span>
                            <span><i class="fa-regular fa-calendar"></i> ${date}</span>
                        </div>
                    </div>
                    ${isHR ? `<button class="announcement-delete-btn" onclick="event.stopPropagation(); deleteAnnouncement(${a.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>`;
            }).join('')}</div>`;
        }
        body.innerHTML = html;
    } catch { body.innerHTML = '<div class="widget-error">Failed to load announcements</div>'; }
}

// ── Announcement Form (HR creates new announcement) ──
function showAnnouncementForm() {
    const modal = document.getElementById('workspace-modal');
    const title = document.getElementById('workspace-modal-title');
    const form = document.getElementById('workspace-item-form');
    const metaFields = document.getElementById('ws-meta-fields');
    if (!modal || !form) return;

    title.textContent = 'New Announcement';
    document.getElementById('ws-item-id').value = '';
    document.getElementById('ws-item-type').value = '__announcement__';
    document.getElementById('ws-item-title').value = '';
    document.getElementById('ws-item-desc').value = '';
    document.getElementById('ws-item-status').closest('.ws-form-group').style.display = 'none';

    metaFields.innerHTML = `
        <div class="ws-form-group">
            <label>Image (optional)</label>
            <input type="file" id="ws-announcement-image" accept=".jpg,.jpeg,.png,.gif,.webp">
        </div>
    `;
    modal.style.display = 'flex';
}

async function deleteAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return;
    try {
        const res = await fetch(`/announcements/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        // Refresh widget + notifications
        const renderer = WIDGET_RENDERERS['announcements'];
        const wDef = workspaceConfig?.widgetDefinitions?.['announcements'];
        if (renderer && document.getElementById('widget-body-announcements')) renderer('announcements', wDef || {});
        loadUnreadCount();
    } catch (err) { alert('Error: ' + err.message); }
}

// ── Notification Bell ──
let _notificationPanelOpen = false;

async function loadUnreadCount() {
    if (!currentUser) return;
    try {
        const res = await fetch('/announcements/unread-count', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (data.count > 0) {
                badge.textContent = data.count > 99 ? '99+' : data.count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch {}
}

function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;
    _notificationPanelOpen = !_notificationPanelOpen;
    panel.style.display = _notificationPanelOpen ? 'block' : 'none';
    if (_notificationPanelOpen) loadNotifications();
}

async function loadNotifications() {
    const list = document.getElementById('notification-panel-list');
    if (!list) return;
    try {
        const res = await fetch('/announcements', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const announcements = await res.json();

        if (!announcements.length) {
            list.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted);">No announcements</div>';
            return;
        }

        list.innerHTML = announcements.slice(0, 20).map(a => {
            const date = new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            return `<div class="notification-item ${a.is_read ? '' : 'unread'}" onclick="openAnnouncementPopup(${a.id}); toggleNotificationPanel();">
                <div class="notification-item-dot"></div>
                <div class="notification-item-body">
                    <div class="notification-item-title">${escapeHtml(a.title)}</div>
                    <div class="notification-item-date">${date} &middot; ${escapeHtml(a.author_name || 'HR')}</div>
                </div>
            </div>`;
        }).join('');
    } catch { list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--accent-red);">Failed to load</div>'; }
}

// ── Announcement Popup ──
async function openAnnouncementPopup(id) {
    const overlay = document.getElementById('announcement-popup');
    const body = document.getElementById('announcement-popup-body');
    if (!overlay || !body) return;

    overlay.style.display = 'flex';
    body.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#94a3b8;"></i></div>';

    try {
        // Mark as read
        fetch(`/announcements/${id}/read`, { method: 'POST', credentials: 'include' }).then(() => loadUnreadCount());

        const res = await fetch('/announcements', { credentials: 'include' });
        const announcements = await res.json();
        const a = announcements.find(x => x.id === id);
        if (!a) { body.innerHTML = '<p>Announcement not found.</p>'; return; }

        const date = new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        body.innerHTML = `
            ${a.image_url ? `<img src="${a.image_url}" class="announcement-popup-img" onerror="this.style.display='none'">` : ''}
            <h2 class="announcement-popup-title">${escapeHtml(a.title)}</h2>
            <div class="announcement-popup-meta">
                <span><i class="fa-solid fa-user"></i> ${escapeHtml(a.author_name || 'HR')}</span>
                <span><i class="fa-regular fa-calendar"></i> ${date}</span>
            </div>
            <div class="announcement-popup-text">${escapeHtml(a.content).replace(/\n/g, '<br>')}</div>
        `;

        // Update unread styling in widget/panel
        document.querySelectorAll(`.announcement-card[onclick*="${id}"]`).forEach(el => el.classList.remove('unread'));
        document.querySelectorAll(`.notification-item[onclick*="${id}"]`).forEach(el => el.classList.remove('unread'));
    } catch { body.innerHTML = '<p style="color:#ef4444;">Failed to load announcement.</p>'; }
}

function closeAnnouncementPopup(event) {
    if (event && event.target !== event.currentTarget && !event.target.closest('.announcement-popup-close')) return;
    const overlay = document.getElementById('announcement-popup');
    if (overlay) overlay.style.display = 'none';
}

// Close notification panel when clicking outside
document.addEventListener('click', (e) => {
    if (_notificationPanelOpen && !e.target.closest('#notification-wrapper')) {
        _notificationPanelOpen = false;
        const panel = document.getElementById('notification-panel');
        if (panel) panel.style.display = 'none';
    }
});

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

    // Handle announcement creation separately
    if (itemType === '__announcement__') {
        if (!description) return alert('Announcement content is required');
        const formData = new FormData();
        formData.append('title', title);
        formData.append('content', description);
        const imageInput = document.getElementById('ws-announcement-image');
        if (imageInput && imageInput.files.length > 0) {
            formData.append('image', imageInput.files[0]);
        }
        try {
            const res = await fetch('/announcements', { method: 'POST', credentials: 'include', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            closeWorkspaceModal();
            document.getElementById('ws-item-status').closest('.ws-form-group').style.display = '';
            // Refresh announcements widget
            const renderer = WIDGET_RENDERERS['announcements'];
            const wDef = workspaceConfig?.widgetDefinitions?.['announcements'];
            if (renderer && document.getElementById('widget-body-announcements')) renderer('announcements', wDef || {});
            loadUnreadCount();
        } catch (err) { alert('Error: ' + err.message); }
        return;
    }

    // Handle task creation separately
    if (itemType === '__task__') {
        const assignee = document.getElementById('ws-task-assignee')?.value;
        const priority = document.getElementById('ws-task-priority')?.value || 'medium';
        const deadline = document.getElementById('ws-task-deadline')?.value || null;
        if (!assignee) return alert('Please select a team member');
        try {
            const res = await fetch('/workspace/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ title, description, assigned_to: assignee, priority, deadline })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            closeWorkspaceModal();
            document.getElementById('ws-item-status').closest('.ws-form-group').style.display = '';
            refreshTaskWidgets();
        } catch (err) { alert('Error: ' + err.message); }
        return;
    }

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
  closeMobileSidebar();

  // UI Update
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tab-${tab}`);
  if(btn) btn.classList.add('active');

  // Get Containers
  const newsContainer = document.getElementById('news-container');
  const dashContainer = document.getElementById('dashboard-container');
  const nlaContainer = document.getElementById('nla-container');
  const adminContainer = document.getElementById('admin-container');
  const workspaceContainer = document.getElementById('workspace-container');
  const hrContainer = document.getElementById('hr-container');

  const filters = document.getElementById('filters');
  const tabTitle = document.getElementById('tab-title');
  const loadMore = document.getElementById('load-more-container');

  // Hide All
  if(newsContainer) newsContainer.style.display = 'none';
  if(dashContainer) dashContainer.style.display = 'none';
  if(nlaContainer) nlaContainer.style.display = 'none';
  if(adminContainer) adminContainer.style.display = 'none';
  if(workspaceContainer) workspaceContainer.style.display = 'none';
  if(hrContainer) hrContainer.style.display = 'none';
  if(filters) filters.style.display = 'flex';
  if(loadMore) loadMore.style.display = 'none';

  // --- LOGIC PER TAB ---

  if (tab === 'dashboard') {
    if(tabTitle) tabTitle.innerText = 'Source of News';
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

  } else if (tab === 'workspace') {
    if(tabTitle) tabTitle.innerText = 'My Workspace';
    if(workspaceContainer) workspaceContainer.style.display = 'block';
    if(filters) filters.style.display = 'none';
    loadWorkspace();

  } else if (tab === 'hr') {
    if (!currentUser || (currentUser.department !== 'HR' && currentUser.role !== 'admin')) { showTab('all'); return; }
    if(tabTitle) tabTitle.innerText = 'HR Management';
    if(hrContainer) hrContainer.style.display = 'block';
    if(filters) filters.style.display = 'none';
    loadHRDashboard();

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
  if (currentTab === 'dashboard') return;
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
function handleImageError(img) {
  img.onerror = null;
  img.parentElement.innerHTML = '<div style="width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;"><i class="fa-solid fa-image fa-2x"></i></div>';
}

function createCard(container, item) {
  const card = document.createElement('div');
  card.className = 'news-card';

  const placeholderHTML = `<div style="width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;
  let imageHTML = `<div class="card-image-wrapper">`;
  if (item.image) {
    imageHTML += `<img src="${item.image}" onerror="handleImageError(this)">`;
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
          wrapper.innerHTML = `<img src="${data.image}" onerror="handleImageError(this)">`;
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

  // Start notification polling
  loadUnreadCount();
  setInterval(loadUnreadCount, 60000);

  // Start chat unread polling
  loadChatUnreadCount();
  setInterval(loadChatUnreadCount, 30000);

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

// Curated IT legislation directory — direct links to official sources
const NLA_DIRECTORY = {
    uz: {
        name: 'Uzbekistan', laws: [
            { title: 'On IT Park — Tax & customs benefits for IT companies', icon: 'fa-building', url: 'https://lex.uz/docs/4422256', source: 'Lex.uz' },
            { title: 'On the Digital Economy — Development framework', icon: 'fa-chart-line', url: 'https://lex.uz/docs/5031048', source: 'Lex.uz' },
            { title: 'On E-Government — Digital public services', icon: 'fa-building-columns', url: 'https://lex.uz/docs/2833855', source: 'Lex.uz' },
            { title: 'On Startups — Support and incentives for startups', icon: 'fa-rocket', url: 'https://lex.uz/docs/8046204', source: 'Lex.uz' },
            { title: 'On Personal Data — Data protection regulation', icon: 'fa-user-shield', url: 'https://lex.uz/docs/4396428', source: 'Lex.uz' },
            { title: 'On Cybersecurity — National cybersecurity framework', icon: 'fa-shield-halved', url: 'https://lex.uz/docs/5960609', source: 'Lex.uz' },
            { title: 'On Crypto Assets — Regulation of digital assets', icon: 'fa-bitcoin-sign', url: 'https://lex.uz/docs/3806048', source: 'Lex.uz' },
            { title: 'On E-Commerce — Electronic commerce regulation', icon: 'fa-cart-shopping', url: 'https://lex.uz/docs/6213428', source: 'Lex.uz' },
            { title: 'On Artificial Intelligence — AI development strategy', icon: 'fa-brain', url: 'https://lex.uz/docs/7159258', source: 'Lex.uz' },
            { title: 'On IT Education — IT training programs', icon: 'fa-graduation-cap', url: 'https://lex.uz/docs/5032131', source: 'Lex.uz' },
        ]
    },
    kz: {
        name: 'Kazakhstan', laws: [
            { title: 'Astana Hub — International tech park of IT startups', icon: 'fa-hubspot', url: 'https://adilet.zan.kz/rus/docs/P1800000949', source: 'Adilet' },
            { title: 'On Informatization — Digital infrastructure law', icon: 'fa-network-wired', url: 'https://adilet.zan.kz/rus/docs/Z1500000418', source: 'Adilet' },
            { title: 'On Personal Data — Data protection', icon: 'fa-user-shield', url: 'https://adilet.zan.kz/rus/docs/Z1300000094', source: 'Adilet' },
            { title: 'On Digital Assets — Cryptocurrency regulation', icon: 'fa-coins', url: 'https://adilet.zan.kz/rus/docs/Z2300000193', source: 'Adilet' },
            { title: 'On Venture Financing — VC and startup investment', icon: 'fa-hand-holding-dollar', url: 'https://adilet.zan.kz/rus/docs/Z1800000169', source: 'Adilet' },
            { title: 'Digital Kazakhstan Program — National digitalization', icon: 'fa-laptop-code', url: 'https://adilet.zan.kz/rus/docs/P1700000827', source: 'Adilet' },
        ]
    },
    sg: {
        name: 'Singapore', laws: [
            { title: 'Personal Data Protection Act (PDPA)', icon: 'fa-id-card', url: 'https://sso.agc.gov.sg/Act/PDPA2012', source: 'SSO' },
            { title: 'Cybersecurity Act 2018', icon: 'fa-shield-halved', url: 'https://sso.agc.gov.sg/Act/CA2018', source: 'SSO' },
            { title: 'Payment Services Act 2019 — Fintech regulation', icon: 'fa-wallet', url: 'https://sso.agc.gov.sg/Act/PSA2019', source: 'SSO' },
            { title: 'Computer Misuse Act — Cybercrime law', icon: 'fa-bug', url: 'https://sso.agc.gov.sg/Act/CMA1993', source: 'SSO' },
            { title: 'Electronic Transactions Act', icon: 'fa-file-signature', url: 'https://sso.agc.gov.sg/Act/ETA2010', source: 'SSO' },
        ]
    },
    gb: {
        name: 'United Kingdom', laws: [
            { title: 'Online Safety Act 2023', icon: 'fa-child-reaching', url: 'https://www.legislation.gov.uk/ukpga/2023/50/contents', source: 'Legislation.gov.uk' },
            { title: 'Data Protection Act 2018 (UK GDPR)', icon: 'fa-database', url: 'https://www.legislation.gov.uk/ukpga/2018/12/contents', source: 'Legislation.gov.uk' },
            { title: 'Digital Markets, Competition and Consumers Act 2024', icon: 'fa-shop', url: 'https://www.legislation.gov.uk/ukpga/2024/13/contents', source: 'Legislation.gov.uk' },
            { title: 'Computer Misuse Act 1990', icon: 'fa-bug', url: 'https://www.legislation.gov.uk/ukpga/1990/18/contents', source: 'Legislation.gov.uk' },
            { title: 'Investigatory Powers Act 2016', icon: 'fa-eye', url: 'https://www.legislation.gov.uk/ukpga/2016/25/contents', source: 'Legislation.gov.uk' },
        ]
    },
    us: {
        name: 'United States', laws: [
            { title: 'CHIPS and Science Act 2022 — Semiconductor investment', icon: 'fa-microchip', url: 'https://www.congress.gov/bill/117th-congress/house-bill/4346', source: 'Congress.gov' },
            { title: 'AI Executive Order 14110 — Safe AI development', icon: 'fa-brain', url: 'https://www.federalregister.gov/documents/2023/11/01/2023-24283/safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence', source: 'Federal Register' },
            { title: 'Cybersecurity Information Sharing Act (CISA)', icon: 'fa-shield-halved', url: 'https://www.congress.gov/bill/114th-congress/senate-bill/754', source: 'Congress.gov' },
            { title: 'Computer Fraud and Abuse Act (CFAA)', icon: 'fa-bug', url: 'https://www.law.cornell.edu/uscode/text/18/1030', source: 'Cornell Law' },
            { title: 'Digital Millennium Copyright Act (DMCA)', icon: 'fa-copyright', url: 'https://www.congress.gov/bill/105th-congress/house-bill/2281', source: 'Congress.gov' },
        ]
    },
    ee: {
        name: 'Estonia', laws: [
            { title: 'E-Residency Program — Digital identity for non-residents', icon: 'fa-id-card-clip', url: 'https://www.riigiteataja.ee/en/eli/ee/504072022003/consolide/current', source: 'Riigi Teataja' },
            { title: 'Cybersecurity Act', icon: 'fa-shield-virus', url: 'https://www.riigiteataja.ee/en/eli/523052023006/consolide', source: 'Riigi Teataja' },
            { title: 'Digital Signatures Act', icon: 'fa-file-signature', url: 'https://www.riigiteataja.ee/en/eli/530102013073/consolide', source: 'Riigi Teataja' },
            { title: 'Public Information Act — Open data regulation', icon: 'fa-users-viewfinder', url: 'https://www.riigiteataja.ee/en/eli/514112013001/consolide', source: 'Riigi Teataja' },
            { title: 'Personal Data Protection Act', icon: 'fa-user-shield', url: 'https://www.riigiteataja.ee/en/eli/523012019001/consolide', source: 'Riigi Teataja' },
        ]
    },
    cn: {
        name: 'China', laws: [
            { title: 'Personal Information Protection Law (PIPL)', icon: 'fa-id-badge', url: 'http://www.npc.gov.cn/npc/c30834/202108/a8c4e3672c74491a80b53a172bb753fe.shtml', source: 'NPC' },
            { title: 'Data Security Law', icon: 'fa-database', url: 'http://www.npc.gov.cn/npc/c30834/202106/7c9af12f51334a73b56d7938f99a788a.shtml', source: 'NPC' },
            { title: 'Cybersecurity Law', icon: 'fa-shield-halved', url: 'http://www.npc.gov.cn/npc/c12435/201611/cbda4e47a6ab45e79cfb4ff58ce52aad.shtml', source: 'NPC' },
            { title: 'E-Commerce Law', icon: 'fa-cart-shopping', url: 'http://www.npc.gov.cn/npc/c12435/201808/f8a87e8ef84d4c3c9af202e992f5b28a.shtml', source: 'NPC' },
        ]
    },
    pl: {
        name: 'Poland', laws: [
            { title: 'National Cybersecurity System Act (KSC)', icon: 'fa-shield', url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180001560', source: 'ISAP Sejm' },
            { title: 'Informatization of Public Entities Act', icon: 'fa-computer', url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20050640565', source: 'ISAP Sejm' },
            { title: 'Personal Data Protection Act', icon: 'fa-user-shield', url: 'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20180001000', source: 'ISAP Sejm' },
        ]
    },
    vn: {
        name: 'Vietnam', laws: [
            { title: 'Law on Cybersecurity 2018', icon: 'fa-user-secret', url: 'https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-an-ninh-mang-2018-351416.aspx', source: 'VBPL' },
            { title: 'Law on E-Transactions 2023', icon: 'fa-comments-dollar', url: 'https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-Giao-dich-dien-tu-2023-567240.aspx', source: 'VBPL' },
            { title: 'Law on Information Technology', icon: 'fa-laptop', url: 'https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-Cong-nghe-thong-tin-2006-67-2006-QH11-12695.aspx', source: 'VBPL' },
        ]
    }
};

/* =========================
   ⚖️ MAIN RENDER FUNCTION
========================= */
async function renderNLA() {
    const container = document.getElementById('nla-grid');
    const breadcrumbs = document.getElementById('nla-breadcrumbs');

    // ------------------------------------------
    // STEP 0: SELECT COUNTRY
    // ------------------------------------------
    if (nlaState.step === 0) {
        if(breadcrumbs) breadcrumbs.innerHTML = 'Select Jurisdiction';
        container.className = 'nla-grid-countries';
        container.innerHTML = '';

        const countries = Object.entries(NLA_DIRECTORY);
        countries.forEach(([code, data]) => {
            const div = document.createElement('div');
            div.className = 'nla-country-card';
            div.innerHTML = `
                <img src="https://flagcdn.com/${code}.svg" width="60">
                <h3>${data.name}</h3>
                <small style="color:#64748b;">${data.laws.length} IT laws</small>
            `;
            div.onclick = () => {
                nlaState.selectedCountry = code;
                nlaState.step = 1;
                renderNLA();
            };
            container.appendChild(div);
        });
    }

    // ------------------------------------------
    // STEP 1: SHOW LAWS — click to open source
    // ------------------------------------------
    else if (nlaState.step === 1) {
        const c = nlaState.selectedCountry;
        const data = NLA_DIRECTORY[c];
        if (!data) { resetNLA(); return; }

        if(breadcrumbs) breadcrumbs.innerHTML = `<span onclick="resetNLA()" style="cursor:pointer; color:#2563eb;"><i class="fa-solid fa-arrow-left"></i> All Countries</span> &rsaquo; <img src="https://flagcdn.com/${c}.svg" width="20" style="vertical-align:middle; border-radius:2px;"> ${data.name}`;

        container.className = 'nla-list-view';
        container.innerHTML = '';

        data.laws.forEach(law => {
            const div = document.createElement('div');
            div.className = 'nla-law-card nla-law-link';
            div.onclick = () => window.open(law.url, '_blank');
            div.innerHTML = `
                <div class="nla-card-header">
                    <div class="nla-icon-box"><i class="fa-solid ${law.icon}"></i></div>
                    <div style="flex:1;">
                        <h4 class="nla-card-title">${law.title}</h4>
                        <div class="nla-card-meta"><span>${law.source}</span></div>
                    </div>
                    <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--primary); font-size:0.85rem;"></i>
                </div>
            `;
            container.appendChild(div);
        });
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

/* =========================
   💬 PERSONAL CHAT (1-on-1)
========================= */

let _chatCurrentUserId = null;
let _chatCurrentUserName = '';

function toggleChatPanel() {
    _chatPanelOpen = !_chatPanelOpen;
    const overlay = document.getElementById('chat-overlay');
    if (_chatPanelOpen) {
        overlay.classList.add('open');
        showChatContactList();
    } else {
        closeChat();
    }
}

function closeChat() {
    _chatPanelOpen = false;
    document.getElementById('chat-overlay')?.classList.remove('open');
    stopChatPolling();
    _chatCurrentUserId = null;
}

function closeChatOnOverlay(event) {
    if (event.target === event.currentTarget) closeChat();
}

async function showChatContactList() {
    const listEl = document.getElementById('chat-department-list');
    const roomEl = document.getElementById('chat-room');
    const backBtn = document.getElementById('chat-back-btn');
    const titleEl = document.getElementById('chat-panel-title');

    listEl.style.display = 'block';
    roomEl.style.display = 'none';
    backBtn.style.display = 'none';
    titleEl.innerHTML = '<i class="fa-solid fa-comments"></i> Messages';

    stopChatPolling();
    _chatCurrentUserId = null;

    let contacts = [];
    try {
        const res = await fetch('/chat/contacts', { credentials: 'include' });
        if (res.ok) contacts = await res.json();
    } catch {}

    // Split: users with conversations first (sorted by last message), then rest by department
    const withMsg = contacts.filter(c => c.last_message);
    const withoutMsg = contacts.filter(c => !c.last_message);

    // Group the rest by department
    const deptGroups = {};
    withoutMsg.forEach(c => {
        const dept = c.department || 'General';
        if (!deptGroups[dept]) deptGroups[dept] = [];
        deptGroups[dept].push(c);
    });

    let html = '';

    // Recent conversations
    if (withMsg.length) {
        html += `<div class="chat-section-title">Recent</div>`;
        for (const u of withMsg) {
            html += renderContactItem(u);
        }
    }

    // All contacts by department
    const sortedDepts = Object.keys(deptGroups).sort();
    for (const dept of sortedDepts) {
        html += `<div class="chat-section-title">${escapeHtml(dept)}</div>`;
        for (const u of deptGroups[dept]) {
            html += renderContactItem(u);
        }
    }

    if (!contacts.length) {
        html = '<div style="text-align:center; padding:40px; color:var(--text-muted);">No contacts found</div>';
    }

    listEl.innerHTML = html;
}

function renderContactItem(u) {
    const avatar = u.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'U')}&background=2563eb&color=fff&size=40`;
    const isMe = u.last_sender_id === currentUser?.id;
    const lastMsg = u.last_message
        ? `${isMe ? 'You: ' : ''}${escapeHtml(chatTruncate(u.last_message, 30))}`
        : `<span style="opacity:0.4">${escapeHtml(u.department || '')}</span>`;
    const timeAgo = u.last_message_at ? formatChatTime(u.last_message_at) : '';
    const unread = u.unread_count > 0 ? `<span class="chat-contact-unread">${u.unread_count}</span>` : '';

    return `<div class="chat-contact-item" onclick="openPersonalChat('${u.id}', '${escapeHtml(u.name).replace(/'/g, "\\'")}')">
        <img class="chat-contact-avatar" src="${escapeHtml(avatar)}" alt="">
        <div class="chat-contact-info">
            <div class="chat-contact-name">${escapeHtml(u.name)}${u.role === 'head' ? ' <span class="chat-role-badge">Head</span>' : ''}${u.role === 'admin' ? ' <span class="chat-role-badge admin">Admin</span>' : ''}</div>
            <div class="chat-contact-preview">${lastMsg}</div>
        </div>
        <div class="chat-contact-meta">
            ${timeAgo ? `<div class="chat-contact-time">${timeAgo}</div>` : ''}
            ${unread}
        </div>
    </div>`;
}

async function openPersonalChat(userId, userName) {
    const listEl = document.getElementById('chat-department-list');
    const roomEl = document.getElementById('chat-room');
    const backBtn = document.getElementById('chat-back-btn');
    const titleEl = document.getElementById('chat-panel-title');

    listEl.style.display = 'none';
    roomEl.style.display = 'flex';
    backBtn.style.display = 'flex';
    titleEl.textContent = userName;

    _chatCurrentUserId = userId;
    _chatCurrentUserName = userName;
    _chatLastMessageId = 0;

    const msgContainer = document.getElementById('chat-messages');
    msgContainer.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch(`/chat/messages/${encodeURIComponent(userId)}?limit=50`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load');
        _chatMessages = await res.json();
        if (_chatMessages.length > 0) {
            _chatLastMessageId = _chatMessages[_chatMessages.length - 1].id;
        }
        renderChatMessages();
        scrollChatToBottom();
        loadChatUnreadCount();
    } catch {
        msgContainer.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Failed to load messages</div>';
    }

    startChatPolling();
}

function renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!_chatMessages.length) {
        container.innerHTML = `<div class="chat-empty"><i class="fa-solid fa-paper-plane"></i><p>Send a message to start the conversation</p></div>`;
        return;
    }

    let html = '';
    let lastDate = '';

    for (const msg of _chatMessages) {
        const msgDate = new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        if (msgDate !== lastDate) {
            html += `<div class="chat-date-separator"><span>${msgDate}</span></div>`;
            lastDate = msgDate;
        }

        const isMe = msg.sender_id === currentUser?.id;
        const time = new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        html += `<div class="chat-msg ${isMe ? 'chat-msg-me' : 'chat-msg-other'}">
            <div class="chat-msg-bubble">
                <div class="chat-msg-text">${escapeHtml(msg.message).replace(/\n/g, '<br>')}</div>
                <div class="chat-msg-time">${time}${isMe ? (msg.is_read ? ' <i class="fa-solid fa-check-double" style="color:#60a5fa;margin-left:3px;font-size:0.6rem;"></i>' : ' <i class="fa-solid fa-check" style="margin-left:3px;font-size:0.6rem;"></i>') : ''}</div>
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message || !_chatCurrentUserId) return;

    input.value = '';
    autoResizeChatInput(input);

    try {
        const res = await fetch('/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ receiver_id: _chatCurrentUserId, message })
        });
        if (!res.ok) throw new Error('Failed to send');
        const newMsg = await res.json();
        _chatMessages.push(newMsg);
        _chatLastMessageId = newMsg.id;
        renderChatMessages();
        scrollChatToBottom();
    } catch {
        alert('Failed to send message');
    }
}

function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

function autoResizeChatInput(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function startChatPolling() {
    stopChatPolling();
    _chatPollInterval = setInterval(pollNewChatMessages, 5000);
}

function stopChatPolling() {
    if (_chatPollInterval) {
        clearInterval(_chatPollInterval);
        _chatPollInterval = null;
    }
}

async function pollNewChatMessages() {
    if (!_chatCurrentUserId || !_chatPanelOpen) return;
    try {
        const res = await fetch(`/chat/new-messages/${encodeURIComponent(_chatCurrentUserId)}?after=${_chatLastMessageId}`, { credentials: 'include' });
        if (!res.ok) return;
        const newMessages = await res.json();
        if (newMessages.length > 0) {
            _chatMessages.push(...newMessages);
            _chatLastMessageId = newMessages[newMessages.length - 1].id;
            const container = document.getElementById('chat-messages');
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            renderChatMessages();
            if (isNearBottom) scrollChatToBottom();
        }
    } catch {}
}

function scrollChatToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

function chatTruncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function formatChatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return diffMins + 'm';
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours + 'h';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

async function loadChatUnreadCount() {
    if (!currentUser) return;
    try {
        const res = await fetch('/chat/unread-count', { credentials: 'include' });
        if (!res.ok) return;
        const { count } = await res.json();
        const badge = document.getElementById('chat-badge');
        if (!badge) return;
        if (count > 0) {
            badge.style.display = '';
            badge.textContent = count > 99 ? '99+' : count;
        } else {
            badge.style.display = 'none';
        }
    } catch {}
}

/* =========================
   👥 HR MODULE
========================= */
let _hrSearchTimer = null;
const ALL_DEPARTMENTS = ['Product Export','Startup Ecosystem','Western Markets','Eastern Markets','GovTech','Venture Capital','Analytics','BPO Monitoring','Residents Relations','Residents Registration','Residents Monitoring','Softlanding','Legal Ecosystem','AI Infrastructure','AI Research','Inclusive Projects','Regional Development','Freelancers & Youth','Infrastructure','Infrastructure Dev','PPP Investors','IT Outsourcing','Global Marketing','Multimedia','Public Relations','Marketing','Event Management','International Relations','HR','Administrative Affairs'];

function showHRSubtab(tab) {
    document.querySelectorAll('.hr-subnav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`hr-sub-${tab}`);
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.hr-subtab').forEach(s => s.style.display = 'none');
    const target = document.getElementById(`hr-${tab}`);
    if (target) target.style.display = 'block';

    if (tab === 'interns') loadHRInterns();
    else if (tab === 'all-users') loadHRAllUsers();
    else if (tab === 'on-hold') loadHRTrialPeriod();
    else if (tab === 'hr-notifs') loadHRNotifications();
}

async function loadHRDashboard() {
    try {
        const res = await fetch('/hr/dashboard', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        const stats = await res.json();

        const bar = document.getElementById('hr-stats-bar');
        if (bar) {
            bar.innerHTML = `
                <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalUsers}</div><div class="admin-stat-label">Total Users</div></div>
                <div class="admin-stat-card"><div class="admin-stat-value">${stats.pendingInterns}</div><div class="admin-stat-label">Pending Interns</div></div>
                <div class="admin-stat-card"><div class="admin-stat-value">${stats.interns}</div><div class="admin-stat-label">Interns</div></div>
                <div class="admin-stat-card"><div class="admin-stat-value">${stats.onHold}</div><div class="admin-stat-label">On Hold</div></div>
                <div class="admin-stat-card"><div class="admin-stat-value">${stats.employees}</div><div class="admin-stat-label">Employees</div></div>
            `;
            if (stats.trialWarnings && stats.trialWarnings.length > 0) {
                bar.innerHTML += `<div class="admin-stat-card" style="background:#fef2f2; border-color:#fca5a5;"><div class="admin-stat-value" style="color:#ef4444;">${stats.trialWarnings.length}</div><div class="admin-stat-label" style="color:#ef4444;">Trial Warnings</div></div>`;
            }
        }

        // Populate dept filter if empty
        const deptFilter = document.getElementById('hr-dept-filter');
        if (deptFilter && deptFilter.options.length <= 1) {
            ALL_DEPARTMENTS.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d; opt.textContent = d;
                deptFilter.appendChild(opt);
            });
        }

        showHRSubtab('interns');
    } catch (e) {
        console.error('HR Dashboard error:', e);
    }
}

async function loadHRInterns() {
    try {
        const res = await fetch('/hr/users?status=intern', { credentials: 'include' });
        const data = await res.json();
        const users = data.users || [];

        const pending = users.filter(u => u.approval_status === 'pending');
        const approved = users.filter(u => u.approval_status === 'approved');

        const pendingEl = document.getElementById('hr-pending-interns');
        if (pendingEl) {
            if (pending.length === 0) {
                pendingEl.innerHTML = '<div style="color:var(--text-muted); padding:16px;">No pending applications.</div>';
            } else {
                pendingEl.innerHTML = pending.map(u => `
                    <div class="hr-intern-card">
                        <div class="hr-intern-info">
                            <img src="${escapeHtml(u.photo_url)}" class="hr-intern-avatar">
                            <div>
                                <strong>${escapeHtml(u.name)}</strong>
                                <div style="color:var(--text-muted); font-size:0.85rem;">${escapeHtml(u.email)}${u.phone ? ' | ' + escapeHtml(u.phone) : ''}</div>
                                <div style="color:var(--text-muted); font-size:0.8rem;">Applied: ${new Date(u.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <div class="hr-intern-actions">
                            <button onclick="approveIntern('${u.id}')" class="ws-btn-save" style="padding:6px 14px; font-size:0.85rem;">Approve</button>
                            <button onclick="rejectUser('${u.id}')" class="ws-btn-cancel" style="padding:6px 14px; font-size:0.85rem;">Reject</button>
                        </div>
                    </div>
                `).join('');
            }
        }

        const approvedEl = document.getElementById('hr-approved-interns');
        if (approvedEl) {
            if (approved.length === 0) {
                approvedEl.innerHTML = '<div style="color:var(--text-muted); padding:16px;">No approved interns awaiting documents.</div>';
            } else {
                approvedEl.innerHTML = approved.map(u => `
                    <div class="hr-intern-card">
                        <div class="hr-intern-info">
                            <img src="${escapeHtml(u.photo_url)}" class="hr-intern-avatar">
                            <div>
                                <strong>${escapeHtml(u.name)}</strong>
                                <div style="color:var(--text-muted); font-size:0.85rem;">${escapeHtml(u.email)}</div>
                                <div style="font-size:0.8rem;">Docs: ${u.doc_count}/5 uploaded</div>
                            </div>
                        </div>
                        <div class="hr-intern-actions">
                            <button onclick="openHRDocModal('${u.id}', '${escapeHtml(u.name)}')" class="ws-btn-save" style="padding:6px 14px; font-size:0.85rem;">View Docs</button>
                            <button onclick="openHRStatusModal('${u.id}', 'intern')" class="ws-btn-cancel" style="padding:6px 14px; font-size:0.85rem;">Change Status</button>
                            <button onclick="openHRAssignModal('${u.id}', '${escapeHtml(u.name)}')" class="primary-btn" style="padding:6px 14px; font-size:0.85rem;">Assign</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.error('Load HR interns error:', e);
    }
}

function debounceHRUserSearch() {
    clearTimeout(_hrSearchTimer);
    _hrSearchTimer = setTimeout(loadHRAllUsers, 300);
}

async function loadHRAllUsers() {
    const search = document.getElementById('hr-user-search')?.value || '';
    const dept = document.getElementById('hr-dept-filter')?.value || '';
    const status = document.getElementById('hr-status-filter')?.value || '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (dept) params.set('department', dept);
    if (status) params.set('status', status);

    try {
        const res = await fetch(`/hr/users?${params}`, { credentials: 'include' });
        const data = await res.json();
        const users = data.users || [];

        const list = document.getElementById('hr-users-list');
        if (!list) return;

        if (users.length === 0) {
            list.innerHTML = '<div style="color:var(--text-muted); padding:16px;">No users found.</div>';
            return;
        }

        list.innerHTML = `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr>
                        <th>User</th><th>Department</th><th>Status</th><th>Docs</th><th>Certs</th><th>Actions</th>
                    </tr></thead>
                    <tbody>
                        ${users.map(u => `<tr>
                            <td><div style="display:flex; align-items:center; gap:8px;">
                                <img src="${escapeHtml(u.photo_url)}" style="width:32px; height:32px; border-radius:50%;">
                                <div><strong>${escapeHtml(u.name)}</strong><br><span style="color:var(--text-muted); font-size:0.8rem;">${escapeHtml(u.email)}</span></div>
                            </div></td>
                            <td>${escapeHtml(u.department)}</td>
                            <td><span class="hr-status-badge hr-status-${u.employment_status}">${u.employment_status}</span></td>
                            <td>${u.doc_count}</td>
                            <td>${u.cert_count}</td>
                            <td>
                                <button onclick="openHRDocModal('${u.id}', '${escapeHtml(u.name)}')" title="View Documents" style="background:none; border:none; cursor:pointer; color:var(--primary); font-size:1rem;"><i class="fa-solid fa-file-lines"></i></button>
                                <button onclick="openHRStatusModal('${u.id}', '${u.employment_status}')" title="Change Status" style="background:none; border:none; cursor:pointer; color:var(--primary); font-size:1rem;"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error('Load HR users error:', e);
    }
}

async function loadHRTrialPeriod() {
    try {
        const res = await fetch('/hr/users?status=on_hold', { credentials: 'include' });
        const data = await res.json();
        const users = data.users || [];

        // Trial warnings
        const dashRes = await fetch('/hr/dashboard', { credentials: 'include' });
        const dashData = await dashRes.json();
        const warnings = dashData.trialWarnings || [];

        const warningsEl = document.getElementById('hr-trial-warnings');
        if (warningsEl) {
            if (warnings.length === 0) {
                warningsEl.innerHTML = '';
            } else {
                warningsEl.innerHTML = '<h3 style="margin-bottom:12px; color:#ef4444;">Trial Period Warnings</h3>' +
                    warnings.map(w => `
                        <div class="hr-warning-card ${w.days_left <= 5 ? 'hr-warning-urgent' : ''}">
                            <div><strong>${escapeHtml(w.name)}</strong> — ${w.days_left} days left (ends ${w.trial_end_date})</div>
                            <button onclick="openHRStatusModal('${w.id}', 'on_hold')" class="ws-btn-save" style="padding:4px 12px; font-size:0.85rem;">Change Status</button>
                        </div>
                    `).join('');
            }
        }

        const listEl = document.getElementById('hr-on-hold-list');
        if (listEl) {
            if (users.length === 0) {
                listEl.innerHTML = '<div style="color:var(--text-muted); padding:16px;">No users on trial period.</div>';
            } else {
                listEl.innerHTML = users.map(u => `
                    <div class="hr-intern-card">
                        <div class="hr-intern-info">
                            <img src="${escapeHtml(u.photo_url)}" class="hr-intern-avatar">
                            <div>
                                <strong>${escapeHtml(u.name)}</strong>
                                <div style="color:var(--text-muted); font-size:0.85rem;">${escapeHtml(u.email)}</div>
                                <div style="font-size:0.85rem;">Dept: <strong>${escapeHtml(u.target_department || u.department)}</strong></div>
                                <div style="font-size:0.8rem; color:var(--text-muted);">Trial: ${u.trial_start_date || '?'} — ${u.trial_end_date || '?'}</div>
                            </div>
                        </div>
                        <div class="hr-intern-actions">
                            <button onclick="openHRDocModal('${u.id}', '${escapeHtml(u.name)}')" class="ws-btn-save" style="padding:6px 14px; font-size:0.85rem;">Docs</button>
                            <button onclick="openHRStatusModal('${u.id}', 'on_hold')" class="ws-btn-cancel" style="padding:6px 14px; font-size:0.85rem;">Change Status</button>
                            <button onclick="openHRAssignModal('${u.id}', '${escapeHtml(u.name)}')" class="primary-btn" style="padding:6px 14px; font-size:0.85rem;">Assign</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.error('Load HR trial period error:', e);
    }
}

async function loadHRNotifications() {
    try {
        const res = await fetch('/hr/notifications', { credentials: 'include' });
        const data = await res.json();
        const notifs = data.notifications || [];

        const list = document.getElementById('hr-notifications-list');
        if (!list) return;

        if (notifs.length === 0) {
            list.innerHTML = '<div style="color:var(--text-muted); padding:16px;">No notifications.</div>';
            return;
        }

        list.innerHTML = notifs.map(n => `
            <div class="hr-notif-item ${n.is_read ? '' : 'hr-notif-unread'}" onclick="markHRNotifRead(${n.id}, this)">
                <div class="hr-notif-icon">
                    <i class="fa-solid ${getNotifIcon(n.type)}"></i>
                </div>
                <div class="hr-notif-content">
                    <strong>${escapeHtml(n.title)}</strong>
                    <div style="font-size:0.85rem; color:var(--text-muted);">${escapeHtml(n.message)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${new Date(n.created_at).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load HR notifications error:', e);
    }
}

function getNotifIcon(type) {
    const icons = {
        intern_application: 'fa-user-plus',
        intern_docs_uploaded: 'fa-file-check',
        intern_approved: 'fa-check-circle',
        intern_assigned: 'fa-user-tag',
        trial_warning_14d: 'fa-clock',
        trial_warning_5d: 'fa-exclamation-triangle',
        admin_affairs_prep: 'fa-desktop',
        new_team_member: 'fa-people-arrows',
        status_change: 'fa-arrows-rotate'
    };
    return icons[type] || 'fa-bell';
}

async function markHRNotifRead(id, el) {
    try {
        await fetch(`/hr/notifications/${id}/read`, { method: 'PUT', credentials: 'include' });
        if (el) el.classList.remove('hr-notif-unread');
    } catch {}
}

async function approveIntern(userId) {
    if (!confirm('Approve this intern application?')) return;
    try {
        const res = await fetch(`/hr/users/${userId}/approve-intern`, { method: 'PUT', credentials: 'include' });
        if (!res.ok) throw new Error('Failed');
        loadHRInterns();
        loadHRDashboard();
    } catch (e) {
        alert('Failed to approve intern.');
    }
}

// --- Document Modal ---
async function openHRDocModal(userId, userName) {
    document.getElementById('hr-doc-modal').style.display = 'flex';
    document.getElementById('hr-doc-modal-title').textContent = `Documents — ${userName}`;
    const body = document.getElementById('hr-doc-modal-body');
    body.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch(`/hr/users/${userId}/documents`, { credentials: 'include' });
        const data = await res.json();
        const docs = data.documents || [];

        if (docs.length === 0) {
            body.innerHTML = '<div style="padding:16px; color:var(--text-muted);">No documents uploaded yet.</div>';
            return;
        }

        body.innerHTML = `
            <div class="hr-doc-list">
                ${docs.map(d => `
                    <div class="hr-doc-item">
                        <div class="hr-doc-icon">
                            <i class="fa-solid ${d.mime_type && d.mime_type.includes('pdf') ? 'fa-file-pdf' : 'fa-file-image'}" style="font-size:1.5rem; color:var(--primary);"></i>
                        </div>
                        <div class="hr-doc-info">
                            <strong>${escapeHtml(d.label || d.doc_type.replace(/_/g, ' '))}</strong>
                            <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(d.original_name)} (${(d.file_size / 1024).toFixed(0)} KB)</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">Uploaded: ${new Date(d.created_at).toLocaleDateString()}</div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <a href="${d.file_path}" target="_blank" class="ws-btn-save" style="padding:4px 10px; font-size:0.8rem; text-decoration:none;">View</a>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        body.innerHTML = '<div style="color:#ef4444; padding:16px;">Failed to load documents.</div>';
    }
}

function closeHRDocModal() {
    document.getElementById('hr-doc-modal').style.display = 'none';
}

// --- Status Change Modal ---
function openHRStatusModal(userId, currentStatus) {
    document.getElementById('hr-status-modal').style.display = 'flex';
    document.getElementById('hr-status-user-id').value = userId;
    document.getElementById('hr-new-status').value = currentStatus;

    // Populate target dept dropdown
    const deptSelect = document.getElementById('hr-target-dept');
    if (deptSelect.options.length <= 0) {
        ALL_DEPARTMENTS.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d;
            deptSelect.appendChild(opt);
        });
    }
    toggleTargetDeptField();
}

function closeHRStatusModal() {
    document.getElementById('hr-status-modal').style.display = 'none';
}

function toggleTargetDeptField() {
    const status = document.getElementById('hr-new-status').value;
    document.getElementById('hr-target-dept-group').style.display = (status === 'on_hold') ? 'block' : 'none';
}

async function submitStatusChange(e) {
    e.preventDefault();
    const userId = document.getElementById('hr-status-user-id').value;
    const employment_status = document.getElementById('hr-new-status').value;
    const target_department = document.getElementById('hr-target-dept').value;

    const body = { employment_status };
    if (employment_status === 'on_hold' && target_department) body.target_department = target_department;

    try {
        const res = await fetch(`/hr/users/${userId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        closeHRStatusModal();
        alert('Status updated successfully!');
        loadHRDashboard();
    } catch (e) {
        alert('Failed: ' + e.message);
    }
}

// --- Assign Intern Modal ---
function openHRAssignModal(internId, internName) {
    document.getElementById('hr-assign-modal').style.display = 'flex';
    document.getElementById('hr-assign-intern-id').value = internId;

    const deptSelect = document.getElementById('hr-assign-dept');
    if (deptSelect.options.length <= 0) {
        ALL_DEPARTMENTS.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d;
            deptSelect.appendChild(opt);
        });
    }
    loadDeptMembers();
}

function closeHRAssignModal() {
    document.getElementById('hr-assign-modal').style.display = 'none';
}

async function loadDeptMembers() {
    const dept = document.getElementById('hr-assign-dept').value;
    const memberSelect = document.getElementById('hr-assign-member');
    memberSelect.innerHTML = '<option value="">Loading...</option>';

    try {
        const res = await fetch(`/hr/department-members?department=${encodeURIComponent(dept)}`, { credentials: 'include' });
        const data = await res.json();
        const members = data.members || [];
        memberSelect.innerHTML = '<option value="">Select member...</option>' +
            members.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${m.role})</option>`).join('');
    } catch {
        memberSelect.innerHTML = '<option value="">Failed to load</option>';
    }
}

async function submitInternAssignment(e) {
    e.preventDefault();
    const internId = document.getElementById('hr-assign-intern-id').value;
    const assigned_to = document.getElementById('hr-assign-member').value;
    const notes = document.getElementById('hr-assign-notes').value;

    if (!assigned_to) return alert('Please select a team member.');

    try {
        const res = await fetch(`/hr/users/${internId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ assigned_to, notes })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        closeHRAssignModal();
        alert('Intern assigned successfully!');
    } catch (e) {
        alert('Failed: ' + e.message);
    }
}

// --- Intern Document Upload (shown in workspace for approved interns) ---
async function renderInternDocUpload(container) {
    const requiredDocs = [
        { type: 'photo_3x4', label: 'Photo 3x4', accept: 'image/*', required: true },
        { type: 'passport', label: 'Passport (PDF)', accept: '.pdf', required: true },
        { type: 'inn', label: 'INN (PDF)', accept: '.pdf', required: true },
        { type: 'diploma', label: 'University Diploma (PDF)', accept: '.pdf', required: true },
        { type: 'resume', label: 'Resume / Obyektivka (PDF)', accept: '.pdf', required: true },
        { type: 'ielts', label: 'IELTS Certificate (PDF)', accept: '.pdf', required: false }
    ];

    // Fetch current upload status
    let uploaded = {};
    try {
        const res = await fetch('/hr/documents/my-status', { credentials: 'include' });
        const data = await res.json();
        uploaded = data.uploaded || {};
    } catch {}

    container.innerHTML = `
        <div class="intern-doc-upload">
            <div class="intern-doc-header">
                <i class="fa-solid fa-file-arrow-up" style="font-size:2rem; color:var(--primary);"></i>
                <h2>Upload Required Documents</h2>
                <p style="color:var(--text-muted);">Please upload all mandatory documents to complete your onboarding.</p>
            </div>
            <div class="intern-doc-grid">
                ${requiredDocs.map(d => `
                    <div class="intern-doc-item ${uploaded[d.type] ? 'intern-doc-done' : ''}" id="intern-doc-${d.type}">
                        <div class="intern-doc-status">
                            ${uploaded[d.type]
                                ? '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:1.5rem;"></i>'
                                : '<i class="fa-regular fa-circle" style="color:#cbd5e1; font-size:1.5rem;"></i>'}
                        </div>
                        <div class="intern-doc-label">
                            <strong>${d.label}</strong>
                            ${d.required ? '<span style="color:#ef4444;"> *</span>' : '<span style="color:var(--text-muted);"> (optional)</span>'}
                            ${uploaded[d.type] ? `<div style="font-size:0.75rem; color:#10b981;">Uploaded: ${uploaded[d.type].name}</div>` : ''}
                        </div>
                        <div>
                            <label class="ws-btn-save" style="padding:6px 14px; font-size:0.85rem; cursor:pointer;">
                                ${uploaded[d.type] ? 'Replace' : 'Upload'}
                                <input type="file" accept="${d.accept}" style="display:none;" onchange="uploadInternDoc('${d.type}', this)">
                            </label>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:24px;">
                <h3>Additional Certificates</h3>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:12px;">Upload any additional certificates you have.</p>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <input type="text" id="cert-label" placeholder="Certificate name (e.g. IELTS 7.5)" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; flex:1; min-width:200px;">
                    <label class="primary-btn" style="padding:8px 16px; cursor:pointer;">
                        <i class="fa-solid fa-plus"></i> Upload Certificate
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style="display:none;" onchange="uploadCertificate(this)">
                    </label>
                </div>
            </div>
        </div>
    `;
}

async function uploadInternDoc(docType, input) {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('document', input.files[0]);
    formData.append('doc_type', docType);

    try {
        const res = await fetch('/hr/documents/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        // Refresh the upload form
        renderInternDocUpload(document.getElementById('workspace-widgets'));
    } catch (e) {
        alert('Upload failed: ' + e.message);
    }
}

async function uploadCertificate(input) {
    if (!input.files[0]) return;
    const label = document.getElementById('cert-label')?.value || 'Certificate';
    const formData = new FormData();
    formData.append('document', input.files[0]);
    formData.append('doc_type', 'certificate');
    formData.append('label', label);

    try {
        const res = await fetch('/hr/documents/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        alert('Certificate uploaded!');
        if (document.getElementById('cert-label')) document.getElementById('cert-label').value = '';
        // If on workspace, refresh
        if (currentUser && currentUser.employment_status === 'intern') {
            renderInternDocUpload(document.getElementById('workspace-widgets'));
        }
    } catch (e) {
        alert('Upload failed: ' + e.message);
    }
}


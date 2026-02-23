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

  const filters = document.getElementById('filters');
  const tabTitle = document.getElementById('tab-title');
  const loadMore = document.getElementById('load-more-container');

  // Hide All
  if(newsContainer) newsContainer.style.display = 'none';
  if(dashContainer) dashContainer.style.display = 'none';
  if(nlaContainer) nlaContainer.style.display = 'none';
  if(statsContainer) statsContainer.style.display = 'none';
  if(archiveContainer) archiveContainer.style.display = 'none';
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

const DOC_TYPE_ICONS = {
    article: 'fa-file-lines',
    report: 'fa-file-chart-column',
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

async function loadArchive() {
    const list = document.getElementById('archive-list');
    const topicsBar = document.getElementById('archive-topics');
    const addBtn = document.getElementById('archive-add-btn');

    list.innerHTML = '<div style=”text-align:center; padding:40px; color:#94a3b8;”><i class=”fa-solid fa-spinner fa-spin fa-2x”></i></div>';

    // Show “New Research” button for admins
    if (currentUser && currentUser.role === 'admin') addBtn.style.display = 'inline-flex';
    else addBtn.style.display = 'none';

    try {
        // Load topics and items in parallel
        const [topicsRes, itemsRes] = await Promise.all([
            fetch('/archive-topics'),
            fetch(activeArchiveTopic ? `/archive?topic=${encodeURIComponent(activeArchiveTopic)}` : '/archive')
        ]);
        archiveTopics = await topicsRes.json();
        archiveData = await itemsRes.json();

        // Render topic chips
        topicsBar.innerHTML = `<button onclick=”setArchiveTopic('')” style=”padding:6px 14px; border-radius:20px; border:1px solid ${!activeArchiveTopic ? 'var(--primary)' : '#cbd5e1'}; background:${!activeArchiveTopic ? 'var(--primary)' : 'white'}; color:${!activeArchiveTopic ? 'white' : '#475569'}; cursor:pointer; font-size:0.85rem; font-weight:500;”>All (${archiveTopics.reduce((s, t) => s + t.count, 0)})</button>` +
            archiveTopics.map(t =>
                `<button onclick=”setArchiveTopic('${t.topic}')” style=”padding:6px 14px; border-radius:20px; border:1px solid ${activeArchiveTopic === t.topic ? 'var(--primary)' : '#cbd5e1'}; background:${activeArchiveTopic === t.topic ? 'var(--primary)' : 'white'}; color:${activeArchiveTopic === t.topic ? 'white' : '#475569'}; cursor:pointer; font-size:0.85rem; font-weight:500;”>${t.topic} (${t.count})</button>`
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
    if (!q) return renderArchiveList(archiveData);
    const filtered = archiveData.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.topic.toLowerCase().includes(q) ||
        (item.summary || '').toLowerCase().includes(q) ||
        (item.author || '').toLowerCase().includes(q)
    );
    renderArchiveList(filtered);
}

function renderArchiveList(items) {
    const list = document.getElementById('archive-list');
    const reader = document.getElementById('archive-reader');
    reader.style.display = 'none';

    if (!items.length) {
        list.innerHTML = `
            <div style=”text-align:center; padding:60px 20px; color:#94a3b8;”>
                <i class=”fa-solid fa-folder-open fa-3x” style=”margin-bottom:16px; opacity:0.5;”></i>
                <p style=”font-size:1.1rem; margin:0;”>No research published yet.</p>
                <p style=”font-size:0.9rem;”>Admins can add articles, reports, and analyses using the “New Research” button.</p>
            </div>`;
        return;
    }

    list.innerHTML = items.map(item => {
        const icon = DOC_TYPE_ICONS[item.doc_type] || 'fa-file';
        const color = DOC_TYPE_COLORS[item.doc_type] || '#64748b';
        const date = new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const isAdmin = currentUser && currentUser.role === 'admin';

        return `
        <div onclick=”openArchiveItem(${item.id})” style=”padding:18px 20px; background:white; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:10px; cursor:pointer; transition:all 0.15s; display:flex; gap:16px; align-items:flex-start;” onmouseover=”this.style.borderColor='var(--primary)';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'” onmouseout=”this.style.borderColor='#e2e8f0';this.style.boxShadow='none'”>
            <div style=”width:42px; height:42px; border-radius:10px; background:${color}15; display:flex; align-items:center; justify-content:center; flex-shrink:0;”>
                <i class=”fa-solid ${icon}” style=”color:${color}; font-size:1.1rem;”></i>
            </div>
            <div style=”flex:1; min-width:0;”>
                <div style=”display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;”>
                    <span style=”font-weight:600; color:#1e293b; font-size:1rem;”>${item.title}</span>
                </div>
                <div style=”display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;”>
                    <span style=”padding:2px 8px; border-radius:4px; background:${color}15; color:${color}; font-size:0.75rem; font-weight:600; text-transform:uppercase;”>${item.doc_type}</span>
                    <span style=”padding:2px 8px; border-radius:4px; background:#f1f5f9; color:#475569; font-size:0.75rem; font-weight:500;”>${item.topic}</span>
                    ${item.author ? `<span style=”color:#94a3b8; font-size:0.8rem;”><i class=”fa-solid fa-user” style=”margin-right:3px;”></i>${item.author}</span>` : ''}
                    <span style=”color:#cbd5e1; font-size:0.8rem;”><i class=”fa-regular fa-calendar” style=”margin-right:3px;”></i>${date}</span>
                </div>
                ${item.summary ? `<p style=”margin:0; color:#64748b; font-size:0.88rem; line-height:1.5; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;”>${item.summary}</p>` : ''}
            </div>
            ${isAdmin ? `<button onclick=”event.stopPropagation(); deleteArchiveItem(${item.id})” title=”Delete” style=”background:none; border:none; color:#cbd5e1; cursor:pointer; padding:4px 8px; font-size:1rem;” onmouseover=”this.style.color='#ef4444'” onmouseout=”this.style.color='#cbd5e1'”><i class=”fa-solid fa-trash-can”></i></button>` : ''}
        </div>`;
    }).join('');
}

async function openArchiveItem(id) {
    const reader = document.getElementById('archive-reader');
    reader.style.display = 'block';
    reader.innerHTML = '<div style=”text-align:center; padding:30px;”><i class=”fa-solid fa-spinner fa-spin fa-2x” style=”color:#94a3b8;”></i></div>';
    reader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
        const res = await fetch(`/archive/${id}`);
        const item = await res.json();
        const color = DOC_TYPE_COLORS[item.doc_type] || '#64748b';
        const icon = DOC_TYPE_ICONS[item.doc_type] || 'fa-file';
        const date = new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const isAdmin = currentUser && currentUser.role === 'admin';

        reader.innerHTML = `
            <div style=”display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:20px;”>
                <div>
                    <h2 style=”margin:0 0 10px 0; color:#1e293b; font-size:1.5rem; line-height:1.3;”>${item.title}</h2>
                    <div style=”display:flex; gap:8px; flex-wrap:wrap; align-items:center;”>
                        <span style=”padding:4px 10px; border-radius:6px; background:${color}15; color:${color}; font-size:0.8rem; font-weight:600; text-transform:uppercase;”>
                            <i class=”fa-solid ${icon}” style=”margin-right:4px;”></i>${item.doc_type}
                        </span>
                        <span style=”padding:4px 10px; border-radius:6px; background:#f1f5f9; color:#475569; font-size:0.8rem; font-weight:500;”>${item.topic}</span>
                        ${item.author ? `<span style=”color:#64748b; font-size:0.85rem;”><i class=”fa-solid fa-user” style=”margin-right:4px;”></i>${item.author}</span>` : ''}
                        <span style=”color:#94a3b8; font-size:0.85rem;”><i class=”fa-regular fa-calendar” style=”margin-right:4px;”></i>${date}</span>
                    </div>
                </div>
                <div style=”display:flex; gap:8px;”>
                    ${isAdmin ? `<button onclick=”editArchiveItem(${item.id})” style=”padding:8px 14px; background:#f1f5f9; border:none; border-radius:8px; cursor:pointer; color:#475569; font-size:0.85rem;”><i class=”fa-solid fa-pen”></i> Edit</button>` : ''}
                    <button onclick=”document.getElementById('archive-reader').style.display='none'” style=”padding:8px 14px; background:#f1f5f9; border:none; border-radius:8px; cursor:pointer; color:#475569; font-size:0.85rem;”>&times; Close</button>
                </div>
            </div>
            ${item.summary ? `<div style=”padding:14px 18px; background:#f8fafc; border-radius:8px; border-left:3px solid ${color}; margin-bottom:20px; color:#475569; font-size:0.95rem; line-height:1.6;”>${item.summary}</div>` : ''}
            <div style=”color:#1e293b; font-size:1rem; line-height:1.8; white-space:pre-wrap;”>${item.content || '<span style=”color:#94a3b8;”>No content yet.</span>'}</div>
            ${item.source_url ? `<div style=”margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0;”><a href=”${item.source_url}” target=”_blank” style=”color:var(--primary); text-decoration:none; font-size:0.9rem;”><i class=”fa-solid fa-arrow-up-right-from-square” style=”margin-right:4px;”></i>View original source</a></div>` : ''}
        `;
    } catch (err) {
        reader.innerHTML = '<div style=”text-align:center; padding:30px; color:#ef4444;”>Failed to load article.</div>';
    }
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
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideArchiveForm() {
    document.getElementById('archive-form').style.display = 'none';
}

async function saveArchiveItem() {
    const editId = document.getElementById('archive-edit-id').value;
    const body = {
        title: document.getElementById('arch-title').value.trim(),
        topic: document.getElementById('arch-topic').value.trim(),
        doc_type: document.getElementById('arch-doctype').value,
        author: document.getElementById('arch-author').value.trim(),
        source_url: document.getElementById('arch-source').value.trim(),
        summary: document.getElementById('arch-summary').value.trim(),
        content: document.getElementById('arch-content').value
    };

    if (!body.title || !body.topic) return alert('Title and Topic are required.');

    try {
        const url = editId ? `/archive/${editId}` : '/archive';
        const method = editId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
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
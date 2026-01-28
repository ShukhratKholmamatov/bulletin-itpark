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
let revenueChartInstance = null; // Market Intel
let taxChartInstance = null;     // Market Intel
let localCompaniesDB = null;     // Cache for companies.json


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
  const companyContainer = document.getElementById('view-companies'); // NEW
  
  const filters = document.getElementById('filters');
  const tabTitle = document.getElementById('tab-title');
  const loadMore = document.getElementById('load-more-container');

  // Hide All
  if(newsContainer) newsContainer.style.display = 'none';
  if(dashContainer) dashContainer.style.display = 'none';
  if(nlaContainer) nlaContainer.style.display = 'none';
  if(statsContainer) statsContainer.style.display = 'none';
  if(companyContainer) companyContainer.style.display = 'none'; // Hide Companies
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

  } else if (tab === 'companies') {
    // NEW: Market Intel Tab
    if(tabTitle) tabTitle.innerText = 'Market Intelligence';
    if(companyContainer) companyContainer.style.display = 'block';
    if(filters) filters.style.display = 'none';

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
  if (currentTab === 'dashboard' || currentTab === 'companies') return;
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

  let imageHTML = `<div class="card-image-wrapper">`;
  if (item.image) {
    imageHTML += `<img src="${item.image}" onerror="this.style.display='none'">`;
  } else {
    imageHTML += `<div style="width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;"><i class="fa-solid fa-image fa-2x"></i></div>`;
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

  card.innerHTML = `
    ${imageHTML}
    <div class="card-body">
      <div class="card-meta">
        <span class="badge">${item.topic || 'General'}</span>
        <span>• ${item.source || 'Unknown'}</span>
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
   🇺🇿 MARKET INTEL (LOCAL JSON ENGINE)
   ========================================= */

async function searchCompany() {
    const query = document.getElementById('company-search').value.toLowerCase().trim();
    const resultContainer = document.getElementById('company-results');
    
    if(!query) return alert("Please enter a company name!");

    // UI Loading
    resultContainer.style.opacity = '0.5';
    document.body.style.cursor = 'wait';
    document.getElementById('comp-name').innerText = "Searching Database...";

    try {
        // 1. Load JSON (Cache it)
        if (!localCompaniesDB) {
            const res = await fetch('companies.json');
            if (!res.ok) throw new Error("Could not load companies.json");
            localCompaniesDB = await res.json();
            console.log(`📚 Database loaded: ${localCompaniesDB.length} records`);
        }

        // 2. Search Logic (Search by Name, INN, or Director)
        // matches "artel", "ortikov", or "713596"
        const company = localCompaniesDB.find(c => {
            const rawText = (c.tashkilotnomi + " " + c.fio + " " + c.davlatroyxatidanotgantartibraqamivasanasi).toLowerCase();
            return rawText.includes(query);
        });

        if (company) {
            console.log("✅ Found:", company.tashkilotnomi);
            const enrichedData = parseUzbekData(company);
            renderCompanyProfile(enrichedData);
        } else {
            alert("Company not found in local database.");
            // Optional: fallback to simulation if you want
            // renderCompanyProfile(enrichUzbekCompany({tashkilotnomi: query + " LLC"})); 
        }

    } catch (err) {
        console.error("Search Error:", err);
        alert("Error loading database.");
    } finally {
        document.body.style.cursor = 'default';
        resultContainer.style.display = 'block';
        resultContainer.style.opacity = '1';
    }
}

// ----------------------------------------------------
// 🧠 PARSING ENGINE: Extracts INN & Date
// ----------------------------------------------------
function parseUzbekData(raw) {
    // 1. Clean Name
    let cleanName = raw.tashkilotnomi
        .replace(/“|”|"/g, '')
        .replace(/limitd liability company/gi, '')
        .replace(/limited liability company/gi, '')
        .replace(/MCHJ/gi, '')
        .replace(/LLC/gi, '')
        .trim();

    // 2. Extract INN & Date from the messy string
    // Example: "Registered with the order number № 713596 in 19.04.2019"
    const metaString = raw.davlatroyxatidanotgantartibraqamivasanasi || "";
    
    // Regex for Date (DD.MM.YYYY or DD/MM/YYYY)
    const dateMatch = metaString.match(/(\d{2}[./-]\d{2}[./-]\d{4})/);
    const regDate = dateMatch ? dateMatch[0] : "Unknown";

    // Regex for INN/Order Number (Look for digits after '№' or at start)
    let regInn = "Unknown";
    const innMatch = metaString.match(/№\s*(\d+)/); // Matches "№ 713596"
    if (innMatch) {
        regInn = innMatch[1];
    } else {
        // Fallback: match the first long number found
        const numMatch = metaString.match(/\d{6,}/); 
        if (numMatch) regInn = numMatch[0];
    }

    // 3. Derive Industry & Color (AI Logic)
    let industry = "General Business";
    let color = "#64748b"; // Grey
    let baseCapital = 500000000; // 500M default
    const nameUpper = cleanName.toUpperCase();

    if (nameUpper.includes("CONSULT") || nameUpper.includes("LEGAL") || nameUpper.includes("YURIDIK") || nameUpper.includes("LAW")) {
        industry = "Legal & Consulting"; color = "#8b5cf6"; baseCapital = 300000000;
    } else if (nameUpper.includes("TECH") || nameUpper.includes("SOFT") || nameUpper.includes("SYSTEM")) {
        industry = "IT Services"; color = "#39ff14"; baseCapital = 1000000000;
    } else if (nameUpper.includes("BUILD") || nameUpper.includes("STROY") || nameUpper.includes("QURILISH")) {
        industry = "Construction"; color = "#f97316"; baseCapital = 5000000000;
    } else if (nameUpper.includes("TRADE") || nameUpper.includes("SAVDO") || nameUpper.includes("COMMERCE")) {
        industry = "Trade & Retail"; color = "#eab308"; baseCapital = 2000000000;
    }

    // 4. Simulate Financials based on parsed data
    const estimatedRevenue = baseCapital * (Math.floor(Math.random() * 10) + 5); 

    return {
        name: cleanName,
        inn: regInn,
        reg_date: regDate,
        region: raw.Hudud || "Uzbekistan",
        address: raw.kontakti || "No Address Listed",
        director: raw.fio || "Not Listed",
        
        // Visuals
        industry: industry,
        color: color,
        revenue: estimatedRevenue
    };
}

// ----------------------------------------------------
// 🎨 RENDER UI
// ----------------------------------------------------
function renderCompanyProfile(data) {
    // 1. Company Title
    document.getElementById('comp-name').innerText = data.name;
    document.getElementById('comp-name').style.color = data.color;

    // 2. OFFICIAL DATA BADGE
    // We inject the extracted INN and Date here
    document.getElementById('comp-inn').innerHTML = `
        <span style="color:${data.color}; font-weight:bold;">● REGISTERED</span> 
        &nbsp;|&nbsp; <i class="fa-solid fa-passport"></i> INN: <b>${data.inn}</b> 
        &nbsp;|&nbsp; <i class="fa-solid fa-calendar"></i> Date: <b>${data.reg_date}</b>
    `;

    // 3. Location & Type
    document.getElementById('comp-region').innerText = data.region;
    document.getElementById('comp-type').innerText = data.industry;
    document.getElementById('comp-type').style.background = data.color + "20"; 
    document.getElementById('comp-type').style.color = data.color;

    // 4. Contact & Owner Info (New Section)
    // We add this dynamically below the badges
    let extraInfo = document.getElementById('comp-extra-info');
    if(!extraInfo) {
        extraInfo = document.createElement('div');
        extraInfo.id = 'comp-extra-info';
        extraInfo.style.cssText = "margin-top:15px; padding:15px; background:rgba(255,255,255,0.05); border-radius:10px; font-size:0.9rem; color:#cbd5e1;";
        document.querySelector('#company-results .nla-law-card > div').appendChild(extraInfo);
    }
    
    extraInfo.innerHTML = `
        <div style="margin-bottom:5px;"><i class="fa-solid fa-user-tie" style="width:20px; text-align:center;"></i> <b>Owner/Director:</b> ${data.director}</div>
        <div><i class="fa-solid fa-map-location-dot" style="width:20px; text-align:center;"></i> <b>Address:</b> ${data.address}</div>
    `;

    // 5. Financials
    const fmtRev = (data.revenue > 1000000000) 
        ? (data.revenue / 1000000000).toFixed(1) + 'B UZS' 
        : (data.revenue / 1000000).toFixed(1) + 'M UZS';
    
    document.getElementById('comp-revenue').innerText = "≈ " + fmtRev;

    // 6. Draw Charts
    const growth = data.revenue / 1000000; 
    const revData = [growth*0.5, growth*0.65, growth*0.8, growth*0.9, growth];
    const taxData = [growth*0.12, growth*0.35, growth*0.53]; 

    drawCharts(['2020', '2021', '2022', '2023', '2024'], revData, taxData, data.color);
}

// 5. CHART DRAWER
function drawCharts(labels, revData, taxData, color) {
    const ctxRev = document.getElementById('revenueChart').getContext('2d');
    const ctxTax = document.getElementById('taxChart').getContext('2d');

    if(revenueChartInstance) revenueChartInstance.destroy();
    if(taxChartInstance) taxChartInstance.destroy();

    revenueChartInstance = new Chart(ctxRev, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Est. Revenue (M UZS)',
                data: revData,
                borderColor: color,
                backgroundColor: color + '20',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { grid: { color: 'rgba(255,255,255,0.1)' } }, x: { grid: { display: false } } },
            plugins: { legend: { display: false } }
        }
    });

    taxChartInstance = new Chart(ctxTax, {
        type: 'doughnut',
        data: {
            labels: ['Est. Tax (12%)', 'Op. Expenses', 'Net Profit'],
            datasets: [{
                data: taxData,
                backgroundColor: ['#ef4444', '#64748b', color],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#cbd5e1' } } }
        }
    });
}
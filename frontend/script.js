let currentTab = 'all';
let currentUser = null;

// Pagination state
let limit = 20;
let offset = 0;
let isLoading = false;

// Auto refresh interval (10 minutes)
const AUTO_REFRESH_MS = 10 * 60 * 1000;

/* =========================
   👤 AUTH
========================= */
async function fetchCurrentUser() {
  try {
    const res = await fetch('/auth/current', { credentials: 'include' });
    if (res.ok) {
      currentUser = await res.json();
      const userNameEl = document.getElementById('user-name');
      if (userNameEl) userNameEl.innerText = `Hello, ${currentUser.name}`;
    } else {
      currentUser = null;
      const userNameEl = document.getElementById('user-name');
      if (userNameEl) userNameEl.innerText = '';
    }
  } catch {
    currentUser = null;
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.innerText = '';
  }
  updateAuthButton();
}

function updateAuthButton() {
  const btn = document.getElementById('auth-btn');
  if (!btn) return;
  btn.innerText = currentUser ? 'Sign Out' : 'Sign in with Google';
}

function handleAuthClick() {
  if (currentUser) logout();
  else loginWithGoogle();
}

function loginWithGoogle() {
  window.location.href = '/auth/google';
}

function logout() {
  window.location.href = '/auth/logout';
}

/* =========================
   📑 TABS
========================= */
function showTab(tab) {
  currentTab = tab;
  const tabTitle = document.getElementById('tab-title');
  if (tabTitle) tabTitle.innerText = tab === 'all' ? 'News' : 'Saved News';

  const filters = document.getElementById('filters');
  if (filters) filters.style.display = tab === 'all' ? 'flex' : 'none';

  resetNews();
  loadNews();
}

/* =========================
   🔄 RESET
========================= */
function resetNews() {
  offset = 0;
  const container = document.getElementById('news-container');
  if (container) container.innerHTML = '';
}

/* =========================
   🧱 CREATE CARD
========================= */
function createCard(container, item) {
  const card = document.createElement('div');
  card.className = 'news-card';
  card.style.border = '1px solid #ddd';
  card.style.borderRadius = '8px';
  card.style.padding = '15px';
  card.style.margin = '10px 0';
  card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
  card.style.backgroundColor = '#fff';

  // Image (if available)
  let contentHTML = '';
  if (item.image) {
    contentHTML += `<img src="${item.image}" alt="${item.title}" 
                     style="width:100%; max-height:200px; object-fit:cover; border-radius:5px; margin-bottom:10px;">`;
  }

  // Description
  contentHTML += `<p>${item.description || ''}</p>`;

  // Video support
  if (item.content_type === 'video') {
    contentHTML += `
      <video width="100%" controls style="margin-top:10px;">
        <source src="${item.url}" type="video/mp4">
      </video>
    `;
  } else {
    contentHTML += `<a href="${item.url}" target="_blank" style="color:#007bff;">Read more</a>`;
  }

  const isSaved = item.saved === true;

  // Save/Unsave button
  const saveButton = currentUser
    ? `<button onclick="${isSaved ? 'unsaveNews' : 'saveNews'}('${item.id}', this)"
               style="margin-top:10px; padding:5px 10px; cursor:pointer;">
         ${isSaved ? 'Unsave' : 'Save'}
       </button>`
    : `<p style="opacity:0.6; margin-top:10px;">Login to save news</p>`;

  // Card inner HTML
  card.innerHTML = `
    <h3 style="margin:5px 0;">${item.title}</h3>
    <p style="font-size:12px; color:#555;">
      <strong>Topic:</strong> ${item.topic || 'General'} |
      <strong>Department:</strong> ${item.department || 'General'} |
      <strong>Source:</strong> ${item.source || 'Unknown'} |
      <strong>Country:</strong> ${item.country || 'Unknown'}
    </p>
    ${contentHTML}
    <p class="relevance" style="font-size:12px; color:#888;">Relevance: ${item.relevance || 0}</p>
    ${saveButton}
  `;

  container.appendChild(card);
}


/* =========================
   ➕ LOAD MORE BUTTON
========================= */
function toggleLoadMore(show) {
  let btn = document.getElementById('load-more-btn');

  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'load-more-btn';
    btn.innerText = 'Load more';
    btn.onclick = loadNews;
    btn.style.margin = '20px auto';
    btn.style.display = 'block';
    document.getElementById('load-more-container').appendChild(btn);
  }

  btn.style.display = show ? 'block' : 'none';
}

/* =========================
   📰 LOAD NEWS
========================= */
async function loadNews() {
  if (isLoading) return;
  isLoading = true;

  const container = document.getElementById('news-container');
  if (!container) return;

  try {
    const topic = document.getElementById('topic-filter')?.value || '';
    const department = document.getElementById('department-filter')?.value || '';
    const keyword = document.getElementById('keyword')?.value || '';

    const query = new URLSearchParams();
    if (topic) query.append('topic', topic);
    if (department) query.append('department', department);
    if (keyword) query.append('keyword', keyword);

    query.append('limit', limit);
    query.append('offset', offset);

    if (currentTab === 'saved' && currentUser) {
      query.append('userId', currentUser.id);
    }

    const res = await fetch(`/news?${query.toString()}`, { credentials: 'include' });

    if (!res.ok) {
      const text = await res.text();
      console.error('News fetch failed:', text);
      throw new Error('Failed to fetch news');
    }

    const news = await res.json();
    console.log('News fetched:', news);

    if (!news.length && offset === 0) {
      container.innerHTML = '<p>No news available</p>';
      toggleLoadMore(false);
      return;
    }

    news.forEach(item => createCard(container, item));

    offset += limit;

    toggleLoadMore(news.length === limit);

  } catch (err) {
    console.error('Error loading news:', err);
    container.innerHTML = '<p>Error loading news.</p>';
  } finally {
    isLoading = false;
  }
}

/* =========================
   ⭐ SAVE / UNSAVE
========================= */
async function saveNews(id, btn) {
  if (!currentUser) return alert('Login first!');
  await fetch('/news/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newsId: id }),
    credentials: 'include'
  });
  btn.innerText = 'Unsave';
  btn.setAttribute('onclick', `unsaveNews('${id}', this)`);
}

async function unsaveNews(id, btn) {
  if (!currentUser) return alert('Login first!');
  await fetch('/news/unsave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newsId: id }),
    credentials: 'include'
  });
  btn.innerText = 'Save';
  btn.setAttribute('onclick', `saveNews('${id}', this)`);
}

/* =========================
   🔁 AUTO REFRESH (10 MIN)
========================= */
setInterval(() => {
  if (currentTab === 'all') {
    resetNews();
    loadNews();
    console.log('🔄 News auto-refreshed');
  }
}, AUTO_REFRESH_MS);

/* =========================
   🚀 INIT
========================= */
window.onload = async () => {
  await fetchCurrentUser();
  showTab('all');
};

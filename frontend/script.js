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
      document.getElementById('user-name').innerText = `Hello, ${currentUser.name}`;
    } else {
      currentUser = null;
      document.getElementById('user-name').innerText = '';
    }
  } catch {
    currentUser = null;
    document.getElementById('user-name').innerText = '';
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
  document.getElementById('tab-title').innerText =
    tab === 'all' ? 'News' : 'Saved News';

  document.getElementById('filters').style.display =
    tab === 'all' ? 'flex' : 'none';

  resetNews();
  loadNews();
}

/* =========================
   🔄 RESET
========================= */
function resetNews() {
  offset = 0;
  document.getElementById('news-container').innerHTML = '';
}

/* =========================
   📰 LOAD NEWS
========================= */
async function loadNews() {
  if (isLoading) return;
  isLoading = true;

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

    const res = await fetch(`/news?${query.toString()}`, {
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Failed to fetch news');

    const news = await res.json();
    const container = document.getElementById('news-container');

    if (!news.length && offset === 0) {
      container.innerHTML = '<p>No news available</p>';
      return;
    }

    news.forEach(item => createCard(container, item));

    offset += limit;

    toggleLoadMore(news.length === limit);

  } catch (err) {
    console.error(err);
    document.getElementById('news-container').innerHTML =
      '<p>Error loading news.</p>';
  } finally {
    isLoading = false;
  }
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
    document.body.appendChild(btn);
  }

  btn.style.display = show ? 'block' : 'none';
}

/* =========================
   🧱 CREATE CARD
========================= */
function createCard(container, item) {
  const card = document.createElement('div');
  card.className = 'news-card';

  let contentHTML = `<p>${item.description || ''}</p>`;

  if (item.content_type === 'video') {
    contentHTML += `
      <video width="100%" controls>
        <source src="${item.url}" type="video/mp4">
      </video>
    `;
  } else {
    contentHTML += `<a href="${item.url}" target="_blank">Read more</a>`;
  }

  const isSaved = item.saved === true;

  const saveButton = currentUser
    ? `<button onclick="${isSaved ? 'unsaveNews' : 'saveNews'}(${item.id}, this)">
         ${isSaved ? 'Unsave' : 'Save'}
       </button>`
    : `<p style="opacity:0.6">Login to save news</p>`;

  card.innerHTML = `
    <h3>${item.title}</h3>
    <p>
      <strong>Topic:</strong> ${item.topic} |
      <strong>Department:</strong> ${item.department || 'General'} |
      <strong>Source:</strong> ${item.source} |
      <strong>Country:</strong> ${item.country}
    </p>
    ${contentHTML}
    <p class="relevance">Relevance: ${item.relevance}</p>
    ${saveButton}
  `;

  container.appendChild(card);
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
  btn.setAttribute('onclick', `unsaveNews(${id}, this)`);
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
  btn.setAttribute('onclick', `saveNews(${id}, this)`);
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
  
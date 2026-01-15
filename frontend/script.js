let currentTab = 'all';
let currentUser = null;

// Fetch current logged-in user from backend
async function fetchCurrentUser() {
  try {
    const res = await fetch('http://localhost:5000/auth/current', { credentials: 'include' });
    if (res.ok) {
      currentUser = await res.json();
    } else {
      currentUser = null;
    }
  } catch (err) {
    currentUser = null;
  }
  updateAuthButton();
}

// Update button text based on login state
function updateAuthButton() {
  const btn = document.getElementById('auth-btn');
  if (currentUser) {
    btn.innerText = 'Sign Out';
  } else {
    btn.innerText = 'Sign in with Google';
  }
}

// Handle click
function handleAuthClick() {
  if (currentUser) {
    logout();
  } else {
    loginWithGoogle();
  }
}

// Redirect to Google OAuth
function loginWithGoogle() {
  window.location.href = 'http://localhost:5000/auth/google';
}

// Logout
function logout() {
  window.location.href = 'http://localhost:5000/auth/logout';
}

// --- News tab code (unchanged) ---
function showTab(tab) {
  currentTab = tab;
  document.getElementById('tab-title').innerText = tab === 'all' ? 'News' : 'Saved News';
  document.getElementById('filters').style.display = tab === 'all' ? 'block' : 'none';
  loadNews();
}

async function loadNews() {
  const newsDiv = document.getElementById('news');
  newsDiv.innerHTML = '';
  await fetchCurrentUser();

  let url = currentTab === 'saved' ? 'http://localhost:5000/news?saved=true' : 'http://localhost:5000/news';
  const query = [];

  if (currentTab === 'all') {
    const country = document.getElementById('country').value;
    const topic = document.getElementById('topic').value;
    const keyword = document.getElementById('keyword').value;
    if (country) query.push(`country=${encodeURIComponent(country)}`);
    if (topic) query.push(`topic=${encodeURIComponent(topic)}`);
    if (keyword) query.push(`keyword=${encodeURIComponent(keyword)}`);
  }

  if (query.length) url += '?' + query.join('&');

  const res = await fetch(url, { credentials: 'include' });
  const data = await res.json();
  if (!data.length) return newsDiv.innerHTML = '<p>No news found.</p>';

  data.forEach(item => createCard(newsDiv, item));
}

function createCard(container, item) {
  const card = document.createElement('div');
  card.className = 'news-card';

  let contentHTML = `<p>${item.description}</p>`;
  if (item.content_type === 'video') {
    contentHTML += `<video width="100%" controls><source src="${item.url}" type="video/mp4"></video>`;
  } else contentHTML += `<a href="${item.url}" target="_blank">Read more</a>`;

  const saveButton = item.saved
    ? `<button onclick="unsaveNews(${item.id})">Unsave</button>`
    : `<button onclick="saveNews(${item.id})">Save</button>`;

  card.innerHTML = `
    <h3>${item.title}</h3>
    <p><strong>Topic:</strong> ${item.topic} | <strong>Source:</strong> ${item.source} | <strong>Country:</strong> ${item.country}</p>
    ${contentHTML}
    ${currentUser ? saveButton : '<p>Login to save news</p>'}
  `;
  container.appendChild(card);
}

async function saveNews(id) {
  if (!currentUser) return alert('Login first!');
  await fetch('http://localhost:5000/news/save', { 
    method: 'POST', 
    headers: {'Content-Type':'application/json'}, 
    body: JSON.stringify({ news_id: id }), 
    credentials:'include'
  });
  loadNews();
}

async function unsaveNews(id) {
  if (!currentUser) return alert('Login first!');
  await fetch('http://localhost:5000/news/unsave', { 
    method: 'POST', 
    headers: {'Content-Type':'application/json'}, 
    body: JSON.stringify({ news_id: id }), 
    credentials:'include'
  });
  loadNews();
}

// Initialize
window.onload = async () => { 
  await fetchCurrentUser(); 
  showTab('all'); 
};

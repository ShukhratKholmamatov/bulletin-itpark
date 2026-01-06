let currentTab = 'all';

function showTab(tab) {
  currentTab = tab;
  document.getElementById('tab-title').innerText = tab === 'all' ? 'News' : 'Saved News';
  document.getElementById('filters').style.display = tab === 'all' ? 'block' : 'none';
  loadNews();
}

async function loadNews() {
  const newsDiv = document.getElementById('news');
  newsDiv.innerHTML = '';

  if (currentTab === 'all') {
    const country = document.getElementById('country').value;
    const topic = document.getElementById('topic').value;
    const keyword = document.getElementById('keyword').value;

    let query = [];
    if (country) query.push(`country=${encodeURIComponent(country)}`);
    if (topic) query.push(`topic=${encodeURIComponent(topic)}`);
    if (keyword) query.push(`keyword=${encodeURIComponent(keyword)}`);

    const res = await fetch(`http://localhost:3000/news?${query.join('&')}`);
    const data = await res.json();

    if (data.length === 0) {
      newsDiv.innerHTML = '<p>No news found.</p>';
      return;
    }

    data.forEach(item => createCard(newsDiv, item));

  } else if (currentTab === 'saved') {
    const savedIds = JSON.parse(localStorage.getItem('savedNews') || '[]');
    if (savedIds.length === 0) {
      newsDiv.innerHTML = '<p>No saved news.</p>';
      return;
    }

    const res = await fetch(`http://localhost:3000/news`);
    const allNews = await res.json();
    const savedNews = allNews.filter(n => savedIds.includes(n.id));
    if (savedNews.length === 0) newsDiv.innerHTML = '<p>No saved news.</p>';
    savedNews.forEach(item => createCard(newsDiv, item, false));
  }
}

function createCard(container, item, showSave = true) {
  const card = document.createElement('div');
  card.className = 'news-card';

  let contentHTML = `<p>${item.description}</p>`;
  if (item.content_type === 'video') {
    contentHTML += `<video width="100%" controls>
                      <source src="${item.url}" type="video/mp4">
                      Your browser does not support the video tag.
                    </video>`;
  } else {
    contentHTML += `<a href="${item.url}" target="_blank">Read more</a>`;
  }

  card.innerHTML = `
    <h3>${item.title}</h3>
    <p><strong>Topic:</strong> ${item.topic} | <strong>Source:</strong> ${item.source} | <strong>Country:</strong> ${item.country}</p>
    ${contentHTML}
    ${showSave ? `<br/><button onclick="saveNews(${item.id})">Save</button>` : ''}
  `;
  container.appendChild(card);
}

function saveNews(id) {
  let saved = JSON.parse(localStorage.getItem('savedNews') || '[]');
  if (!saved.includes(id)) saved.push(id);
  localStorage.setItem('savedNews', JSON.stringify(saved));
  alert('Saved!');
}

window.onload = () => showTab('all');

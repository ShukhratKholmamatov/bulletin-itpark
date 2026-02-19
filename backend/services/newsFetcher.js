require('dotenv').config();
const axios = require('axios');
const db = require('../config/db');

const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4/search';

// Map keywords to topics if you want
const mapTopic = title => {
  title = title.toLowerCase();
  if (title.includes('ai') || title.includes('chatgpt')) return 'AI';
  if (title.includes('cloud') || title.includes('aws') || title.includes('azure')) return 'Cloud';
  return 'General';
};

async function fetchAndStoreNews() {
  try {
    const res = await axios.get(BASE_URL, {
      params: { q: 'IT Park', token: GNEWS_API_KEY, lang: 'en', max: 10 }
    });

    const articles = res.data.articles;

    articles.forEach(article => {
      const { title, description, url, source, publishedAt, content } = article;
      const topic = mapTopic(title);
      const country = 'Global'; // or you can detect from source
      const content_type = article.url.endsWith('.mp4') ? 'video' : 'article';

      db.run(
        `INSERT OR IGNORE INTO news (title, description, url, source, country, topic, content_type, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, description || content || '', url, source.name || source, country, topic, content_type, publishedAt]
      );
    });

    console.log(`News updated: ${articles.length} articles`);
  } catch (err) {
    console.error('Error fetching news:', err.response ? err.response.data : err.message);
  }
}

module.exports = fetchAndStoreNews;

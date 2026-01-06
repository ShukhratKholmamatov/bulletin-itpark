require('dotenv').config();
const axios = require('axios');
const db = require('../config/db');
const mapTopic = require('../utils/keywordMapper');

const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4/search';

async function fetchAndStoreNews() {
  try {
    const res = await axios.get(BASE_URL, {
      params: {
        q: 'IT Park OR startup OR technology',
        lang: 'en',
        max: 20,
        apikey: GNEWS_API_KEY
      }
    });

    const articles = res.data.articles;

    articles.forEach(a => {
      const topic = mapTopic(a.title + ' ' + a.description);
      const contentType = a.url.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'article';

      db.run(
        `INSERT OR IGNORE INTO news
        (title, description, url, source, country, topic, content_type, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.title,
          a.description,
          a.url,
          a.source.name,
          a.country || 'Global',
          topic,
          contentType,
          a.publishedAt
        ]
      );
    });

    console.log('News updated:', articles.length, 'articles');
  } catch (err) {
    console.error('Error fetching news:', err.message);
  }
}

module.exports = fetchAndStoreNews;

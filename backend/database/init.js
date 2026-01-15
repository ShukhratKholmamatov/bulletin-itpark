const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'news.db');
const db = new sqlite3.Database(dbPath, err => {
  if (err) return console.error(err.message);
  console.log('SQLite connected at', dbPath);
});

// Create news table
db.run(`
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    url TEXT UNIQUE,
    source TEXT,
    country TEXT,
    topic TEXT,
    content_type TEXT,
    published_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create saved_news table
db.run(`
  CREATE TABLE IF NOT EXISTS saved_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    news_id INTEGER,
    UNIQUE(user_id, news_id)
  )
`);

module.exports = db;

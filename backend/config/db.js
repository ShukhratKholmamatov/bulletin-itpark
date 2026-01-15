const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'news.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('SQLite error:', err);
    else console.log('SQLite connected at', dbPath);
});

// Users table for Google OAuth
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

// Saved news per user
db.run(`CREATE TABLE IF NOT EXISTS saved_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    news_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);

module.exports = db;

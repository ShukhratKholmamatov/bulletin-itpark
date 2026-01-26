const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Make sure this points to the correct location of your DB file
const dbPath = path.resolve(__dirname, 'news.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Enable Foreign Keys
  db.run("PRAGMA foreign_keys = ON");

  // 1. CREATE USERS TABLE (Make sure photo_url is here!)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      photo_url TEXT, 
      department TEXT DEFAULT 'General',
      role TEXT DEFAULT 'viewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. CREATE SAVED NEWS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS saved_news (
      user_id TEXT,
      news_id TEXT,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, news_id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  console.log("✅ Database initialized. Columns: id, name, email, photo_url, department");
});

module.exports = db;
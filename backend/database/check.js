const db = require('../config/db');

db.all('SELECT id, title, topic, source FROM news LIMIT 5', [], (err, rows) => {
  if (err) return console.error(err.message);
  console.table(rows);
});

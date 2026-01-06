require('dotenv').config();
const express = require('express');
const db = require('./config/db');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/news', (req, res) => {
  const { country, topic, keyword } = req.query;
  let sql = 'SELECT * FROM news WHERE 1=1';
  const params = [];

  if (country) {
    sql += ' AND country = ?';
    params.push(country);
  }
  if (topic) {
    sql += ' AND topic = ?';
    params.push(topic);
  }
  if (keyword) {
    sql += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

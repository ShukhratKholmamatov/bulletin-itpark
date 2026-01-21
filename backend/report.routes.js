const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');

router.post('/', (req, res) => {
  const { news, period } = req.body;

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);

  // ===== COVER =====
  doc.fontSize(18).text('Weekly Bulletin of IT News and Articles', { align: 'center' });
  doc.moveDown();
  doc.text(`(${period.from} – ${period.to})`, { align: 'center' });
  doc.moveDown(2);
  doc.text('Department of Strategy and Analysis', { align: 'center' });
  doc.text('Tashkent, January 2026', { align: 'center' });
  doc.addPage();

  // ===== TABLE OF CONTENTS =====
  doc.fontSize(16).text('Table of Contents');
  doc.moveDown();
  news.forEach((n, i) => {
    doc.fontSize(11).text(`${i + 1}. ${n.title}`);
  });
  doc.addPage();

  // ===== ARTICLES =====
  news.forEach((n, i) => {
    doc.fontSize(14).text(`${i + 1}. ${n.title}`);
    doc.fontSize(10).text(`(${n.source})`);
    doc.moveDown();
    doc.fontSize(11).text(n.content || n.description || '', { align: 'justify' });
    doc.moveDown();
    doc.fontSize(10).text(`Read full article at ${n.url}`);
    doc.addPage();
  });

  doc.end();
});

module.exports = router;

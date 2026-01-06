const cron = require('node-cron');
const fetchAndStoreNews = require('../services/newsFetcher');

cron.schedule('0 */3 * * *', () => { // every 3 hours
  console.log('Fetching news...');
  fetchAndStoreNews();
});

// Run once immediately
fetchAndStoreNews();

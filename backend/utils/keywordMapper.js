function mapTopic(text) {
  text = text.toLowerCase();
  if (text.includes('ai') || text.includes('chatgpt')) return 'AI';
  if (text.includes('startup') || text.includes('funding')) return 'Startup';
  if (text.includes('technology') || text.includes('gadget')) return 'Tech';
  return 'General';
}

module.exports = mapTopic;

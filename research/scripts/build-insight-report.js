const fs = require('fs');

// Load data
const commanders = JSON.parse(fs.readFileSync('/tmp/commanders_ranked.json', 'utf8'));
const hasInsights = new Set(fs.readFileSync('/tmp/has_insights.txt', 'utf8').trim().split('\n'));

// Parse transcript counts
const transcriptCounts = {};
fs.readFileSync('/tmp/transcript_counts.txt', 'utf8').trim().split('\n').forEach(line => {
  const parts = line.split('|');
  if (parts.length === 2) {
    transcriptCounts[parts[0]] = parseInt(parts[1]);
  }
});

// Build report
const report = [];
commanders.forEach(cmd => {
  const transcripts = transcriptCounts[cmd.display_name] || 0;
  const insights = hasInsights.has(cmd.id);
  report.push({
    rank: cmd.edhrec_rank,
    name: cmd.display_name,
    decks: cmd.edhrec_deck_count,
    transcripts,
    hasInsights: insights,
    status: insights ? '✓ Done' : (transcripts > 0 ? '⏳ Ready' : '❌ None')
  });
});

// Output markdown table
console.log('# Commander Insight Coverage Report\n');
console.log(`**Generated:** ${new Date().toISOString().split('T')[0]}\n`);

// Summary stats
const done = report.filter(r => r.hasInsights).length;
const ready = report.filter(r => !r.hasInsights && r.transcripts > 0).length;
const none = report.filter(r => r.transcripts === 0).length;

console.log('## Summary\n');
console.log(`| Status | Count | % of Top 500 |`);
console.log(`|--------|-------|--------------|`);
console.log(`| ✓ Has Insights | ${done} | ${(done/5).toFixed(1)}% |`);
console.log(`| ⏳ Transcripts Ready | ${ready} | ${(ready/5).toFixed(1)}% |`);
console.log(`| ❌ No Transcripts | ${none} | ${(none/5).toFixed(1)}% |`);
console.log('');

// Top 100 table
console.log('## Top 100 Most Popular Commanders\n');
console.log('| Rank | Commander | Decks | Transcripts | Status |');
console.log('|------|-----------|-------|-------------|--------|');
report.slice(0, 100).forEach(r => {
  console.log(`| ${r.rank} | ${r.name} | ${r.decks?.toLocaleString() || '-'} | ${r.transcripts} | ${r.status} |`);
});

// Ready to process (have transcripts, no insights) - top 50
console.log('\n## Ready to Process (Have Transcripts, No Insights)\n');
console.log('| Rank | Commander | Decks | Transcripts |');
console.log('|------|-----------|-------|-------------|');
report.filter(r => !r.hasInsights && r.transcripts > 0)
  .slice(0, 50)
  .forEach(r => {
    console.log(`| ${r.rank} | ${r.name} | ${r.decks?.toLocaleString() || '-'} | ${r.transcripts} |`);
  });

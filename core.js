export function shuffle(items, random = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function makeChoices(word, words) {
  const distinct = new Map();
  for (const w of words) if (w.id !== word.id && w.meaning !== word.meaning) distinct.set(w.meaning, w);
  return shuffle([word, ...shuffle([...distinct.values()]).slice(0, 3)]);
}
export function mergeEvents(...groups) {
  return [...new Map(groups.flat().map(e => [e.id, e])).values()].sort((a,b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}
export function summarize(events) {
  const map = new Map(); let correct = 0, total = 0;
  for (const e of mergeEvents(events)) {
    const s = map.get(e.word_id) || {attempts:0, errors:0, correct:0, active:false, mastered:false, last:''};
    if (e.kind === 'master') { s.active = false; s.mastered = true; }
    else if (e.kind === 'unmaster') { s.active = true; s.mastered = false; }
    else { s.attempts++; total++; if (e.correct) { s.correct++; correct++; } else { s.errors++; s.active=true; s.mastered=false; } }
    s.last = e.created_at; map.set(e.word_id, s);
  }
  return {map, correct, total, accuracy: total ? Math.round(correct / total * 100) : 0};
}
export function localDay(iso) {
  const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function isLearningEvent(e, validWords) {
  return !!e && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e.id) && validWords.has(e.word_id) && ['choice','match','master','unmaster'].includes(e.kind) && !Number.isNaN(Date.parse(e.created_at)) && (['choice','match'].includes(e.kind) ? typeof e.correct === 'boolean' : e.correct === null) && (e.answer == null || typeof e.answer === 'string' && e.answer.length <= 2000);
}

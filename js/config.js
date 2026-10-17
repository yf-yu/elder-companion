/* 共用工具：所有資料僅儲存在本裝置 */
window.C = {};
window.readJSON = function(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); }
  catch (_) { return fallback; }
};
window.saveJSON = function(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (_) { window.toast('儲存失敗，請確認瀏覽器儲存空間是否可用'); return false; }
};
window.escapeHTML = function(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};
window.lC = function() {
  const data = readJSON('banlaoyou', {});
  window.C = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
};
window.e = function(id) { return document.getElementById(id); };
window.v = function(id) { return (e(id)?.value || '').trim(); };
window.toast = function(msg) {
  const t = e('toast'); if (!t) return;
  t.textContent = msg; t.setAttribute('role','status'); t.setAttribute('aria-live','polite');
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.transform = 'translateX(-50%) translateY(80px)'; }, 3500);
};

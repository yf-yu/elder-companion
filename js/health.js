/* ============ health.js：健康操、養生知識、影片載入 ============ */
window.tex = function(hdr){
  const s = hdr.nextElementSibling;
  const a = hdr.querySelector('.etg');
  s.classList.toggle('op');
  a.classList.toggle('op');
};

window.swh = function(btn, tid){
  document.querySelectorAll('.htab').forEach(t => t.classList.remove('act'));
  btn.classList.add('act');
  document.querySelectorAll('.hcards').forEach(c => c.style.display = 'none');
  const target = e(tid);
  if(target) target.style.display = 'flex';
};

// 🌟 影片載入邏輯（無 API Key 版，自動嵌入搜尋結果）
window.loadVideo = function(btn, query) {
  const box = btn.nextElementSibling; // 取得 .video-box
  if (!box) return;

  // 如果已經載入過，就切換顯示/隱藏
  if (box.innerHTML !== '') {
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    btn.textContent = box.style.display === 'block' ? '📺 隱藏示範影片' : '📺 看示範影片';
    return;
  }

  if (!navigator.onLine) {
    toast('目前沒有網路，請依上方文字說明做動作');
    return;
  }

  // YouTube 已不支援 iframe 搜尋清單；使用明確的外部搜尋連結。
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  box.replaceChildren();
  const note = document.createElement('p');
  note.textContent = '影片由 YouTube 提供，請選擇適合自己身體狀況的動作；如有疼痛請停止。';
  const link = document.createElement('a');
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = '📺 開啟 YouTube 示範影片搜尋';
  link.style.cssText = 'display:block;padding:16px;font-size:18px;text-decoration:underline';
  box.append(note, link); box.style.display = 'block';
  btn.textContent = '📺 隱藏影片連結';
};

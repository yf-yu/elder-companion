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

  // 顯示載入中
  btn.textContent = '⏳ 影片載入中...';
  box.style.display = 'block';
  box.innerHTML = '<div style="padding:10px;text-align:center;color:var(--muted)">正在搜尋影片...</div>';

  // 使用 YouTube 的 iframe 搜尋 API (不需 Key)
  // 限制：listType=search 會顯示搜尋結果清單，讓使用者自己點選最安全的影片
  const searchUrl = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}`;
  
  // 建立 iframe
  box.innerHTML = `
    <iframe src="${searchUrl}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
    <div style="font-size:12px;color:var(--muted);text-align:center;margin-top:8px;line-height:1.5;">
      若上方影片無法播放，請點擊 
      <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" style="color:var(--n);font-weight:bold;text-decoration:underline;">前往 YouTube 觀看</a>
    </div>
  `;
  btn.textContent = '📺 隱藏示範影片';
};

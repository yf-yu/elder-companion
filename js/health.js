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

// 🌟 新增：載入影片邏輯（無 API Key 版）
window.loadVideo = function(btn, query) {
  const box = btn.nextElementSibling; // 取得 .video-box
  if (!box) return;

  // 如果已經載入過，就切換顯示/隱藏
  if (box.innerHTML !== '') {
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    return;
  }

  if (!navigator.onLine) {
    toast('目前沒有網路，請依上方文字說明做動作');
    return;
  }

  // 顯示載入中
  btn.textContent = '⏳ 影片載入中...';
  box.style.display = 'block';
  box.innerHTML = '<div style="padding:10px;text-align:center;color:var(--muted)">正在搜尋適合的影片...</div>';
  const searchUrl = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}`;
  
  // 建立 iframe
  box.innerHTML = `
    <iframe src="${searchUrl}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
    <div style="font-size:12px;color:var(--muted);text-align:center;margin-top:8px">
      若影片無法播放，請點擊<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" style="color:var(--n)">這裡前往 YouTube 搜尋</a>
    </div>
  `;
  btn.textContent = '📺 隱藏示範影片';
};

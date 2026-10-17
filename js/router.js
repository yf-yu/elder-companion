/* 伴老友：單一畫面路由；支援瀏覽器返回及安全的直接連結。 */
(function () {
  'use strict';
  const pages = () => Array.from(document.querySelectorAll('.page, .sub'));
  const find = id => pages().find(p => p.id === id);
  const positions = new Map();
  const base = location.pathname + location.search;
  let current = null;
  let internalDepth = 0;
  function remember() {
    const page = find(current);
    if (page) positions.set(current, (page.querySelector('.sbdy') || page).scrollTop);
  }
  function activate(id) {
    try {
      if (id === 'sos') bldP('sos-phones', true);
      else if (id === 'phone') bldP('all-phones', false);
      else if (id === 'notice') bldN();
      else if (id === 'meds') initMeds();
      else if (id === 'brain') initMem();
      else if (id === 'dress') initDress();
      else if (id === 'home') initH();
    } catch (error) { console.error('頁面初始化失敗', id, error); }
  }
  function render(id, restore) {
    const target = find(id);
    if (!target) return false;
    remember();
    pages().forEach(page => {
      const active = page === target;
      page.hidden = !active;
      page.classList.toggle('show', active);
      page.setAttribute('aria-hidden', String(!active));
      if ('inert' in page) page.inert = !active;
    });
    current = id;
    document.body.dataset.activePage = id;
    const area = target.querySelector('.sbdy') || target;
    area.scrollTop = restore ? (positions.get(id) || 0) : 0;
    activate(id);
    return true;
  }
  function navigate(id, mode = 'push', restore = false) {
    if (!find(id)) return false;
    if (current === id && mode === 'push') return true;
    if (!render(id, restore)) return false;
    const url = id === 'home' ? base : base + '#' + encodeURIComponent(id);
    if (mode === 'push') {
      internalDepth += 1;
      history.pushState({ elderPage: id, elderDepth: internalDepth }, '', url);
    } else if (mode === 'replace') {
      history.replaceState({ elderPage: id, elderDepth: internalDepth }, '', url);
    }
    return true;
  }
  window.showPage = id => navigate(id, 'replace');
  window.go = id => navigate(id, 'push');
  window.bk = () => {
    if (!current || current === 'home') return;
    if (internalDepth > 0 && history.state?.elderDepth > 0) history.back();
    else navigate('home', 'replace');
  };
  window.goHome = () => {
    try { localStorage.setItem('elder_lastopen', new Date().toLocaleString('zh-TW')); } catch (_) {}
    return navigate('home', 'replace');
  };
  window.addEventListener('popstate', event => {
    const id = event.state?.elderPage || decodeURIComponent(location.hash.slice(1)) || 'home';
    internalDepth = Math.max(0, Number(event.state?.elderDepth) || 0);
    render(find(id) ? id : 'home', true);
  });
  // Must run before the deferred main.js calls showPage/goHome.
  const initial = decodeURIComponent(location.hash.slice(1));
  if (find(initial)) {
    internalDepth = 0;
    history.replaceState({ elderPage: initial, elderDepth: 0 }, '', location.href);
  } else {
    history.replaceState({ elderPage: 'home', elderDepth: 0 }, '', base);
  }
  pages().forEach(page => {
    const active = page.id === 'home';
    page.hidden = !active;
    page.classList.toggle('show', active);
    page.setAttribute('aria-hidden', String(!active));
    if ('inert' in page) page.inert = !active;
  });
  current = 'home';
})();

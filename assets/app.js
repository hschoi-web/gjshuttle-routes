/* 광진구청 동행버스 통합 노선 - 메인 스크립트 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    routeTabs: $('#routeTabs'),
    mapFrame: $('#mapFrame'),
    tplRouteTab: $('#tplRouteTab'),
    brandHome: $('#brandHome')
  };

  const state = {
    data: null,
    selected: null    // { complexId, zoneName, direction, routeId }
  };

  const STORAGE_KEY = 'gjshuttle-routes:last';

  /* ---------- 데이터 로드 ---------- */
  async function loadRoutes() {
    const res = await fetch('data/routes.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.data = await res.json();
  }

  /* ---------- 탭 렌더 ---------- */
  function renderTabs() {
    const frag = document.createDocumentFragment();
    for (const complex of state.data.complexes) {
      for (const zone of complex.zones) {
        const dir = zone.commute.go != null ? 'go'
                  : zone.commute.return != null ? 'return'
                  : null;
        if (!dir) continue;
        const routeId = zone.commute[dir];

        const tab = els.tplRouteTab.content.firstElementChild.cloneNode(true);
        tab.dataset.complexId = complex.id;
        tab.dataset.zoneName = zone.name;
        tab.dataset.direction = dir;
        tab.dataset.routeId = String(routeId);
        $('.tab-name', tab).textContent = zone.name;
        $('.tab-route', tab).textContent = zone.route || '';
        $('.tab-open', tab).href = mapUrl(routeId);
        frag.appendChild(tab);
      }
    }
    els.routeTabs.innerHTML = '';
    els.routeTabs.appendChild(frag);
  }

  /* ---------- 선택 + 지도 갱신 ---------- */
  function selectRoute(complexId, zoneName, direction) {
    const complex = state.data.complexes.find(c => c.id === complexId);
    if (!complex) return;
    const zone = complex.zones.find(z => z.name === zoneName);
    if (!zone) return;
    const routeId = zone.commute[direction];
    if (routeId == null) return;

    state.selected = { complexId, zoneName, direction, routeId, complexName: complex.name };

    // 탭 활성 상태
    $$('.route-tab', els.routeTabs).forEach(t => {
      const isActive = t.dataset.complexId === complexId
                    && t.dataset.zoneName === zoneName
                    && t.dataset.direction === direction;
      t.setAttribute('aria-selected', String(isActive));
    });

    els.mapFrame.src = mapUrl(routeId);
    saveLast();
    syncHash();
  }

  function mapUrl(routeId) {
    return `${state.data.mapBaseUrl || 'https://gjshuttle.rideus.net/gjshuttle/shuttlebus/'}${routeId}/map`;
  }

  /* ---------- URL 해시 동기화 ---------- */
  function syncHash() {
    const sel = state.selected;
    if (!sel) return;
    const hash = `#${sel.complexId}/${encodeURIComponent(sel.zoneName)}/${sel.direction}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function readHash() {
    const m = location.hash.match(/^#([^\/]+)\/([^\/]+)\/(go|return)$/);
    if (!m) return null;
    return { complexId: m[1], zoneName: decodeURIComponent(m[2]), direction: m[3] };
  }

  /* ---------- localStorage ---------- */
  function saveLast() {
    try {
      const sel = state.selected;
      if (!sel) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        complexId: sel.complexId, zoneName: sel.zoneName, direction: sel.direction
      }));
    } catch (e) {}
  }

  function loadLast() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ---------- 첫 화면으로 초기화 ---------- */
  function resetToHome() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    history.replaceState(null, '', location.pathname + location.search);
    const c = state.data.complexes[0];
    const z = c.zones[0];
    const dir = z.commute.go != null ? 'go' : 'return';
    selectRoute(c.id, z.name, dir);
  }

  /* ---------- 이벤트 ---------- */
  function bindEvents() {
    els.routeTabs.addEventListener('click', (e) => {
      // 새 창에서 열기 링크는 브라우저 기본 동작
      if (e.target.closest('.tab-open')) return;
      const tab = e.target.closest('.route-tab');
      if (!tab) return;
      selectRoute(tab.dataset.complexId, tab.dataset.zoneName, tab.dataset.direction);
    });

    els.brandHome.addEventListener('click', (e) => {
      e.preventDefault();
      resetToHome();
    });

    window.addEventListener('hashchange', () => {
      const h = readHash();
      if (h && (
        !state.selected ||
        state.selected.complexId !== h.complexId ||
        state.selected.zoneName !== h.zoneName ||
        state.selected.direction !== h.direction
      )) {
        selectRoute(h.complexId, h.zoneName, h.direction);
      }
    });
  }

  /* ---------- 초기 진입 노선 결정 ---------- */
  function pickInitialSelection() {
    const fromHash = readHash();
    if (fromHash && isValid(fromHash)) return fromHash;
    const fromStorage = loadLast();
    if (fromStorage && isValid(fromStorage)) return fromStorage;
    const c = state.data.complexes[0];
    const z = c.zones[0];
    const dir = z.commute.go != null ? 'go' : 'return';
    return { complexId: c.id, zoneName: z.name, direction: dir };
  }

  function isValid(sel) {
    const c = state.data.complexes.find(x => x.id === sel.complexId);
    if (!c) return false;
    const z = c.zones.find(x => x.name === sel.zoneName);
    if (!z) return false;
    return z.commute[sel.direction] != null;
  }

  /* ---------- 부트 ---------- */
  async function init() {
    try {
      await loadRoutes();
    } catch (err) {
      els.routeTabs.innerHTML = `<div class="loading" style="padding:14px;color:#dc2626">노선 데이터를 불러올 수 없습니다. (${err.message})</div>`;
      return;
    }
    renderTabs();
    bindEvents();
    const initial = pickInitialSelection();
    selectRoute(initial.complexId, initial.zoneName, initial.direction);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

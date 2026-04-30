/* 부산산업단지 통근버스 통합 노선 - 메인 스크립트 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    tree: $('#tree'),
    search: $('#search'),
    breadcrumb: $('#breadcrumb'),
    mapFrame: $('#mapFrame'),
    sidebar: $('#sidebar'),
    tplComplex: $('#tplComplex'),
    tplZone: $('#tplZone'),
    mapOpenLink: $('#mapOpenLink'),
    brandHome: $('#brandHome')
  };

  const state = {
    data: null,
    selected: null         // { complexId, zoneName, direction }
  };

  const STORAGE_KEY = 'busansandan-routes:last';
  const DIR_LABEL = { go: '출근', return: '퇴근' };

  /* ---------- 데이터 로드 ---------- */
  async function loadRoutes() {
    try {
      const res = await fetch('data/routes.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.data = await res.json();
    } catch (err) {
      els.tree.innerHTML = `<div class="loading" style="color:#dc2626">노선 데이터를 불러올 수 없습니다.<br><small>${err.message}</small></div>`;
      throw err;
    }
  }

  /* ---------- 트리 렌더 ---------- */
  function renderTree() {
    const frag = document.createDocumentFragment();
    for (const complex of state.data.complexes) {
      const node = els.tplComplex.content.firstElementChild.cloneNode(true);
      node.dataset.complexId = complex.id;
      $('.node-name', node).textContent = complex.name;
      $('.node-count', node).textContent = `${complex.zones.length}개`;
      const children = $('.children', node);
      for (const zone of complex.zones) {
        const hasGo = zone.commute.go != null;
        const hasReturn = zone.commute.return != null;
        const isSingle = (hasGo && !hasReturn) || (!hasGo && hasReturn);

        if (isSingle) {
          // 단일 노선: zone-row 자체를 클릭 가능한 leaf로 사용
          const dir = hasGo ? 'go' : 'return';
          const leaf = document.createElement('button');
          leaf.type = 'button';
          leaf.className = 'leaf zone-as-leaf';
          leaf.setAttribute('role', 'treeitem');
          leaf.dataset.complexId = complex.id;
          leaf.dataset.zoneName = zone.name;
          leaf.dataset.direction = dir;
          leaf.dataset.routeId = zone.commute[dir];
          leaf.innerHTML = '<span class="leaf-icon">🚌</span> <span class="node-name"></span>';
          $('.node-name', leaf).textContent = zone.name;
          children.appendChild(leaf);
        } else {
          // 양방향: 기존 zone-row + 출/퇴근 leaf
          const zNode = els.tplZone.content.firstElementChild.cloneNode(true);
          zNode.dataset.complexId = complex.id;
          zNode.dataset.zoneName = zone.name;
          $('.node-name', zNode).textContent = zone.name;
          const goBtn = $('.leaf-go', zNode);
          const retBtn = $('.leaf-return', zNode);
          goBtn.dataset.complexId = complex.id;
          goBtn.dataset.zoneName = zone.name;
          goBtn.dataset.routeId = zone.commute.go ?? '';
          retBtn.dataset.complexId = complex.id;
          retBtn.dataset.zoneName = zone.name;
          retBtn.dataset.routeId = zone.commute.return ?? '';
          if (!hasGo) goBtn.disabled = true;
          if (!hasReturn) retBtn.disabled = true;
          children.appendChild(zNode);
        }
      }
      frag.appendChild(node);
    }
    els.tree.innerHTML = '';
    els.tree.appendChild(frag);
  }

  /* ---------- 펼침/접힘 ---------- */
  function toggleNode(node, force) {
    const expanded = node.getAttribute('aria-expanded') === 'true';
    const next = typeof force === 'boolean' ? force : !expanded;
    node.setAttribute('aria-expanded', String(next));
    const children = $(':scope > .children', node);
    if (children) children.hidden = !next;
  }

  function expandToSelection(complexId, zoneName) {
    $$('.node-complex', els.tree).forEach(n => {
      const isMatch = n.dataset.complexId === complexId;
      toggleNode(n, isMatch);
      if (isMatch) {
        $$('.node-zone', n).forEach(z => {
          toggleNode(z, z.dataset.zoneName === zoneName);
        });
      }
    });
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

    // 활성 leaf 표시
    $$('.leaf', els.tree).forEach(b => b.classList.remove('active'));
    const leaf = els.tree.querySelector(
      `.leaf[data-complex-id="${CSS.escape(complexId)}"][data-zone-name="${CSS.escape(zoneName)}"][data-direction="${direction}"]`
    );
    if (leaf) leaf.classList.add('active');

    expandToSelection(complexId, zoneName);
    renderBreadcrumb();
    updateMap(routeId);
    saveLast();
    syncHash();

  }

  function renderBreadcrumb() {
    const sel = state.selected;
    if (!sel) {
      els.breadcrumb.innerHTML = '<span class="bc-ph">좌측에서 노선을 선택하세요</span>';
      return;
    }
    els.breadcrumb.innerHTML = '';
    const items = [
      { label: sel.complexName },
      { label: sel.zoneName },
      { label: DIR_LABEL[sel.direction], final: true }
    ];
    items.forEach((it, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'bc-sep';
        sep.textContent = '›';
        els.breadcrumb.appendChild(sep);
      }
      const span = document.createElement('span');
      span.className = it.final ? 'bc-item bc-final' : 'bc-item';
      span.textContent = it.label;
      els.breadcrumb.appendChild(span);
    });
  }

  function mapUrl(routeId) {
    return `${state.data.mapBaseUrl || 'https://rideus.net/busansandan/shuttlebus/'}${routeId}/map`;
  }

  function updateMap(routeId) {
    const url = mapUrl(routeId);
    if (els.mapOpenLink) {
      els.mapOpenLink.href = url;
      els.mapOpenLink.hidden = false;
    }
    els.mapFrame.src = url;
  }

  /* ---------- 검색 필터 ---------- */
  function applySearch(q) {
    const term = q.trim().toLowerCase();
    if (!term) {
      $$('.node, .leaf', els.tree).forEach(n => n.classList.remove('hidden'));
      return;
    }
    $$('.node-complex', els.tree).forEach(complex => {
      const cText = $('.node-name', complex).textContent.toLowerCase();
      let anyZoneMatch = false;
      $$('.node-zone', complex).forEach(zone => {
        const zText = $('.node-name', zone).textContent.toLowerCase();
        const match = cText.includes(term) || zText.includes(term);
        zone.classList.toggle('hidden', !match);
        if (match) anyZoneMatch = true;
      });
      complex.classList.toggle('hidden', !(cText.includes(term) || anyZoneMatch));
      if (cText.includes(term) || anyZoneMatch) toggleNode(complex, true);
    });
  }

  /* ---------- URL 해시 동기화 ---------- */
  function syncHash() {
    const sel = state.selected;
    if (!sel) return;
    const hash = `#${sel.complexId}/${encodeURIComponent(sel.zoneName)}/${sel.direction}`;
    if (location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
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
    } catch (e) { /* private mode */ }
  }

  function loadLast() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ---------- 이벤트 위임 ---------- */
  function bindEvents() {
    els.tree.addEventListener('click', (e) => {
      const leaf = e.target.closest('.leaf');
      if (leaf && !leaf.disabled) {
        selectRoute(leaf.dataset.complexId, leaf.dataset.zoneName, leaf.dataset.direction);
        return;
      }
      const row = e.target.closest('.node-row');
      if (row) {
        const node = row.parentElement;
        toggleNode(node);
      }
    });

    els.search.addEventListener('input', (e) => applySearch(e.target.value));

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

  /* ---------- 첫 화면으로 초기화 ---------- */
  function resetToHome() {
    // 검색어 초기화
    els.search.value = '';
    applySearch('');
    // localStorage / hash 초기화
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    history.replaceState(null, '', location.pathname + location.search);
    // 첫 산단 > 첫 노선 > 출근(없으면 퇴근) 자동 선택
    const c = state.data.complexes[0];
    const z = c.zones[0];
    const dir = z.commute.go != null ? 'go' : 'return';
    selectRoute(c.id, z.name, dir);
    // 트리 스크롤 맨 위로
    els.tree.scrollTop = 0;
  }

  /* ---------- 초기 진입 노선 결정 ---------- */
  function pickInitialSelection() {
    const fromHash = readHash();
    if (fromHash && isValid(fromHash)) return fromHash;
    const fromStorage = loadLast();
    if (fromStorage && isValid(fromStorage)) return fromStorage;
    // 기본값: 첫 산단 > 첫 지역 > go (없으면 return)
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
    await loadRoutes();
    renderTree();
    bindEvents();
    const initial = pickInitialSelection();
    selectRoute(initial.complexId, initial.zoneName, initial.direction);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

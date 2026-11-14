import { revealElement, updateNavIndicators } from './motion.js?v=assistant-20261113d';

const workspacePages = {
  explore: { title: '鳍更长，也会更重吗？', description: '把总体关系拆开，看见物种与性别的差异。', kicker: 'FIELD STUDY / 01', hash: '#explorer' },
  discover: { title: '总体与局部，为什么不同？', description: '从三个问题开始，让每一次操作都有一个值得追查的方向。', kicker: 'DISCOVERY / 02', hash: '#discovery' },
  compare: { title: '并置两组，读懂差异。', description: '保留观察条件，用相同尺度比较，再回到具体样本。', kicker: 'COMPARISON / 03', hash: '#comparison' },
  notebook: { title: '把发现，留在这里。', description: '保存条件与观察，让下一次探索从已有的发现继续。', kicker: 'FIELD NOTES / 04', hash: '#notebook' },
  assistant: { title: '沿着问题，继续探索。', description: '让模型解读当前图表，先核对统计，再应用建议。', kicker: 'DATA ASSISTANT / 05', hash: '#assistant' },
  method: { title: '数据的边界，解释的起点。', description: '了解观测来源、测量含义与每一项统计的口径。', kicker: 'DATA & METHODOLOGY / 06', hash: '#method' },
};
let workspacePage = 'explore', inspectorView = 'relation', layoutInitialized = false;

function notifyLayout() { window.dispatchEvent(new CustomEvent('penguin:layout', { detail: { page: workspacePage, inspector: inspectorView } })); }

export function setActivePage(page, options = {}) {
  if (!Object.hasOwn(workspacePages, page)) return;
  const changing=workspacePage!==page;
  workspacePage = page;
  for (const id of Object.keys(workspacePages)) {
    const panel = document.getElementById('page-' + id);
    if (panel) panel.hidden = id !== page;
    const tab = document.getElementById('tab-' + id);
    if (tab) { tab.setAttribute('aria-selected', String(id === page)); tab.tabIndex = id === page || (page === 'method' && id === 'explore') ? 0 : -1; }
  }
  const metadata = workspacePages[page];
  document.getElementById('workspace-title').textContent = metadata.title;
  document.getElementById('workspace-description').textContent = metadata.description;
  document.getElementById('workspace-kicker').textContent = metadata.kicker;
  document.body.dataset.page = page;
  document.querySelectorAll('.popover[open], .playback-settings[open]').forEach(node => node.open = false);
  if (options.hash !== false && location.hash !== metadata.hash) { try { history.pushState(null, '', metadata.hash); } catch {} }
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: 'instant' });
  if (options.notify !== false) notifyLayout();
  updateNavIndicators();
  document.querySelector('.primary-nav [aria-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  if(changing){revealElement(document.getElementById('page-'+page),7,360);revealElement(document.getElementById('workspace-title'),4,300);}
}

export function setActiveInspector(id, options = {}) {
  if (!['relation', 'distribution', 'trend', 'data'].includes(id)) return;
  const changing=inspectorView!==id;
  inspectorView = id;
  document.querySelectorAll('[data-inspector]').forEach(tab => {
    const selected = tab.dataset.inspector === id;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
  });
  if (options.notify !== false) notifyLayout();
  updateNavIndicators();
  if(changing)revealElement(document.getElementById('panel-'+id),5,270);
}

function routeWorkspaceHash() {
  const hash = location.hash;
  const page = Object.entries(workspacePages).find(([, value]) => value.hash === hash)?.[0] || 'explore';
  setActivePage(hash === '#correlation-lab' ? 'explore' : page, { hash: false, notify: false });
  if (hash === '#correlation-lab') setActiveInspector('relation', { notify: false });
  notifyLayout();
}

function wireTabKeyboard(selector, change) {
  document.querySelectorAll(selector).forEach(tab => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll(selector)], current = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    change(tabs[next]); tabs[next].focus();
  }));
}

export function initializeLayout() {
  if (layoutInitialized) return;
  layoutInitialized = true;
  document.querySelectorAll('[data-page]').forEach(tab => tab.addEventListener('click', () => setActivePage(tab.dataset.page)));
  document.querySelectorAll('[data-open-page]').forEach(button => button.addEventListener('click', () => {
    setActivePage(button.dataset.openPage);
    if (button.dataset.openPage === 'notebook') document.getElementById('notebook-title').focus({ preventScroll: true });
  }));
  document.querySelectorAll('[data-inspector]').forEach(tab => tab.addEventListener('click', () => setActiveInspector(tab.dataset.inspector)));
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link && (link.hash === '#correlation-lab' || Object.values(workspacePages).some(page => page.hash === link.hash))) {
      event.preventDefault();
      setActivePage(link.hash === '#correlation-lab' ? 'explore' : Object.entries(workspacePages).find(([, page]) => page.hash === link.hash)[0]);
      if (link.hash === '#correlation-lab') setActiveInspector('relation');
    }
    document.querySelectorAll('.popover[open], .playback-settings[open]').forEach(node => { if (!node.contains(event.target)) node.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector('.popover[open], .playback-settings[open]');
    if (open) { open.open = false; open.querySelector('summary').focus(); }
  });
  wireTabKeyboard('.primary-nav [role="tab"]', tab => setActivePage(tab.dataset.page));
  wireTabKeyboard('.inspector-nav [role="tab"]', tab => setActiveInspector(tab.dataset.inspector));
  const mobile = matchMedia('(max-width: 760px)');
  const resizeFilters = () => { document.getElementById('filter-panel').open = !mobile.matches; notifyLayout(); };
  mobile.addEventListener('change', resizeFilters); resizeFilters();
  window.addEventListener('hashchange', routeWorkspaceHash);
  window.addEventListener('popstate', routeWorkspaceHash);
  setActiveInspector('relation', { notify: false }); routeWorkspaceHash();
}

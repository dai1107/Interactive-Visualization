const motionEase = 'cubic-bezier(.22, 1, .36, 1)';
const activeMetricAnimations = new WeakMap();

export function motionAllowed() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'off') return false;
  return typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function revealElement(node, distance = 7, duration = 340) {
  if (!node?.animate || !motionAllowed() || node.closest('[hidden]')) return;
  node.getAnimations().forEach(animation => animation.cancel());
  return node.animate([{ opacity: .55, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'translateY(0)' }], { duration, easing: motionEase });
}

export function setMetricText(node, text) {
  const next = String(text);
  if (node.textContent === next) return;
  activeMetricAnimations.get(node)?.cancel();
  node.textContent = next;
  if (node.animate && motionAllowed() && !node.closest('[hidden]')) {
    activeMetricAnimations.set(node, node.animate([{ opacity: .4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 250, easing: motionEase }));
  }
}

export function updateNavIndicators() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.primary-nav, .inspector-nav').forEach(nav => {
    const tab = nav.querySelector('[aria-selected="true"]');
    nav.style.setProperty('--indicator-opacity', tab ? '1' : '0');
    if (!tab) return;
    nav.style.setProperty('--indicator-x', tab.offsetLeft + 'px');
    nav.style.setProperty('--indicator-width', tab.offsetWidth + 'px');
  });
}

export function initializeMotion() {
  const button = document.getElementById('motion-toggle');
  const system = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = true;
  try { enabled = localStorage.getItem('penguin-ui-motion') !== 'off'; } catch {}
  function sync() {
    const allowed = enabled && !system.matches;
    document.documentElement.dataset.motion = allowed ? 'on' : 'off';
    button.setAttribute('aria-pressed', String(allowed));
    button.disabled = system.matches;
    button.title = system.matches ? '系统已启用减少动态' : allowed ? '关闭界面动效' : '开启界面动效';
    document.getAnimations().forEach(animation => animation.cancel());
    window.dispatchEvent(new CustomEvent('penguin:motion'));
    updateNavIndicators();
  }
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('penguin-ui-motion', enabled ? 'on' : 'off'); } catch {}
    sync();
  });
  system.addEventListener('change', sync);
  window.addEventListener('resize', updateNavIndicators);
  document.querySelector('.inspector-nav')?.addEventListener('scroll', updateNavIndicators, { passive: true });
  sync();
  requestAnimationFrame(() => document.documentElement.dataset.motionReady = 'true');
}

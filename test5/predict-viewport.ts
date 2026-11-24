// A zero-height fixed probe reports the browser's actual fixed-position origin.
// Unlike innerHeight alone, this avoids compensating twice on browsers that
// already move fixed content above the keyboard.
export function attachPredictViewport(dock: HTMLElement): () => void {
  const shell = dock.closest<HTMLElement>('.shell');
  if (!shell) return () => {};
  const vv = window.visualViewport;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden','true');
  probe.style.cssText = 'position:fixed;bottom:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  let frame = 0;
  let last = '';
  const update = () => {
    frame = 0;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const offset = Math.round(probe.getBoundingClientRect().bottom - bottom);
    const clearance = Math.max(0,Math.ceil(document.documentElement.clientHeight - bottom));
    // Pin only in the normal zoom range. At pinch zoom, allow native panning.
    const normal = !vv || Math.abs(vv.scale - 1) < .05;
    const key = [normal ? offset : 0,normal ? clearance : 0,normal && clearance > 80].join(':');
    if (key === last) return;
    last = key;
    shell.style.setProperty('--predict-viewport-offset', (normal ? offset : 0)+'px');
    shell.style.setProperty('--predict-viewport-clearance', (normal ? clearance : 0)+'px');
    shell.dataset.predictOccluded = String(normal && clearance > 80);
  };
  const schedule = () => {if (!frame) frame = requestAnimationFrame(update);};
  update();
  vv?.addEventListener('resize',schedule);
  vv?.addEventListener('scroll',schedule);
  window.addEventListener('resize',schedule);
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule);
  window.addEventListener('pageshow',schedule);
  document.addEventListener('focusin',schedule);
  document.addEventListener('focusout',schedule);
  return () => {
    cancelAnimationFrame(frame);
    vv?.removeEventListener('resize',schedule);
    vv?.removeEventListener('scroll',schedule);
    window.removeEventListener('resize',schedule);
    window.removeEventListener('scroll',schedule);
    window.removeEventListener('orientationchange',schedule);
    window.removeEventListener('pageshow',schedule);
    document.removeEventListener('focusin',schedule);
    document.removeEventListener('focusout',schedule);
    probe.remove();
    shell.style.removeProperty('--predict-viewport-offset');
    shell.style.removeProperty('--predict-viewport-clearance');
    delete shell.dataset.predictOccluded;
  };
}

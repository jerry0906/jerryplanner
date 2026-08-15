/**
 * 누르자마자 바로 드래그가 시작되지 않고, 잠깐 눌러야("살짝 지그시") 드래그가
 * 활성화되도록 하는 헬퍼. 이동 중이나 짧은 탭은 드래그로 오인하지 않는다.
 *
 * 사용:
 *   onPointerDown={(e) => holdThenDrag(e, () => beginDrag(...))}
 */
export function holdThenDrag(e, onStart, { delay = 170, moveThreshold = 8 } = {}) {
  const startX = e.clientX;
  const startY = e.clientY;
  let fired = false;

  const timer = setTimeout(() => {
    fired = true;
    cleanup();
    onStart(e);
  }, delay);

  const cancel = (ev) => {
    if (fired) return;
    if (ev.type === "pointermove") {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.hypot(dx, dy) < moveThreshold) return; // 아직 눌러만 있는 상태로 간주
    }
    clearTimeout(timer);
    cleanup();
  };

  function cleanup() {
    window.removeEventListener("pointerup", cancel);
    window.removeEventListener("pointermove", cancel);
  }

  window.addEventListener("pointerup", cancel);
  window.addEventListener("pointermove", cancel);
}

/**
 * 드래그 중 포인터가 화면 위/아래 가장자리에 가까워지면
 * 자동으로 스크롤되게 하는 헬퍼. pointermove가 뜸해도(손가락을 가만히 대고
 * 있어도) requestAnimationFrame으로 계속 스크롤되도록 만든다.
 *
 * 사용:
 *   const scroller = useRef(createEdgeAutoScroll()).current;
 *   ...pointermove... scroller.update(e.clientY);
 *   ...pointerup...   scroller.stop();
 */
export function createEdgeAutoScroll({ edge = 70, maxSpeed = 14 } = {}) {
  let active = false;
  let y = 0;
  let raf = null;

  function tick() {
    if (!active) { raf = null; return; }
    const vh = window.innerHeight;
    if (y < edge) {
      window.scrollBy(0, -maxSpeed * ((edge - y) / edge));
    } else if (y > vh - edge) {
      window.scrollBy(0, maxSpeed * ((y - (vh - edge)) / edge));
    }
    raf = requestAnimationFrame(tick);
  }

  return {
    update(clientY) {
      y = clientY;
      if (!active) {
        active = true;
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    },
  };
}

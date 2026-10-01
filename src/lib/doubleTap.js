/**
 * 한 번 탭과 두 번 탭(더블 클릭)을 구분하는 헬퍼.
 * 터치 기기에서는 dblclick 이벤트가 믿을 만하지 않아서 click 간격으로 직접 판정한다.
 *  - 같은 key를 delay 안에 두 번 누르면 onDouble
 *  - 아니면 delay 뒤에 onSingle (onSingle이 없으면 기다리지 않는다)
 *
 * 사용:
 *   onClick={() => tap(task.id, { onSingle: ..., onDouble: ... })}
 */
let last = { key: null, time: 0, timer: null, single: null };

export function tap(key, { onSingle, onDouble, delay = 280 } = {}) {
  const now = Date.now();

  if (last.key === key && now - last.time < delay) {
    clearTimeout(last.timer);
    last = { key: null, time: 0, timer: null, single: null };
    onDouble?.();
    return;
  }

  // 다른 아이템을 누르면, 대기 중이던 한 번 탭은 바로 실행한다
  if (last.timer) {
    clearTimeout(last.timer);
    last.single?.();
  }

  last = {
    key, time: now, single: onSingle ?? null,
    timer: onSingle ? setTimeout(() => { last.timer = null; last.single = null; onSingle(); }, delay) : null,
  };
}

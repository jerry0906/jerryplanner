import { useEffect, useRef, useState } from "react";

/**
 * 세로 드래그로 리스트 우선순위를 바꾸는 로직.
 * TasksScreen에서 일반 할 일 / 루틴 두 그룹에 각각 독립적으로 사용한다.
 *
 * @param {Array<{id: string|number}>} items - sort_order로 이미 정렬된 배열
 * @param {(orderedIds: (string|number)[]) => void} reorderTasks - 드롭 시 호출, 넘겨받은 id들만 재정렬한다
 */
export function useDragOrder(items, reorderTasks) {
  const [order, setOrder] = useState(null); // 드래그 중 임시 순서
  const [dragId, setDragId] = useState(null);
  const rowRefs = useRef({});

  const list = order ?? items;

  useEffect(() => {
    if (!dragId) return;
    const move = (e) => {
      const ids = (order ?? items).map((t) => t.id);
      const from = ids.indexOf(dragId);
      let to = from;
      for (let i = 0; i < ids.length; i++) {
        const el = rowRefs.current[ids[i]];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (e.clientY > r.top && e.clientY < r.bottom) { to = i; break; }
      }
      if (to !== from) {
        const next = [...(order ?? items)];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setOrder(next);
      }
    };
    const up = () => {
      if (order) reorderTasks(order.map((t) => t.id));
      setDragId(null);
      setOrder(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragId, order, items, reorderTasks]);

  return { list, dragId, setDragId, rowRefs };
}

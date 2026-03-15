import { useRef, useState, useCallback, useEffect, type CSSProperties } from "react";

type Placement = "bottom-right" | "top-center";

export type DragHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
};

/**
 * Hook to make an element draggable via mouse/touch hold-and-drag.
 * Returns a ref to attach to the element and a style object for positioning.
 */
export function useDraggable(options?: { placement?: Placement }) {
  const placement = options?.placement ?? "bottom-right";
  const ref = useRef<HTMLDivElement>(null);
  // pos.x === -1 means "not yet dragged, use CSS placement"
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const initialized = useRef(false);

  const clamp = useCallback((x: number, y: number) => {
    const el = ref.current;
    if (!el) return { x, y };
    return {
      x: Math.max(0, Math.min(window.innerWidth - el.offsetWidth, x)),
      y: Math.max(0, Math.min(window.innerHeight - el.offsetHeight, y)),
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')) return;
    dragging.current = true;
    el.setPointerCapture(e.pointerId);
    // Always read actual rendered position so CSS-centered widget drags smoothly
    const rect = el.getBoundingClientRect();
    setPos({ x: rect.left, y: rect.top });
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      setPos(clamp(e.clientX - offset.current.x, e.clientY - offset.current.y));
    },
    [clamp],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);
  useEffect(() => {
    if (placement === "bottom-right" && !initialized.current && ref.current) {
      initialized.current = true;
      const el = ref.current;
      setPos(clamp(window.innerWidth - el.offsetWidth - 16, window.innerHeight - el.offsetHeight - 16));
    }
  }, [placement, clamp]);
  const style: CSSProperties =
    placement === "top-center" && pos.x === -1
      ? { position: "fixed", left: "50%", top: "16px", transform: "translateX(-50%)", touchAction: "none", userSelect: "none" }
      : { position: "fixed", left: pos.x === -1 ? undefined : pos.x, top: pos.y === -1 ? undefined : pos.y, touchAction: "none", userSelect: "none" };

  return {
    ref,
    style,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}

import type { DecorCategory } from "./board-decor";

/** Matches cork CSS breakpoint (`min-width: 768px` = desktop). */
export const WALL_LAYOUT_BREAKPOINT = 768;

export type WallLayout = "desktop" | "mobile";

export type WallObjectKind = DecorCategory;

export type WallObjectTransform = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
};

/** Cork free-placed decoration (shared shape for client + server). */
export type WallObject = {
  id: string;
  catalogId: string;
  kind: WallObjectKind;
  /** Desktop cork layout (% of surface). */
  x: number;
  y: number;
  rotate: number;
  scale: number;
  /** Mobile cork layout (% of surface). */
  mobileX: number;
  mobileY: number;
  mobileRotate: number;
  mobileScale: number;
  z: number;
  label: string;
  createdAt: string;
  updatedAt: string;
};

export function wallLayoutFromWidth(width: number): WallLayout {
  return width < WALL_LAYOUT_BREAKPOINT ? "mobile" : "desktop";
}

export function wallObjectTransform(
  obj: WallObject,
  layout: WallLayout,
): WallObjectTransform {
  if (layout === "mobile") {
    return {
      x: obj.mobileX,
      y: obj.mobileY,
      rotate: obj.mobileRotate,
      scale: obj.mobileScale,
    };
  }
  return {
    x: obj.x,
    y: obj.y,
    rotate: obj.rotate,
    scale: obj.scale,
  };
}

export function withWallObjectTransform(
  obj: WallObject,
  layout: WallLayout,
  patch: Partial<WallObjectTransform>,
): WallObject {
  if (layout === "mobile") {
    return {
      ...obj,
      mobileX: patch.x !== undefined ? patch.x : obj.mobileX,
      mobileY: patch.y !== undefined ? patch.y : obj.mobileY,
      mobileRotate:
        patch.rotate !== undefined ? patch.rotate : obj.mobileRotate,
      mobileScale: patch.scale !== undefined ? patch.scale : obj.mobileScale,
    };
  }
  return {
    ...obj,
    x: patch.x !== undefined ? patch.x : obj.x,
    y: patch.y !== undefined ? patch.y : obj.y,
    rotate: patch.rotate !== undefined ? patch.rotate : obj.rotate,
    scale: patch.scale !== undefined ? patch.scale : obj.scale,
  };
}

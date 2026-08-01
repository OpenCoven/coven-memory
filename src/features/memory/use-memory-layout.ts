"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MEMORY_LAYOUT_STORAGE_KEY = "coven-memory:layout:v1";
export const MEMORY_LAYOUT_RAIL_WIDTH = 44;
export const MEMORY_LAYOUT_WIDTH_STEP = 8;

export type MemoryLayoutSection = "library" | "inspector";

export type MemoryLayoutRail = {
  collapsed: boolean;
  width: number;
};

export type MemoryLayout = {
  version: 1;
  library: MemoryLayoutRail;
  inspector: MemoryLayoutRail;
};

export const MEMORY_LAYOUT_WIDTH_LIMITS = {
  library: { min: 144, max: 360 },
  inspector: { min: 224, max: 384 }
} as const;

export const DEFAULT_MEMORY_LAYOUT: MemoryLayout = {
  version: 1,
  library: { collapsed: false, width: 216 },
  inspector: { collapsed: false, width: 288 }
};

export const MEMORY_LAYOUT_DEFAULTS = DEFAULT_MEMORY_LAYOUT;

type MemoryLayoutOptions = {
  storage?: Storage | null;
};

type MemoryLayoutApi = {
  layout: MemoryLayout;
  defaults: MemoryLayout;
  storageKey: string;
  railWidth: number;
  widthLimits: typeof MEMORY_LAYOUT_WIDTH_LIMITS;
  toggle: (section: MemoryLayoutSection) => void;
  setWidth: (section: MemoryLayoutSection, width: number) => void;
  commitWidth: (section: MemoryLayoutSection, width?: number) => void;
  hydrated: boolean;
};

function cloneLayout(layout: MemoryLayout): MemoryLayout {
  return {
    version: 1,
    library: { ...layout.library },
    inspector: { ...layout.inspector }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampWidth(section: MemoryLayoutSection, width: number): number {
  const limits = MEMORY_LAYOUT_WIDTH_LIMITS[section];
  if (!Number.isFinite(width)) {
    return DEFAULT_MEMORY_LAYOUT[section].width;
  }
  const clamped = Math.min(limits.max, Math.max(limits.min, width));
  return Math.min(
    limits.max,
    limits.min +
      Math.round((clamped - limits.min) / MEMORY_LAYOUT_WIDTH_STEP) *
        MEMORY_LAYOUT_WIDTH_STEP
  );
}

function parseRail(
  value: unknown,
  section: MemoryLayoutSection
): MemoryLayoutRail {
  const fallback = DEFAULT_MEMORY_LAYOUT[section];
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    collapsed:
      typeof value.collapsed === "boolean"
        ? value.collapsed
        : fallback.collapsed,
    width:
      typeof value.width === "number"
        ? clampWidth(section, value.width)
        : fallback.width
  };
}

function parseLayout(value: unknown): MemoryLayout {
  if (!isRecord(value) || value.version !== 1) {
    return cloneLayout(DEFAULT_MEMORY_LAYOUT);
  }

  return {
    version: 1,
    library: parseRail(value.library, "library"),
    inspector: parseRail(value.inspector, "inspector")
  };
}

function readLayout(storage: Storage | null): MemoryLayout {
  if (!storage) {
    return cloneLayout(DEFAULT_MEMORY_LAYOUT);
  }

  try {
    const raw = storage.getItem(MEMORY_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return cloneLayout(DEFAULT_MEMORY_LAYOUT);
    }
    return parseLayout(JSON.parse(raw) as unknown);
  } catch {
    return cloneLayout(DEFAULT_MEMORY_LAYOUT);
  }
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function persistLayout(storage: Storage | null, layout: MemoryLayout): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(MEMORY_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage can become unavailable after hydration (for example, in a
    // private browsing context). Layout interaction remains local-only.
  }
}

export function useMemoryLayout(options: MemoryLayoutOptions = {}): MemoryLayoutApi {
  const storageRef = useRef<Storage | null | undefined>(options.storage);
  const [layout, setLayout] = useState<MemoryLayout>(() =>
    cloneLayout(DEFAULT_MEMORY_LAYOUT)
  );
  const layoutRef = useRef(layout);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (storageRef.current === undefined) {
      storageRef.current = getBrowserStorage();
    }

    const persisted = readLayout(storageRef.current);
    layoutRef.current = persisted;
    setLayout(persisted);
    setHydrated(true);
  }, []);

  const toggle = useCallback((section: MemoryLayoutSection) => {
    const next = cloneLayout(layoutRef.current);
    next[section].collapsed = !next[section].collapsed;
    layoutRef.current = next;
    setLayout(next);
    persistLayout(storageRef.current ?? getBrowserStorage(), next);
  }, []);

  const setWidth = useCallback(
    (section: MemoryLayoutSection, width: number) => {
      const next = cloneLayout(layoutRef.current);
      next[section].width = clampWidth(section, width);
      layoutRef.current = next;
      setLayout(next);
    },
    []
  );

  const commitWidth = useCallback(
    (section: MemoryLayoutSection, width?: number) => {
      const next = cloneLayout(layoutRef.current);
      if (width !== undefined) {
        next[section].width = clampWidth(section, width);
        layoutRef.current = next;
        setLayout(next);
      }
      persistLayout(storageRef.current ?? getBrowserStorage(), next);
    },
    []
  );

  return {
    layout,
    defaults: DEFAULT_MEMORY_LAYOUT,
    storageKey: MEMORY_LAYOUT_STORAGE_KEY,
    railWidth: MEMORY_LAYOUT_RAIL_WIDTH,
    widthLimits: MEMORY_LAYOUT_WIDTH_LIMITS,
    toggle,
    setWidth,
    commitWidth,
    hydrated
  };
}

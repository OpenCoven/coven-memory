import { act, renderHook, waitFor } from "@testing-library/react";
import {
  DEFAULT_MEMORY_LAYOUT,
  MEMORY_LAYOUT_STORAGE_KEY,
  MEMORY_LAYOUT_RAIL_WIDTH,
  useMemoryLayout
} from "./use-memory-layout";

describe("useMemoryLayout", () => {
  const storage = new Map<string, string>();
  const storageAdapter: Storage = {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key) => storage.get(key) ?? null,
    key: (index) => [...storage.keys()][index] ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, value)
  };

  beforeEach(() => {
    storage.clear();
  });

  it("exposes the versioned storage contract and safe defaults", async () => {
    const { result } = renderHook(() => useMemoryLayout({ storage: storageAdapter }));

    expect(MEMORY_LAYOUT_STORAGE_KEY).toBe("coven-memory:layout:v1");
    expect(MEMORY_LAYOUT_RAIL_WIDTH).toBe(44);
    expect(DEFAULT_MEMORY_LAYOUT).toEqual({
      version: 1,
      library: { collapsed: false, width: 216 },
      inspector: { collapsed: false, width: 288 }
    });
    expect(result.current.layout).toEqual(DEFAULT_MEMORY_LAYOUT);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
  });

  it("loads persisted preferences while clamping widths to each rail's limits", async () => {
    storageAdapter.setItem(
      MEMORY_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        library: { collapsed: true, width: 100 },
        inspector: { collapsed: false, width: 500 }
      })
    );

    const { result } = renderHook(() => useMemoryLayout({ storage: storageAdapter }));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.layout).toEqual({
      version: 1,
      library: { collapsed: true, width: 144 },
      inspector: { collapsed: false, width: 384 }
    });
  });

  it("falls back to defaults for malformed persisted preferences", async () => {
    storageAdapter.setItem(MEMORY_LAYOUT_STORAGE_KEY, "not-json");

    const { result } = renderHook(() => useMemoryLayout({ storage: storageAdapter }));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.layout).toEqual(DEFAULT_MEMORY_LAYOUT);
  });

  it("persists explicit collapse toggles", async () => {
    const { result } = renderHook(() => useMemoryLayout({ storage: storageAdapter }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.toggle("library"));

    expect(result.current.layout.library.collapsed).toBe(true);
    expect(JSON.parse(storageAdapter.getItem(MEMORY_LAYOUT_STORAGE_KEY)!)).toEqual(
      result.current.layout
    );
  });

  it("keeps transient resizes out of storage until committed", async () => {
    const { result } = renderHook(() => useMemoryLayout({ storage: storageAdapter }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    const beforeResize = storageAdapter.getItem(MEMORY_LAYOUT_STORAGE_KEY);
    act(() => result.current.setWidth("inspector", 352));

    expect(result.current.layout.inspector.width).toBe(352);
    expect(storageAdapter.getItem(MEMORY_LAYOUT_STORAGE_KEY)).toBe(
      beforeResize
    );

    act(() => result.current.commitWidth("inspector"));

    expect(JSON.parse(storageAdapter.getItem(MEMORY_LAYOUT_STORAGE_KEY)!)).toEqual(
      result.current.layout
    );
  });

  it("does not throw when storage is unavailable", async () => {
    const getItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });
    const setItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });
    const unavailableStorage = { ...storageAdapter, getItem, setItem } as Storage;

    const { result } = renderHook(() => useMemoryLayout({ storage: unavailableStorage }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(() => {
      act(() => result.current.toggle("inspector"));
    }).not.toThrow();
    expect(result.current.layout).toEqual({
      ...DEFAULT_MEMORY_LAYOUT,
      inspector: { collapsed: true, width: 288 }
    });
    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalled();
  });
});

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  MemoryDetail,
  MemoryOverview,
  MemorySummary
} from "@/lib/memory-types";
import {
  DEFAULT_MEMORY_FILTERS,
  filterMemories,
  type MemoryFilters
} from "./filter-memories";

type IdleState = { status: "idle"; data: null; error: null };
type LoadingState = { status: "loading"; data: null; error: null };
type ReadyState<T> = { status: "ready"; data: T; error: null };
type ErrorState = { status: "error"; data: null; error: string };

export type LoadState<T> =
  | IdleState
  | LoadingState
  | ReadyState<T>
  | ErrorState;

type DashboardOptions = {
  onUnauthorized: () => void;
  now?: number;
};

class DashboardRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function safeResponseCode(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "code" in value &&
    typeof value.code === "string" &&
    /^[a-z0-9_]{1,64}$/.test(value.code)
  ) {
    return value.code;
  }
  return "invalid_response";
}

async function requestData<T>(
  path: string,
  signal: AbortSignal,
  onUnauthorized: () => void,
  accepts: (value: unknown) => value is T
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    signal
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DashboardRequestError("invalid_response");
  }

  if (response.status === 401) {
    onUnauthorized();
    throw new DashboardRequestError("session_required");
  }
  if (!response.ok) {
    throw new DashboardRequestError(safeResponseCode(body));
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("ok" in body) ||
    body.ok !== true ||
    !("data" in body) ||
    !accepts(body.data)
  ) {
    throw new DashboardRequestError("invalid_response");
  }
  return body.data;
}

function errorCode(error: unknown): string {
  return error instanceof DashboardRequestError
    ? error.code
    : "memory_unavailable";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isVerificationState(
  value: unknown
): value is MemorySummary["verification"]["state"] {
  return (
    value === "verified" ||
    value === "needs-review" ||
    value === "degraded" ||
    value === "unknown" ||
    value === "unavailable"
  );
}

function isMemorySummary(value: unknown): value is MemorySummary {
  if (!isRecord(value)) {
    return false;
  }
  const source = value.source;
  const privacy = value.privacy;
  const verification = value.verification;
  return (
    typeof value.id === "string" &&
    typeof value.familiarId === "string" &&
    typeof value.title === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.relativeUpdatedAt === "string" &&
    typeof value.excerpt === "string" &&
    isRecord(source) &&
    typeof source.kind === "string" &&
    typeof source.label === "string" &&
    isRecord(privacy) &&
    isNullableString(privacy.classification) &&
    (privacy.revealRequired === null ||
      typeof privacy.revealRequired === "boolean") &&
    isRecord(verification) &&
    isVerificationState(verification.state)
  );
}

function isMemoryList(value: unknown): value is MemorySummary[] {
  return Array.isArray(value) && value.every(isMemorySummary);
}

function isMemoryOverview(value: unknown): value is MemoryOverview {
  if (!isRecord(value)) {
    return false;
  }
  const totals = value.totals;
  const capabilities = value.capabilities;
  const verification = value.verification;
  return (
    typeof value.generatedAt === "string" &&
    isNullableString(value.lastUpdatedAt) &&
    isRecord(totals) &&
    typeof totals.entries === "number" &&
    typeof totals.familiars === "number" &&
    typeof totals.verified === "number" &&
    typeof totals.needsReview === "number" &&
    typeof totals.unknown === "number" &&
    isRecord(capabilities) &&
    typeof capabilities.detail === "boolean" &&
    typeof capabilities.verification === "boolean" &&
    typeof capabilities.attestationMetadata === "boolean" &&
    typeof capabilities.supersessionHistory === "boolean" &&
    typeof capabilities.mutations === "boolean" &&
    isRecord(verification) &&
    isVerificationState(verification.state) &&
    typeof verification.checkedAt === "string" &&
    isNullableString(verification.manifest) &&
    isNullableString(verification.index) &&
    Array.isArray(verification.issues) &&
    verification.issues.every((issue) => typeof issue === "string")
  );
}

function isMemoryDetail(value: unknown): value is MemoryDetail {
  if (!isRecord(value)) {
    return false;
  }
  const source = value.source;
  const privacy = value.privacy;
  const verification = value.verification;
  const attestationMetadata = value.attestationMetadata;
  const supersession = value.supersession;
  return (
    typeof value.id === "string" &&
    typeof value.familiarId === "string" &&
    typeof value.title === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.content === "string" &&
    value.contentFormat === "markdown" &&
    isRecord(source) &&
    typeof source.kind === "string" &&
    typeof source.label === "string" &&
    isRecord(privacy) &&
    isNullableString(privacy.classification) &&
    (privacy.revealRequired === null ||
      typeof privacy.revealRequired === "boolean") &&
    typeof privacy.reason === "string" &&
    isRecord(verification) &&
    isVerificationState(verification.state) &&
    typeof verification.reason === "string" &&
    (attestationMetadata === null ||
      (isRecord(attestationMetadata) &&
        Object.keys(attestationMetadata).length === 1 &&
        Number.isInteger(attestationMetadata.fieldCount) &&
        Number(attestationMetadata.fieldCount) >= 0)) &&
    isRecord(supersession) &&
    isNullableString(supersession.supersedes) &&
    isNullableString(supersession.supersededBy)
  );
}

const loading = (): LoadingState => ({
  status: "loading",
  data: null,
  error: null
});
const idle = (): IdleState => ({ status: "idle", data: null, error: null });

export function useMemoryDashboard({
  onUnauthorized,
  now
}: DashboardOptions) {
  const unauthorizedRef = useRef(onUnauthorized);
  const selectedIdRef = useRef<string | null>(null);

  const [overview, setOverview] = useState<LoadState<MemoryOverview>>(loading);
  const [list, setList] = useState<LoadState<MemorySummary[]>>(loading);
  const [detail, setDetail] = useState<LoadState<MemoryDetail>>(idle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<MemoryFilters>(
    DEFAULT_MEMORY_FILTERS
  );
  const [reloadVersion, setReloadVersion] = useState(0);
  const [detailVersion, setDetailVersion] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(true);

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const loadOverview = requestData<MemoryOverview>(
      "/api/memory/overview",
      controller.signal,
      () => unauthorizedRef.current(),
      isMemoryOverview
    )
      .then((data) => {
        if (active) {
          setOverview({ status: "ready", data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setOverview({
            status: "error",
            data: null,
            error: errorCode(error)
          });
        }
      });

    const loadList = requestData<MemorySummary[]>(
      "/api/memory",
      controller.signal,
      () => unauthorizedRef.current(),
      isMemoryList
    )
      .then((data) => {
        if (!active) {
          return;
        }
        setList({ status: "ready", data, error: null });
        const current = selectedIdRef.current;
        const next =
          current && data.some((entry) => entry.id === current)
            ? current
            : (data[0]?.id ?? null);
        selectedIdRef.current = next;
        setSelectedId(next);
        setDetail(next ? loading() : idle());
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setList({ status: "error", data: null, error: errorCode(error) });
          selectedIdRef.current = null;
          setSelectedId(null);
          setDetail(idle());
        }
      });

    void Promise.allSettled([loadOverview, loadList]).then(() => {
      if (active) {
        setIsRefreshing(false);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadVersion]);

  const filteredEntries = useMemo(
    () =>
      list.status === "ready"
        ? filterMemories(list.data, filters, now)
        : [],
    [filters, list, now]
  );

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    void requestData<MemoryDetail>(
      `/api/memory/${encodeURIComponent(selectedId)}`,
      controller.signal,
      () => unauthorizedRef.current(),
      isMemoryDetail
    )
      .then((data) => {
        if (active) {
          setDetail({ status: "ready", data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setDetail({ status: "error", data: null, error: errorCode(error) });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [detailVersion, selectedId]);

  const selectMemory = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    setDetail(id ? loading() : idle());
  }, []);

  const setFilter = useCallback(
    <Key extends keyof MemoryFilters>(
      key: Key,
      value: MemoryFilters[Key]
    ) => {
      const next = { ...filters, [key]: value };
      setFilters(next);
      const currentSelection = selectedIdRef.current;
      if (
        currentSelection &&
        list.status === "ready" &&
        !filterMemories(list.data, next, now).some(
          (entry) => entry.id === currentSelection
        )
      ) {
        selectMemory(null);
      }
    },
    [filters, list, now, selectMemory]
  );

  const clearFilters = useCallback(
    () => setFilters(DEFAULT_MEMORY_FILTERS),
    []
  );
  const reload = useCallback(() => {
    setIsRefreshing(true);
    setOverview(loading());
    setList(loading());
    setDetail(selectedIdRef.current ? loading() : idle());
    setReloadVersion((value) => value + 1);
    setDetailVersion((value) => value + 1);
  }, []);
  const retryDetail = useCallback(() => {
    if (selectedIdRef.current) {
      setDetail(loading());
      setDetailVersion((value) => value + 1);
    }
  }, []);

  return {
    overview,
    list,
    detail,
    selectedId,
    setSelectedId: selectMemory,
    filters,
    setFilter,
    clearFilters,
    filteredEntries,
    reload,
    retryDetail,
    isRefreshing
  };
}

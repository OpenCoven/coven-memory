export type MemoryVerificationState =
  | "verified"
  | "needs-review"
  | "degraded"
  | "unknown"
  | "unavailable";

export type MemorySource = {
  kind: string;
  label: string;
};

export type MemorySummary = {
  id: string;
  familiarId: string;
  title: string;
  updatedAt: string;
  relativeUpdatedAt: string;
  excerpt: string;
  source: MemorySource;
  privacy: {
    classification: string | null;
    revealRequired: boolean | null;
  };
  verification: {
    state: MemoryVerificationState;
  };
};

export type MemoryOverview = {
  generatedAt: string;
  totals: {
    entries: number;
    familiars: number;
    verified: number;
    needsReview: number;
    unknown: number;
  };
  lastUpdatedAt: string | null;
  capabilities: {
    detail: boolean;
    verification: boolean;
    attestationMetadata: boolean;
    supersessionHistory: boolean;
    mutations: boolean;
  };
  verification: {
    state: MemoryVerificationState;
    checkedAt: string;
    manifest: string | null;
    index: string | null;
    issues: string[];
  };
};

export type MemoryDetail = {
  id: string;
  familiarId: string;
  title: string;
  updatedAt: string;
  source: MemorySource;
  content: string;
  contentFormat: "markdown";
  privacy: {
    classification: string | null;
    revealRequired: boolean | null;
    reason: string;
  };
  verification: {
    state: MemoryVerificationState;
    reason: string;
  };
  attestation: Record<string, unknown> | null;
  supersession: {
    supersedes: string | null;
    supersededBy: string | null;
  };
};

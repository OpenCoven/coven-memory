import { z } from "zod";
import type {
  MemoryDetail,
  MemoryOverview,
  MemorySummary,
  MemoryVerificationState
} from "@/lib/memory-types";
import {
  memoryDetailSchema,
  memoryListSchema,
  memoryOverviewSchema
} from "./memory-contract";
import type { DaemonResponse } from "./daemon-transport";

type Transport = {
  get(path: string): Promise<DaemonResponse>;
};

type MemoryGatewayErrorCode =
  | "invalid_id"
  | "invalid_payload"
  | "daemon_status";

export class MemoryGatewayError extends Error {
  constructor(
    public readonly code: MemoryGatewayErrorCode,
    public readonly status?: number
  ) {
    super(code);
    this.name = "MemoryGatewayError";
  }
}

function parsed<T>(schema: z.ZodType<T>, body: string): T {
  try {
    const result = schema.safeParse(JSON.parse(body));
    if (!result.success) {
      throw new MemoryGatewayError("invalid_payload");
    }
    return result.data;
  } catch (error) {
    if (error instanceof MemoryGatewayError) {
      throw error;
    }
    throw new MemoryGatewayError("invalid_payload");
  }
}

function requireSuccess(response: DaemonResponse) {
  if (response.status !== 200) {
    throw new MemoryGatewayError("daemon_status", response.status);
  }
}

function browserVerificationState(
  state: "verified" | "needs_review" | "degraded" | "unknown" | "unavailable"
): MemoryVerificationState {
  return state === "needs_review" ? "needs-review" : state;
}

export function createMemoryGateway(transport: Transport) {
  return {
    async list(): Promise<MemorySummary[]> {
      const response = await transport.get("/api/v1/memory");
      requireSuccess(response);
      return parsed(memoryListSchema, response.body).map((entry) => ({
        id: entry.id,
        familiarId: entry.familiar_id,
        title: entry.title,
        updatedAt: entry.updated_at_iso,
        relativeUpdatedAt: entry.updated_at,
        excerpt: entry.excerpt,
        source: { kind: "coven-origin", label: "Coven origin" },
        privacy: {
          classification: entry.privacy_classification,
          revealRequired: entry.reveal_required
        },
        verification: {
          state: browserVerificationState(entry.verification_state)
        }
      }));
    },

    async overview(): Promise<MemoryOverview> {
      const response = await transport.get("/api/v1/memory/overview");
      requireSuccess(response);
      const value = parsed(memoryOverviewSchema, response.body);
      return {
        generatedAt: value.generated_at,
        totals: {
          entries: value.totals.entries,
          familiars: value.totals.familiars,
          verified: value.totals.verified,
          needsReview: value.totals.needs_review,
          unknown: value.totals.unknown
        },
        lastUpdatedAt: value.last_updated_at,
        capabilities: {
          detail: value.capabilities.detail,
          verification: value.capabilities.verification,
          attestationMetadata: value.capabilities.attestation_metadata,
          supersessionHistory: value.capabilities.supersession_history,
          mutations: value.capabilities.mutations
        },
        verification: {
          state: browserVerificationState(value.verification.state),
          checkedAt: value.verification.checked_at,
          manifest: value.verification.manifest,
          index: value.verification.index,
          issues: value.verification.issues
        }
      };
    },

    async detail(id: string): Promise<MemoryDetail | null> {
      if (!z.uuid().safeParse(id).success) {
        throw new MemoryGatewayError("invalid_id");
      }
      const response = await transport.get(
        `/api/v1/memory/${encodeURIComponent(id)}`
      );
      if (response.status === 404) {
        return null;
      }
      requireSuccess(response);
      const entry = parsed(memoryDetailSchema, response.body);
      return {
        id: entry.id,
        familiarId: entry.familiar_id,
        title: entry.title,
        updatedAt: entry.updated_at,
        source: entry.source,
        content: entry.content,
        contentFormat: entry.content_format,
        privacy: {
          classification: entry.privacy.classification,
          revealRequired: entry.privacy.reveal_required,
          reason: entry.privacy.reason
        },
        verification: {
          state: browserVerificationState(entry.verification.state),
          reason: entry.verification.reason
        },
        attestationMetadata: entry.attestation
          ? { fieldCount: Object.keys(entry.attestation).length }
          : null,
        supersession: {
          supersedes: entry.supersession.supersedes,
          supersededBy: entry.supersession.superseded_by
        }
      };
    }
  };
}

export type MemoryGateway = ReturnType<typeof createMemoryGateway>;

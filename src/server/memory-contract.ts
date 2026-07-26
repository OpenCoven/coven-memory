import { z } from "zod";

const wireVerificationState = z.enum([
  "verified",
  "needs_review",
  "degraded",
  "unknown",
  "unavailable"
]);

const isoTimestamp = z.iso.datetime({ offset: true });
const opaqueId = z.uuid();
const shortText = z.string().max(2_048);

const relativeMemoryPath = z
  .string()
  .min(1)
  .max(4_096)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.startsWith("\\\\") &&
      !/^[A-Za-z]:[\\/]/.test(value),
    "memory path must be relative"
  )
  .refine(
    (value) => !value.split(/[\\/]/).some((segment) => segment === ".."),
    "memory path must remain contained"
  );

export const memoryListSchema = z.array(
  z.strictObject({
    id: opaqueId,
    familiar_id: z.string().min(1).max(256),
    title: z.string().min(1).max(1_024),
    path: relativeMemoryPath,
    updated_at: z.string().min(1).max(128),
    updated_at_iso: isoTimestamp,
    excerpt: shortText,
    privacy_classification: z.string().max(128).nullable(),
    reveal_required: z.boolean().nullable(),
    verification_state: wireVerificationState
  })
);

export const memoryOverviewSchema = z
  .strictObject({
    generated_at: isoTimestamp,
    totals: z.strictObject({
      entries: z.number().int().nonnegative(),
      familiars: z.number().int().nonnegative(),
      verified: z.number().int().nonnegative(),
      needs_review: z.number().int().nonnegative(),
      unknown: z.number().int().nonnegative()
    }),
    last_updated_at: isoTimestamp.nullable(),
    capabilities: z.strictObject({
      detail: z.boolean(),
      verification: z.boolean(),
      attestation_metadata: z.boolean(),
      supersession_history: z.boolean(),
      mutations: z.boolean()
    }),
    verification: z.strictObject({
      state: wireVerificationState,
      checked_at: isoTimestamp,
      manifest: shortText.nullable(),
      index: shortText.nullable(),
      issues: z.array(shortText).max(1_000)
    })
  })
  .superRefine(({ totals }, context) => {
    if (
      totals.familiars > totals.entries ||
      totals.verified + totals.needs_review + totals.unknown > totals.entries
    ) {
      context.addIssue({
        code: "custom",
        message: "overview counts exceed total entries",
        path: ["totals"]
      });
    }
  });

export const memoryDetailSchema = z.strictObject({
  id: opaqueId,
  familiar_id: z.string().min(1).max(256),
  title: z.string().min(1).max(1_024),
  updated_at: isoTimestamp,
  source: z.strictObject({
    kind: z.string().min(1).max(128),
    label: z.string().min(1).max(256)
  }),
  content: z.string(),
  content_format: z.literal("markdown"),
  privacy: z.strictObject({
    classification: z.string().max(128).nullable(),
    reveal_required: z.boolean().nullable(),
    reason: shortText
  }),
  verification: z.strictObject({
    state: wireVerificationState,
    reason: shortText
  }),
  attestation: z.record(z.string(), z.unknown()).nullable(),
  supersession: z.strictObject({
    supersedes: opaqueId.nullable(),
    superseded_by: opaqueId.nullable()
  })
});

export type MemoryListWire = z.infer<typeof memoryListSchema>;
export type MemoryOverviewWire = z.infer<typeof memoryOverviewSchema>;
export type MemoryDetailWire = z.infer<typeof memoryDetailSchema>;

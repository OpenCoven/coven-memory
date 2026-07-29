export type DemoVerification = "verified" | "needs-review" | "unknown";

export type DemoMemory = {
  id: `demo-${string}`;
  familiar: string;
  title: string;
  source: string;
  relativeUpdatedAt: string;
  excerpt: string;
  body: readonly string[];
  verification: DemoVerification;
  privacy: "public" | "protected";
  revealRequired: boolean;
  synthetic: true;
};

export const DEMO_MEMORIES = [
  {
    id: "demo-architecture-boundary",
    familiar: "lumen",
    title: "Architecture boundary",
    source: "Coven origin",
    relativeUpdatedAt: "4m ago",
    excerpt: "The local daemon remains the authority for genuine memory.",
    body: [
      "This fictional decision keeps durable memory behind a local authority boundary.",
      "The dashboard receives a validated browser shape and never opens storage directly."
    ],
    verification: "verified",
    privacy: "public",
    revealRequired: false,
    synthetic: true
  },
  {
    id: "demo-maintainer-handoffs",
    familiar: "briar",
    title: "Maintainer handoffs",
    source: "Promoted memory",
    relativeUpdatedAt: "2d ago",
    excerpt: "Use concise evidence and leave the next action explicit.",
    body: [
      "This fictional promoted memory demonstrates a stable collaboration preference.",
      "A useful handoff names the changed surface, verification evidence, and remaining decision."
    ],
    verification: "verified",
    privacy: "public",
    revealRequired: false,
    synthetic: true
  },
  {
    id: "demo-recall-review",
    familiar: "lumen",
    title: "Recall awaiting review",
    source: "Imported draft",
    relativeUpdatedAt: "5d ago",
    excerpt: "A synthetic imported note is waiting for verification.",
    body: [
      "This fictional draft shows how unverified recall remains visible without being treated as settled truth.",
      "Review can promote, revise, or discard it in a future authority-aware workflow."
    ],
    verification: "needs-review",
    privacy: "public",
    revealRequired: false,
    synthetic: true
  },
  {
    id: "demo-protected-example",
    familiar: "echo",
    title: "Protected example",
    source: "Coven origin",
    relativeUpdatedAt: "3w ago",
    excerpt: "Preview hidden until explicitly revealed.",
    body: [
      "This is a fictional protected memory created only for the static demo.",
      "Reveal state lasts only in this page and is never stored."
    ],
    verification: "unknown",
    privacy: "protected",
    revealRequired: true,
    synthetic: true
  }
] as const satisfies readonly DemoMemory[];

export const DEMO_OVERVIEW = {
  entries: DEMO_MEMORIES.length,
  familiars: new Set(DEMO_MEMORIES.map((memory) => memory.familiar)).size,
  verified: DEMO_MEMORIES.filter(
    (memory) => memory.verification === "verified"
  ).length,
  needsReview: DEMO_MEMORIES.filter(
    (memory) => memory.verification === "needs-review"
  ).length,
  unknown: DEMO_MEMORIES.filter(
    (memory) => memory.verification === "unknown"
  ).length
} as const;

export function filterDemoMemories(
  memories: readonly DemoMemory[],
  query: string
): readonly DemoMemory[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return memories;
  }

  return memories.filter((memory) =>
    [
      memory.title,
      memory.familiar,
      memory.source,
      memory.excerpt
    ].some((value) => value.toLocaleLowerCase().includes(normalized))
  );
}

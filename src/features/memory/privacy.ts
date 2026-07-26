export function memoryRequiresReveal(privacy: {
  classification: string | null;
  revealRequired: boolean | null;
}) {
  return (
    privacy.revealRequired !== false || privacy.classification !== "public"
  );
}

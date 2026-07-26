import { LaunchGate } from "@/components/launch-gate";
import { MemoryDashboard } from "@/features/memory/memory-dashboard";

export default function HomePage() {
  return (
    <LaunchGate>
      <MemoryDashboard />
    </LaunchGate>
  );
}

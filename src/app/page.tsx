import { connection } from "next/server";
import { LaunchGate } from "@/components/launch-gate";
import { MemoryDashboard } from "@/features/memory/memory-dashboard";

export default async function HomePage() {
  await connection();
  return (
    <LaunchGate>
      <MemoryDashboard />
    </LaunchGate>
  );
}

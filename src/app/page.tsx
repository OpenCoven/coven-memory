import { connection } from "next/server";
import { MemoryDashboard } from "@/features/memory/memory-dashboard";

export default async function HomePage() {
  await connection();
  return <MemoryDashboard />;
}

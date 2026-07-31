import Dashboard from "@/components/Dashboard";

export default function Page() {
  return <Dashboard aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}

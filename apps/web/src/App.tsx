import { CasesRoute } from "./routes/Cases";

export function App() {
  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-white/10 px-4 py-6">
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">ILMS</div>
        <nav className="mt-8 space-y-1 text-sm">
          <NavItem label="Cases" active />
          <NavItem label="Tools" />
          <NavItem label="Agent" />
          <NavItem label="Reports" />
          <NavItem label="Settings" />
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto px-10 py-8">
        <CasesRoute />
      </main>
    </div>
  );
}

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      className={
        "rounded px-2 py-1.5 " +
        (active ? "bg-white/5 text-white" : "text-white/50 hover:text-white/80")
      }
    >
      {label}
    </div>
  );
}

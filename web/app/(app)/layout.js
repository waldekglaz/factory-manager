import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        {children}
      </main>
    </div>
  );
}

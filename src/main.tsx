import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { prefetchRoute } from "./lib/routePrefetch";

createRoot(document.getElementById("root")!).render(<App />);

// Warm up the most-visited route chunks once the browser is idle so the
// first navigation feels instant. These are fire-and-forget.
const idle =
  (typeof window !== "undefined" && (window as any).requestIdleCallback) ||
  ((cb: () => void) => setTimeout(cb, 1500));
idle(() => {
  prefetchRoute("ContractDetail");
  prefetchRoute("Contracts");
  prefetchRoute("Dashboard");
  prefetchRoute("ReportsDashboard");
  prefetchRoute("AlertsDashboard");
});


import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CopilotKit } from "@copilotkit/react-core/v2";
import { HttpAgent } from "@ag-ui/client";
import "@copilotkit/react-core/v2/styles.css";
import { ErrorBoundary } from "./error-boundary";
import "./globals.css";
import App from "./App";

// Connect the React app DIRECTLY to the Python/FastAPI AG-UI endpoint — no Node
// runtime in between. `/agui` is same-origin and Vite proxies it to the FastAPI
// backend (see vite.config.ts), which also lets it work inside Colab's iframe
// where only the frontend port is exposed to the browser.
const podcastAgent = new HttpAgent({ url: "/agui" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <main className="h-screen w-screen">
        <CopilotKit selfManagedAgents={{ default: podcastAgent }}>
          <App />
        </CopilotKit>
      </main>
    </ErrorBoundary>
  </StrictMode>,
);

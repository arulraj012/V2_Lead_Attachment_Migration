import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@ui5/webcomponents-react";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { FailedRecords } from "./pages/FailedRecords";
import { MigrationHistory } from "./pages/MigrationHistory";
import { Settings } from "./pages/Settings";
import "@ui5/webcomponents/dist/Assets.js";
import "@ui5/webcomponents-fiori/dist/Assets.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

// Detect basename from Vite's base config (injected at build time)
// For local CAP: /ui, for BTP: /v2leadattachmentmigration
const basename = import.meta.env.BASE_URL?.replace(/\/$/, '') || '/ui';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter basename={basename}>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="failed-records" element={<FailedRecords />} />
              <Route path="history" element={<MigrationHistory />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

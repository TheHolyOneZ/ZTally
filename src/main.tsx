import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/styles.css";
import "./styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nProvider } from "./lib/i18n";
import { StoreProvider, useStore } from "./lib/store";

function Localised() {
  const { settings } = useStore();

  if (!settings) return null;
  return (
    <I18nProvider setting={settings.language}>
      <App />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <Localised />
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);

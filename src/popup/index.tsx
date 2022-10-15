import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import AppRoot from "./components/root";

const container = document.createElement("popup");
document.body.appendChild(container);

const root = createRoot(container);
root.render(
  <MantineProvider withGlobalStyles withNormalizeCSS>
    <AppRoot />
  </MantineProvider>
);

// console.log("Popup 👋");

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./components/App.vue";
import "./style.css";
import "tippy.js/dist/tippy.css";
import { initializeStartup } from "./startup";

const app = createApp(App).use(createPinia());
initializeStartup()
  .then(() => app.mount("#app"))
  .catch((error: unknown) => {
    const root = document.getElementById("app");
    if (root)
      root.textContent = `Unable to initialize application: ${String(error)}`;
    console.error(error);
  });

// disable the right click menu
document.addEventListener("contextmenu", (e) => e.preventDefault());

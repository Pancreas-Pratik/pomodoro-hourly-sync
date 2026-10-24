
const buttons = document.querySelectorAll(
  "[data-theme-option]"
);

const system = window.matchMedia(
  "(prefers-color-scheme: dark)"
);

const key = "minimal-pomo-theme";
let theme = "system";

try {
  theme = localStorage.getItem(key) || "system";
} catch {}

if (!["system", "light", "dark"].includes(theme)) {
  theme = "system";
}

function applyTheme() {
  const appearance =
    theme === "system"
      ? (system.matches ? "dark" : "light")
      : theme;

  document.documentElement.dataset.theme = appearance;

  buttons.forEach(button => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.themeOption === theme)
    );
  });
}

buttons.forEach(button => {
  button.addEventListener("click", () => {
    theme = button.dataset.themeOption;

    try {
      if (theme === "system") {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, theme);
      }
    } catch {}

    applyTheme();
  });
});

system.addEventListener("change", applyTheme);
applyTheme();

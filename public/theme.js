(() => {
  let preference = "system";
  try {
    const stored = localStorage.getItem("branchboard.theme");
    if (stored === "light" || stored === "dark") preference = stored;
  } catch {
    // System appearance remains the safe default when storage is unavailable.
  }

  const theme =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#141218" : "#fef7ff");
})();

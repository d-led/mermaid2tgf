import { convertInputToOutput, DEMO, getDownloadInfo } from "./converter";

const DEBOUNCE_MS = 300;

function run(): void {
  const mermaidEl = document.getElementById("mermaid") as HTMLTextAreaElement;
  const tgfEl = document.getElementById("tgf") as HTMLTextAreaElement;
  const downloadBtn = document.getElementById("download");
  const swapBtn = document.getElementById("swap");

  if (!mermaidEl || !tgfEl || !downloadBtn || !swapBtn) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function updateOutput(): void {
    const input = mermaidEl.value.trim();
    const effective = input === "" ? DEMO : input;
    tgfEl.value = convertInputToOutput(effective);
    updateDownloadButtonLabel();
  }

  function updateDownloadButtonLabel(): void {
    const info = getDownloadInfo(tgfEl.value);
    downloadBtn.textContent =
      info != null ? `Download ${info.filename}` : "Download";
  }

  function scheduleUpdate(): void {
    if (debounceTimer != null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      updateOutput();
    }, DEBOUNCE_MS);
  }

  mermaidEl.addEventListener("input", scheduleUpdate);
  mermaidEl.addEventListener("paste", () => {
    setTimeout(scheduleUpdate, 0);
  });

  swapBtn.addEventListener("click", () => {
    mermaidEl.value = tgfEl.value;
    updateOutput();
  });

  downloadBtn.addEventListener("click", () => {
    const info = getDownloadInfo(tgfEl.value);
    if (info == null) return;
    const blob = new Blob([info.content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = info.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  if (mermaidEl.value.trim() === "") {
    mermaidEl.value = DEMO;
  }
  updateOutput();
}

run();

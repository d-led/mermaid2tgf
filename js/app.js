(function () {
  const DEMO = `flowchart TD
  UI_SRC["Frontend source code (Vite app)"] -->|"Build frontend files"| UI_DIST["Built frontend files (dist folder)"]
  SRV_SRC["Backend source code (Rust server)"] -->|"Compile backend executable"| SRV_BIN["Backend executable (server binary)"]
  UI_DIST -. "Embedded into" .-> SRV_BIN
  UI_DIST ==>|"HTTP requests"| SRV_BIN
  UI_DIST ==>|"WebSocket connection"| SRV_BIN`;

  const mermaidEl = document.getElementById('mermaid');
  const tgfEl = document.getElementById('tgf');
  const downloadBtn = document.getElementById('download');

  function parseMermaidToTGF(text) {
    const raw = (text || '').trim();
    const source = raw === '' ? DEMO : raw;
    const lines = source.split(/\r?\n/).map(function (s) { return s.trim(); });
    const nodes = new Map();
    const edges = [];

    const nodeDefRe = /(\w+)(?:\["([^"]*)"\]|\(["']?([^"')]*)["']?\))?/g;
    const arrowRe = /\s*(?:-->|==>)(?:\|"([^"]*)"\|)?|(?:-\.\s*"([^"]*)"\s*\.->|-\.?->)\s*/g;

    function ensureNode(id, label) {
      if (!nodes.has(id)) {
        nodes.set(id, label != null ? label : id);
      } else if (label != null && label !== '') {
        nodes.set(id, label);
      }
    }

    function parseNodeDef(str) {
      const m = str.match(/^(\w+)(?:\["([^"]*)"\]|\(["']?([^"')]*)["']?\))?/);
      if (!m) return { id: null, label: null };
      const id = m[1];
      const label = m[2] != null ? m[2] : (m[3] != null ? m[3] : null);
      return { id, label };
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || /^\s*flowchart\s/i.test(line) || /^\s*direction\s/i.test(line)) continue;

      const arrowMatches = [...line.matchAll(arrowRe)];
      if (arrowMatches.length === 0) continue;

      const parts = line.split(arrowRe).filter(Boolean);
      let partIdx = 0;

      for (let j = 0; j < arrowMatches.length; j++) {
        const edgeLabel = arrowMatches[j][1] || arrowMatches[j][2] || null;
        const leftPart = parts[partIdx];
        const rightPart = edgeLabel != null ? parts[partIdx + 2] : parts[partIdx + 1];
        partIdx += edgeLabel != null ? 3 : 2;

        const left = parseNodeDef((leftPart || '').trim());
        const right = parseNodeDef((rightPart || '').trim());
        if (left.id) ensureNode(left.id, left.label);
        if (right.id) ensureNode(right.id, right.label);

        if (left.id && right.id) edges.push({ from: left.id, to: right.id, label: edgeLabel });
      }
    }

    const nodeLines = [];
    nodes.forEach(function (label, id) {
      nodeLines.push(id + ' ' + label);
    });
    const edgeLines = edges.map(function (e) {
      return e.label != null ? e.from + ' ' + e.to + ' ' + e.label : e.from + ' ' + e.to;
    });
    return nodeLines.join('\n') + '\n#\n' + edgeLines.join('\n');
  }

  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  function updateTGF() {
    const input = mermaidEl.value.trim();
    const effective = input === '' ? DEMO : input;
    tgfEl.value = parseMermaidToTGF(effective);
  }

  function scheduleUpdate() {
    if (debounceTimer != null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      updateTGF();
    }, DEBOUNCE_MS);
  }

  mermaidEl.addEventListener('input', scheduleUpdate);
  mermaidEl.addEventListener('paste', function () {
    setTimeout(scheduleUpdate, 0);
  });

  downloadBtn.addEventListener('click', function () {
    const tgf = tgfEl.value;
    if (!tgf) return;
    const blob = new Blob([tgf], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'graph.tgf';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  if (mermaidEl.value.trim() === '') {
    mermaidEl.value = DEMO;
  }
  updateTGF();
})();

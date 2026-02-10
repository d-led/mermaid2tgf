export const DEMO = `flowchart TD
  UI_SRC["Frontend source code (Vite app)"] -->|"Build frontend files"| UI_DIST["Built frontend files (dist folder)"]
  SRV_SRC["Backend source code (Rust server)"] -->|"Compile backend executable"| SRV_BIN["Backend executable (server binary)"]
  UI_DIST -. "Embedded into" .-> SRV_BIN
  UI_DIST ==>|"HTTP requests"| SRV_BIN
  UI_DIST ==>|"WebSocket connection"| SRV_BIN`;

const ARROW_RE =
  /\s*(?:-->|==>)(?:\|"([^"]*)"\||\|([^|]*)\|)?|(?:-\.\s*"([^"]*)"\s*\.->|-\.?->)\s*/g;

const NODE_DEF_RE =
  /^(\w+)(?:\["([^"]*)"\]|\[([^\]]*)\]|\(["']?([^"')]*)["']?\)|\{([^}]*)\})?/;

interface NodeDef {
  id: string | null;
  label: string | null;
}

function parseNodeDef(str: string): NodeDef {
  const m = str.trim().match(NODE_DEF_RE);
  if (!m) return { id: null, label: null };
  const id = m[1];
  const label =
    m[2] != null
      ? m[2]
      : m[3] != null
        ? m[3]
        : m[4] != null
          ? m[4]
          : m[5] != null
            ? m[5]
            : null;
  return { id, label };
}

export function parseMermaidToTGF(text: string): string {
  const raw = (text ?? "").trim();
  const source = raw === "" ? DEMO : raw;
  const lines = source.split(/\r?\n/).map((s) => s.trim());
  const nodes = new Map<string, string>();
  const edges: { from: string; to: string; label: string | null }[] = [];

  function ensureNode(id: string, label: string | null): void {
    if (!nodes.has(id)) {
      nodes.set(id, label != null ? label : id);
    } else if (label != null && label !== "") {
      nodes.set(id, label);
    }
  }

  // First pass: collect node definitions from lines that only define a node (no arrows).
  // This preserves labels when round-tripping from TGF, which outputs one node per line.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("%%")) continue;
    if (
      /^\s*(?:flowchart|graph)\s/i.test(line) ||
      /^\s*direction\s/i.test(line)
    )
      continue;
    const arrowMatches = [...line.matchAll(ARROW_RE)];
    if (arrowMatches.length > 0) continue;
    const def = parseNodeDef(line.trim());
    if (def.id != null && def.label != null) ensureNode(def.id, def.label);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("%%")) continue;
    if (
      /^\s*(?:flowchart|graph)\s/i.test(line) ||
      /^\s*direction\s/i.test(line)
    )
      continue;

    const arrowMatches = [...line.matchAll(ARROW_RE)];
    if (arrowMatches.length === 0) continue;

    const parts = line.split(ARROW_RE).filter(Boolean);
    let partIdx = 0;

    for (let j = 0; j < arrowMatches.length; j++) {
      const edgeLabel =
        arrowMatches[j][1] ?? arrowMatches[j][2] ?? arrowMatches[j][3] ?? null;
      const leftPart = parts[partIdx];
      const rightPart =
        edgeLabel != null ? parts[partIdx + 2] : parts[partIdx + 1];
      // With edge label: [left, label, right] → advance 3. Chained without label: [..., left, right] → advance 1 so right becomes next left.
      partIdx += edgeLabel != null ? 3 : 1;

      const left = parseNodeDef((leftPart ?? "").trim());
      const right = parseNodeDef((rightPart ?? "").trim());
      if (left.id) ensureNode(left.id, left.label);
      if (right.id) ensureNode(right.id, right.label);

      if (left.id && right.id)
        edges.push({ from: left.id, to: right.id, label: edgeLabel });
    }
  }

  let numId = 1;
  const mermaidIdToNum = new Map<string, number>();
  nodes.forEach((_label, mermaidId) => {
    mermaidIdToNum.set(mermaidId, numId);
    numId += 1;
  });

  const nodeLines: string[] = [];
  nodes.forEach((label, mermaidId) => {
    nodeLines.push(String(mermaidIdToNum.get(mermaidId)) + " " + label);
  });
  const edgeLines = edges.map((e) => {
    const from = mermaidIdToNum.get(e.from);
    const to = mermaidIdToNum.get(e.to);
    return e.label != null
      ? String(from) + " " + String(to) + " " + e.label
      : String(from) + " " + String(to);
  });
  return nodeLines.join("\n") + "\n#\n" + edgeLines.join("\n");
}

export function isMermaidInput(text: string): boolean {
  const t = (text ?? "").trim();
  return /^(?:flowchart|graph)\s+\S/.test(t);
}

function escapeNodeLabel(s: string): string {
  return s.replace(/"/g, '""');
}

function escapeEdgeLabel(s: string): string {
  return s.replace(/"/g, '""');
}

export function parseTGFToMermaid(text: string): string | null {
  const raw = (text ?? "").trim();
  const lines = raw.split(/\r?\n/);
  const separatorIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "#") separatorIndexes.push(i);
  }
  if (separatorIndexes.length !== 1) return null;
  const sep = separatorIndexes[0];
  const nodes = new Map<string, string>();
  const nodesPart = lines.slice(0, sep);
  for (let i = 0; i < nodesPart.length; i++) {
    const line = nodesPart[i].trim();
    if (!line) continue;
    const spaceIdx = line.indexOf(" ");
    const id = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
    const label = spaceIdx === -1 ? line : line.slice(spaceIdx + 1).trim();
    if (nodes.has(id)) return null;
    nodes.set(id, label);
  }
  const edges: { from: string; to: string; label: string | null }[] = [];
  const edgesPart = lines.slice(sep + 1);
  for (let i = 0; i < edgesPart.length; i++) {
    const line = edgesPart[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) return null;
    const from = parts[0];
    const to = parts[1];
    const edgeLabel = parts.length > 2 ? parts.slice(2).join(" ") : null;
    if (!nodes.has(from) || !nodes.has(to)) return null;
    edges.push({ from, to, label: edgeLabel });
  }
  const nodeLines: string[] = [];
  nodes.forEach((label, id) => {
    nodeLines.push("  " + id + '["' + escapeNodeLabel(label) + '"]');
  });
  const edgeLines = edges.map((e) => {
    if (e.label != null && e.label !== "") {
      return "  " + e.from + ' -->|"' + escapeEdgeLabel(e.label) + '"| ' + e.to;
    }
    return "  " + e.from + " --> " + e.to;
  });
  return "flowchart TD\n" + nodeLines.join("\n") + "\n" + edgeLines.join("\n");
}

export function convertInputToOutput(text: string): string {
  const raw = (text ?? "").trim();
  const effective = raw === "" ? DEMO : raw;
  if (isMermaidInput(effective)) return parseMermaidToTGF(effective);
  const mermaid = parseTGFToMermaid(effective);
  if (mermaid != null) return mermaid;
  return parseMermaidToTGF(effective);
}

/**
 * Normalize for round-trip comparison: reduce to sorted node labels and edges (from, to, label)
 * so that formatting and node ID renumbering don't affect equality.
 */
export function normalizedSemantics(text: string): string | null {
  const raw = (text ?? "").trim();
  if (raw === "") return null;
  if (isMermaidInput(raw)) {
    const tgf = parseMermaidToTGF(raw);
    return normalizedTGFSemantics(tgf);
  }
  return normalizedTGFSemantics(raw);
}

function normalizedTGFSemantics(tgf: string): string {
  const lines = tgf.trim().split(/\r?\n/);
  const sepIdx = lines.findIndex((l) => l.trim() === "#");
  if (sepIdx < 0) return tgf.trim();
  const nodeLines = lines.slice(0, sepIdx).filter((l) => l.trim());
  const edgeLines = lines.slice(sepIdx + 1).filter((l) => l.trim());
  const nodes = new Map<string, string>();
  for (const line of nodeLines) {
    const i = line.indexOf(" ");
    const id = i === -1 ? line : line.slice(0, i);
    const label = i === -1 ? line : line.slice(i + 1).trim();
    nodes.set(id, label);
  }
  const nodeEntries = Array.from(nodes.entries())
    .map(([id, label]) => `${id}:${label}`)
    .sort();
  const edges = edgeLines.map((line) => {
    const parts = line.split(/\s+/);
    const from = parts[0];
    const to = parts[1];
    const label = parts.length > 2 ? parts.slice(2).join(" ") : "";
    return `${from}->${to}:${label}`;
  });
  edges.sort();
  return ["NODES", ...nodeEntries, "EDGES", ...edges].join("\n");
}

/**
 * Returns download filename and content for the current output, or null if output is empty.
 * Use .tgf for TGF output and .mermaid for Mermaid (flowchart/graph) output.
 */
export function getDownloadInfo(
  output: string,
): { filename: string; content: string } | null {
  const trimmed = (output ?? "").trim();
  if (trimmed === "") return null;
  const isMermaid = /^(?:flowchart|graph)\s/.test(trimmed);
  return {
    filename: isMermaid ? "graph.mermaid" : "graph.tgf",
    content: output,
  };
}

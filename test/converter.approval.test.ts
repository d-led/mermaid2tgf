import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  convertInputToOutput,
  DEMO,
  normalizedSemantics,
} from "../src/converter";

const approvals = require("approvals");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.CI) {
  approvals.configure({ reporters: ["gitdiff"] });
}

describe("converter approval tests", () => {
  it("mermaid demo to TGF", () => {
    const out = convertInputToOutput(DEMO);
    approvals.verify(__dirname, "mermaid_demo_to_tgf", out);
  });

  it("empty input uses demo and outputs TGF", () => {
    const out = convertInputToOutput("");
    approvals.verify(__dirname, "empty_input_demo_tgf", out);
  });

  it("Christmas flowchart mermaid to TGF", () => {
    const mermaid = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]`;
    const out = convertInputToOutput(mermaid);
    approvals.verify(__dirname, "christmas_mermaid_to_tgf", out);
  });

  it("TGF to mermaid (round-trip demo)", () => {
    const tgf = `1 Frontend source code (Vite app)
2 Built frontend files (dist folder)
3 Backend source code (Rust server)
4 Backend executable (server binary)
#
1 2 Build frontend files
3 4 Compile backend executable
2 4 Embedded into
2 4 HTTP requests
2 4 WebSocket connection`;
    const out = convertInputToOutput(tgf);
    approvals.verify(__dirname, "tgf_to_mermaid_demo", out);
  });

  // Syntax quirks from https://mermaid.ai/open-source/syntax/flowchart.html
  it("mermaid syntax quirks: shapes (rectangle, round, rhombus) and link types (arrow, dotted, thick with labels)", () => {
    const mermaid = `flowchart TD
  A[Process box] -->|arrow label| B(Round edges)
  B -. "dotted label" .-> C{Diamond}
  C ==>|"thick label"| D[End]`;
    const out = convertInputToOutput(mermaid);
    approvals.verify(__dirname, "mermaid_syntax_quirks", out);
  });

  it("mermaid chained links on one line", () => {
    const mermaid = `flowchart LR
  A --> B --> C --> D`;
    const out = convertInputToOutput(mermaid);
    approvals.verify(__dirname, "mermaid_chained_links", out);
  });

  it("mermaid line with comment is ignored", () => {
    const mermaid = `flowchart TD
  %% this is a comment
  X[Only node] --> Y(Only edge)`;
    const out = convertInputToOutput(mermaid);
    approvals.verify(__dirname, "mermaid_with_comment", out);
  });

  describe("round-trip: normalized semantics preserved", () => {
    function roundTripOnce(input: string): string {
      return convertInputToOutput(convertInputToOutput(input));
    }

    function roundTripN(input: string, n: number): string {
      let out = input.trim();
      for (let i = 0; i < n; i++) {
        out = convertInputToOutput(out);
      }
      return out;
    }

    it("DEMO: one round-trip (mermaid -> tgf -> mermaid) preserves semantics", () => {
      const after = roundTripOnce(DEMO);
      const orig = normalizedSemantics(DEMO);
      const back = normalizedSemantics(after);
      expect(orig).not.toBeNull();
      expect(back).not.toBeNull();
      expect(back).toBe(orig);
    });

    it("DEMO: two round-trips preserve semantics", () => {
      const after = roundTripN(DEMO, 4); // mermaid -> tgf -> mermaid -> tgf -> mermaid
      const orig = normalizedSemantics(DEMO);
      const back = normalizedSemantics(after);
      expect(orig).not.toBeNull();
      expect(back).not.toBeNull();
      expect(back).toBe(orig);
    });

    it("TGF demo: one round-trip (tgf -> mermaid -> tgf) preserves semantics", () => {
      const tgf = `1 Frontend source code (Vite app)
2 Built frontend files (dist folder)
3 Backend source code (Rust server)
4 Backend executable (server binary)
#
1 2 Build frontend files
3 4 Compile backend executable
2 4 Embedded into
2 4 HTTP requests
2 4 WebSocket connection`;
      const after = roundTripOnce(tgf);
      const orig = normalizedSemantics(tgf);
      const back = normalizedSemantics(after);
      expect(orig).not.toBeNull();
      expect(back).not.toBeNull();
      expect(back).toBe(orig);
    });
  });
});

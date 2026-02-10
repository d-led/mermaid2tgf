import { describe, it, expect } from "vitest";
import { getDownloadInfo } from "../src/converter";

describe("getDownloadInfo", () => {
  it("returns null when output is empty", () => {
    expect(getDownloadInfo("")).toBeNull();
    expect(getDownloadInfo("   ")).toBeNull();
    expect(getDownloadInfo("\n\t")).toBeNull();
  });

  it("returns graph.tgf and content when output is TGF", () => {
    const tgf = "1 A\n2 B\n#\n1 2";
    const info = getDownloadInfo(tgf);
    expect(info).not.toBeNull();
    expect(info!.filename).toBe("graph.tgf");
    expect(info!.content).toBe(tgf);
  });

  it("returns graph.tgf when output is TGF with leading/trailing whitespace", () => {
    const tgf = "\n1 A\n#\n1 1\n";
    const info = getDownloadInfo(tgf);
    expect(info).not.toBeNull();
    expect(info!.filename).toBe("graph.tgf");
    expect(info!.content).toBe(tgf);
  });

  it("returns graph.mermaid and content when output starts with flowchart", () => {
    const mermaid = "flowchart TD\n  A --> B";
    const info = getDownloadInfo(mermaid);
    expect(info).not.toBeNull();
    expect(info!.filename).toBe("graph.mermaid");
    expect(info!.content).toBe(mermaid);
  });

  it("returns graph.mermaid when output starts with graph", () => {
    const mermaid = "graph LR\n  X --> Y";
    const info = getDownloadInfo(mermaid);
    expect(info).not.toBeNull();
    expect(info!.filename).toBe("graph.mermaid");
    expect(info!.content).toBe(mermaid);
  });

  it("returns graph.mermaid with leading whitespace trimmed for detection", () => {
    const mermaid = "\n  flowchart TD\n  A --> B";
    const info = getDownloadInfo(mermaid);
    expect(info).not.toBeNull();
    expect(info!.filename).toBe("graph.mermaid");
    expect(info!.content).toBe(mermaid);
  });

  it("returns graph.tgf when output has no # (invalid TGF but not mermaid)", () => {
    const text = "just some text";
    const info = getDownloadInfo(text);
    expect(info).not.toBeNull();
    expect(info!.filename).toBe("graph.tgf");
    expect(info!.content).toBe(text);
  });

  it("preserves full content including whitespace", () => {
    const content = 'flowchart TD\n  A["x"] --> B';
    const info = getDownloadInfo(content);
    expect(info!.content).toBe(content);
  });
});

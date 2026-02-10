package main

import (
	"bytes"
	"os"
	"strings"
	"testing"

	"github.com/approvals/go-approval-tests"
	"github.com/spf13/afero"
)

func TestMain(m *testing.M) {
	approvals.UseFolder("testdata")
	os.Exit(m.Run())
}

func runCLI(args []string, stdin string) (stdout, stderr string, exitCode int) {
	return runCLIWithFS(args, stdin, afero.NewOsFs())
}

// runCLIWithFS runs doMain with the given args, stdin, and osFs (e.g. MemMapFs for file-based tests).
func runCLIWithFS(args []string, stdin string, osFs afero.Fs) (stdout, stderr string, exitCode int) {
	embedded, err := buildEmbeddedFS()
	if err != nil {
		panic("test setup: " + err.Error())
	}
	var outBuf, errBuf bytes.Buffer
	in := strings.NewReader(stdin)
	code := doMain(args, in, &outBuf, &errBuf, osFs, embedded)
	return outBuf.String(), errBuf.String(), code
}

func approvalOutput(stdout, stderr string, exitCode int) string {
	var b strings.Builder
	b.WriteString("exit code: ")
	if exitCode != 0 {
		b.WriteString("1")
	} else {
		b.WriteString("0")
	}
	b.WriteString("\n\n")
	if stderr != "" {
		b.WriteString("STDERR:\n")
		b.WriteString(stderr)
		b.WriteString("\n")
	}
	if stdout != "" {
		b.WriteString("STDOUT:\n")
		b.WriteString(stdout)
	}
	return b.String()
}

func TestDoMain_EmptyStdin_PrintsDemoTGF(t *testing.T) {
	t.Parallel()
	stdout, stderr, code := runCLI([]string{}, "")
	got := approvalOutput(stdout, stderr, code)
	approvals.VerifyString(t, got)
}

func TestDoMain_MermaidStdin_PrintsTGF(t *testing.T) {
	t.Parallel()
	stdin := `flowchart TD
  A --> B
  B --> C`
	stdout, stderr, code := runCLI([]string{}, stdin)
	got := approvalOutput(stdout, stderr, code)
	approvals.VerifyString(t, got)
}

func TestDoMain_TGFStdin_PrintsMermaid(t *testing.T) {
	t.Parallel()
	stdin := `1 a
2 b
#
1 2`
	stdout, stderr, code := runCLI([]string{}, stdin)
	got := approvalOutput(stdout, stderr, code)
	approvals.VerifyString(t, got)
}

func TestDoMain_Help_PrintsUsage(t *testing.T) {
	t.Parallel()
	stdout, stderr, code := runCLI([]string{"--help"}, "")
	got := approvalOutput(stdout, stderr, code)
	approvals.VerifyString(t, got)
}

func TestDoMain_NonexistentFile_PrintsErrorToStderr(t *testing.T) {
	t.Parallel()
	stdout, stderr, code := runCLI([]string{"/nonexistent/file.mermaid"}, "")
	got := approvalOutput(stdout, stderr, code)
	approvals.VerifyString(t, got)
}

func TestDoMain_MermaidFile_PrintsTGF(t *testing.T) {
	t.Parallel()
	mem := afero.NewMemMapFs()
	const content = "flowchart TD\n  X[Start] --> Y[End]\n"
	if err := afero.WriteFile(mem, "input.mermaid", []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	stdout, stderr, code := runCLIWithFS([]string{"input.mermaid"}, "", mem)
	got := approvalOutput(stdout, stderr, code)
	approvals.VerifyString(t, got)
}

func TestDoMain_TGFFile_PrintsMermaid(t *testing.T) {
	t.Parallel()
	mem := afero.NewMemMapFs()
	const content = "1 alpha\n2 beta\n#\n1 2\n"
	if err := afero.WriteFile(mem, "graph.tgf", []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	stdout, stderr, code := runCLIWithFS([]string{"graph.tgf"}, "", mem)
	got := approvalOutput(stdout, stderr, code)
	approvals.VerifyString(t, got)
}

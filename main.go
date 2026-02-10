package main

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/d-led/mermaid2tgf/internal/app"
	"github.com/gin-gonic/gin"
	"github.com/spf13/afero"
	"github.com/spf13/cobra"
)

// BuildSHA is set at link time: go build -ldflags "-X main.BuildSHA=<value>" (default "(devel)").
// If still "(devel)" at run time, BUILD_SHA env is used.
var BuildSHA = "(devel)"

//go:embed static/*
var staticEmbed embed.FS

//go:embed dist/*
var distEmbed embed.FS

func buildEmbeddedFS() (afero.Fs, error) {
	mem := afero.NewMemMapFs()
	copyEmbedToAfero := func(efs embed.FS, dir string, stripPrefix string) error {
		return fs.WalkDir(efs, dir, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			data, err := fs.ReadFile(efs, p)
			if err != nil {
				return err
			}
			outPath := path.Clean(p)
			if stripPrefix != "" && len(outPath) >= len(stripPrefix) && outPath[:len(stripPrefix)] == stripPrefix {
				outPath = outPath[len(stripPrefix):]
				if outPath == "" || outPath[0] != '/' {
					// keep as relative
				} else {
					outPath = outPath[1:]
				}
			}
			if outPath == "" {
				outPath = p
			}
			dirPath := path.Dir(outPath)
			if dirPath != "." {
				if err := mem.MkdirAll(dirPath, 0755); err != nil {
					return err
				}
			}
			if outPath == "index.html" {
				data = []byte(strings.ReplaceAll(string(data), "__BUILD_SHA__", BuildSHA))
			}
			return afero.WriteFile(mem, outPath, data, 0644)
		})
	}
	if err := copyEmbedToAfero(staticEmbed, "static", "static/"); err != nil {
		return nil, err
	}
	if err := copyEmbedToAfero(distEmbed, "dist", ""); err != nil {
		return nil, err
	}
	return afero.NewReadOnlyFs(mem), nil
}

func contentTypeFor(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".html", ".htm":
		return "text/html; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".js":
		return "application/javascript; charset=utf-8"
	default:
		return "application/octet-stream"
	}
}

func runServe(embedded afero.Fs, addr string, out io.Writer) error {
	if out == nil {
		out = os.Stderr
	}
	fmt.Fprintln(out, "Serving at http://localhost"+addr)
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.RedirectTrailingSlash = false
	r.Use(gin.LoggerWithWriter(out))
	r.Use(gin.Recovery())
	httpFs := afero.NewHttpFs(embedded)
	r.GET("/*filepath", func(c *gin.Context) {
		name := strings.TrimPrefix(c.Param("filepath"), "/")
		if name == "" {
			name = "index.html"
		}
		f, err := httpFs.Open(name)
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		defer f.Close()
		stat, err := f.Stat()
		if err != nil || stat.IsDir() {
			c.Status(http.StatusNotFound)
			return
		}
		ctype := contentTypeFor(name)
		c.Header("Content-Type", ctype)
		c.Status(http.StatusOK)
		io.Copy(c.Writer, f)
	})
	return r.Run(addr)
}

func runConvert(osFs afero.Fs, embedded afero.Fs, filePath string, out io.Writer) error {
	content, err := afero.ReadFile(osFs, filePath)
	if err != nil {
		return fmt.Errorf("read %s: %w", filePath, err)
	}
	converterJS, err := afero.ReadFile(embedded, "dist/converter.js")
	if err != nil {
		return fmt.Errorf("read embedded converter: %w", err)
	}
	result, err := app.Convert(string(content), string(converterJS))
	if err != nil {
		return err
	}
	fmt.Fprintln(out, result)
	return nil
}

func runConvertStdin(embedded afero.Fs, in io.Reader, out io.Writer) error {
	content, err := io.ReadAll(in)
	if err != nil {
		return fmt.Errorf("read stdin: %w", err)
	}
	converterJS, err := afero.ReadFile(embedded, "dist/converter.js")
	if err != nil {
		return fmt.Errorf("read embedded converter: %w", err)
	}
	result, err := app.Convert(string(content), string(converterJS))
	if err != nil {
		return err
	}
	fmt.Fprintln(out, result)
	return nil
}

// doMain runs the CLI. All filesystem access goes through the provided afero Fs (osFs for
// file paths, embedded for static/converter assets). Returns exit code (0 or 1).
func doMain(args []string, stdin io.Reader, stdout, stderr io.Writer, osFs afero.Fs, embedded afero.Fs) int {
	rootCmd := &cobra.Command{
		Use:   "mermaid2tgf [file]",
		Short: "Convert between Mermaid flowchart and TGF",
		Long:  "With no args or a file path: read Mermaid or TGF and print the conversion. Use the 'serve' subcommand to run the embedded web UI.",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			in := cmd.InOrStdin()
			out := cmd.OutOrStdout()
			if len(args) == 0 {
				return runConvertStdin(embedded, in, out)
			}
			return runConvert(osFs, embedded, args[0], out)
		},
	}
	rootCmd.SilenceUsage = true
	rootCmd.SilenceErrors = true

	serveCmd := &cobra.Command{
		Use:   "serve",
		Short: "Serve the embedded web UI",
		RunE: func(cmd *cobra.Command, args []string) error {
			port, _ := cmd.Flags().GetString("port")
			if port == "" {
				port = "9876"
			}
			return runServe(embedded, ":"+port, cmd.ErrOrStderr())
		},
	}
	serveCmd.SilenceUsage = true
	serveCmd.SilenceErrors = true
	serveCmd.Flags().StringP("port", "p", "9876", "port to listen on")

	rootCmd.AddCommand(serveCmd)
	rootCmd.SetArgs(args)
	rootCmd.SetIn(stdin)
	rootCmd.SetOut(stdout)
	rootCmd.SetErr(stderr)

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}

func main() {
	if BuildSHA == "(devel)" {
		if s := os.Getenv("BUILD_SHA"); s != "" {
			BuildSHA = s
		}
	}
	embedded, err := buildEmbeddedFS()
	if err != nil {
		fmt.Fprintln(os.Stderr, "init embedded fs:", err)
		os.Exit(1)
	}
	os.Exit(doMain(os.Args[1:], os.Stdin, os.Stdout, os.Stderr, afero.NewOsFs(), embedded))
}

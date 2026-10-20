package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/text/encoding/simplifiedchinese"
)

// ---------- types ----------

type Format struct {
	ID         string  `json:"id"`
	Ext        string  `json:"ext"`
	Resolution string  `json:"resolution"`
	Fps        float64 `json:"fps"`
	FilesizeMB float64 `json:"filesizeMb"`
	Vcodec     string  `json:"vcodec"`
	Acodec     string  `json:"acodec"`
}

type Meta struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Uploader   string   `json:"uploader"`
	Duration   float64  `json:"duration"`
	Thumbnail  string   `json:"thumbnail"`
	WebpageURL string   `json:"webpageUrl"`
	Extractor  string   `json:"extractor"`
	IsPlaylist bool     `json:"isPlaylist"`
	Entries    []*Meta  `json:"entries,omitempty"`
	Formats    []Format `json:"formats"`
}

type Progress struct {
	TaskID     string  `json:"taskId"`
	Status     string  `json:"status"` // downloading | processing | finished | error | canceled
	Percent    float64 `json:"percent"`
	Speed      string  `json:"speed"`
	Eta        string  `json:"eta"`
	TotalMB    float64 `json:"totalMb"`
	Downloaded float64 `json:"downloadedMb"`
	Filename   string  `json:"filename"`
	Dir        string  `json:"dir"`
	Filepath   string  `json:"filepath"`
	Error      string  `json:"error,omitempty"`
}

type taskHandle struct {
	cancel context.CancelFunc
}

// App is the application struct.
type App struct {
	ctx   context.Context
	mu    sync.Mutex
	tasks map[string]*taskHandle
	parses map[string]*taskHandle
	engine  map[string]interface{}
	ytdlp   string // active engine binary
	managed string // AppData location used for updates
	cfg     appConfig
	binDir  string
	tmpDir  string // private temp for engine children (PyInstaller extraction)
	proxy   string
}

type appConfig struct {
	EnginePath string `json:"enginePath"`
}

func (a *App) configPath() string {
	if appData, err := os.UserConfigDir(); err == nil {
		return filepath.Join(appData, "OpenGrab", "config.json")
	}
	return "config.json"
}

func (a *App) loadConfig() {
	if b, err := os.ReadFile(a.configPath()); err == nil {
		_ = json.Unmarshal(b, &a.cfg)
	}
}

func (a *App) saveConfig() {
	if b, err := json.MarshalIndent(a.cfg, "", "  "); err == nil {
		_ = os.WriteFile(a.configPath(), b, 0o644)
	}
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// ---------- lifecycle ----------

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.tasks = map[string]*taskHandle{}
	a.parses = map[string]*taskHandle{}
	if appData, err := os.UserConfigDir(); err == nil {
		a.binDir = filepath.Join(appData, "OpenGrab", "bin")
	} else {
		a.binDir = "bin"
	}
	_ = os.MkdirAll(a.binDir, 0o755)
	a.tmpDir = filepath.Join(filepath.Dir(a.binDir), "tmp")
	_ = os.MkdirAll(a.tmpDir, 0o755)
	a.managed = filepath.Join(a.binDir, "yt-dlp.exe")
	a.loadConfig()
	// engine precedence: bundled next to exe > user-selected path > managed AppData copy
	a.ytdlp = a.managed
	bundled := filepath.Join(filepath.Dir(os.Args[0]), "yt-dlp.exe")
	if _, err := os.Stat(bundled); err == nil {
		a.ytdlp = bundled
	} else if a.cfg.EnginePath != "" {
		if _, err := os.Stat(a.cfg.EnginePath); err == nil {
			a.ytdlp = a.cfg.EnginePath
		}
	}
	// detect engine once in the background at startup, so the settings page
	// can show the cached status without re-running yt-dlp on every visit
	go a.refreshEngineStatus()
}

func (a *App) refreshEngineStatus() {
	cmd := exec.Command(a.ytdlp, "--version")
	hideWindow(cmd)
	out, err := cmd.Output()
	ver := strings.TrimSpace(fixEncoding(string(out)))
	if err != nil {
		a.debugLog(fmt.Sprintf("engine check failed: ytdlp=%q err=%v out=%q", a.ytdlp, err, ver))
	} else {
		a.debugLog(fmt.Sprintf("engine check ok: ytdlp=%q version=%q", a.ytdlp, ver))
	}
	a.mu.Lock()
	a.engine = map[string]interface{}{
		"ok":      err == nil,
		"path":    a.ytdlp,
		"version": ver,
	}
	st := a.engine
	a.mu.Unlock()
	runtime.EventsEmit(a.ctx, "engine:status", st)
}

// ---------- engine management ----------

// EngineStatus reports the cached engine status; it only runs yt-dlp when no
// cached status exists yet.
func (a *App) EngineStatus() map[string]interface{} {
	a.mu.Lock()
	st := a.engine
	a.mu.Unlock()
	if st != nil {
		return st
	}
	a.refreshEngineStatus()
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.engine
}

// installEngine downloads the latest yt-dlp.exe into the managed AppData
// location and switches the active engine to it.
func (a *App) installEngine() (string, error) {
	_ = os.MkdirAll(a.binDir, 0o755)
	tmp := a.managed + ".tmp"
	if err := downloadFile("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", tmp, a.proxy); err != nil {
		return "", err
	}
	_ = os.Remove(a.managed)
	if err := os.Rename(tmp, a.managed); err != nil {
		return "", err
	}
	a.ytdlp = a.managed
	return a.managed, nil
}

// SelectEngine lets the user pick an existing yt-dlp.exe via a native file
// dialog, validates it, and remembers the choice.
func (a *App) SelectEngine() (map[string]interface{}, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 yt-dlp.exe",
		Filters: []runtime.FileFilter{
			{DisplayName: "yt-dlp.exe (*.exe)", Pattern: "*.exe"},
		},
	})
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, errors.New("未选择文件")
	}
	cmd := exec.Command(path, "--version")
	hideWindow(cmd)
	if out, err := cmd.Output(); err != nil {
		return nil, fmt.Errorf("所选文件无法运行（%v）：%s", err, strings.TrimSpace(fixEncoding(string(out))))
	}
	a.ytdlp = path
	a.cfg.EnginePath = path
	a.saveConfig()
	a.refreshEngineStatus()
	return a.EngineStatus(), nil
}

// OpenEngineDownloadPage opens the official yt-dlp download in the browser.
func (a *App) OpenEngineDownloadPage() {
	runtime.BrowserOpenURL(a.ctx, "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
}

// ensureEngineAvailable returns a friendly error when no engine is configured.
func (a *App) ensureEngineAvailable() error {
	if _, err := os.Stat(a.ytdlp); err == nil {
		return nil
	}
	return errors.New("未找到下载引擎：请在 设置 中选择 yt-dlp.exe，或点击“官方下载”后自行选择")
}

// UpdateEngine replaces yt-dlp.exe with the latest release.
func (a *App) UpdateEngine() (string, error) {
	if _, err := a.installEngine(); err != nil {
		return "", err
	}
	a.refreshEngineStatus()
	return a.ytdlp, nil
}

// SetProxy sets an optional HTTP proxy for engine download, parsing and downloads.
func (a *App) SetProxy(p string) {
	a.proxy = strings.TrimSpace(p)
}

// ---------- parsing ----------

var urlRe = regexp.MustCompile(`https?://[^\s"'<>]+`)

// fixEncoding converts yt-dlp output to UTF-8: if the bytes are not valid
// UTF-8 they are almost certainly GBK (Windows console codepage), so decode them.
func fixEncoding(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	if out, err := simplifiedchinese.GBK.NewDecoder().Bytes([]byte(s)); err == nil {
		return string(out)
	}
	return s
}

// hideWindow makes a child process run without a flashing console window.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}

// registerParse tracks a cancellable parse operation under parseID.
func (a *App) registerParse(parseID string) (context.Context, func()) {
	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	if old, ok := a.parses[parseID]; ok {
		old.cancel()
	}
	a.parses[parseID] = &taskHandle{cancel: cancel}
	a.mu.Unlock()
	return ctx, func() {
		a.mu.Lock()
		delete(a.parses, parseID)
		a.mu.Unlock()
		cancel()
	}
}

// CancelParse cancels a running parse (e.g. when the network is too slow).
func (a *App) CancelParse(parseID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if h, ok := a.parses[parseID]; ok {
		h.cancel()
	}
}

// cleanInput removes invisible characters that can break URL detection.
func cleanInput(raw string) string {
	r := strings.Map(func(rr rune) rune {
		if rr == 0xFEFF || rr == 0x200B || rr == 0x200C || rr == 0x200D || rr == 0x00A0 {
			return ' '
		}
		return rr
	}, raw)
	return strings.TrimSpace(r)
}

// ParseURL analyzes one link (video or whole playlist). parseID allows cancellation.
func (a *App) ParseURL(parseID, raw string) (*Meta, error) {
	raw = fixEncoding(raw)
	input := cleanInput(raw)
	urls := urlRe.FindAllString(input, -1)
	if len(urls) == 0 {
		// schemeless fallback: "www.example.com/..." or "example.com/..."
		bare := regexp.MustCompile(`\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:/\S*)?`).FindAllString(input, -1)
		for _, b := range bare {
			urls = append(urls, "https://"+strings.TrimPrefix(b, "https://"))
		}
	}
	if len(urls) == 0 {
		a.debugLog(fmt.Sprintf("ParseURL no link found; parseID=%q rawLen=%d rawHex=%x", parseID, len(raw), raw))
		return nil, errors.New("未识别到链接，请检查输入是否包含完整的网址（例如 https://...）")
	}
	ctx, done := a.registerParse(parseID)
	defer done()
	return a.parseOne(ctx, urls[0], true, false)
}

// debugLog appends a diagnostic line to %APPDATA%\OpenGrab\debug.log
func (a *App) debugLog(msg string) {
	if appData, err := os.UserConfigDir(); err == nil {
		f := filepath.Join(appData, "OpenGrab", "debug.log")
		_ = os.MkdirAll(filepath.Dir(f), 0o755)
		_ = os.WriteFile(f, []byte(time.Now().Format(time.RFC3339)+" "+msg+"\n"), 0o644)
	}
}

// ParsePlaylist analyzes a playlist / channel / profile URL and returns its
// entries (fully resolved: titles, durations, thumbnails) for batch
// downloading. parseID allows cancellation.
func (a *App) ParsePlaylist(parseID, raw string) (*Meta, error) {
	raw = fixEncoding(raw)
	urls := urlRe.FindAllString(cleanInput(raw), -1)
	if len(urls) == 0 {
		return nil, errors.New("未识别到链接，请检查输入是否包含完整的网址（例如 https://...）")
	}
	ctx, done := a.registerParse(parseID)
	defer done()
	return a.parseOne(ctx, urls[0], false, false)
}

type BatchResult struct {
	Metas []*Meta  `json:"metas"`
	Fails []string `json:"fails"`
}

// ParseBatch analyzes many links concurrently. parseID allows cancellation.
func (a *App) ParseBatch(parseID, raw string) (*BatchResult, error) {
	raw = fixEncoding(raw)
	seen := map[string]bool{}
	uniq := []string{}
	for _, u := range urlRe.FindAllString(cleanInput(raw), -1) {
		if !seen[u] {
			seen[u] = true
			uniq = append(uniq, u)
		}
	}
	if len(uniq) == 0 {
		return nil, errors.New("未识别到链接，请检查输入是否包含完整的网址（例如 https://...）")
	}
	var (
		mu    sync.Mutex
		metas []*Meta
		fails []string
		wg    sync.WaitGroup
	)
	sem := make(chan struct{}, 4)
	for _, u := range uniq {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			c, d := a.registerParse(parseID + "|" + u)
			defer d()
			m, err := a.parseOne(c, u, false, true)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				fails = append(fails, u+" — "+err.Error())
			} else {
				metas = append(metas, m)
			}
		}(u)
	}
	wg.Wait()
	if metas == nil {
		metas = []*Meta{}
	}
	if fails == nil {
		fails = []string{}
	}
	return &BatchResult{Metas: metas, Fails: fails}, nil
}

func (a *App) parseOne(ctx context.Context, link string, noPlaylist, flatPlaylist bool) (*Meta, error) {
	if err := a.ensureEngineAvailable(); err != nil {
		return nil, err
	}
	args := []string{"-J", "--no-warnings"}
	if noPlaylist {
		args = append(args, "--no-playlist")
	}
	if flatPlaylist {
		args = append(args, "--flat-playlist")
	}
	args = append(args, link)

	var (
		out []byte
		err error
	)
	runErr := engineAttempt(func() error {
		c, cancel := context.WithTimeout(ctx, 180*time.Second)
		defer cancel()
		cmd := exec.CommandContext(c, a.ytdlp, args...)
		cmd.Env = a.env()
		hideWindow(cmd)
		out, err = cmd.Output()
		if err != nil {
			if c.Err() == context.Canceled {
				return errCanceled
			}
			if ee, ok := err.(*exec.ExitError); ok && len(ee.Stderr) > 0 {
				return errors.New(firstLine(fixEncoding(string(ee.Stderr))))
			}
			return err
		}
		return nil
	})
	if runErr != nil {
		if runErr == errCanceled {
			return nil, errors.New("已取消")
		}
		return nil, runErr
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}
	if t, _ := raw["_type"].(string); t == "playlist" {
		m := &Meta{
			Title:      str(raw, "title"),
			Uploader:   str(raw, "channel"),
			WebpageURL: str(raw, "webpage_url"),
			Extractor:  str(raw, "extractor_key"),
			IsPlaylist: true,
		}
		if ents, ok := raw["entries"].([]interface{}); ok {
			for _, e := range ents {
				if em, ok := e.(map[string]interface{}); ok {
					m.Entries = append(m.Entries, metaFrom(em))
				}
			}
		}
		return m, nil
	}
	return metaFrom(raw), nil
}

func metaFrom(raw map[string]interface{}) *Meta {
	m := &Meta{
		ID:         str(raw, "id"),
		Title:      str(raw, "title"),
		Uploader:   str(raw, "uploader"),
		Duration:   num(raw, "duration"),
		Thumbnail:  str(raw, "thumbnail"),
		WebpageURL: str(raw, "webpage_url"),
		Extractor:  str(raw, "extractor_key"),
	}
	if fs, ok := raw["formats"].([]interface{}); ok {
		for _, f := range fs {
			fm, ok := f.(map[string]interface{})
			if !ok {
				continue
			}
			m.Formats = append(m.Formats, Format{
				ID:         str(fm, "format_id"),
				Ext:        str(fm, "ext"),
				Resolution: pickRes(fm),
				Fps:        num(fm, "fps"),
				FilesizeMB: (num(fm, "filesize") + num(fm, "filesize_approx")) / 1024 / 1024,
				Vcodec:     str(fm, "vcodec"),
				Acodec:     str(fm, "acodec"),
			})
		}
	}
	return m
}

func pickRes(fm map[string]interface{}) string {
	if s := str(fm, "resolution"); s != "" && s != "audio only" {
		return s
	}
	if h := num(fm, "height"); h > 0 {
		return fmt.Sprintf("%dp", int(h))
	}
	return "audio"
}

func (a *App) env() []string {
	e := os.Environ()
	// yt-dlp is a PyInstaller onefile exe: it unpacks python310.dll into %TEMP%.
	// Some machines have a broken-ACL user Temp dir, which makes the DLL fail to
	// load ("PYI-24804"). Point every engine child at our own private temp dir.
	e = append(e, "TMP="+a.tmpDir, "TEMP="+a.tmpDir)
	// force UTF-8 so filenames are not mojibake on Windows
	e = append(e, "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	if a.proxy != "" {
		e = append(e, "HTTP_PROXY="+a.proxy, "HTTPS_PROXY="+a.proxy)
	}
	return e
}

// engineAttempt runs fn and retries once when yt-dlp fails with the PyInstaller
// "Failed to load Python DLL" bootstrap error (flaky temp-dir extraction).
func engineAttempt(fn func() error) error {
	err := fn()
	if err != nil && strings.Contains(err.Error(), "PYI-") {
		time.Sleep(time.Second)
		err = fn()
	}
	return err
}

var errCanceled = errors.New("canceled")

func str(m map[string]interface{}, k string) string {
	if v, ok := m[k]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func num(m map[string]interface{}, k string) float64 {
	if v, ok := m[k]; ok {
		if f, ok := v.(float64); ok {
			return f
		}
	}
	return 0
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		s = s[:i]
	}
	return s
}

// ---------- downloading ----------

// StartDownload begins a download task and streams progress via events.
func (a *App) StartDownload(taskID, link, formatSel, dir string) error {
	if err := a.ensureEngineAvailable(); err != nil {
		return err
	}
	if dir == "" {
		dir = filepath.Join(homeDir(), "Downloads", "OpenGrab")
	}
	_ = os.MkdirAll(dir, 0o755)

	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	if old, ok := a.tasks[taskID]; ok {
		old.cancel()
	}
	a.tasks[taskID] = &taskHandle{cancel: cancel}
	a.mu.Unlock()

	args := []string{
		"--newline", "--no-playlist", "--windows-filenames",
		"--print", "after_move:filepath",
		"-o", filepath.Join(dir, "%(title).150B.%(ext)s"),
	}
	if formatSel != "" {
		args = append(args, "-f", formatSel)
	}
	args = append(args, link)
	cmd := exec.CommandContext(ctx, a.ytdlp, args...)
	cmd.Env = a.env()
	hideWindow(cmd)
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return err
	}

	emit := func(p Progress) { runtime.EventsEmit(a.ctx, "download:progress", p) }
	emit(Progress{TaskID: taskID, Status: "downloading", Dir: dir})

	go func() {
		sc := bufio.NewScanner(stdout)
		sc.Buffer(make([]byte, 1024*1024), 1024*1024)
		re := regexp.MustCompile(`\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)(\w+).*?at\s+([\d.]+\s*\S*/s|Unknown)`)
		pathRe := regexp.MustCompile(`^[A-Za-z]:[\\/]`)
		for sc.Scan() {
			line := fixEncoding(strings.TrimSpace(sc.Text()))
			if pathRe.MatchString(line) {
				// final file path printed by --print after_move:filepath
				emit(Progress{TaskID: taskID, Status: "downloading", Dir: filepath.Dir(line), Filepath: line, Filename: filepath.Base(line)})
				continue
			}
			if dest := afterMarker(line, "[download] Destination: "); dest != "" {
				emit(Progress{TaskID: taskID, Status: "downloading", Filename: filepath.Base(dest)})
				continue
			}
			if m := re.FindStringSubmatch(line); m != nil {
				pct, _ := strconv.ParseFloat(m[1], 64)
				total, _ := strconv.ParseFloat(m[2], 64)
				totalMB := unitMB(total, m[3])
				eta := ""
				if i := strings.Index(line, "ETA "); i >= 0 {
					eta = strings.TrimSpace(line[i+4:])
				}
				emit(Progress{
					TaskID: taskID, Status: "downloading", Percent: pct,
					Speed: m[4], Eta: eta, TotalMB: totalMB,
					Downloaded: totalMB * pct / 100,
				})
				continue
			}
			if strings.HasPrefix(line, "[Merger]") || strings.HasPrefix(line, "[ExtractAudio]") || strings.HasPrefix(line, "[VideoRemuxer]") {
				emit(Progress{TaskID: taskID, Status: "processing"})
			}
		}
	}()

	go func() {
		errBytes, _ := io.ReadAll(stderr)
		err := cmd.Wait()
		a.mu.Lock()
		delete(a.tasks, taskID)
		a.mu.Unlock()
		switch {
		case ctx.Err() == context.Canceled:
			emit(Progress{TaskID: taskID, Status: "canceled"})
		case err != nil:
			emit(Progress{TaskID: taskID, Status: "error", Error: firstLine(string(errBytes))})
		default:
			emit(Progress{TaskID: taskID, Status: "finished"})
		}
	}()
	return nil
}

// CancelDownload cancels a running task.
func (a *App) CancelDownload(taskID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if h, ok := a.tasks[taskID]; ok {
		h.cancel()
	}
}

// PickDirectory opens a native folder selection dialog and returns the chosen path.
func (a *App) PickDirectory() (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择下载目录",
	})
	if err != nil {
		return "", err
	}
	return dir, nil
}

// OpenFolder reveals a folder in Windows Explorer.
func (a *App) OpenFolder(path string) {
	_ = exec.Command("explorer", path).Start()
}

// RevealFile opens the folder containing the file with the file selected,
// using the documented SHOpenFolderAndSelectItems API.
func (a *App) RevealFile(path string) {
	a.debugLog(fmt.Sprintf("RevealFile called with %q", path))
	p := filepath.Clean(strings.ReplaceAll(strings.TrimSpace(path), "/", `\`))
	if _, err := os.Stat(p); err != nil {
		a.debugLog(fmt.Sprintf("RevealFile stat failed: %v", err))
		// fall back to opening the nearest existing ancestor
		d := filepath.Dir(p)
		for d != filepath.Dir(d) {
			if _, err2 := os.Stat(d); err2 == nil {
				_ = exec.Command("explorer", d).Start()
				return
			}
			d = filepath.Dir(d)
		}
		return
	}
	if err := revealInExplorer(p); err != nil {
		a.debugLog(fmt.Sprintf("RevealFile API failed (%v), falling back to folder open", err))
		_ = exec.Command("explorer", filepath.Dir(p)).Start()
	} else {
		a.debugLog(fmt.Sprintf("RevealFile selected %q", p))
	}
}

// ---------- win32 helpers for reveal ----------

var (
	ole32   = syscall.NewLazyDLL("ole32.dll")
	shell32 = syscall.NewLazyDLL("shell32.dll")

	procCoInitialize              = ole32.NewProc("CoInitialize")
	procILCreateFromPathW         = shell32.NewProc("ILCreateFromPathW")
	procSHOpenFolderAndSelectItem = shell32.NewProc("SHOpenFolderAndSelectItems")
	procILFree                    = shell32.NewProc("ILFree")
)

// revealInExplorer opens an Explorer window with the given file selected.
func revealInExplorer(path string) error {
	p16, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	procCoInitialize.Call(0)
	pidl, _, _ := procILCreateFromPathW.Call(uintptr(unsafe.Pointer(p16)))
	if pidl == 0 {
		return errors.New("ILCreateFromPathW returned null")
	}
	defer procILFree.Call(pidl)
	hr, _, _ := procSHOpenFolderAndSelectItem.Call(pidl, 0, 0, 0)
	if hr != 0 {
		return fmt.Errorf("SHOpenFolderAndSelectItems HRESULT 0x%x", int32(hr))
	}
	return nil
}

// ---------- helpers ----------

func unitMB(v float64, unit string) float64 {
	switch strings.ToLower(strings.TrimSpace(unit)) {
	case "b":
		return v / 1024 / 1024
	case "kib", "kb", "k":
		return v / 1024
	case "gib", "gb", "g":
		return v * 1024
	case "tib", "tb":
		return v * 1024 * 1024
	default: // mib / mb
		return v
	}
}

func afterMarker(line, marker string) string {
	if strings.HasPrefix(line, marker) {
		return strings.TrimSpace(line[len(marker):])
	}
	return ""
}

func homeDir() string {
	if h, err := os.UserHomeDir(); err == nil {
		return h
	}
	return "."
}

func downloadFile(rawURL, dest, proxy string) error {
	client := &http.Client{Timeout: 15 * time.Minute}
	if proxy != "" {
		if pu, err := url.Parse(proxy); err == nil {
			client.Transport = &http.Transport{Proxy: http.ProxyURL(pu)}
		}
	}
	resp, err := client.Get(rawURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

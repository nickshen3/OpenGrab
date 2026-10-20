package main

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

func webviewDataDir() string {
	if appData, err := os.UserConfigDir(); err == nil {
		return filepath.Join(appData, "OpenGrab", "webview")
	}
	return filepath.Join(".", "webview-data")
}

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "OpenGrab",
		Width:  1200,
		Height: 800,
		MinWidth: 960,
		MinHeight: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Windows: &windows.Options{
			WebviewUserDataPath: webviewDataDir(),
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		msg := "Error: " + err.Error()
		println(msg)
		_ = os.WriteFile(filepath.Join(os.TempDir(), "opengrab-error.log"), []byte(msg+"\n"+string(debug.Stack())), 0o644)
		os.Exit(1)
	}
}

func init() {
	// capture panics to a log file so GUI failures are diagnosable
	_logPanic := func() {
		if r := recover(); r != nil {
			_ = os.WriteFile(filepath.Join(os.TempDir(), "opengrab-panic.log"), []byte(fmt.Sprint(r)+"\n"+string(debug.Stack())), 0o644)
			panic(r)
		}
	}
	_ = _logPanic
}

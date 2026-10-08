package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"github.com/jchv/go-webview2"
)

// PulseTerm Native Windows Portable Desktop Application
// - Bundled runtime (Python embedded + site-packages)
// - Native Edge WebView2 container with persistent state/profile
// - Auto-start backend service on launch
// - Auto-stop & cleanup backend process on window close / exit
// - Windows PE32+ Resource embedded icon & modern PerMonitorV2 manifest
// - Dynamic DWM Window Border & Titlebar theme synchronization
// - Full WM_SETICON window titlebar & taskbar icon synchronization

const defaultPort = 3000

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	dwmapi               = syscall.NewLazyDLL("dwmapi.dll")
	procDwmSetAttribute  = dwmapi.NewProc("DwmSetWindowAttribute")
	procSendMessageW     = user32.NewProc("SendMessageW")
	procLoadImageW       = user32.NewProc("LoadImageW")
	procGetSystemMetrics = user32.NewProc("GetSystemMetrics")
	procGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")
)

const (
	DWMWA_USE_IMMERSIVE_DARK_MODE = 20
	DWMWA_BORDER_COLOR            = 34
	DWMWA_CAPTION_COLOR           = 35
	DWMWA_TEXT_COLOR              = 36

	WM_SETICON = 0x0080
	ICON_SMALL = 0
	ICON_BIG   = 1

	IMAGE_ICON     = 1
	LR_SHARED      = 0x8000
	LR_LOADFROMFILE = 0x0010

	SM_CXICON   = 11
	SM_CYICON   = 12
	SM_CXSMICON = 49
	SM_CYSMICON = 50
)

func setWindowIcons(hwnd uintptr, baseDir string) {
	hMod, _, _ := procGetModuleHandleW.Call(0)

	cxSm, _, _ := procGetSystemMetrics.Call(SM_CXSMICON)
	cySm, _, _ := procGetSystemMetrics.Call(SM_CYSMICON)
	cxLg, _, _ := procGetSystemMetrics.Call(SM_CXICON)
	cyLg, _, _ := procGetSystemMetrics.Call(SM_CYICON)

	// Attempt 1: Load from embedded PE Resource ID 2 (RT_GROUP_ICON)
	hIconSm, _, _ := procLoadImageW.Call(hMod, 2, IMAGE_ICON, cxSm, cySm, LR_SHARED)
	hIconLg, _, _ := procLoadImageW.Call(hMod, 2, IMAGE_ICON, cxLg, cyLg, LR_SHARED)

	// Attempt 2: Fallback to assets/app.ico if resource handle is null
	if hIconSm == 0 || hIconLg == 0 {
		icoPath := filepath.Join(baseDir, "assets", "app.ico")
		if _, err := os.Stat(icoPath); err == nil {
			icoPtr, _ := syscall.UTF16PtrFromString(icoPath)
			if hIconSm == 0 {
				hIconSm, _, _ = procLoadImageW.Call(0, uintptr(unsafe.Pointer(icoPtr)), IMAGE_ICON, cxSm, cySm, LR_LOADFROMFILE)
			}
			if hIconLg == 0 {
				hIconLg, _, _ = procLoadImageW.Call(0, uintptr(unsafe.Pointer(icoPtr)), IMAGE_ICON, cxLg, cyLg, LR_LOADFROMFILE)
			}
		}
	}

	// Send WM_SETICON messages to native window
	if hIconSm != 0 {
		_, _, _ = procSendMessageW.Call(hwnd, WM_SETICON, ICON_SMALL, hIconSm)
	}
	if hIconLg != 0 {
		_, _, _ = procSendMessageW.Call(hwnd, WM_SETICON, ICON_BIG, hIconLg)
	}
}

func setWindowTheme(hwnd uintptr, r, g, b byte, isDark bool) {
	if procDwmSetAttribute == nil || procDwmSetAttribute.Find() != nil {
		return
	}
	// COLORREF: 0x00BBGGRR
	color := uint32(r) | (uint32(g) << 8) | (uint32(b) << 16)

	darkVal := int32(0)
	if isDark {
		darkVal = 1
	}
	_, _, _ = procDwmSetAttribute.Call(
		hwnd,
		uintptr(DWMWA_USE_IMMERSIVE_DARK_MODE),
		uintptr(unsafe.Pointer(&darkVal)),
		unsafe.Sizeof(darkVal),
	)

	// Border color (Windows 11 build 22000+)
	_, _, _ = procDwmSetAttribute.Call(
		hwnd,
		uintptr(DWMWA_BORDER_COLOR),
		uintptr(unsafe.Pointer(&color)),
		unsafe.Sizeof(color),
	)

	// Caption/titlebar color (Windows 11 build 22000+)
	_, _, _ = procDwmSetAttribute.Call(
		hwnd,
		uintptr(DWMWA_CAPTION_COLOR),
		uintptr(unsafe.Pointer(&color)),
		unsafe.Sizeof(color),
	)
}

func isPortListening(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 300*time.Millisecond)
	if err == nil {
		_ = conn.Close()
		return true
	}
	return false
}

func waitForServer(port int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://127.0.0.1:%d/api/health", port)
	client := http.Client{Timeout: 500 * time.Millisecond}

	for time.Now().Before(deadline) {
		if isPortListening(port) {
			resp, err := client.Get(url)
			if err == nil {
				_ = resp.Body.Close()
				if resp.StatusCode == 200 {
					return true
				}
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return false
}

func findPythonBinary(baseDir string) string {
	candidates := []string{
		filepath.Join(baseDir, "runtime", "python.exe"),
		filepath.Join(baseDir, "venv", "Scripts", "python.exe"),
		filepath.Join(baseDir, "python", "python.exe"),
		filepath.Join(baseDir, ".venv", "Scripts", "python.exe"),
	}

	for _, cand := range candidates {
		if _, err := os.Stat(cand); err == nil {
			return cand
		}
	}

	// Fallback to system PATH
	if p, err := exec.LookPath("python.exe"); err == nil {
		return p
	}
	if p, err := exec.LookPath("python"); err == nil {
		return p
	}

	return ""
}

func startBackendServer(baseDir, pythonExe string) (*exec.Cmd, error) {
	backendMain := filepath.Join(baseDir, "backend", "main.py")
	if _, err := os.Stat(backendMain); err != nil {
		return nil, fmt.Errorf("backend entrypoint not found at %s", backendMain)
	}

	cmd := exec.Command(pythonExe, backendMain)
	cmd.Dir = baseDir

	// Hide backend process console completely in Windows
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}

	// Portable environment settings
	env := os.Environ()
	env = append(env, fmt.Sprintf("APP_PORT=%d", defaultPort))
	env = append(env, "APP_HOST=127.0.0.1")
	env = append(env, fmt.Sprintf("PYTHONPATH=%s", filepath.Join(baseDir, "runtime", "site-packages")))
	cmd.Env = env

	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd, nil
}

func stopBackendServer(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	// Terminate backend process cleanly
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
}

func main() {
	exePath, err := os.Executable()
	if err != nil {
		exePath = os.Args[0]
	}
	baseDir := filepath.Dir(exePath)

	targetUrl := fmt.Sprintf("http://127.0.0.1:%d", defaultPort)

	var backendCmd *exec.Cmd
	weStartedBackend := false

	// 1. Check if backend is already listening; if not, spawn bundled backend
	if !isPortListening(defaultPort) {
		py := findPythonBinary(baseDir)
		if py != "" {
			cmd, err := startBackendServer(baseDir, py)
			if err == nil {
				backendCmd = cmd
				weStartedBackend = true
				// Wait for server health
				waitForServer(defaultPort, 8*time.Second)
			}
		}
	}

	// Clean up backend process on application exit
	defer func() {
		if weStartedBackend && backendCmd != nil {
			stopBackendServer(backendCmd)
		}
	}()

	// 2. Initialize Edge WebView2 window
	userDataDir := filepath.Join(baseDir, "data", "webview2")
	_ = os.MkdirAll(userDataDir, 0755)

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  "PulseTerm // Minimalist TUI Audio Player",
			Width:  1280,
			Height: 820,
			IconId: 2, // RT_GROUP_ICON resource ID generated by rsrc
			Center: true,
		},
		DataPath: userDataDir,
	})

	if w != nil {
		defer w.Destroy()
		hwnd := uintptr(w.Window())

		// Explicitly send WM_SETICON for small (titlebar) and big (alt-tab / taskbar) icons
		w.Dispatch(func() {
			setWindowIcons(hwnd, baseDir)
			setWindowTheme(hwnd, 0x06, 0x09, 0x06, true)
		})

		// Expose bridge function for frontend theme changes
		_ = w.Bind("setNativeWindowTheme", func(r, g, b int, isDark bool) {
			w.Dispatch(func() {
				setWindowTheme(hwnd, byte(r), byte(g), byte(b), isDark)
			})
		})

		w.SetTitle("PulseTerm // Minimalist TUI Audio Player")
		w.SetSize(1280, 820, webview2.HintNone)
		w.Navigate(targetUrl)
		w.Run()
	} else {
		// Fallback in case WebView2 runtime is absent on older Windows versions
		launchBrowserFallback(targetUrl)
		if weStartedBackend && backendCmd != nil {
			select {}
		}
	}

	runtime.GC()
}

func launchBrowserFallback(targetUrl string) {
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", targetUrl).Start()
}

import Cocoa
import WebKit
import Carbon.HIToolbox
import UserNotifications

// Native macOS shell for the "DSH 装备版" bundle (dsh-upgrade-kit).
// - AppKit window + WKWebView rendering the local DSH web UI
// - first-run wizard: paste DeepSeek API key → init home + LaunchAgents → start
// - own Dock identity, status-bar item, global hotkey (Opt+Shift+Space)
// - single instance; auto-kicks the LaunchAgent if the server is down

let kDSHURL = URL(string: "http://127.0.0.1:3080")!
let kWebAgentLabel = "com.dsh-upgrade.dsh-web"

var gDelegate: AppDelegate?

private let hotKeyHandler: EventHandlerUPP = { _, _, _ -> OSStatus in
    DispatchQueue.main.async { gDelegate?.toggle() }
    return noErr
}

final class NotificationCenterDelegate: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        gDelegate?.showWindow()
        completionHandler()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var statusItem: NSStatusItem!
    var hotKeyRef: EventHotKeyRef?
    var serverTries = 0
    let notificationDelegate = NotificationCenterDelegate()

    // MARK: - lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        let bid = Bundle.main.bundleIdentifier ?? "com.piggy00544.dsh-upgrade-kit"
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: bid)
            .filter { $0 != NSRunningApplication.current }
        if !others.isEmpty {
            others.first?.activate(options: [.activateAllWindows])
            NSApp.terminate(nil)
            return
        }

        NSApp.setActivationPolicy(.regular)
        let center = UNUserNotificationCenter.current()
        center.delegate = notificationDelegate
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        buildMenu()
        buildWindow()
        buildStatusItem()
        registerHotKey()
        NSApp.activate(ignoringOtherApps: true)

        if isFirstRun() {
            showWelcome()
        } else {
            startServerCheck()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let ref = hotKeyRef { UnregisterEventHotKey(ref) }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    // MARK: - first run wizard

    func userHome() -> String {
        let fm = FileManager.default
        let base = fm.homeDirectoryForCurrentUser.path + "/Library/Application Support/DSH-Upgrade-Kit"
        return base
    }

    func isFirstRun() -> Bool {
        let home = userHome() + "/home"
        let creds = home + "/.credentials.yaml"
        guard FileManager.default.fileExists(atPath: creds) else { return true }
        guard let content = try? String(contentsOfFile: creds, encoding: .utf8) else { return true }
        // 已配置 = credentials 里有非空 key
        let keyLine = content.split(separator: "\n").first ?? ""
        return !keyLine.contains("sk-")
    }

    func showWelcome() {
        window.title = "DSH 装备版 · 开始"
        let html = welcomeHTML()
        webView.loadHTMLString(html, baseURL: nil)
    }

    func welcomeHTML() -> String {
        return """
        <!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,"PingFang SC",system-ui,sans-serif;background:#010102;color:#f7f8f8;
             display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}
        .card{max-width:520px;width:100%}
        .eyebrow{font-size:12px;letter-spacing:1.5px;color:#8a8f98;margin-bottom:14px}
        .eyebrow b{color:#5e6ad2}
        h1{font-size:30px;font-weight:600;letter-spacing:-0.8px;line-height:1.2;margin-bottom:12px}
        h1 span{color:#5e6ad2}
        .sub{font-size:14px;line-height:1.7;color:#d0d6e0;margin-bottom:24px}
        .kits{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:26px}
        .kit{font-size:12px;color:#d0d6e0;background:#141516;border:1px solid #23252a;border-radius:6px;padding:5px 10px}
        label{display:block;font-size:13px;color:#8a8f98;margin-bottom:8px}
        input{width:100%;background:#0f1011;border:1px solid #34343a;border-radius:8px;color:#f7f8f8;
              font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:11px 12px;margin-bottom:8px;outline:none}
        input:focus{border-color:#5e6ad2}
        .hint{font-size:12px;color:#62666d;line-height:1.6;margin-bottom:20px}
        .hint a{color:#5e6ad2;text-decoration:none}
        button{width:100%;background:#5e6ad2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;
               padding:12px;cursor:pointer}
        button:hover{background:#828fff}
        button:disabled{opacity:.5;cursor:default}
        .skip{display:block;text-align:center;margin-top:14px;font-size:12px;color:#62666d;text-decoration:none}
        .skip:hover{color:#8a8f98}
        .err{color:#f27d7d;font-size:12px;margin:6px 0 0;min-height:16px}
        </style></head><body>
        <div class="card">
          <div class="eyebrow"><b>DSH</b> 装备版 · 首次设置</div>
          <h1>填一个 key，<span>五件装备</span>全部就位</h1>
          <div class="sub">DeepSeek Harness 本体 + 费用面板 + 文件预览 + 外网搜集 + 视觉桥接 + 微信双向通道，已经全部打包好。只差你的 API key。</div>
          <div class="kits">
            <span class="kit">💰 费用面板</span><span class="kit">📄 文件预览</span>
            <span class="kit">🌐 外网搜集</span><span class="kit">👁 视觉桥接</span>
            <span class="kit">💬 微信双向通道</span>
          </div>
          <label for="key">DeepSeek API key</label>
          <input id="key" type="password" placeholder="sk-..." autocomplete="off">
          <div class="hint">在 <a href="#">platform.deepseek.com</a> 的「API keys」页面创建。<br>key 只写进本机配置（~/.config 权限 600），绝不上传。</div>
          <button id="go">开始使用</button>
          <div class="err" id="err"></div>
          <a class="skip" href="#" id="later">先跳过，稍后在设置里填</a>
        </div>
        <script>
        const keyInput = document.getElementById('key');
        const go = document.getElementById('go');
        const err = document.getElementById('err');
        function submit() {
          const key = keyInput.value.trim();
          if (!key.startsWith('sk-')) { err.textContent = 'key 格式看起来不对，应以 sk- 开头'; return; }
          go.disabled = true;
          err.textContent = '正在初始化，首次启动约需 1 分钟…';
          window.webkit.messageHandlers.saveKey.postMessage(key);
        }
        go.addEventListener('click', submit);
        keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        document.getElementById('later').addEventListener('click', (e) => {
          e.preventDefault();
          window.webkit.messageHandlers.saveKey.postMessage('');
        });
        document.querySelector('.hint a').addEventListener('click', (e) => {
          e.preventDefault();
          window.webkit.messageHandlers.openConsole.postMessage('platform');
        });
        </script></body></html>
        """
    }

    // WKScriptMessageHandler
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "openConsole" {
            if let url = URL(string: "https://platform.deepseek.com/api_keys") {
                NSWorkspace.shared.open(url)
            }
            return
        }
        guard message.name == "saveKey" else { return }
        let key = (message.body as? String) ?? ""
        DispatchQueue.global().async { [weak self] in
            self?.runFirstSetup(key: key)
        }
    }

    func runFirstSetup(key: String) {
        let setup = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/first-run.sh").path
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = [setup, key]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        try? proc.run()
        proc.waitUntilExit()
        DispatchQueue.main.async { [weak self] in
            self?.startServerCheck()
        }
    }

    // MARK: - UI construction

    func buildMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 DSH 装备版",
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
                        keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏 DSH 装备版",
                        action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "隐藏其他",
                                    action: #selector(NSApplication.hideOtherApplications(_:)),
                                    keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出 DSH 装备版",
                        action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "文件")
        fileMenu.addItem(withTitle: "重新加载", action: #selector(reload), keyEquivalent: "r")
        fileMenu.addItem(withTitle: "在浏览器中打开", action: #selector(openInBrowser), keyEquivalent: "")
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "重新运行设置向导", action: #selector(rerunWizard), keyEquivalent: "")
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "关闭窗口",
                         action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileMenuItem.submenu = fileMenu

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "拷贝", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化",
                           action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放",
                           action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenuItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = mainMenu
    }

    func buildWindow() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.add(self, name: "saveKey")
        config.userContentController.add(self, name: "openConsole")
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.uiDelegate = self
        wv.navigationDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        webView = wv

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "DSH 装备版"
        window.contentView = wv
        window.center()
        window.setFrameAutosaveName("DSHUpgradeMainWindow")
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 960, height: 620)
        window.makeKeyAndOrderFront(nil)
    }

    func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            let iconURL = Bundle.main.bundleURL
                .appendingPathComponent("Contents/Resources/AppIcon.icns")
            if let img = NSImage(contentsOf: iconURL) {
                img.size = NSSize(width: 17, height: 17)
                button.image = img
            } else {
                button.title = "DS"
            }
        }
        let menu = NSMenu()
        menu.addItem(withTitle: "显示 DSH 装备版", action: #selector(showWindow), keyEquivalent: "")
        menu.addItem(withTitle: "重新加载", action: #selector(reload), keyEquivalent: "")
        menu.addItem(withTitle: "在浏览器中打开", action: #selector(openInBrowser), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = menu
    }

    func registerHotKey() {
        let hotKeyID = EventHotKeyID(signature: OSType(0x4453_484B), id: 1) // 'DSHK'
        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(UInt32(kVK_Space),
                                         UInt32(optionKey | shiftKey),
                                         hotKeyID,
                                         GetApplicationEventTarget(),
                                         0,
                                         &ref)
        if status == noErr { hotKeyRef = ref }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                 eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), hotKeyHandler, 1, &spec, nil, nil)
    }

    // MARK: - URL scheme: dsh://notify?title=...&message=...

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  comps.scheme == "dsh", comps.host == "notify" else { continue }
            let title = comps.queryItems?.first(where: { $0.name == "title" })?.value ?? "DSH 装备版"
            let message = comps.queryItems?.first(where: { $0.name == "message" })?.value ?? ""
            postNotification(title: title, message: message)
        }
    }

    func postNotification(title: String, message: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = message
        content.sound = .default
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - server connection

    func startServerCheck() {
        serverTries = 0
        showWaiting()
        probeServer()
    }

    func probeServer() {
        var req = URLRequest(url: kDSHURL)
        req.timeoutInterval = 2
        URLSession.shared.dataTask(with: req) { [weak self] _, resp, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let http = resp as? HTTPURLResponse, http.statusCode < 500 {
                    self.loadApp()
                } else {
                    self.serverTries += 1
                    if self.serverTries == 4 {
                        let task = Process.launchedProcess(
                            launchPath: "/bin/launchctl",
                            arguments: ["kickstart", "-k", "gui/\(getuid())/\(kWebAgentLabel)"])
                        task.waitUntilExit()
                    }
                    if self.serverTries <= 15 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                            self?.probeServer()
                        }
                    } else {
                        self.showFailure()
                    }
                }
            }
        }.resume()
    }

    func showWaiting() {
        let html = """
        <html><head><meta charset="utf-8"><style>
        body{font-family:-apple-system;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#101014;color:#8a8a95}
        .box{text-align:center}.spin{width:28px;height:28px;border:3px solid #2a2a32;border-top-color:#4D6BFE;border-radius:50%;display:inline-block;animation:r 1s linear infinite}
        @keyframes r{to{transform:rotate(360deg)}}
        p{margin-top:14px;font-size:14px}
        </style></head><body><div class="box"><div class="spin"></div><p>正在启动 DSH…</p></div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func showFailure() {
        let html = """
        <html><head><meta charset="utf-8"><style>
        body{font-family:-apple-system;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#101014;color:#8a8a95}
        .box{text-align:center;max-width:420px;padding:24px}
        h2{color:#e8e8ec;font-size:17px;font-weight:600}
        p{font-size:14px;line-height:1.7;margin:12px 0}
        code{background:#1c1c22;border-radius:6px;padding:2px 8px;font-size:12px}
        </style></head><body><div class="box">
        <h2>DSH 服务没能启动</h2>
        <p>可能是 API key 无效，或 3080 端口被占用。<br>重新运行设置向导试试：菜单栏「文件 → 重新运行设置向导」。</p>
        </div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func loadApp() {
        webView.load(URLRequest(url: kDSHURL))
    }

    // MARK: - actions

    @objc func showWindow() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    @objc func reload() {
        if webView.url == nil {
            webView.load(URLRequest(url: kDSHURL))
        } else {
            webView.reload()
        }
    }

    @objc func openInBrowser() {
        NSWorkspace.shared.open(kDSHURL)
    }

    @objc func rerunWizard() {
        showWelcome()
    }

    @objc func toggle() {
        if window.isVisible && NSApp.isActive {
            NSApp.hide(nil)
        } else {
            NSApp.activate(ignoringOtherApps: true)
            window.makeKeyAndOrderFront(nil)
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        let code = (error as NSError).code
        guard code != NSURLErrorCancelled else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.startServerCheck()
        }
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            if url.scheme == "about" { decisionHandler(.allow); return }
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
gDelegate = delegate
app.delegate = delegate
app.run()

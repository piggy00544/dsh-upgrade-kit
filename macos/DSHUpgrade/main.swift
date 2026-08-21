import Cocoa
import WebKit
import CoreImage
import Sparkle
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
    var webServerProcess: Process?
    var qrTimer: Timer?
    var updaterController: SPUStandardUpdaterController!
    var currentQrcode = ""
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
        // Sparkle 自动更新（Info.plist 的 SUFeedURL/SUPublicEDKey 驱动）
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: nil,
            userDriverDelegate: nil)
        NSApp.activate(ignoringOtherApps: true)

        if isFirstRun() {
            showWelcome()
        } else {
            startServerCheck()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let ref = hotKeyRef { UnregisterEventHotKey(ref) }
        if webServerProcess?.isRunning == true { webServerProcess?.terminate() }
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
        // 已配置 = credentials 里 key 非空（内部网关 key 无 sk- 前缀，不能按前缀判断）
        let keyLine = content.split(separator: "\n").first ?? ""
        let keyValue = keyLine.split(separator: ":", maxSplits: 1).last?
            .trimmingCharacters(in: .whitespaces) ?? ""
        return keyValue.isEmpty
    }

    func showWelcome() {
        window.title = "DSH 装备版 · 开始"
        let html = welcomeHTML()
        webView.loadHTMLString(html, baseURL: Bundle.main.resourceURL)
    }

    // MARK: - WeChat bridge wizard (step 2)

    func showWechatPage() {
        window.title = "DSH 装备版 · 连微信"
        webView.loadHTMLString(wechatHTML(), baseURL: nil)
        fetchWechatQr()
    }

    func wechatHTML() -> String {
        return """
        <!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,"PingFang SC",system-ui,sans-serif;background:#010102;color:#f7f8f8;
             display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}
        .card{max-width:520px;width:100%;text-align:center}
        .eyebrow{font-size:12px;letter-spacing:1.5px;color:#8a8f98;margin-bottom:14px}
        .eyebrow b{color:#5e6ad2}
        h1{font-size:28px;font-weight:600;letter-spacing:-0.8px;margin-bottom:10px}
        h1 span{color:#5e6ad2}
        .sub{font-size:14px;line-height:1.7;color:#d0d6e0;margin-bottom:22px}
        .qrbox{width:208px;height:208px;margin:0 auto 18px;background:#fff;border-radius:12px;
               display:flex;align-items:center;justify-content:center;overflow:hidden}
        .qrbox img{width:192px;height:192px}
        .qrbox .placeholder{color:#62666d;font-size:12px;text-align:center;line-height:1.6}
        .status{font-size:14px;color:#d0d6e0;margin-bottom:22px;min-height:20px}
        .status.ok{color:#27a644}
        button{width:100%;background:#5e6ad2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;
               padding:12px;cursor:pointer}
        button:hover{background:#828fff}
        button:disabled{opacity:.5;cursor:default}
        button.ghost{background:#0f1011;border:1px solid #34343a;color:#8a8f98;margin-top:12px;font-weight:500}
        </style></head><body>
        <div class="card">
          <div class="eyebrow"><b>DSH</b> 装备版 · 第 2 步（可选）</div>
          <h1>扫码连上你的<span>微信</span></h1>
          <div class="sub">之后在微信里给 bot 发消息，就能远程指挥 DSH；<br>干完活它也会主动发微信通知你。</div>
          <div class="qrbox" id="qrbox"><div class="placeholder">二维码加载中…</div></div>
          <div class="status" id="status">正在获取二维码…</div>
          <button id="enter" disabled>进入 DSH</button>
          <button class="ghost" id="skip">先跳过，稍后再连</button>
        </div>
        <script>
        function setQr(src) {
          document.getElementById('qrbox').innerHTML = '<img src="' + src + '">';
        }
        function setStatus(text, ok) {
          const el = document.getElementById('status');
          el.textContent = text;
          el.className = ok ? 'status ok' : 'status';
        }
        function setReady() {
          document.getElementById('enter').disabled = false;
        }
        document.getElementById('enter').addEventListener('click', () => {
          window.webkit.messageHandlers.enterDsh.postMessage('go');
        });
        document.getElementById('skip').addEventListener('click', () => {
          window.webkit.messageHandlers.skipWechat.postMessage('skip');
        });
        </script></body></html>
        """
    }

    // MARK: - WeChat QR plumbing (node subprocess + CoreImage)

    func wechatScriptPath() -> String {
        // 优先 ~/bin（first-run 安装的副本），回退 App 资源
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let binCopy = home + "/bin/dsh-wechat.mjs"
        if FileManager.default.fileExists(atPath: binCopy) { return binCopy }
        return Bundle.main.bundleURL
            .appendingPathComponent("Contents/Resources/plugins/wechat-bridge/dsh-wechat.mjs").path
    }

    func nodeBinPath() -> String {
        return Bundle.main.bundleURL
            .appendingPathComponent("Contents/MacOS/node/bin/node").path
    }

    func runNode(args: [String], completion: @escaping (String?) -> Void) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: nodeBinPath())
        proc.arguments = [wechatScriptPath()] + args
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        try? proc.run()
        DispatchQueue.global().async {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let out = String(data: data, encoding: .utf8)
            DispatchQueue.main.async { completion(out) }
        }
    }

    func qrDataURI(from string: String) -> String {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return "" }
        filter.setValue(Data(string.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return "" }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        let rep = NSBitmapImageRep(ciImage: scaled)
        guard let png = rep.representation(using: .png, properties: [:]) else { return "" }
        return "data:image/png;base64," + png.base64EncodedString()
    }

    func js(_ code: String) {
        webView.evaluateJavaScript(code, completionHandler: nil)
    }

    func fetchWechatQr() {
        runNode(args: ["qr"]) { [weak self] out in
            guard let self = self else { return }
            guard let data = out?.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  obj["ok"] as? Bool == true,
                  let qrcode = obj["qrcode"] as? String,
                  let img = obj["img"] as? String, !img.isEmpty else {
                self.js("setStatus('二维码获取失败，可跳过稍后再连', false)")
                return
            }
            self.currentQrcode = qrcode
            let dataURI = self.qrDataURI(from: img)
            self.js("setQr(\'\(dataURI)\')")
            self.js("setStatus('请用微信扫码，然后手机确认', false)")
            self.startQrPolling()
        }
    }

    func startQrPolling() {
        stopQrPolling()
        qrTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.pollQrStatus()
        }
    }

    func stopQrPolling() {
        qrTimer?.invalidate()
        qrTimer = nil
    }

    func pollQrStatus() {
        guard !currentQrcode.isEmpty else { return }
        runNode(args: ["check", currentQrcode]) { [weak self] out in
            guard let self = self else { return }
            guard let data = out?.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let status = obj["status"] as? String else { return }
            switch status {
            case "wait":
                self.js("setStatus('请用微信扫码，然后手机确认', false)")
            case "scaned":
                self.js("setStatus('已扫码，请在手机上点确认', false)")
            case "expired":
                self.js("setStatus('二维码过期，正在刷新…', false)")
                self.fetchWechatQr()
            case "confirmed":
                self.stopQrPolling()
                self.js("setStatus('✅ 微信已连上！以后在微信里发消息就能指挥 DSH', true)")
                self.js("setReady()")
            default:
                break
            }
        }
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
        .author{margin-top:22px;padding-top:18px;border-top:1px solid #23252a;display:flex;align-items:center;gap:14px}
        .author img{width:76px;height:76px;border-radius:10px;border:1px solid #23252a}
        .author-text{text-align:left}
        .author-name{font-size:13px;color:#f7f8f8;margin-bottom:4px}
        .author-name b{font-weight:600}
        .author-sub{font-size:11px;color:#62666d;line-height:1.6}
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
          <input id="key" type="password" placeholder="官方 key（sk-…）或内部网关 key" autocomplete="off">
          <div class="hint">官方 key 在 <a href="#">platform.deepseek.com</a> 创建；<br>公司内部部署的 key 同样支持。key 只写进本机配置（权限 600），绝不上传。</div>
          <details style="margin-bottom:20px">
            <summary style="font-size:13px;color:#8a8f98;cursor:pointer;user-select:none">高级选项：自定义 API 地址（内部部署用）</summary>
            <div style="margin-top:10px">
              <label for="proto">API 协议（响应模式）</label>
              <select id="proto" style="width:100%;background:#0f1011;border:1px solid #34343a;border-radius:8px;color:#f7f8f8;font-size:13px;padding:10px 12px;margin-bottom:14px;outline:none">
                <option value="deepseek">DeepSeek 官方</option>
                <option value="openai-completions">OpenAI Completions（内部网关推荐）</option>
              </select>
              <label for="base">API 地址（留空 = 官方 api.deepseek.com）</label>
              <input id="base" type="text" placeholder="如 http://10.0.0.8:8080/v1" autocomplete="off">
              <label for="model" style="margin-top:10px">模型 ID（多个用英文逗号分隔；留空 = deepseek-v4-pro）</label>
              <input id="model" type="text" placeholder="如 deepseek-v4-pro,deepseek-v4-flash" autocomplete="off">
            </div>
          </details>
          <button id="go">开始使用</button>
          <div class="err" id="err"></div>
          <a class="skip" href="#" id="later">先跳过，稍后在设置里填</a>
          <div class="author">
            <img src="qrcode-wechat.jpg" alt="公众号二维码">
            <div class="author-text">
              <div class="author-name">作者：<b>牛村木木山</b></div>
              <div class="author-sub">欢迎关注公众号「牛村木木山」<br>DSH 技巧 · AI 工具 · 不定期更新</div>
            </div>
          </div>
        </div>
        <script>
        const keyInput = document.getElementById('key');
        const go = document.getElementById('go');
        const err = document.getElementById('err');
        function submit() {
          const key = keyInput.value.trim();
          if (!key) { err.textContent = '请填入 API key'; return; }
          go.disabled = true;
          err.textContent = '正在初始化，首次启动约需 1 分钟…';
          const payload = JSON.stringify({
            key: key,
            baseURL: document.getElementById('base').value.trim(),
            modelId: document.getElementById('model').value.trim(),
            protocol: document.getElementById('proto').value
          });
          window.webkit.messageHandlers.saveKey.postMessage(payload);
        }
        go.addEventListener('click', submit);
        keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        // 填了自定义 API 地址 → 协议自动切到 OpenAI Completions（内部网关兼容性最好，可手动改回）
        document.getElementById('base').addEventListener('input', function () {
          document.getElementById('proto').value = 'openai-completions';
        });
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
        if message.name == "skipWechat" {
            DispatchQueue.main.async { [weak self] in
                self?.stopQrPolling()
                self?.startServerCheck()
            }
            return
        }
        if message.name == "enterDsh" {
            DispatchQueue.main.async { [weak self] in
                self?.stopQrPolling()
                self?.startServerCheck()
            }
            return
        }
        guard message.name == "saveKey" else { return }
        var key = (message.body as? String) ?? ""
        var baseURL = ""
        var modelId = ""
        var protocolName = "deepseek"
        if let data = key.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            key = (obj["key"] as? String) ?? ""
            baseURL = (obj["baseURL"] as? String) ?? ""
            modelId = (obj["modelId"] as? String) ?? ""
            protocolName = (obj["protocol"] as? String) ?? "deepseek"
        }
        DispatchQueue.global().async { [weak self] in
            self?.runFirstSetup(key: key, baseURL: baseURL, modelId: modelId, protocolName: protocolName)
        }
    }

    func runFirstSetup(key: String, baseURL: String, modelId: String, protocolName: String) {
        let setup = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/first-run.sh").path
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = [setup, key, baseURL, modelId, protocolName]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        try? proc.run()
        proc.waitUntilExit()
        DispatchQueue.main.async { [weak self] in
            self?.showWechatPage()
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
        appMenu.addItem(withTitle: "检查更新…",
                        action: #selector(checkForUpdates), keyEquivalent: "")
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
        fileMenu.addItem(withTitle: "连接微信…", action: #selector(connectWechat), keyEquivalent: "")
        fileMenu.addItem(withTitle: "配置视觉模型…", action: #selector(configureVision), keyEquivalent: "")
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
        config.userContentController.add(self, name: "skipWechat")
        config.userContentController.add(self, name: "enterDsh")
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
        menu.addItem(withTitle: "检查更新…", action: #selector(checkForUpdates), keyEquivalent: "")
        menu.addItem(withTitle: "连接微信…", action: #selector(connectWechat), keyEquivalent: "")
        menu.addItem(withTitle: "配置视觉模型…", action: #selector(configureVision), keyEquivalent: "")
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

    // 自己把 DSH web 服务拉起来（不依赖 LaunchAgent，绕开系统文件夹权限限制）
    func spawnWebServer() {
        if webServerProcess?.isRunning == true { return }
        let proc = Process()
        proc.executableURL = Bundle.main.bundleURL
            .appendingPathComponent("Contents/MacOS/dsh")
        proc.arguments = ["web", "--host", "127.0.0.1", "--port", "3080"]
        var env = ProcessInfo.processInfo.environment
        env["DSH_HOME"] = userHome() + "/home"
        env["DSH_TELEMETRY_DISABLED"] = "1"
        proc.environment = env
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice
        try? proc.run()
        webServerProcess = proc
    }

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
                        // LaunchAgent 可能没注册成功（系统权限），自己拉起服务兜底
                        self.spawnWebServer()
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

    @objc func checkForUpdates() {
        updaterController.updater.checkForUpdates()
    }

    @objc func rerunWizard() {
        showWelcome()
    }

    @objc func connectWechat() {
        // 已配 key 时直接打开扫码页；未配置则先走向导
        if isFirstRun() {
            showWelcome()
        } else {
            showWechatPage()
        }
    }

    @objc func configureVision() {
        let alert = NSAlert()
        alert.messageText = "配置视觉模型 API key"
        alert.informativeText = "用于「看图」功能（vision-bridge）。推荐阿里百炼 DashScope，新用户限免 50 万 token。key 只写本机配置文件（权限 600）。"
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        input.placeholderString = "sk-...（留空则清除）"
        alert.accessoryView = input
        alert.addButton(withTitle: "保存")
        alert.addButton(withTitle: "取消")
        if alert.runModal() == .alertFirstButtonReturn {
            let key = input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            let ok = saveVisionKey(key)
            let done = NSAlert()
            done.messageText = ok ? "视觉模型已配置" : "配置失败"
            done.informativeText = ok
                ? "现在在 DSH 里贴图说「看这张图」就会自动识图。"
                : "配置文件写入失败，可到 ~/.config/vision-bridge/config.json 手动填写。"
            done.runModal()
        }
    }

    func saveVisionKey(_ key: String) -> Bool {
        let fm = FileManager.default
        let cfgDir = fm.homeDirectoryForCurrentUser.path + "/.config/vision-bridge"
        let cfgPath = cfgDir + "/config.json"
        if !fm.fileExists(atPath: cfgPath) {
            let tpl = Bundle.main.resourceURL?
                .appendingPathComponent("home-template/skills/vision-bridge/config.example.json").path
            if let tpl = tpl, fm.fileExists(atPath: tpl) {
                try? fm.createDirectory(atPath: cfgDir, withIntermediateDirectories: true)
                try? fm.copyItem(atPath: tpl, toPath: cfgPath)
            }
        }
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: cfgPath)),
              var obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              var providers = obj["providers"] as? [String: Any],
              var dashscope = providers["dashscope"] as? [String: Any] else { return false }
        dashscope["apiKey"] = key
        providers["dashscope"] = dashscope
        obj["providers"] = providers
        guard let out = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]) else { return false }
        do {
            try out.write(to: URL(fileURLWithPath: cfgPath), options: .atomic)
            try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: cfgPath)
            return true
        } catch {
            return false
        }
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

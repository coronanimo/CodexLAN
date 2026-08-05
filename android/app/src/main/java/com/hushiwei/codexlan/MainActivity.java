package com.hushiwei.codexlan;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputType;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.io.File;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String PREFERENCES = "codex_workspace";
    private static final String ADDRESS_KEY = "address";
    private static final int FILE_CHOOSER_REQUEST = 4107;
    private static final long EXIT_GESTURE_WINDOW_MS = 1800;
    private static final long ADDRESS_GESTURE_WINDOW_MS = 1400;
    private static final long CONNECTION_TIMEOUT_MS = 12000;
    private SharedPreferences preferences;
    private FrameLayout appRoot;
    private FrameLayout workspaceContainer;
    private WebView webView;
    private LinearLayout connectionPanel;
    private EditText addressInput;
    private TextView errorText;
    private long lastExitGestureAt;
    private long firstAddressGestureAt;
    private Toast exitToast;
    private ValueCallback<Uri[]> fileChooserCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable connectionTimeout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        configureWebView();
        registerBackHandler();
        showStoredAddressOrEditor();
    }

    private void registerBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                this::handleBack
            );
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView == null) return;
        webView.onResume();
        webView.post(() -> webView.evaluateJavascript(
            "window.dispatchEvent(new Event('codex-native-resume'))",
            null
        ));
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    private void configureWebView() {
        appRoot = new AddressGestureLayout(this);
        appRoot.setBackgroundColor(Color.rgb(245, 248, 252));
        appRoot.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) ->
            updateAddressGestureExclusion()
        );
        workspaceContainer = new FrameLayout(this);
        workspaceContainer.setBackgroundColor(Color.rgb(245, 248, 252));
        workspaceContainer.setPadding(0, initialTopSystemInset(), 0, 0);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            settings.setAlgorithmicDarkeningAllowed(false);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setBackgroundColor(Color.rgb(245, 248, 252));
        webView.setWebChromeClient(new WorkspaceWebChromeClient());
        webView.setWebViewClient(new WorkspaceWebViewClient());
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setDownloadListener(this::startDownload);
        webView.addJavascriptInterface(new AndroidBridge(), "CodexAndroid");
        workspaceContainer.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        applyTopSystemInset(workspaceContainer, 0, 0, 0, 0);
    }

    private void showStoredAddressOrEditor() {
        String address = preferences.getString(ADDRESS_KEY, "");
        if (isTrustedWorkspaceAddress(address)) loadWorkspace(address);
        else showConnectionEditor("");
    }

    private void loadWorkspace(String address) {
        String normalized = normalizeAddress(address);
        connectionPanel = null;
        showContent(workspaceContainer);
        webView.stopLoading();
        webView.clearHistory();
        cancelConnectionTimeout();
        connectionTimeout = () -> {
            connectionTimeout = null;
            if (connectionPanel == null) {
                webView.stopLoading();
                showConnectionEditor("连接超时，请检查公网地址、端口映射或网络状态后重试。");
            }
        };
        mainHandler.postDelayed(connectionTimeout, CONNECTION_TIMEOUT_MS);
        webView.loadUrl(normalized);
    }

    private void showContent(View content) {
        if (content.getParent() instanceof FrameLayout) {
            ((FrameLayout) content.getParent()).removeView(content);
        }
        appRoot.removeAllViews();
        appRoot.addView(content, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(appRoot);
    }

    private void showConnectionEditor(String message) {
        cancelConnectionTimeout();
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_VERTICAL);
        int panelPadding = dp(26);
        panel.setPadding(panelPadding, panelPadding, panelPadding, panelPadding);
        panel.setBackgroundColor(Color.rgb(245, 248, 252));
        applyTopSystemInset(panel, panelPadding, panelPadding, panelPadding, panelPadding);

        TextView eyebrow = text("工作台连接", 12, Color.rgb(46, 107, 255));
        TextView title = text("连接 Codex 工作台", 27, Color.rgb(16, 33, 61));
        TextView hint = text("输入完整的 HTTP 或 HTTPS 地址，支持局域网 IP、公网 IP和域名。公网连接建议使用 HTTPS；HTTP 会明文传输登录和聊天内容。在任意页面从屏幕右侧边缘任意位置连续向左滑两次，可以重新打开这里。", 15, Color.rgb(90, 107, 132));
        addressInput = new EditText(this);
        addressInput.setSingleLine(true);
        addressInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        addressInput.setHint("http://192.168.1.50:8687");
        addressInput.setText(preferences.getString(ADDRESS_KEY, ""));
        addressInput.setSelectAllOnFocus(false);
        Button connect = new Button(this);
        connect.setText("连接工作台");
        errorText = text(message, 13, Color.rgb(189, 60, 74));

        panel.addView(eyebrow, margins(0, 0, 0, 8));
        panel.addView(title, margins(0, 0, 0, 14));
        panel.addView(hint, margins(0, 0, 0, 20));
        panel.addView(addressInput, margins(0, 0, 0, 10));
        panel.addView(errorText, margins(0, 0, 0, 10));
        panel.addView(connect, margins(0, 0, 0, 0));
        connect.setOnClickListener((view) -> saveAndLoadAddress());
        connectionPanel = panel;
        showContent(panel);
        addressInput.requestFocus();
    }

    private void saveAndLoadAddress() {
        String address = addressInput.getText().toString().trim();
        if (!isTrustedWorkspaceAddress(address)) {
            errorText.setText("请输入完整的 http:// 或 https:// 地址，例如 http://公网IP:端口 或 https://你的域名。");
            return;
        }
        String normalized = normalizeAddress(address);
        preferences.edit().putString(ADDRESS_KEY, normalized).apply();
        loadWorkspace(normalized);
    }

    private boolean isTrustedWorkspaceAddress(String raw) {
        try {
            Uri uri = Uri.parse(normalizeAddress(raw));
            String host = uri.getHost();
            String scheme = uri.getScheme();
            String path = uri.getPath();
            int port = uri.getPort();
            return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                && host != null
                && !host.trim().isEmpty()
                && uri.getUserInfo() == null
                && (path == null || path.isEmpty() || "/".equals(path))
                && uri.getQuery() == null
                && uri.getFragment() == null
                && (port == -1 || (port >= 1 && port <= 65535));
        } catch (Exception ignored) {
            return false;
        }
    }

    private String normalizeAddress(String raw) {
        String value = raw == null ? "" : raw.trim();
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private void cancelConnectionTimeout() {
        if (connectionTimeout == null) return;
        mainHandler.removeCallbacks(connectionTimeout);
        connectionTimeout = null;
    }

    private void startDownload(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        if (!isCurrentWorkspaceUrl(url)) {
            Toast.makeText(this, "已阻止非当前工作台的下载地址", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            String fileName = uniqueDownloadName(downloadFileName(url, contentDisposition, mimeType));
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            if (mimeType != null && !mimeType.trim().isEmpty()) request.setMimeType(mimeType);
            if (userAgent != null && !userAgent.trim().isEmpty()) request.addRequestHeader("User-Agent", userAgent);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.trim().isEmpty()) request.addRequestHeader("Cookie", cookie);
            request.setTitle(fileName);
            request.setDescription("来自 Codex 工作台");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "已加入系统下载：" + fileName, Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, "下载启动失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private String downloadFileName(String url, String contentDisposition, String mimeType) {
        String named = Uri.parse(url).getQueryParameter("name");
        if (named != null && !named.trim().isEmpty()) return new File(named).getName();
        return URLUtil.guessFileName(url, contentDisposition, mimeType);
    }

    private boolean isCurrentWorkspaceUrl(String raw) {
        try {
            Uri download = Uri.parse(raw);
            Uri workspace = Uri.parse(preferences.getString(ADDRESS_KEY, ""));
            String path = download.getPath();
            boolean allowedDownloadPath = path != null && (
                path.matches("/api/projects/[0-9a-fA-F-]+/files/download")
                    || path.equals("/api/admin/files/download")
            );
            return isSameWorkspaceOrigin(download, workspace)
                && allowedDownloadPath;
        } catch (Exception ignored) {
            return false;
        }
    }

    private int normalizedPort(Uri uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private boolean isSameWorkspaceOrigin(Uri candidate, Uri workspace) {
        return candidate.getScheme() != null
            && workspace.getScheme() != null
            && candidate.getScheme().equalsIgnoreCase(workspace.getScheme())
            && candidate.getHost() != null
            && workspace.getHost() != null
            && candidate.getHost().equalsIgnoreCase(workspace.getHost())
            && normalizedPort(candidate) == normalizedPort(workspace);
    }

    private String uniqueDownloadName(String suggestedName) {
        String cleanName = new File(suggestedName == null ? "Codex-download" : suggestedName).getName();
        if (cleanName.trim().isEmpty()) cleanName = "Codex-download";
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File candidate = new File(downloads, cleanName);
        if (!candidate.exists()) return cleanName;
        int dot = cleanName.lastIndexOf('.');
        String stem = dot > 0 ? cleanName.substring(0, dot) : cleanName;
        String extension = dot > 0 ? cleanName.substring(dot) : "";
        for (int copy = 1; copy < 1000; copy++) {
            String nextName = stem + " (" + copy + ")" + extension;
            if (!new File(downloads, nextName).exists()) return nextName;
        }
        return stem + "-" + System.currentTimeMillis() + extension;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;
        Uri[] selected = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                selected = new Uri[count];
                for (int index = 0; index < count; index++) {
                    selected[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                selected = new Uri[] { data.getData() };
            }
        }
        fileChooserCallback.onReceiveValue(selected);
        fileChooserCallback = null;
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        firstAddressGestureAt = 0;
        if (connectionPanel != null) {
            String storedAddress = preferences.getString(ADDRESS_KEY, "");
            if (isTrustedWorkspaceAddress(storedAddress)) {
                lastExitGestureAt = 0;
                loadWorkspace(storedAddress);
            } else {
                handleExitGesture();
            }
            return;
        }
        if (webView != null && webView.canGoBack()) {
            lastExitGestureAt = 0;
            webView.goBack();
            return;
        }
        if (webView != null) {
            webView.evaluateJavascript("window.codexHandleAndroidBack ? window.codexHandleAndroidBack() : 'exit'", (result) -> {
                if ("\"handled\"".equals(result)) lastExitGestureAt = 0;
                else handleExitGesture();
            });
            return;
        }
        handleExitGesture();
    }

    private void handleAddressGesture() {
        long now = SystemClock.elapsedRealtime();
        if (firstAddressGestureAt > 0 && now - firstAddressGestureAt <= ADDRESS_GESTURE_WINDOW_MS) {
            firstAddressGestureAt = 0;
            appRoot.performHapticFeedback(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? HapticFeedbackConstants.CONFIRM
                : HapticFeedbackConstants.LONG_PRESS);
            showConnectionEditor("");
            return;
        }
        firstAddressGestureAt = now;
        appRoot.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
    }

    private void handleExitGesture() {
        long now = SystemClock.elapsedRealtime();
        if (lastExitGestureAt > 0 && now - lastExitGestureAt <= EXIT_GESTURE_WINDOW_MS) {
            if (exitToast != null) exitToast.cancel();
            finish();
            return;
        }
        lastExitGestureAt = now;
        exitToast = Toast.makeText(this, "再滑一次退出", Toast.LENGTH_SHORT);
        exitToast.show();
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(0, 1.25f);
        return view;
    }

    private LinearLayout.LayoutParams margins(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void applyTopSystemInset(View view, int left, int top, int right, int bottom) {
        view.setOnApplyWindowInsetsListener((target, windowInsets) -> {
            int topInset = initialTopSystemInset();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                Insets safeArea = windowInsets.getInsets(WindowInsets.Type.statusBars() | WindowInsets.Type.displayCutout());
                topInset = Math.max(topInset, safeArea.top);
            }
            target.setPadding(left, top + topInset, right, bottom);
            return windowInsets;
        });
        view.requestApplyInsets();
    }

    private int initialTopSystemInset() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return 0;
        int resourceId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        return resourceId > 0 ? getResources().getDimensionPixelSize(resourceId) : dp(24);
    }

    private void updateAddressGestureExclusion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || appRoot.getWidth() == 0 || appRoot.getHeight() == 0) return;
        Rect addressGestureArea = new Rect(
            appRoot.getWidth() - dp(44),
            0,
            appRoot.getWidth(),
            appRoot.getHeight()
        );
        appRoot.setSystemGestureExclusionRects(Collections.singletonList(addressGestureArea));
    }

    private final class AddressGestureLayout extends FrameLayout {
        private float startX;
        private float startY;
        private boolean tracking;

        AddressGestureLayout(Context context) {
            super(context);
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent event) {
            observeAddressGesture(event);
            return super.dispatchTouchEvent(event);
        }

        private void observeAddressGesture(MotionEvent event) {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                startX = event.getX();
                startY = event.getY();
                tracking = startX >= getWidth() - dp(44);
                return;
            }
            if (!tracking) return;
            if (event.getActionMasked() == MotionEvent.ACTION_MOVE && Math.abs(event.getY() - startY) > dp(48)) {
                tracking = false;
                return;
            }
            if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                tracking = false;
                return;
            }
            if (event.getActionMasked() != MotionEvent.ACTION_UP) return;
            tracking = false;
            float leftDistance = startX - event.getX();
            float verticalDistance = Math.abs(event.getY() - startY);
            if (leftDistance < dp(48) || verticalDistance > dp(56)) return;
            handleAddressGesture();
        }
    }

    private final class WorkspaceWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri workspace = Uri.parse(preferences.getString(ADDRESS_KEY, ""));
            return !isSameWorkspaceOrigin(request.getUrl(), workspace);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            cancelConnectionTimeout();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            cancelConnectionTimeout();
            String description = error == null || error.getDescription() == null ? "无法连接服务器" : error.getDescription().toString();
            runOnUiThread(() -> showConnectionEditor("连接失败：" + description + "。请检查地址后重试。"));
        }
    }

    private final class WorkspaceWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = callback;
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
            picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(picker, FILE_CHOOSER_REQUEST);
                return true;
            } catch (Exception error) {
                fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = null;
                Toast.makeText(MainActivity.this, "无法打开系统文件选择器", Toast.LENGTH_LONG).show();
                return false;
            }
        }
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void openConnectionSettings() {
            runOnUiThread(() -> showConnectionEditor(""));
        }
    }
}

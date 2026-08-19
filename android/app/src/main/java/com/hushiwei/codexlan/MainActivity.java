package com.hushiwei.codexlan;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.DownloadManager;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Picture;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
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
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;

public final class MainActivity extends Activity {
    private static final String PREFERENCES = "codex_workspace";
    private static final String ADDRESS_KEY = "address";
    private static final String SERVERS_KEY = "servers";
    private static final String ORB_POSITION_KEY = "orb_position";
    private static final int MAX_SAVED_SERVERS = 8;
    private static final int FILE_CHOOSER_REQUEST = 4107;
    private static final long EXIT_GESTURE_WINDOW_MS = 1800;
    private static final long CONNECTION_TIMEOUT_MS = 12000;
    private SharedPreferences preferences;
    private FrameLayout appRoot;
    private FrameLayout workspaceContainer;
    private WebView webView;
    private WebView printWebView;
    private LinearLayout controlDock;
    private LinearLayout controlMenu;
    private ControlOrbView controlOrbButton;
    private View controlOrbSurface;
    private TextView controlHost;
    private View controlStatusDot;
    private LinearLayout connectionPanel;
    private EditText addressInput;
    private TextView errorText;
    private long lastExitGestureAt;
    private Toast exitToast;
    private ValueCallback<Uri[]> fileChooserCallback;
    private final ArrayList<Uri> pendingSharedUris = new ArrayList<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable connectionTimeout;
    private String orbConnectionState = "offline";
    private float orbDragStartRawY;
    private float orbDragStartTranslationY;
    private boolean orbMoved;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        configureWebView();
        captureSharedFiles(getIntent());
        registerBackHandler();
        showStoredAddressOrEditor();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureSharedFiles(intent);
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

    @Override
    protected void onDestroy() {
        cancelConnectionTimeout();
        if (printWebView != null) {
            releasePrintableDocument(printWebView);
        }
        if (webView != null) {
            webView.removeJavascriptInterface("CodexAndroid");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        appRoot = new FrameLayout(this);
        appRoot.setBackgroundColor(Color.rgb(245, 248, 252));
        workspaceContainer = new FrameLayout(this);
        workspaceContainer.setBackgroundColor(Color.rgb(245, 248, 252));
        workspaceContainer.setPadding(0, 0, 0, 0);
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
        configureControlDock();
    }

    private void configureControlDock() {
        controlDock = new LinearLayout(this);
        controlDock.setOrientation(LinearLayout.HORIZONTAL);
        controlDock.setGravity(Gravity.CENTER_VERTICAL);
        controlDock.setElevation(dp(12));

        controlMenu = new LinearLayout(this);
        controlMenu.setOrientation(LinearLayout.VERTICAL);
        controlMenu.setPadding(dp(6), dp(7), dp(6), dp(7));
        controlMenu.setBackground(roundedBackground(Color.argb(250, 255, 255, 255), 16));
        controlMenu.setVisibility(View.GONE);

        controlHost = text("尚未连接服务器", 12, Color.rgb(16, 33, 61));
        controlHost.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        controlHost.setSingleLine(true);
        controlHost.setEllipsize(android.text.TextUtils.TruncateAt.END);
        controlMenu.addView(controlHost, margins(9, 2, 9, 7));
        controlMenu.addView(controlAction("↻", "刷新", this::refreshCurrentServer));
        controlMenu.addView(controlAction("◎", "服务器", this::showServerChooser));

        LinearLayout.LayoutParams menuParams = new LinearLayout.LayoutParams(dp(184), LinearLayout.LayoutParams.WRAP_CONTENT);
        menuParams.setMarginEnd(dp(6));
        controlDock.addView(controlMenu, menuParams);

        controlOrbButton = new ControlOrbView(this);
        controlOrbButton.setBackgroundColor(Color.TRANSPARENT);
        controlOrbButton.setContentDescription("打开全局菜单");
        controlOrbButton.setOnClickListener((view) -> setControlExpanded(controlMenu.getVisibility() != View.VISIBLE));
        controlOrbButton.setOnTouchListener(this::handleOrbTouch);
        controlOrbSurface = new View(this);
        controlOrbSurface.setBackground(orbBackground(Color.argb(150, 23, 52, 95)));
        controlOrbButton.addView(controlOrbSurface, new FrameLayout.LayoutParams(dp(34), dp(34), Gravity.CENTER));
        controlStatusDot = new View(this);
        FrameLayout.LayoutParams dotParams = new FrameLayout.LayoutParams(dp(8), dp(8), Gravity.END | Gravity.BOTTOM);
        dotParams.setMargins(0, 0, dp(3), dp(3));
        controlOrbButton.addView(controlStatusDot, dotParams);
        controlDock.addView(controlOrbButton, new LinearLayout.LayoutParams(dp(44), dp(44)));
        refreshControlDock();
    }

    private void showStoredAddressOrEditor() {
        String address = preferences.getString(ADDRESS_KEY, "");
        if (isWorkspaceAddress(address)) {
            loadWorkspace(address);
        }
        else {
            setOrbConnectionState("offline");
            showConnectionEditor("");
        }
    }

    private void loadWorkspace(String address) {
        String normalized = normalizeAddress(address);
        setOrbConnectionState("connecting");
        connectionPanel = null;
        showContent(workspaceContainer);
        webView.stopLoading();
        webView.clearHistory();
        cancelConnectionTimeout();
        connectionTimeout = () -> {
            connectionTimeout = null;
            if (connectionPanel == null) {
                webView.stopLoading();
                setOrbConnectionState("offline");
                showConnectionEditor("连接超时。请确认手机和服务器在同一网络，并检查工作台地址和端口。");
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
        attachControlOrb(false);
        setContentView(appRoot);
    }

    private void attachControlOrb(boolean expanded) {
        if (controlDock == null) return;
        if (controlDock.getParent() instanceof ViewGroup) {
            ((ViewGroup) controlDock.getParent()).removeView(controlDock);
        }
        setControlExpanded(expanded);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.END | Gravity.CENTER_VERTICAL
        );
        params.setMarginEnd(dp(4));
        appRoot.addView(controlDock, params);
        controlDock.bringToFront();
        controlDock.post(this::restoreControlPosition);
    }

    private void setControlExpanded(boolean expanded) {
        if (controlMenu == null) return;
        controlMenu.setVisibility(expanded ? View.VISIBLE : View.GONE);
        if (controlOrbButton != null && controlOrbSurface != null) {
            controlOrbButton.setContentDescription(expanded ? "关闭全局菜单" : "打开全局菜单");
            controlOrbSurface.setBackground(orbBackground(expanded
                ? Color.argb(185, 46, 107, 255)
                : Color.argb(150, 23, 52, 95)));
        }
        if (expanded) {
            refreshControlDock();
            controlDock.post(() -> controlDock.setTranslationY(clampControlTranslation(controlDock.getTranslationY())));
        } else {
            controlDock.post(this::restoreControlPosition);
        }
    }

    private boolean handleOrbTouch(View view, MotionEvent event) {
        if (controlMenu.getVisibility() == View.VISIBLE) return false;
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            orbDragStartRawY = event.getRawY();
            orbDragStartTranslationY = controlDock.getTranslationY();
            orbMoved = false;
            return true;
        }
        if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
            float distance = event.getRawY() - orbDragStartRawY;
            if (Math.abs(distance) > dp(4)) orbMoved = true;
            if (orbMoved) controlDock.setTranslationY(clampControlTranslation(orbDragStartTranslationY + distance));
            return true;
        }
        if (event.getActionMasked() == MotionEvent.ACTION_UP) {
            if (orbMoved) saveControlPosition();
            else view.performClick();
            return true;
        }
        if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            restoreControlPosition();
            return true;
        }
        return true;
    }

    private float clampControlTranslation(float requested) {
        if (appRoot.getHeight() <= 0 || controlDock.getHeight() <= 0) return requested;
        float baseTop = (appRoot.getHeight() - controlDock.getHeight()) / 2f;
        float minimum = dp(10) - baseTop;
        float maximum = appRoot.getHeight() - dp(10) - controlDock.getHeight() - baseTop;
        return Math.max(minimum, Math.min(maximum, requested));
    }

    private void restoreControlPosition() {
        if (appRoot.getHeight() <= 0 || controlDock.getHeight() <= 0) return;
        float ratio = Math.max(0f, Math.min(1f, preferences.getFloat(ORB_POSITION_KEY, 0.52f)));
        float available = Math.max(0f, appRoot.getHeight() - dp(20) - controlDock.getHeight());
        float desiredTop = dp(10) + available * ratio;
        float baseTop = (appRoot.getHeight() - controlDock.getHeight()) / 2f;
        controlDock.setTranslationY(clampControlTranslation(desiredTop - baseTop));
    }

    private void saveControlPosition() {
        if (appRoot.getHeight() <= 0 || controlDock.getHeight() <= 0) return;
        float baseTop = (appRoot.getHeight() - controlDock.getHeight()) / 2f;
        float actualTop = baseTop + controlDock.getTranslationY();
        float available = Math.max(1f, appRoot.getHeight() - dp(20) - controlDock.getHeight());
        float ratio = Math.max(0f, Math.min(1f, (actualTop - dp(10)) / available));
        preferences.edit().putFloat(ORB_POSITION_KEY, ratio).apply();
    }

    private void setOrbConnectionState(String state) {
        orbConnectionState = state;
        refreshControlDock();
    }

    private void refreshControlDock() {
        if (controlStatusDot != null) {
            int color = "online".equals(orbConnectionState)
                ? Color.rgb(19, 138, 100)
                : "connecting".equals(orbConnectionState)
                    ? Color.rgb(245, 166, 35)
                    : Color.rgb(189, 60, 74);
            controlStatusDot.setBackground(ovalBackground(color));
        }
        if (controlHost != null) {
            String address = preferences == null ? "" : preferences.getString(ADDRESS_KEY, "");
            controlHost.setText(isWorkspaceAddress(address) ? address : "尚未连接服务器");
        }
    }

    private TextView controlAction(String icon, String label, Runnable action) {
        TextView button = text(icon + "    " + label, 13, Color.rgb(36, 59, 91));
        button.setGravity(Gravity.CENTER_VERTICAL);
        button.setMinHeight(dp(44));
        button.setPadding(dp(10), 0, dp(10), 0);
        button.setBackground(roundedBackground(Color.rgb(246, 249, 253), 10));
        button.setClickable(true);
        button.setFocusable(true);
        button.setOnClickListener((view) -> {
            setControlExpanded(false);
            action.run();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, dp(2), 0, 0);
        button.setLayoutParams(params);
        return button;
    }

    private GradientDrawable roundedBackground(int color, int radiusDp) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(dp(radiusDp));
        background.setStroke(dp(1), Color.rgb(203, 216, 232));
        return background;
    }

    private GradientDrawable ovalBackground(int color) {
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(color);
        background.setStroke(dp(2), Color.WHITE);
        return background;
    }

    private GradientDrawable orbBackground(int color) {
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(color);
        background.setStroke(dp(1), Color.argb(130, 255, 255, 255));
        return background;
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
        TextView title = text("连接 CodexLAN", 27, Color.rgb(16, 33, 61));
        TextView hint = text("输入完整的 HTTP 或 HTTPS 地址，支持局域网 IP、公网 IP和域名。公网连接建议使用 HTTPS；HTTP 会明文传输登录和聊天内容。屏幕右侧的悬浮球始终可以打开服务器切换。", 15, Color.rgb(90, 107, 132));
        addressInput = new EditText(this);
        addressInput.setSingleLine(true);
        addressInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        addressInput.setHint("http://192.168.1.50:8688");
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
        if (!isWorkspaceAddress(address)) {
            errorText.setText(R.string.invalid_workspace_address);
            return;
        }
        String normalized = normalizeAddress(address);
        saveServerSelection(normalized);
        loadWorkspace(normalized);
    }

    private boolean isWorkspaceAddress(String raw) {
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

    private ArrayList<String> savedServers() {
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        String current = preferences.getString(ADDRESS_KEY, "");
        if (isWorkspaceAddress(current)) unique.add(normalizeAddress(current));
        try {
            JSONArray stored = new JSONArray(preferences.getString(SERVERS_KEY, "[]"));
            for (int index = 0; index < stored.length() && unique.size() < MAX_SAVED_SERVERS; index++) {
                String address = normalizeAddress(stored.optString(index, ""));
                if (isWorkspaceAddress(address)) unique.add(address);
            }
        } catch (Exception ignored) {
            preferences.edit().remove(SERVERS_KEY).apply();
        }
        return new ArrayList<>(unique);
    }

    private void saveServerSelection(String rawAddress) {
        String address = normalizeAddress(rawAddress);
        ArrayList<String> servers = savedServers();
        servers.remove(address);
        servers.add(0, address);
        writeSavedServers(servers, address);
    }

    private void forgetServer(String rawAddress) {
        String address = normalizeAddress(rawAddress);
        String current = normalizeAddress(preferences.getString(ADDRESS_KEY, ""));
        if (address.equals(current)) return;
        ArrayList<String> servers = savedServers();
        if (servers.remove(address)) writeSavedServers(servers, null);
    }

    private void writeSavedServers(ArrayList<String> servers, String current) {
        JSONArray stored = new JSONArray();
        for (int index = 0; index < servers.size() && index < MAX_SAVED_SERVERS; index++) {
            stored.put(servers.get(index));
        }
        SharedPreferences.Editor editor = preferences.edit().putString(SERVERS_KEY, stored.toString());
        if (current != null) editor.putString(ADDRESS_KEY, current);
        editor.apply();
        refreshControlDock();
    }

    private void switchServer(String rawAddress) {
        String address = normalizeAddress(rawAddress);
        if (!isWorkspaceAddress(address)) {
            Toast.makeText(this, "服务器地址无效", Toast.LENGTH_SHORT).show();
            return;
        }
        saveServerSelection(address);
        setControlExpanded(false);
        loadWorkspace(address);
    }

    private void refreshCurrentServer() {
        String address = preferences.getString(ADDRESS_KEY, "");
        if (!isWorkspaceAddress(address)) {
            showConnectionEditor("");
            return;
        }
        hideSoftwareKeyboard();
        if (connectionPanel == null) {
            setOrbConnectionState("connecting");
            webView.reload();
        } else {
            loadWorkspace(address);
        }
    }

    private void showServerChooser() {
        ArrayList<String> servers = savedServers();
        if (servers.isEmpty()) {
            showConnectionEditor("");
            return;
        }
        String current = normalizeAddress(preferences.getString(ADDRESS_KEY, ""));
        Dialog dialog = new Dialog(this);
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(16), dp(14), dp(16), dp(18));
        sheet.setBackground(serverSheetBackground());

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout heading = new LinearLayout(this);
        heading.setOrientation(LinearLayout.VERTICAL);
        TextView kicker = text("服务器", 11, Color.rgb(46, 107, 255));
        kicker.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        TextView title = text("切换工作台", 22, Color.rgb(16, 33, 61));
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        heading.addView(kicker);
        heading.addView(title);
        header.addView(heading, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        TextView close = text("×", 25, Color.rgb(92, 110, 135));
        close.setGravity(Gravity.CENTER);
        close.setContentDescription("关闭服务器列表");
        close.setBackground(roundedBackground(Color.rgb(242, 246, 251), 11));
        close.setOnClickListener((view) -> dialog.dismiss());
        header.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));
        sheet.addView(header, margins(2, 0, 0, 13));

        LinearLayout serverList = new LinearLayout(this);
        serverList.setOrientation(LinearLayout.VERTICAL);
        for (String address : servers) {
            serverList.addView(serverRow(dialog, address, address.equals(current)));
        }
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.addView(serverList);
        int listHeight = Math.min(servers.size() * 68, 326);
        sheet.addView(scroll, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(listHeight)
        ));

        TextView addServer = text("＋  添加服务器", 14, Color.WHITE);
        addServer.setGravity(Gravity.CENTER);
        addServer.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        addServer.setBackground(roundedBackground(Color.rgb(46, 107, 255), 12));
        addServer.setOnClickListener((view) -> {
            dialog.dismiss();
            showConnectionEditor("");
        });
        LinearLayout.LayoutParams addParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(48)
        );
        addParams.setMargins(0, dp(12), 0, 0);
        sheet.addView(addServer, addParams);

        dialog.setContentView(sheet);
        dialog.setCanceledOnTouchOutside(true);
        Window window = dialog.getWindow();
        if (window != null) window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        dialog.show();
        window = dialog.getWindow();
        if (window != null) {
            window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT);
            window.setGravity(Gravity.BOTTOM);
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.dimAmount = 0.34f;
            window.setAttributes(attributes);
        }
    }

    private View serverRow(Dialog dialog, String address, boolean current) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), dp(7), dp(10), dp(7));
        row.setBackground(roundedBackground(
            current ? Color.rgb(235, 242, 255) : Color.rgb(248, 250, 253),
            12
        ));
        row.setClickable(true);
        row.setFocusable(true);
        row.setOnClickListener((view) -> {
            dialog.dismiss();
            if (!current) switchServer(address);
        });

        View dot = new View(this);
        int dotColor = current
            ? "online".equals(orbConnectionState)
                ? Color.rgb(19, 138, 100)
                : "connecting".equals(orbConnectionState)
                    ? Color.rgb(245, 166, 35)
                    : Color.rgb(189, 60, 74)
            : Color.rgb(175, 188, 205);
        dot.setBackground(ovalBackground(dotColor));
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dp(10), dp(10));
        dotParams.setMarginEnd(dp(11));
        row.addView(dot, dotParams);

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        TextView host = text(serverHost(address), 14, Color.rgb(16, 33, 61));
        host.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        TextView url = text(address, 10, Color.rgb(101, 120, 145));
        url.setSingleLine(true);
        url.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        copy.addView(host);
        copy.addView(url);
        row.addView(copy, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        TextView trailing = text(current ? "当前" : "×", current ? 10 : 20, current ? Color.rgb(23, 79, 201) : Color.rgb(139, 83, 93));
        trailing.setGravity(Gravity.CENTER);
        if (current) {
            trailing.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            trailing.setBackground(roundedBackground(Color.rgb(218, 231, 255), 8));
        } else {
            trailing.setContentDescription("移除服务器 " + serverHost(address));
            trailing.setBackground(roundedBackground(Color.rgb(253, 243, 245), 9));
            trailing.setClickable(true);
            trailing.setOnClickListener((view) -> {
                forgetServer(address);
                dialog.dismiss();
                showServerChooser();
            });
        }
        row.addView(trailing, new LinearLayout.LayoutParams(current ? dp(42) : dp(28), dp(32)));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(62)
        );
        params.setMargins(0, 0, 0, dp(6));
        row.setLayoutParams(params);
        return row;
    }

    private String serverHost(String address) {
        Uri uri = Uri.parse(address);
        String host = uri.getHost() == null ? address : uri.getHost();
        return uri.getPort() > 0 ? host + ":" + uri.getPort() : host;
    }

    private GradientDrawable serverSheetBackground() {
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(255, 255, 255));
        float radius = dp(22);
        background.setCornerRadii(new float[] { radius, radius, radius, radius, 0, 0, 0, 0 });
        return background;
    }

    private void hideSoftwareKeyboard() {
        InputMethodManager keyboard = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null && appRoot != null) {
            keyboard.hideSoftInputFromWindow(appRoot.getWindowToken(), 0);
        }
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
            request.setDescription("来自 CodexLAN");
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

    private void openExternalDownload(String url) {
        if (!isCurrentWorkspaceUrl(url)) {
            Toast.makeText(this, "已阻止非当前工作台的下载地址", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(Intent.createChooser(intent, "选择浏览器下载"));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可打开下载链接的浏览器", Toast.LENGTH_SHORT).show();
        }
    }

    private void shareText(String title, String contents) {
        String text = contents == null ? "" : contents;
        if (text.trim().isEmpty()) {
            Toast.makeText(this, "没有可分享的内容", Toast.LENGTH_SHORT).show();
            return;
        }
        if (text.length() > 500_000) {
            Toast.makeText(this, "内容过长，请先转为 PDF 后分享", Toast.LENGTH_LONG).show();
            return;
        }
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_SUBJECT, normalizedDocumentTitle(title));
        share.putExtra(Intent.EXTRA_TEXT, text);
        try {
            startActivity(Intent.createChooser(share, "分享对话内容"));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可接收文本的应用", Toast.LENGTH_SHORT).show();
        }
    }

    private void printMarkdown(String title, String documentHtml) {
        loadPrintableDocument(title, documentHtml, (view, documentTitle) -> {
            PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            if (manager == null) {
                Toast.makeText(MainActivity.this, "系统打印服务不可用", Toast.LENGTH_SHORT).show();
                releasePrintableDocument(view);
                return;
            }
            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(documentTitle);
            manager.print(documentTitle, adapter, null);
        });
    }

    private void shareMarkdownAsPdf(String title, String documentHtml) {
        Toast.makeText(this, "正在生成 PDF…", Toast.LENGTH_SHORT).show();
        loadPrintableDocument(title, documentHtml, this::writeAndSharePdf);
    }

    private void shareDocument(String title, String markdown, String documentHtml) {
        String contents = markdown == null ? "" : markdown;
        if (contents.trim().isEmpty()) {
            Toast.makeText(this, "没有可分享的内容", Toast.LENGTH_SHORT).show();
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("选择分享格式")
            .setItems(new String[] { "PDF 文件", "Markdown 文件" }, (dialog, which) -> {
                if (which == 0) shareMarkdownAsPdf(title, documentHtml);
                else shareMarkdownFile(title, contents);
            })
            .setNegativeButton("取消", null)
            .show();
    }

    private void shareMarkdownFile(String title, String contents) {
        File file = null;
        try {
            file = createSharedFile(title, "shared-markdown", ".md");
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(contents.getBytes(StandardCharsets.UTF_8));
            }
            shareFile(title, file, "text/markdown", "分享 Markdown");
        } catch (IOException error) {
            if (file != null) file.delete();
            Toast.makeText(this, "Markdown 文件生成失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void loadPrintableDocument(String title, String documentHtml, PrintableDocumentReady callback) {
        String html = documentHtml == null ? "" : documentHtml;
        if (html.trim().isEmpty()) {
            Toast.makeText(this, "没有可转换的内容", Toast.LENGTH_SHORT).show();
            return;
        }
        if (html.length() > 2_000_000) {
            Toast.makeText(this, "内容过长，无法生成 PDF", Toast.LENGTH_LONG).show();
            return;
        }
        if (printWebView != null) {
            releasePrintableDocument(printWebView);
        }
        printWebView = new WebView(this);
        printWebView.setBackgroundColor(Color.WHITE);
        printWebView.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        printWebView.getSettings().setJavaScriptEnabled(false);
        printWebView.getSettings().setAllowFileAccess(false);
        printWebView.getSettings().setAllowContentAccess(false);
        printWebView.setWebViewClient(new WebViewClient() {
            private boolean documentReady;

            @Override
            public void onPageFinished(WebView view, String url) {
                if (documentReady || view != printWebView) return;
                documentReady = true;
                view.postVisualStateCallback(SystemClock.uptimeMillis(), new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        if (view != printWebView) return;
                        view.postDelayed(() -> {
                            if (view == printWebView) callback.onReady(view, normalizedDocumentTitle(title));
                        }, 80);
                    }
                });
            }
        });
        workspaceContainer.addView(printWebView, 0, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        String address = preferences.getString(ADDRESS_KEY, "");
        String baseUrl = isWorkspaceAddress(address) ? normalizeAddress(address) + "/" : null;
        printWebView.loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null);
    }

    private void writeAndSharePdf(WebView view, String title) {
        final int pageWidth = 595;
        final int pageHeight = 842;
        final int margin = 42;
        Picture picture = view.capturePicture();
        final int sourceWidth = picture.getWidth();
        final int sourceHeight = picture.getHeight();
        if (sourceWidth <= 0 || sourceHeight <= 0) {
            releasePrintableDocument(view);
            Toast.makeText(this, "PDF 页面尚未渲染，请重试", Toast.LENGTH_LONG).show();
            return;
        }
        final float scale = (float) (pageWidth - margin * 2) / sourceWidth;
        final float sourcePageHeight = (pageHeight - margin * 2) / scale;
        int pageCount = Math.max(1, (int) Math.ceil(sourceHeight / sourcePageHeight));
        if (pageCount > 100) {
            releasePrintableDocument(view);
            Toast.makeText(this, "内容超过 100 页，无法直接分享 PDF", Toast.LENGTH_LONG).show();
            return;
        }

        File file = null;
        PdfDocument document = new PdfDocument();
        try {
            file = createSharedFile(title, "shared-pdf", ".pdf");
            for (int pageNumber = 0; pageNumber < pageCount; pageNumber += 1) {
                PdfDocument.PageInfo info = new PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber + 1).create();
                PdfDocument.Page page = document.startPage(info);
                page.getCanvas().drawColor(Color.WHITE);
                page.getCanvas().save();
                page.getCanvas().translate(margin, margin);
                page.getCanvas().clipRect(0, 0, pageWidth - margin * 2, pageHeight - margin * 2);
                page.getCanvas().scale(scale, scale);
                page.getCanvas().translate(0, -pageNumber * sourcePageHeight);
                picture.draw(page.getCanvas());
                page.getCanvas().restore();
                document.finishPage(page);
            }
            try (FileOutputStream output = new FileOutputStream(file)) {
                document.writeTo(output);
            }
            releasePrintableDocument(view);
            shareFile(title, file, "application/pdf", "分享 PDF");
        } catch (IOException | RuntimeException error) {
            if (file != null) file.delete();
            releasePrintableDocument(view);
            Toast.makeText(this, "PDF 生成失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
        } finally {
            document.close();
        }
    }

    private File createSharedFile(String title, String directoryName, String extension) throws IOException {
        File directory = new File(getCacheDir(), directoryName);
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create PDF cache");
        long cutoff = System.currentTimeMillis() - 86_400_000L;
        File[] existing = directory.listFiles();
        if (existing != null) {
            for (File file : existing) if (file.lastModified() < cutoff) file.delete();
        }
        String safeTitle = normalizedDocumentTitle(title).replaceAll("[\\\\/:*?\"<>|]+", "-").trim();
        if (safeTitle.isEmpty()) safeTitle = "CodexLAN 对话";
        if (safeTitle.length() > 60) safeTitle = safeTitle.substring(0, 60);
        return new File(directory, safeTitle + "-" + System.currentTimeMillis() + extension);
    }

    private void shareFile(String title, File file, String mimeType, String chooserTitle) {
        Uri uri = SharedFileProvider.uriForFile(this, file);
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType(mimeType);
        share.putExtra(Intent.EXTRA_SUBJECT, normalizedDocumentTitle(title));
        share.putExtra(Intent.EXTRA_STREAM, uri);
        share.setClipData(ClipData.newUri(getContentResolver(), file.getName(), uri));
        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(Intent.createChooser(share, chooserTitle));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可接收该文件的应用", Toast.LENGTH_SHORT).show();
        }
    }

    private void releasePrintableDocument(WebView view) {
        if (view != printWebView) return;
        view.stopLoading();
        if (view.getParent() instanceof ViewGroup parent) parent.removeView(view);
        view.destroy();
        printWebView = null;
    }

    private interface PrintableDocumentReady {
        void onReady(WebView view, String title);
    }

    private String normalizedDocumentTitle(String title) {
        String value = title == null ? "" : title.replaceAll("[\\r\\n\\t]+", " ").trim();
        if (value.isEmpty()) value = "CodexLAN 对话";
        return value.length() > 80 ? value.substring(0, 80) : value;
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

    private void captureSharedFiles(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;

        LinkedHashSet<Uri> selected = new LinkedHashSet<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Uri single = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            if (single != null) selected.add(single);
            ArrayList<Uri> multiple = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
            if (multiple != null) selected.addAll(multiple);
        } else {
            Uri single = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (single != null) selected.add(single);
            ArrayList<Uri> multiple = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (multiple != null) selected.addAll(multiple);
        }
        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index++) {
                Uri uri = clipData.getItemAt(index).getUri();
                if (uri != null) selected.add(uri);
            }
        }

        pendingSharedUris.clear();
        for (Uri uri : selected) {
            if ("content".equalsIgnoreCase(uri.getScheme())) pendingSharedUris.add(uri);
        }
        if (pendingSharedUris.isEmpty()) {
            Toast.makeText(this, "分享内容中没有可读取的文件", Toast.LENGTH_LONG).show();
            return;
        }
        dispatchPendingSharedFiles();
    }

    private void dispatchPendingSharedFiles() {
        if (pendingSharedUris.isEmpty() || webView == null || fileChooserCallback != null) return;
        webView.post(() -> webView.evaluateJavascript(
            "window.codexReceiveAndroidShare ? window.codexReceiveAndroidShare() : 'not-ready'",
            null
        ));
    }

    private void deliverPendingSharedFiles(ValueCallback<Uri[]> callback) {
        Uri[] uris = pendingSharedUris.toArray(new Uri[0]);
        pendingSharedUris.clear();
        callback.onReceiveValue(uris);
        Toast.makeText(this, uris.length == 1 ? "已加入分享的文件" : "已加入 " + uris.length + " 个分享文件", Toast.LENGTH_SHORT).show();
    }

    private void showAttachmentSourceChooser() {
        new AlertDialog.Builder(this)
            .setTitle("添加附件")
            .setItems(new String[] { "照片和截图", "文件" }, (dialog, index) -> {
                if (index == 0) launchImagePicker();
                else launchDocumentPicker();
            })
            .setOnCancelListener((dialog) -> finishFileSelection(null))
            .show();
    }

    private void launchImagePicker() {
        Intent picker;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            picker = new Intent(MediaStore.ACTION_PICK_IMAGES);
            picker.setType("image/*");
            picker.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(20, MediaStore.getPickImagesMaxLimit()));
        } else {
            picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("image/*");
            picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        startFilePicker(picker, "无法打开系统照片选择器");
    }

    private void launchDocumentPicker() {
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        picker.addCategory(Intent.CATEGORY_OPENABLE);
        picker.setType("*/*");
        picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startFilePicker(picker, "无法打开系统文件选择器");
    }

    private void startFilePicker(Intent picker, String failureMessage) {
        try {
            startActivityForResult(picker, FILE_CHOOSER_REQUEST);
        } catch (Exception error) {
            finishFileSelection(null);
            Toast.makeText(this, failureMessage, Toast.LENGTH_LONG).show();
        }
    }

    private void finishFileSelection(Uri[] selected) {
        if (fileChooserCallback == null) return;
        fileChooserCallback.onReceiveValue(selected);
        fileChooserCallback = null;
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (connectionPanel != null) {
            String storedAddress = preferences.getString(ADDRESS_KEY, "");
            if (isWorkspaceAddress(storedAddress)) {
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

    @SuppressWarnings("deprecation")
    private void applyTopSystemInset(View view, int left, int top, int right, int bottom) {
        view.setOnApplyWindowInsetsListener((target, windowInsets) -> {
            int topInset;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets safeArea = windowInsets.getInsets(WindowInsets.Type.statusBars() | WindowInsets.Type.displayCutout());
                topInset = safeArea.top;
            } else {
                topInset = windowInsets.getSystemWindowInsetTop();
            }
            target.setPadding(left, top + topInset, right, bottom);
            return windowInsets;
        });
        view.requestApplyInsets();
    }

    private final class WorkspaceWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri workspace = Uri.parse(preferences.getString(ADDRESS_KEY, ""));
            Uri target = request.getUrl();
            if (isSameWorkspaceOrigin(target, workspace)) return false;
            String scheme = target.getScheme();
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme) && !"mailto".equalsIgnoreCase(scheme)) {
                Toast.makeText(MainActivity.this, "无法打开这个链接", Toast.LENGTH_SHORT).show();
                return true;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, target));
            } catch (ActivityNotFoundException error) {
                Toast.makeText(MainActivity.this, "没有可打开这个链接的应用", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            cancelConnectionTimeout();
            Uri current = Uri.parse(preferences.getString(ADDRESS_KEY, ""));
            if (connectionPanel == null && isSameWorkspaceOrigin(Uri.parse(url), current)) {
                setOrbConnectionState("online");
            }
            dispatchPendingSharedFiles();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            cancelConnectionTimeout();
            setOrbConnectionState("offline");
            String description = error == null || error.getDescription() == null ? "无法连接服务器" : error.getDescription().toString();
            runOnUiThread(() -> showConnectionEditor("连接失败：" + description + "。请检查地址后重试。"));
        }
    }

    private final class ControlOrbView extends FrameLayout {
        ControlOrbView(Context context) {
            super(context);
        }

        @Override
        public boolean performClick() {
            super.performClick();
            return true;
        }
    }

    private final class WorkspaceWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = callback;
            if (!pendingSharedUris.isEmpty()) deliverPendingSharedFiles(callback);
            else showAttachmentSourceChooser();
            return true;
        }
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void copyText(String contents) {
            runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard == null) {
                    Toast.makeText(MainActivity.this, "系统剪贴板不可用", Toast.LENGTH_SHORT).show();
                    return;
                }
                clipboard.setPrimaryClip(ClipData.newPlainText("CodexLAN", contents == null ? "" : contents));
            });
        }

        @JavascriptInterface
        public void openConnectionSettings() {
            runOnUiThread(() -> showConnectionEditor(""));
        }

        @JavascriptInterface
        public void readyForSharedFiles() {
            runOnUiThread(MainActivity.this::dispatchPendingSharedFiles);
        }

        @JavascriptInterface
        public void hideKeyboard() {
            runOnUiThread(MainActivity.this::hideSoftwareKeyboard);
        }

        @JavascriptInterface
        public void shareText(String title, String contents) {
            runOnUiThread(() -> MainActivity.this.shareText(title, contents));
        }

        @JavascriptInterface
        public void shareMarkdownAsPdf(String title, String documentHtml) {
            runOnUiThread(() -> MainActivity.this.shareMarkdownAsPdf(title, documentHtml));
        }

        @JavascriptInterface
        public void shareDocument(String title, String markdown, String documentHtml) {
            runOnUiThread(() -> MainActivity.this.shareDocument(title, markdown, documentHtml));
        }

        @JavascriptInterface
        public void printMarkdown(String title, String documentHtml) {
            runOnUiThread(() -> MainActivity.this.printMarkdown(title, documentHtml));
        }

        @JavascriptInterface
        public void openExternalDownload(String url) {
            runOnUiThread(() -> MainActivity.this.openExternalDownload(url));
        }
    }
}

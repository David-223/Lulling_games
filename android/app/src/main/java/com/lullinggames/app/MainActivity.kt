package com.lullinggames.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.net.http.SslError
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.webkit.*
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.lullinggames.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences
    private var currentUrl: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = "Lulling Games"

        prefs = getSharedPreferences("lulling_prefs", Context.MODE_PRIVATE)

        setupWebView()
        setupSwipeRefresh()

        val ip = prefs.getString("server_ip", "") ?: ""
        if (ip.isEmpty()) {
            showServerDialog(firstLaunch = true)
        } else {
            loadServer(ip)
        }
    }

    // ── WebView Setup ──────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        with(binding.webView) {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_NO_CACHE
            }

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    binding.swipeRefresh.isRefreshing = false
                    binding.errorView.isVisible = false
                    binding.webView.isVisible = true
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                ) {
                    if (request.isForMainFrame) {
                        binding.swipeRefresh.isRefreshing = false
                        showErrorPage()
                    }
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    // Stay within same host
                    val host = request.url.host ?: return false
                    val serverIp = prefs.getString("server_ip", "") ?: ""
                    return !host.contains(serverIp)
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onJsAlert(
                    view: WebView, url: String, message: String, result: JsResult
                ): Boolean {
                    AlertDialog.Builder(this@MainActivity)
                        .setMessage(message)
                        .setPositiveButton("OK") { _, _ -> result.confirm() }
                        .setOnCancelListener { result.cancel() }
                        .show()
                    return true
                }

                override fun onJsConfirm(
                    view: WebView, url: String, message: String, result: JsResult
                ): Boolean {
                    AlertDialog.Builder(this@MainActivity)
                        .setMessage(message)
                        .setPositiveButton("OK") { _, _ -> result.confirm() }
                        .setNegativeButton("Abbrechen") { _, _ -> result.cancel() }
                        .setOnCancelListener { result.cancel() }
                        .show()
                    return true
                }
            }
        }
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setColorSchemeColors(Color.parseColor("#e74c3c"))
        binding.swipeRefresh.setProgressBackgroundColorSchemeColor(Color.parseColor("#11111a"))
        binding.swipeRefresh.setOnRefreshListener {
            if (currentUrl.isNotEmpty()) {
                binding.webView.reload()
            } else {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    // ── Load server ────────────────────────────────────────────────────

    private fun loadServer(ip: String) {
        val port = prefs.getInt("server_port", 3000)
        currentUrl = "http://$ip:$port"
        binding.webView.isVisible = true
        binding.errorView.isVisible = false
        binding.webView.loadUrl(currentUrl)
    }

    private fun showErrorPage() {
        binding.webView.isVisible = false
        binding.errorView.isVisible = true
        val ip = prefs.getString("server_ip", "—") ?: "—"
        val port = prefs.getInt("server_port", 3000)
        binding.errorMessage.text = "Server nicht erreichbar\nhttp://$ip:$port\n\nStell sicher, dass der Server\nim lokalen Netzwerk läuft."
    }

    // ── Server Dialog ──────────────────────────────────────────────────

    private fun showServerDialog(firstLaunch: Boolean = false) {
        val savedIp = prefs.getString("server_ip", "") ?: ""
        val savedPort = prefs.getInt("server_port", 3000)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (20 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, 0)
        }

        val titleHint = TextView(this).apply {
            text = "Server-IP eingeben (z.B. 192.168.1.100)"
            setTextColor(Color.parseColor("#8888aa"))
            textSize = 13f
        }

        val ipInput = EditText(this).apply {
            setText(savedIp)
            hint = "192.168.1.100"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setTextColor(Color.parseColor("#e8e8f0"))
            setHintTextColor(Color.parseColor("#555577"))
        }

        val portHint = TextView(this).apply {
            text = "Port (Standard: 3000)"
            setTextColor(Color.parseColor("#8888aa"))
            textSize = 13f
            setPadding(0, (12 * resources.displayMetrics.density).toInt(), 0, 0)
        }

        val portInput = EditText(this).apply {
            setText(savedPort.toString())
            hint = "3000"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setTextColor(Color.parseColor("#e8e8f0"))
            setHintTextColor(Color.parseColor("#555577"))
        }

        layout.addView(titleHint)
        layout.addView(ipInput)
        layout.addView(portHint)
        layout.addView(portInput)

        val title = if (firstLaunch) "Server einrichten" else "Server einstellen"

        AlertDialog.Builder(this)
            .setTitle(title)
            .setView(layout)
            .setPositiveButton("Verbinden") { _, _ ->
                val ip = ipInput.text.toString().trim()
                val port = portInput.text.toString().toIntOrNull() ?: 3000
                if (ip.isNotEmpty()) {
                    prefs.edit()
                        .putString("server_ip", ip)
                        .putInt("server_port", port)
                        .apply()
                    loadServer(ip)
                } else if (!firstLaunch) {
                    // Do nothing if empty on re-open
                }
            }
            .apply {
                if (!firstLaunch) {
                    setNegativeButton("Abbrechen", null)
                }
                setCancelable(!firstLaunch)
            }
            .show()
    }

    // ── Menu ───────────────────────────────────────────────────────────

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.menu_refresh -> {
                binding.swipeRefresh.isRefreshing = true
                binding.webView.reload()
                true
            }
            R.id.menu_home -> {
                val ip = prefs.getString("server_ip", "") ?: ""
                if (ip.isNotEmpty()) {
                    val port = prefs.getInt("server_port", 3000)
                    binding.webView.loadUrl("http://$ip:$port/index.html")
                }
                true
            }
            R.id.menu_admin -> {
                val ip = prefs.getString("server_ip", "") ?: ""
                if (ip.isNotEmpty()) {
                    val port = prefs.getInt("server_port", 3000)
                    binding.webView.loadUrl("http://$ip:$port/admin.html")
                }
                true
            }
            R.id.menu_settings -> {
                showServerDialog(firstLaunch = false)
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    // ── Error Screen Button ───────────────────────────────────────────

    fun onSettingsClick(view: android.view.View) {
        showServerDialog(firstLaunch = false)
    }

    // ── Back Navigation ────────────────────────────────────────────────

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}

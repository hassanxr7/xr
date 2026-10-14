package studio.nssr.demobetting;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Demo Betting for Android: a full-screen WebView around the website.
 * The site's own pages and SovaMoney's checkout stay inside the app (so the payment returns
 * to the same session); any other link opens in the phone's browser.
 * Accounts, bets and the wallet live in the site's localStorage, so DOM storage is enabled.
 */
public class MainActivity extends Activity {
    private static final String APP_UA = " DemoBettingApp/1";
    private static final String OFFLINE = "file:///android_asset/offline.html";

    private WebView web;
    private String home;
    private String homeHost;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        home = getString(R.string.site_url);
        homeHost = Uri.parse(home).getHost();

        web = new WebView(this);
        web.setBackgroundColor(0xFF0A1622);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + APP_UA); // lets the site hide its "download app" links
        CookieManager.getInstance().setAcceptCookie(true);

        web.setWebViewClient(new Client());
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);

        if (state == null || web.restoreState(state) == null) web.loadUrl(home);
    }

    private boolean staysInApp(Uri u) {
        String scheme = u.getScheme();
        String host = u.getHost();
        if (host == null || !"https".equalsIgnoreCase(scheme)) return false;
        return host.equalsIgnoreCase(homeHost) || host.equalsIgnoreCase("sovamoney.com") || host.equalsIgnoreCase("www.sovamoney.com");
    }

    private class Client extends WebViewClient {
        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri u = Uri.parse(url);
            if ("app".equals(u.getScheme())) {
                view.loadUrl(home); // "Try again" on the offline page
                return true;
            }
            if (staysInApp(u)) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (ActivityNotFoundException e) {
                // nothing can open it; stay on the current page
            }
            return true;
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            // the legacy callback only fires for the main page, so a failed image never blanks the app
            view.loadUrl(OFFLINE);
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack() && !OFFLINE.equals(web.getUrl())) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}

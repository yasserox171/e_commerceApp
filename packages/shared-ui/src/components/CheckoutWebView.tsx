import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { useTheme } from '../theme/ThemeProvider.js';
import type { CheckoutSession } from '../types.js';
import { Text } from './Text.js';

export type CheckoutResultStatus = 'success' | 'failed' | 'cancelled' | 'unverified';

export interface CheckoutWebViewProps {
  session: CheckoutSession;
  /** Fired once the gateway bounces back to the app's deep link. */
  onResult: (result: { status: CheckoutResultStatus; reference: string }) => void;
  onError?: (message: string) => void;
}

/**
 * Hosts the gateway's own card page.
 *
 * The card number is typed into CMI's page inside this WebView — it never
 * passes through the app or the API, which is what keeps PCI scope off this
 * codebase. Two things happen here:
 *
 *   1. A `form_post` instruction is rendered as an auto-submitting HTML form,
 *      because CMI's 3D_PAY_HOSTING entry point only accepts POST.
 *   2. Navigation is watched for the app's deep-link prefix; when the gateway
 *      redirects there, the sheet closes and the result is reported.
 */
export function CheckoutWebView({ session, onResult, onError }: CheckoutWebViewProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  // The gateway redirects several times during 3-D Secure; only the first hit
  // on the return prefix counts.
  const settled = useRef(false);

  const source = useMemo(() => {
    if (session.instruction.kind === 'redirect') {
      return { uri: session.instruction.url };
    }
    return {
      html: buildAutoSubmitForm(session.instruction.url, session.instruction.fields),
      baseUrl: session.instruction.url,
    };
  }, [session.instruction]);

  const handleNavigation = (event: WebViewNavigation): boolean => {
    if (settled.current) return false;
    if (!event.url.startsWith(session.returnUrlPrefix)) return true;

    settled.current = true;
    const params = parseQuery(event.url);
    const status = (params.status ?? 'failed') as CheckoutResultStatus;
    onResult({
      status: ['success', 'failed', 'cancelled', 'unverified'].includes(status) ? status : 'failed',
      reference: params.reference ?? session.reference,
    });
    // Stop the WebView from trying to resolve a scheme it cannot open.
    return false;
  };

  return (
    <View style={styles.container}>
      <WebView
        source={source}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={handleNavigation}
        onNavigationStateChange={(event) => {
          // Android does not always route custom schemes through
          // onShouldStartLoadWithRequest, so the result is caught here too.
          if (event.url.startsWith(session.returnUrlPrefix)) handleNavigation(event);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={(event) => {
          setLoading(false);
          onError?.(event.nativeEvent.description ?? 'تعذر تحميل صفحة الدفع');
        }}
        javaScriptEnabled
        domStorageEnabled
        // 3-D Secure steps are served from the issuing bank, a different origin.
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        startInLoadingState={false}
        style={{ backgroundColor: theme.colors.surface }}
      />

      {loading && (
        <View style={[styles.loader, { backgroundColor: theme.colors.surface, gap: theme.spacing.md }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="callout" color={theme.colors.textMuted}>
            جارٍ فتح صفحة الدفع الآمنة…
          </Text>
        </View>
      )}
    </View>
  );
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildAutoSubmitForm(action: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeAttribute(name)}" value="${escapeAttribute(value)}">`)
    .join('\n');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:#FAF7F2;
       font-family:system-ui,-apple-system,sans-serif;color:#57534E}
</style>
</head>
<body>
  <p>جارٍ التحويل إلى صفحة الدفع…</p>
  <form id="gw" method="POST" action="${escapeAttribute(action)}" accept-charset="UTF-8">
${inputs}
  </form>
  <script>document.getElementById('gw').submit();</script>
</body>
</html>`;
}

function parseQuery(url: string): Record<string, string> {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return {};

  const result: Record<string, string> = {};
  for (const pair of url.slice(queryStart + 1).split('&')) {
    if (!pair) continue;
    const [key = '', value = ''] = pair.split('=');
    try {
      result[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

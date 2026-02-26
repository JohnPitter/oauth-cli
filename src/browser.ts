import { chromium, type Browser } from "playwright";

export interface CapturedParams {
  [key: string]: string;
}

export interface CaptureResult {
  params: CapturedParams;
  redirectUrl: string;
}

async function launchBrowser(): Promise<Browser> {
  // Try real Chrome first (avoids "browser not secure" blocks)
  try {
    return await chromium.launch({
      headless: false,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch {
    // Fallback to bundled Chromium
    console.log("Chrome not available, using Chromium...");
    return await chromium.launch({
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
    });
  }
}

export async function captureOAuth(
  authUrl: string,
  redirectPattern: RegExp,
): Promise<CaptureResult> {
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const redirectUrl = await new Promise<string>((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Timed out waiting for redirect (5 minutes)"));
        }
      }, 5 * 60 * 1000);

      const settle = (url: string) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          clearInterval(interval);
          resolve(url);
        }
      };

      // Use CDP to monitor ALL requests at the network level
      // This catches requests even if they fail (localhost not running)
      const cdp = context.newCDPSession(page).then((client) => {
        client.send("Network.enable").then(() => {
          client.on("Network.requestWillBeSent", (params: { request: { url: string } }) => {
            const url = params.request.url;
            if (redirectPattern.test(url)) {
              settle(url);
            }
          });
        });
      });

      // Also try page.route as backup
      page.route("**/*", (route) => {
        const url = route.request().url();
        if (redirectPattern.test(url)) {
          route.abort().catch(() => {});
          settle(url);
        } else {
          route.continue().catch(() => {});
        }
      });

      // Monitor URL bar changes too
      page.on("framenavigated", () => {
        try {
          const url = page.url();
          if (redirectPattern.test(url)) {
            settle(url);
          }
        } catch { /* page closed */ }
      });

      const interval = setInterval(() => {
        if (page.isClosed()) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            clearInterval(interval);
            reject(new Error("Browser was closed before redirect was captured"));
          }
          return;
        }
      }, 500);

      // Navigate after all listeners are ready
      cdp.then(() => {
        page.goto(authUrl, { waitUntil: "commit" }).catch(() => {});
      });
    });

    console.log("Redirect captured!");

    // Parse query params and hash fragment
    const params: CapturedParams = {};
    const parsed = new URL(redirectUrl);
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.slice(1));
      hashParams.forEach((value, key) => {
        params[key] = value;
      });
    }

    return { params, redirectUrl };
  } finally {
    await browser.close();
  }
}

#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

// Load .env file if present (no external dependency)
try {
  const envFile = readFileSync(".env", "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch { /* no .env file, that's fine */ }

import { getProvider, listProviderNames, type OAuthProviderConfig, type DeviceFlowProviderConfig } from "./providers.js";
import { generateCodeVerifier, generateCodeChallenge, buildAuthUrl, exchangeCode } from "./oauth.js";
import { captureOAuth } from "./browser.js";
import { saveToken, type TokenData } from "./store.js";

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    return null;
  }
}

async function handleApiKey(providerName: string, instruction: string): Promise<void> {
  console.log(`\n${instruction}\n`);

  const rl = createInterface({ input: stdin, output: stdout });
  const apiKey = await rl.question("Paste your API key: ");
  rl.close();

  if (!apiKey.trim()) {
    console.error("No API key provided. Aborting.");
    process.exit(1);
  }

  await saveToken(providerName, {
    provider: providerName,
    type: "api_key",
    apiKey: apiKey.trim(),
    createdAt: new Date().toISOString(),
  });

  console.log(`\nAPI key saved for ${providerName}.`);
}

async function handleOAuth(providerName: string, config: OAuthProviderConfig): Promise<void> {
  // Generate PKCE
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString("hex");

  // Build auth URL
  const authUrl = buildAuthUrl(config, codeChallenge, state);
  console.log(`Opening browser for ${config.displayName} authentication...`);

  // Capture via Playwright
  const { params, redirectUrl } = await captureOAuth(authUrl, config.redirectPattern);

  // Extract the actual redirect URI used (without query params) for token exchange
  const actualRedirectUri = redirectUrl.split("?")[0].split("#")[0];

  // Determine what we got
  const idToken = params["id_token"];
  const code = params["code"];

  let tokenData: TokenData;

  if (idToken) {
    // Simplified flow — id_token delivered directly in redirect
    const payload = decodeJwtPayload(idToken);
    const expiresAt = payload?.exp
      ? new Date((payload.exp as number) * 1000).toISOString()
      : undefined;

    tokenData = {
      provider: providerName,
      type: "oauth2",
      accessToken: idToken,
      idToken,
      expiresAt,
      scopes: params["scope"]?.split(/[\s,]+/),
      tokenType: "Bearer",
      createdAt: new Date().toISOString(),
    };

    console.log("\nSimplified flow: id_token received directly.");
    if (payload) {
      console.log(`  Email: ${payload.email ?? "n/a"}`);
      console.log(`  Plan: ${payload.plan_type ?? "n/a"}`);
      console.log(`  Expires: ${expiresAt ?? "unknown"}`);
    }
  } else if (code) {
    // Standard code exchange flow
    console.log("\nExchanging authorization code for tokens...");
    const tokens = await exchangeCode(config, code, codeVerifier, {
      redirectUri: actualRedirectUri,
      state: params["state"] ?? state,
    });

    const expiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
      : undefined;

    tokenData = {
      provider: providerName,
      type: "oauth2",
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      scopes: tokens.scope?.split(/[\s,]+/),
      tokenType: tokens.tokenType,
      createdAt: new Date().toISOString(),
    };

    console.log("Token exchange successful.");
  } else {
    // Fallback — use whatever params we got
    tokenData = {
      provider: providerName,
      type: "oauth2",
      accessToken: params["access_token"] ?? "",
      refreshToken: params["refresh_token"],
      scopes: params["scope"]?.split(/[\s,]+/),
      tokenType: params["token_type"],
      createdAt: new Date().toISOString(),
    };
  }

  await saveToken(providerName, tokenData);
  console.log(`\nTokens saved for ${providerName}. Check ~/.mcp-oauth/tokens.json`);
}

async function handleDeviceFlow(providerName: string, config: DeviceFlowProviderConfig): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...config.headers,
  };

  // Step 1: Request device code
  const codeResponse = await fetch(config.deviceCodeUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_id: config.clientId,
      scope: config.scopes,
    }),
  });

  if (!codeResponse.ok) {
    throw new Error(`Device code request failed (${codeResponse.status}): ${await codeResponse.text()}`);
  }

  const codeData = (await codeResponse.json()) as Record<string, unknown>;
  const deviceCode = codeData.device_code as string;
  const userCode = codeData.user_code as string;
  const verificationUri = codeData.verification_uri as string;
  const interval = ((codeData.interval as number) ?? 5) * 1000;

  console.log(`\n  Code: ${userCode}`);
  console.log(`  Open: ${verificationUri}`);
  console.log(`\nEnter the code above in your browser, then wait...`);

  // Open browser automatically
  const { execFile } = await import("node:child_process");
  const openCmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const openArgs = process.platform === "win32" ? ["/c", "start", verificationUri] : [verificationUri];
  execFile(openCmd, openArgs, () => {});

  // Step 2: Poll for token
  let accessToken = "";
  let tokenType = "";
  let scope = "";

  while (true) {
    await new Promise((r) => setTimeout(r, interval));

    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_id: config.clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const tokenData = (await tokenResponse.json()) as Record<string, unknown>;

    if (tokenData.error === "authorization_pending") {
      continue;
    }
    if (tokenData.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (tokenData.error) {
      throw new Error(`Device flow error: ${tokenData.error} — ${tokenData.error_description ?? ""}`);
    }

    accessToken = tokenData.access_token as string;
    tokenType = (tokenData.token_type as string) ?? "bearer";
    scope = (tokenData.scope as string) ?? "";
    break;
  }

  await saveToken(providerName, {
    provider: providerName,
    type: "oauth2",
    accessToken,
    scopes: scope ? scope.split(/[\s,]+/) : undefined,
    tokenType,
    createdAt: new Date().toISOString(),
  });

  console.log("Token received!");
  console.log(`\nTokens saved for ${providerName}. Check ~/.mcp-oauth/tokens.json`);
}

async function main(): Promise<void> {
  const providerName = process.argv[2];

  if (!providerName) {
    console.log("Usage: npx tsx src/index.ts <provider>");
    console.log(`\nAvailable providers: ${listProviderNames().join(", ")}`);
    process.exit(1);
  }

  const provider = getProvider(providerName);
  if (!provider) {
    console.error(`Unknown provider: ${providerName}`);
    console.error(`Available: ${listProviderNames().join(", ")}`);
    process.exit(1);
  }

  console.log(`Authenticating with ${provider.displayName}...`);

  if (provider.type === "api_key") {
    await handleApiKey(providerName, provider.instruction);
  } else if (provider.type === "device_flow") {
    await handleDeviceFlow(providerName, provider);
  } else {
    await handleOAuth(providerName, provider);
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

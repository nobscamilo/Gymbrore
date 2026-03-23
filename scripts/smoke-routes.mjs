#!/usr/bin/env node

const baseUrlRaw = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const baseUrl = baseUrlRaw.replace(/\/+$/, "");

const routes = [
  "/",
  "/login",
  "/dashboard",
  "/dashboard/plan",
  "/dashboard/session",
  "/dashboard/nutrition",
  "/dashboard/library",
  "/dashboard/settings",
  "/legal/privacy",
  "/legal/terms",
];

const timeoutMs = 20_000;
const failures = [];

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "gymbro-smoke-check/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

console.log(`\nRoute smoke check against: ${baseUrl}\n`);

for (const route of routes) {
  const url = `${baseUrl}${route}`;
  const start = Date.now();

  try {
    const response = await fetchWithTimeout(url);
    const ms = Date.now() - start;
    const body = await response.text();
    const looksLikeHtml = /<html/i.test(body);
    const okStatus = response.status >= 200 && response.status < 500;

    if (!okStatus || !looksLikeHtml) {
      failures.push({
        route,
        status: response.status,
        reason: !okStatus ? "status>=500 or invalid status" : "response body is not HTML",
      });
      console.log(`FAIL  ${route}  status=${response.status}  ${ms}ms`);
    } else {
      console.log(`PASS  ${route}  status=${response.status}  ${ms}ms`);
    }
  } catch (error) {
    failures.push({
      route,
      status: "ERR",
      reason: error instanceof Error ? error.message : String(error),
    });
    console.log(`FAIL  ${route}  status=ERR  ${Date.now() - start}ms`);
  }
}

if (failures.length > 0) {
  console.error("\nSmoke check failures:");
  failures.forEach((failure) => {
    console.error(`- ${failure.route}: [${failure.status}] ${failure.reason}`);
  });
  process.exit(1);
}

console.log("\nAll smoke checks passed.");

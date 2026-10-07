import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;

const here = path.dirname(fileURLToPath(import.meta.url));
const width = 900;
const height = 300;
const frameCount = 36;
const frameDelay = 80;

function mime(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const safePath = path.normalize(urlPath).replace(/^([.][.][/\\])+/, "");
  const file = path.join(here, safePath === "/" ? "scene.html" : safePath);
  if (!file.startsWith(here) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": mime(file), "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));

async function profileActivity() {
  const owner = process.env.PROFILE_OWNER;
  const token = process.env.GITHUB_TOKEN;
  if (!owner) return { activity: 18, pushes: 8, pullRequests: 2 };

  try {
    const response = await fetch(`https://api.github.com/users/${owner}/events/public?per_page=100`, {
      headers: token
        ? { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" }
        : { accept: "application/vnd.github+json" }
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    const events = await response.json();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = events.filter((e) => Date.parse(e.created_at) >= cutoff);
    return {
      activity: recent.length,
      pushes: recent.filter((e) => e.type === "PushEvent").length,
      pullRequests: recent.filter((e) => e.type === "PullRequestEvent").length
    };
  } catch (error) {
    console.warn("Using fallback activity:", error.message);
    return { activity: 18, pushes: 8, pullRequests: 2 };
  }
}

const activity = await profileActivity();
console.log("Profile activity:", activity);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"]
});

try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:4173/scene.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate((data) => window.setProfileData(data), activity);

  const gif = GIFEncoder();

  for (let i = 0; i < frameCount; i++) {
    const progress = i / frameCount;
    await page.evaluate((p) => window.setFrame(p), progress);
    await page.waitForTimeout(18);

    const pngBuffer = await page.screenshot({ type: "png" });
    const png = PNG.sync.read(pngBuffer);
    const palette = quantize(png.data, 128);
    const index = applyPalette(png.data, palette);

    gif.writeFrame(index, width, height, {
      palette,
      delay: frameDelay,
      repeat: i === 0 ? 0 : undefined
    });
  }

  gif.finish();

  const output = path.resolve(here, "../assets/profile/generated/profile-loop.gif");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, Buffer.from(gif.bytes()));
  console.log(`Wrote ${output} (${fs.statSync(output).size} bytes)`);
} finally {
  await browser.close();
  server.close();
}

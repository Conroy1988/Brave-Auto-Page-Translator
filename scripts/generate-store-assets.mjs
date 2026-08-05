import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "store-assets");
const temporary = mkdtempSync(path.join(tmpdir(), "bapt-store-"));
mkdirSync(output, { recursive: true });

function escape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function icon(x, y, size) {
  const scale = size / 256;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <rect width="256" height="256" rx="58" fill="#0d0c18"/>
    <path d="M56 56h112a32 32 0 0 1 32 32v80a32 32 0 0 1-32 32H96l-40 28v-28a32 32 0 0 1-32-32V88a32 32 0 0 1 32-32Z" fill="url(#brand)"/>
    <path d="M79 161 112 84h25l33 77h-25l-6-16h-31l-6 16H79Zm37-37h16l-8-23-8 23Z" fill="white"/>
    <path d="M166 85h51l-13-13m13 13-13 13" fill="none" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="203" cy="186" r="31" fill="#0f9f8f" stroke="#0d0c18" stroke-width="9"/>
    <path d="m187 186 11 11 21-24" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function defs() {
  return `<defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b0a14"/><stop offset=".55" stop-color="#17142a"/><stop offset="1" stop-color="#102c2b"/></linearGradient>
    <linearGradient id="brand" x1="32" y1="20" x2="226" y2="238" gradientUnits="userSpaceOnUse"><stop stop-color="#8b7cff"/><stop offset=".52" stop-color="#6654f3"/><stop offset="1" stop-color="#0f9f8f"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#03030a" flood-opacity=".55"/></filter>
  </defs>`;
}

function text(x, y, value, size, weight = 500, fill = "#f7f7fb", anchor = "start") {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escape(value)}</text>`;
}

function shell(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs()}<rect width="100%" height="100%" fill="url(#background)"/>${body}</svg>`;
}

function writePng(name, width, height, body) {
  const svg = path.join(temporary, `${name}.svg`);
  const png = path.join(output, `${name}.png`);
  const source = shell(width, height, body);
  writeFileSync(svg, source);
  const rendered = new Resvg(source, { fitTo: { mode: "original" } }).render();
  writeFileSync(png, rendered.asPng());
  console.log(`Created store-assets/${name}.png (${width}x${height})`);
}

const bullets = (x, y, values, gap = 50) => values.map((value, index) => `
  <circle cx="${x}" cy="${y + index * gap - 7}" r="7" fill="#25c7aa"/>
  ${text(x + 24, y + index * gap, value, 24, 600, "#d7d4e1")}`).join("");

writePng("promo-small-440x280", 440, 280, `
  ${icon(24, 32, 76)}
  ${text(118, 62, "AUTO PAGE", 17, 800, "#9c91ff")}
  ${text(118, 91, "TRANSLATOR", 25, 800)}
  ${text(24, 148, "Foreign pages,", 31, 800)}
  ${text(24, 185, "your language.", 31, 800)}
  <rect x="24" y="218" width="202" height="38" rx="19" fill="#6d5dfc"/>
  ${text(125, 244, "Translate in place", 16, 700, "white", "middle")}
  <circle cx="378" cy="220" r="32" fill="#0f9f8f" opacity=".92"/>
  <path d="m361 220 12 12 24-28" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
`);

writePng("marquee-1400x560", 1400, 560, `
  <circle cx="1200" cy="80" r="360" fill="#6d5dfc" opacity=".10"/><circle cx="1150" cy="510" r="300" fill="#0f9f8f" opacity=".12"/>
  ${icon(90, 75, 108)}
  ${text(230, 118, "AUTO PAGE TRANSLATOR FOR BRAVE", 22, 800, "#9c91ff")}
  ${text(90, 234, "Read the web", 69, 800)}
  ${text(90, 313, "in your language.", 69, 800)}
  ${text(94, 373, "Automatic where you allow it. Private by design.", 27, 500, "#c9c5d7")}
  <rect x="94" y="420" width="250" height="58" rx="29" fill="#6d5dfc"/>${text(219, 458, "Translate in place", 20, 700, "white", "middle")}
  <g filter="url(#shadow)"><rect x="862" y="82" width="420" height="396" rx="30" fill="#171622" stroke="#383345"/>
    ${text(902, 131, "INDEPENDENT EXTENSION", 13, 800, "#9588ff")}${text(902, 168, "Auto Translator", 27, 800)}
    <rect x="902" y="197" width="340" height="83" rx="18" fill="#242130"/><circle cx="928" cy="225" r="7" fill="#25c7aa"/>
    ${text(947, 225, "Page translated", 18, 700)}${text(947, 252, "Spanish → English", 14, 500, "#aba7b6")}
    ${text(902, 319, "Translate pages into", 13, 700, "#bcb8c8")}<rect x="902" y="335" width="340" height="52" rx="12" fill="#211e2d" stroke="#4a4558"/>${text(920, 368, "English", 16, 600)}
    <rect x="902" y="407" width="340" height="50" rx="14" fill="#6d5dfc"/>${text(1072, 439, "Show original", 16, 700, "white", "middle")}
  </g>
`);

function screenshotHeader(number, title, subtitle) {
  return `${text(68, 67, `0${number}`, 18, 800, "#9588ff")}${text(110, 68, title, 30, 800)}${text(68, 108, subtitle, 18, 500, "#bbb7c7")}`;
}

writePng("screenshot-1-translate-1280x800", 1280, 800, `
  ${screenshotHeader(1, "Translate pages without leaving them", "Readable text changes in place. Restore the original at any time.")}
  <g filter="url(#shadow)"><rect x="64" y="150" width="810" height="575" rx="24" fill="#f6f4ee"/>
    <rect x="64" y="150" width="810" height="64" rx="24" fill="#2b2931"/><circle cx="98" cy="182" r="7" fill="#ff6b6b"/><circle cx="122" cy="182" r="7" fill="#ffd166"/><circle cx="146" cy="182" r="7" fill="#25c7aa"/>
    ${text(104, 279, "Madrid: culture, history and life", 34, 800, "#24212d")}${text(104, 326, "Explore neighbourhoods, museums and local traditions", 18, 500, "#625d68")}
    <rect x="104" y="370" width="720" height="1" fill="#ddd8cf"/>${text(104, 419, "A city made for walking", 24, 700, "#24212d")}
    ${text(104, 459, "Historic streets meet modern galleries and lively public squares.", 17, 500, "#56515d")}${text(104, 493, "Every section stays interactive while new content is translated.", 17, 500, "#56515d")}
    <rect x="557" y="639" width="275" height="55" rx="16" fill="#12111c"/><circle cx="580" cy="666" r="7" fill="#25c7aa"/>${text(598, 672, "Translated to English", 14, 700)}<rect x="727" y="652" width="91" height="30" rx="15" fill="#6d5dfc"/>${text(772, 672, "Original", 11, 700, "white", "middle")}
  </g>
  <g filter="url(#shadow)"><rect x="914" y="188" width="302" height="421" rx="24" fill="#171622" stroke="#383345"/>${icon(940, 214, 52)}${text(1006, 235, "AUTO TRANSLATOR", 18, 800)}
    <rect x="940" y="291" width="250" height="86" rx="17" fill="#242130"/><circle cx="961" cy="319" r="6" fill="#25c7aa"/>${text(978, 322, "Page translated", 16, 700)}${text(978, 347, "42 sections → English", 12, 500, "#aaa6b7")}
    ${text(940, 412, "Translate pages into", 12, 700, "#bcb8c8")}<rect x="940" y="429" width="250" height="48" rx="12" fill="#211e2d" stroke="#484353"/>${text(957, 459, "English", 14, 600)}
    <rect x="940" y="499" width="250" height="48" rx="13" fill="#6d5dfc"/>${text(1065, 530, "Show original", 14, 700, "white", "middle")}
  </g>
`);

writePng("screenshot-2-automatic-rules-1280x800", 1280, 800, `
  ${screenshotHeader(2, "Automatic only where you choose", "Start with manual access, approve selected websites, or opt into every website.")}
  <rect x="68" y="151" width="1144" height="566" rx="28" fill="#171622" stroke="#363141"/>
  ${text(108, 205, "01", 16, 800, "#9588ff")}${text(151, 207, "Access and automatic behaviour", 25, 800)}
  <rect x="108" y="250" width="1032" height="124" rx="18" fill="#22202d" stroke="#3b3648"/>
  <circle cx="146" cy="290" r="12" fill="#6d5dfc"/><circle cx="146" cy="290" r="5" fill="white"/>${text(176, 287, "Manual only", 18, 700)}${text(176, 317, "Temporary page access after your click — recommended", 14, 500, "#aba7b6")}
  <rect x="858" y="273" width="242" height="49" rx="24" fill="#2c283a"/>${text(979, 304, "No all-site access", 14, 700, "#c9c5d7", "middle")}
  <rect x="108" y="395" width="500" height="132" rx="18" fill="#22202d" stroke="#3b3648"/>${text(142, 435, "Approved websites", 18, 700)}${text(142, 468, "Grant narrow access one site at a time", 14, 500, "#aba7b6")}<rect x="142" y="486" width="180" height="28" rx="14" fill="#173a37"/>${text(232, 505, "news.example.com", 12, 700, "#69d7c8", "middle")}
  <rect x="640" y="395" width="500" height="132" rx="18" fill="#22202d" stroke="#3b3648"/>${text(674, 435, "Every website", 18, 700)}${text(674, 468, "Optional permission, requested only by choice", 14, 500, "#aba7b6")}<rect x="674" y="486" width="174" height="28" rx="14" fill="#332d51"/>${text(761, 505, "Opt-in permission", 12, 700, "#c7c1ff", "middle")}
  <rect x="108" y="565" width="1032" height="103" rx="18" fill="#131f21" stroke="#285d57"/>${text(142, 605, "Sensitive-page safeguard", 17, 700, "#69d7c8")}${text(142, 636, "Sign-in and payment pages pause automatically; form values are never read.", 14, 500, "#c4c0ce")}
`);

writePng("screenshot-3-providers-1280x800", 1280, 800, `
  ${screenshotHeader(3, "Choose how text is translated", "Prefer on-device translation or explicitly approve an official or custom provider.")}
  <rect x="68" y="151" width="1144" height="566" rx="28" fill="#171622" stroke="#363141"/>
  ${text(108, 205, "02", 16, 800, "#9588ff")}${text(151, 207, "Translation provider", 25, 800)}<rect x="870" y="178" width="290" height="35" rx="17" fill="#173a37"/>${text(1015, 201, "Keys are session-only by default", 12, 700, "#69d7c8", "middle")}
  <rect x="108" y="248" width="1032" height="76" rx="18" fill="#28243a" stroke="#6d5dfc"/><circle cx="143" cy="286" r="12" fill="#6d5dfc"/><circle cx="143" cy="286" r="5" fill="white"/>${text(176, 284, "Automatic provider selection", 18, 700)}${text(176, 308, "On-device first, then configured providers and optional fallback", 13, 500, "#aaa6b7")}
  ${[
    ["On-device Translator", "Text stays on-device where supported", "#25c7aa"],
    ["Google Cloud Translation", "Optional user-supplied API key", "#8b7cff"],
    ["DeepL API", "Official Free and Pro API endpoints", "#ff6f61"],
    ["LibreTranslate", "Your own HTTPS endpoint", "#4ca6ff"],
    ["Compatibility fallback", "Off by default and separately approved", "#f0a34a"],
    ["Provider-specific consent", "No external route is silently enabled", "#69d7c8"]
  ].map(([title, detail, color], i) => `<rect x="${108 + (i % 2) * 520}" y="${345 + Math.floor(i / 2) * 108}" width="500" height="88" rx="18" fill="#22202d" stroke="#3b3648"/><circle cx="${145 + (i % 2) * 520}" cy="${375 + Math.floor(i / 2) * 108}" r="9" fill="${color}"/>${text(170 + (i % 2) * 520, 379 + Math.floor(i / 2) * 108, title, 16, 700)}${text(145 + (i % 2) * 520, 412 + Math.floor(i / 2) * 108, detail, 12, 500, "#aaa6b7")}`).join("")}
`);

writePng("screenshot-4-live-pages-1280x800", 1280, 800, `
  ${screenshotHeader(4, "Built for modern, changing pages", "New content, open Shadow DOM, accessible frames and right-to-left targets are covered.")}
  <rect x="68" y="151" width="720" height="566" rx="28" fill="#f6f4ee"/><rect x="68" y="151" width="720" height="66" rx="28" fill="#2b2931"/>${text(111, 192, "LIVE NEWS FEED", 14, 800, "#d5d1de")}
  ${[["Breaking update", "Translated as it appears without rescanning the whole page"],["Open component", "Readable text inside open Shadow DOM is included"],["Embedded article", "Same-origin and accessible frames can translate too"]].map(([title, detail], i) => `<rect x="108" y="${254 + i * 128}" width="640" height="100" rx="17" fill="white" stroke="#e0dcd3"/><circle cx="140" cy="${288 + i * 128}" r="9" fill="${i === 0 ? "#6d5dfc" : "#0f9f8f"}"/>${text(166, 289 + i * 128, title, 18, 700, "#26222d")}${text(140, 324 + i * 128, detail, 13, 500, "#625d68")}`).join("")}
  <g filter="url(#shadow)"><rect x="835" y="190" width="377" height="477" rx="28" fill="#171622" stroke="#363141"/>${text(875, 244, "LIVE PAGE CONTROLS", 14, 800, "#9588ff")}
    ${bullets(885, 302, ["Incremental translation", "Cancel in progress", "Restore originals", "Pause in hidden tabs", "RTL direction support"], 58)}
    <rect x="875" y="586" width="297" height="52" rx="15" fill="#6d5dfc"/>${text(1024, 619, "Show original", 15, 700, "white", "middle")}
  </g>
`);

writePng("screenshot-5-privacy-1280x800", 1280, 800, `
  ${screenshotHeader(5, "Privacy choices before translation", "Nothing is translated until the disclosure is accepted and an access mode is selected.")}
  <rect x="68" y="151" width="1144" height="566" rx="28" fill="#171622" stroke="#363141"/>
  ${icon(108, 194, 74)}${text(205, 219, "INDEPENDENT EXTENSION", 13, 800, "#9588ff")}${text(205, 256, "Translation on your terms.", 29, 800)}
  <rect x="108" y="301" width="1032" height="184" rx="20" fill="#22202d" stroke="#3b3648"/>${text(142, 342, "PRIVACY CHECKPOINT", 13, 800, "#69d7c8")}
  ${text(142, 380, "External providers receive selected readable page text only after approval.", 18, 700)}${text(142, 414, "No analytics, advertising or developer-operated translation server.", 16, 500, "#b8b4c3")}${text(142, 447, "Website passwords, PINs, login fields, payment details and cookies are never read.", 16, 500, "#b8b4c3")}
  <rect x="142" y="513" width="28" height="28" rx="6" fill="#6d5dfc"/><path d="m149 527 6 6 10-13" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/>${text(186, 534, "I understand and agree when I request or enable translation", 16, 600)}
  <rect x="811" y="611" width="329" height="58" rx="18" fill="#6d5dfc"/>${text(976, 648, "Accept and finish setup", 17, 700, "white", "middle")}
  ${text(108, 647, "Clear provider disclosure", 14, 700, "#c7c1ff")}${text(108, 673, "Versioned consent • session-only keys • optional website access", 13, 500, "#aaa6b7")}
`);

rmSync(temporary, { recursive: true, force: true });

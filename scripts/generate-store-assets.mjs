import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "store-assets");
const iconOutput = path.join(root, "icons");
const temporary = mkdtempSync(path.join(tmpdir(), "bapt-store-"));
mkdirSync(output, { recursive: true });
mkdirSync(iconOutput, { recursive: true });

function escape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function defs() {
  return `<defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b0a14"/><stop offset=".55" stop-color="#17142a"/><stop offset="1" stop-color="#102c2b"/></linearGradient>
    <linearGradient id="brand" x1="32" y1="20" x2="226" y2="238" gradientUnits="userSpaceOnUse"><stop stop-color="#8b7cff"/><stop offset=".52" stop-color="#6654f3"/><stop offset="1" stop-color="#0f9f8f"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#03030a" flood-opacity=".55"/></filter>
  </defs>`;
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

function text(x, y, value, size, weight = 500, fill = "#f7f7fb", anchor = "start") {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="DejaVu Sans,Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escape(value)}</text>`;
}

function shell(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs()}<rect width="100%" height="100%" fill="url(#background)"/>${body}</svg>`;
}

function writePng(name, width, height, body) {
  const source = shell(width, height, body);
  writeFileSync(path.join(temporary, `${name}.svg`), source);
  const rendered = new Resvg(source, { fitTo: { mode: "original" } }).render();
  writeFileSync(path.join(output, `${name}.png`), rendered.asPng());
  console.log(`Created store-assets/${name}.png (${width}x${height})`);
}

function writeIconPng(size) {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs()}${icon(0, 0, size)}</svg>`;
  const rendered = new Resvg(source, { fitTo: { mode: "original" } }).render();
  writeFileSync(path.join(iconOutput, `icon-${size}.png`), rendered.asPng());
  console.log(`Created icons/icon-${size}.png (${size}x${size})`);
}

function header(number, title, subtitle) {
  return `${text(68, 67, `0${number}`, 18, 800, "#9588ff")}${text(110, 68, title, 30, 800)}${text(68, 108, subtitle, 18, 500, "#bbb7c7")}`;
}

function pill(x, y, width, value, fill = "#2c283a", color = "#d8d4e2") {
  return `<rect x="${x}" y="${y}" width="${width}" height="34" rx="17" fill="${fill}"/>${text(x + width / 2, y + 23, value, 12, 700, color, "middle")}`;
}

for (const size of [16, 32, 48, 128]) writeIconPng(size);

writePng("promo-small-440x280", 440, 280, `
  ${icon(24, 26, 74)}
  ${text(116, 54, "PRIVATE AUTO", 16, 800, "#9c91ff")}
  ${text(116, 82, "PAGE TRANSLATOR", 22, 800)}
  ${text(24, 139, "Read. Write.", 31, 800)}
  ${text(24, 177, "Stay private.", 31, 800)}
  ${pill(24, 216, 202, "Context-aware translation", "#6d5dfc", "white")}
  <circle cx="378" cy="222" r="31" fill="#0f9f8f"/><path d="m362 222 11 11 22-26" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
`);

writePng("marquee-1400x560", 1400, 560, `
  <circle cx="1210" cy="70" r="360" fill="#6d5dfc" opacity=".10"/><circle cx="1160" cy="520" r="310" fill="#0f9f8f" opacity=".13"/>
  ${icon(88, 67, 106)}${text(224, 106, "PRIVATE AUTO PAGE TRANSLATOR", 21, 800, "#9c91ff")}
  ${text(88, 222, "Read and write", 67, 800)}${text(88, 300, "across languages.", 67, 800)}
  ${text(92, 360, "Context-aware. Bilingual. Private by design.", 27, 500, "#c9c5d7")}
  ${pill(92, 412, 194, "Privacy Firewall", "#173a37", "#69d7c8")}${pill(300, 412, 186, "Smart Compose", "#332d51", "#c7c1ff")}
  <g filter="url(#shadow)"><rect x="858" y="79" width="438" height="405" rx="30" fill="#171622" stroke="#383345"/>
    ${text(896, 124, "TRANSLATION WORKSPACE", 13, 800, "#9588ff")}${text(896, 164, "Spanish → English", 26, 800)}
    <rect x="896" y="194" width="362" height="79" rx="17" fill="#242130"/><circle cx="920" cy="221" r="7" fill="#25c7aa"/>${text(940, 225, "Translated on this page", 17, 700)}${text(940, 250, "Private values masked", 13, 500, "#aaa6b7")}
    ${text(896, 310, "READING MODE", 12, 800, "#aaa6b7")}${pill(896, 327, 104, "Translated", "#6d5dfc", "white")}${pill(1012, 327, 100, "Bilingual")}${pill(1124, 327, 90, "Hover")}
    <rect x="896" y="395" width="362" height="55" rx="16" fill="#6d5dfc"/>${text(1077, 430, "Open Smart Compose", 16, 700, "white", "middle")}
  </g>
`);

writePng("screenshot-1-translate-1280x800", 1280, 800, `
  ${header(1, "Translate complete thoughts, not fragments", "Context-aware grouping keeps sentences coherent across links, emphasis and spans.")}
  <g filter="url(#shadow)"><rect x="64" y="150" width="808" height="575" rx="24" fill="#f6f4ee"/><rect x="64" y="150" width="808" height="64" rx="24" fill="#2b2931"/>
    ${text(103, 274, "Discover Madrid with", 32, 800, "#24212d")}${text(103, 323, "local guides", 32, 800, "#5f51db")}${text(304, 323, "today", 32, 800, "#24212d")}
    <path d="M103 332h184" stroke="#8b7cff" stroke-width="3"/><rect x="103" y="354" width="706" height="1" fill="#ddd8cf"/>
    ${text(103, 402, "Nearby inline text is translated as one sentence,", 18, 500, "#56515d")}${text(103, 438, "then restored to its original DOM elements.", 18, 500, "#56515d")}
    <rect x="103" y="490" width="706" height="116" rx="18" fill="#ece9f7"/>${text(130, 530, "VIEWPORT FIRST", 13, 800, "#6255d7")}${text(130, 566, "Visible content is prioritized on long pages.", 19, 700, "#282431")}
    ${pill(581, 651, 142, "On-device", "#173a37", "#287f73")}${pill(734, 651, 100, "Original", "#171622", "white")}
  </g>
  <g filter="url(#shadow)"><rect x="914" y="184" width="302" height="433" rx="24" fill="#171622" stroke="#383345"/>${text(940, 228, "READING MODE", 13, 800, "#9588ff")}
    <rect x="940" y="251" width="250" height="64" rx="15" fill="#6d5dfc"/>${text(1065, 291, "Translated", 16, 700, "white", "middle")}
    <rect x="940" y="329" width="250" height="64" rx="15" fill="#242130"/>${text(1065, 369, "Bilingual", 16, 700, "#d8d4e2", "middle")}
    <rect x="940" y="407" width="250" height="64" rx="15" fill="#242130"/>${text(1065, 447, "Original on hover", 16, 700, "#d8d4e2", "middle")}
    <rect x="940" y="506" width="250" height="76" rx="17" fill="#132321" stroke="#285d57"/><circle cx="965" cy="536" r="7" fill="#25c7aa"/>${text(984, 541, "No second request", 15, 700)}${text(965, 565, "Switch instantly", 12, 500, "#aaa6b7")}
  </g>
`);

writePng("screenshot-2-automatic-rules-1280x800", 1280, 800, `
  ${header(2, "Choose how you want to read", "Switch between a clean translation, bilingual context and original-on-hover.")}
  <rect x="68" y="151" width="1144" height="566" rx="28" fill="#171622" stroke="#363141"/>
  ${[ ["Translated", "A focused reading view", "Hello, welcome", "#6d5dfc"], ["Bilingual", "Original plus translation", "Hola, bienvenido", "#0f9f8f"], ["Hover", "Original on demand", "Hover translated text", "#2f2b3b"] ].map(([title, detail, sample, color], i) => {
    const x = 105 + i * 365;
    return `<rect x="${x}" y="207" width="330" height="414" rx="24" fill="#22202d" stroke="${i === 0 ? "#7666ff" : "#3b3648"}"/><rect x="${x + 24}" y="231" width="282" height="48" rx="16" fill="${color}"/>${text(x + 165, 262, title, 17, 800, "white", "middle")}${text(x + 28, 323, detail, 16, 700)}<rect x="${x + 28}" y="351" width="274" height="155" rx="17" fill="#f4f1eb"/>${text(x + 50, 398, sample, 14, 700, "#2a2630")}${i === 1 ? text(x + 50, 445, "Hello, welcome", 14, 700, "#6255d7") : ""}${i === 2 ? pill(x + 50, 434, 134, "Original appears", "#332d51", "#c7c1ff") : ""}${text(x + 28, 552, i === 0 ? "For focused reading" : i === 1 ? "For learning and comparison" : "For quick reference", 12, 500, "#aaa6b7")}`;
  }).join("")}
  ${pill(486, 650, 308, "Switch modes without retranslating", "#173a37", "#69d7c8")}
`);

writePng("screenshot-3-providers-1280x800", 1280, 800, `
  ${header(3, "A Privacy Firewall before external translation", "Recognized private values are masked locally and restored only after token checks pass.")}
  <rect x="68" y="151" width="1144" height="566" rx="28" fill="#171622" stroke="#363141"/>
  <rect x="105" y="205" width="488" height="410" rx="24" fill="#22202d" stroke="#3b3648"/>${text(139, 249, "BEFORE", 13, 800, "#aaa6b7")}
  <rect x="139" y="276" width="420" height="150" rx="18" fill="#171622"/>${text(163, 317, "Email alex@example.com", 17, 600)}${text(163, 354, "Order REF-483920", 17, 600)}${text(163, 391, "Total £1,240.00", 17, 600)}
  <path d="M173 462h350" stroke="#454050" stroke-width="2"/>${text(139, 507, "Custom confidential terms", 15, 700)}${pill(139, 530, 147, "Project Lantern", "#332d51", "#c7c1ff")}${pill(298, 530, 119, "Client Acme", "#332d51", "#c7c1ff")}
  <path d="M623 372h76" stroke="#25c7aa" stroke-width="5" stroke-linecap="round"/><path d="m686 355 20 17-20 17" fill="none" stroke="#25c7aa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="730" y="205" width="445" height="410" rx="24" fill="#132321" stroke="#285d57"/>${text(764, 249, "EXTERNAL REQUEST", 13, 800, "#69d7c8")}
  <rect x="764" y="276" width="377" height="150" rx="18" fill="#0d1918"/>${text(788, 317, "Email BAPTPRIVATE0001BAPT", 16, 600)}${text(788, 354, "Order BAPTPRIVATE0002BAPT", 16, 600)}${text(788, 391, "Total BAPTPRIVATE0003BAPT", 16, 600)}
  <circle cx="788" cy="475" r="12" fill="#0f9f8f"/><path d="m781 475 5 5 10-12" fill="none" stroke="white" stroke-width="4"/>${text(814, 481, "Fail closed if any token changes", 16, 700)}
  ${pill(764, 530, 128, "On-device", "#173a37", "#69d7c8")}${pill(904, 530, 170, "Masked external route", "#332d51", "#c7c1ff")}
`);

writePng("screenshot-4-live-pages-1280x800", 1280, 800, `
  ${header(4, "Translate your writing with Smart Compose", "Preview first, choose a style and replace only when you confirm.")}
  <rect x="68" y="151" width="638" height="566" rx="28" fill="#f6f4ee"/><rect x="68" y="151" width="638" height="65" rx="28" fill="#2b2931"/>${text(108, 192, "MESSAGE", 14, 800, "#d5d1de")}
  <rect x="108" y="263" width="558" height="220" rx="20" fill="white" stroke="#ded9cf"/>${text(140, 310, "Buenos días, ¿podemos reunirnos mañana?", 18, 600, "#302b35")}${text(140, 353, "Quiero revisar los próximos pasos.", 18, 600, "#302b35")}
  ${pill(108, 518, 190, "Alt + Enter to preview", "#332d51", "#6255d7")}${text(108, 588, "Your original writing stays untouched", 18, 700, "#302b35")}${text(108, 618, "until you choose Replace writing.", 15, 500, "#625d68")}
  <g filter="url(#shadow)"><rect x="752" y="171" width="460" height="527" rx="28" fill="#171622" stroke="#363141"/>${text(788, 218, "SMART COMPOSE", 13, 800, "#9588ff")}${text(788, 256, "English preview", 25, 800)}
    ${pill(788, 285, 100, "Natural", "#6d5dfc", "white")}${pill(900, 285, 94, "Formal")}${pill(1006, 285, 100, "Informal")}
    <rect x="788" y="342" width="388" height="166" rx="18" fill="#242130"/>${text(812, 383, "Good morning, can we meet tomorrow?", 16, 600)}${text(812, 420, "I'd like to review the next steps.", 16, 600)}${pill(812, 455, 74, "Copy", "#332d51", "#c7c1ff")}${pill(898, 455, 74, "Swap", "#332d51", "#c7c1ff")}
    <rect x="788" y="555" width="180" height="55" rx="16" fill="#282531"/>${text(878, 589, "Cancel", 15, 700, "#d8d4e2", "middle")}<rect x="982" y="555" width="194" height="55" rx="16" fill="#6d5dfc"/>${text(1079, 589, "Replace writing", 15, 700, "white", "middle")}
    ${text(788, 650, "Sensitive login and payment fields are excluded.", 12, 500, "#aaa6b7")}
  </g>
`);

writePng("screenshot-5-privacy-1280x800", 1280, 800, `
  ${header(5, "Keep translation controls beside the page", "The workspace combines page status, site intelligence, quick translation and language packs.")}
  <rect x="68" y="151" width="705" height="566" rx="28" fill="#f6f4ee"/><rect x="68" y="151" width="705" height="64" rx="28" fill="#2b2931"/>${text(108, 192, "CURRENT PAGE", 14, 800, "#d5d1de")}
  ${text(108, 284, "A workspace that stays open", 32, 800, "#29242f")}${text(108, 329, "Translate pages while keeping the controls", 17, 500, "#625d68")}${text(108, 359, "visible beside your browsing session.", 17, 500, "#625d68")}
  ${[ ["Site intelligence", "Provider, language, mode and automation"], ["Quick translator", "Translate a short passage without leaving the tab"], ["Language packs", "Prepare supported on-device pairs"], ["Recent session work", "Memory only; cleared with the tab or session"] ].map(([title, detail], i) => `<rect x="108" y="${405 + i * 67}" width="625" height="54" rx="15" fill="white" stroke="#e0dcd3"/><circle cx="133" cy="${432 + i * 67}" r="7" fill="${i % 2 ? "#6d5dfc" : "#0f9f8f"}"/>${text(153, 429 + i * 67, title, 14, 700, "#29242f")}${text(337, 429 + i * 67, detail, 12, 500, "#625d68")}`).join("")}
  <g filter="url(#shadow)"><rect x="817" y="167" width="395" height="530" rx="28" fill="#171622" stroke="#363141"/>${text(854, 211, "TRANSLATION WORKSPACE", 13, 800, "#9588ff")}
    <rect x="854" y="238" width="321" height="86" rx="18" fill="#242130"/><circle cx="879" cy="270" r="7" fill="#25c7aa"/>${text(899, 274, "Page translated", 16, 700)}${text(879, 300, "Spanish → English · 3 masked", 12, 500, "#aaa6b7")}
    ${text(854, 365, "SITE PROFILE", 12, 800, "#aaa6b7")}${pill(854, 383, 139, "Bilingual mode", "#332d51", "#c7c1ff")}${pill(1005, 383, 132, "On-device first", "#173a37", "#69d7c8")}
    <rect x="854" y="444" width="321" height="98" rx="18" fill="#22202d"/>${text(878, 476, "Quick translation", 15, 700)}${text(878, 507, "Bonjour → Hello", 15, 600, "#c7c1ff")}
    <rect x="854" y="568" width="321" height="57" rx="16" fill="#6d5dfc"/>${text(1015, 603, "Translate this page", 16, 700, "white", "middle")}
    ${text(854, 662, "No account · No analytics · No subscription", 12, 500, "#aaa6b7")}
  </g>
`);

rmSync(temporary, { recursive: true, force: true });

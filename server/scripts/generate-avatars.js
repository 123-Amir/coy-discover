// Generates a locally bundled SVG avatar per profile into client/public/avatars/.
// Deterministic: same input, same files. Run with `npm run avatars`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentUser, profiles } from '../src/data/profiles.js';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public/avatars');
const HAIR = ['short', 'long', 'bun', 'cap'];

function avatarSvg(index) {
  const hue = (index * 47 + 12) % 360;          // spread hues around the wheel
  const hue2 = (hue + 38 + (index % 3) * 14) % 360;
  const hair = HAIR[index % HAIR.length];
  const dark = `hsl(${hue} 45% 22%)`;
  const hairLayer = {
    long: `<ellipse cx="200" cy="228" rx="82" ry="104" fill="${dark}" opacity=".6"/>`,
    bun: `<circle cx="200" cy="128" r="24" fill="${dark}" opacity=".6"/>`,
    short: '', cap: '',
  }[hair];
  const hairTop = {
    short: `<path d="M136 205 C132 132 268 132 264 205 C250 168 150 168 136 205 Z" fill="${dark}" opacity=".6"/>`,
    cap: `<path d="M134 200 C138 138 262 138 266 200 Z" fill="${dark}" opacity=".6"/>`,
    bun: `<path d="M138 202 C140 146 260 146 262 202 C248 172 152 172 138 202 Z" fill="${dark}" opacity=".6"/>`,
    long: `<path d="M138 205 C140 142 260 142 262 205 C246 172 154 172 138 205 Z" fill="${dark}" opacity=".6"/>`,
  }[hair];
  const sx = 52 + (index % 4) * 6; // slight shoulder-width variation
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${hue2} 65% 38%)"/></linearGradient>
<radialGradient id="glow" cx=".3" cy=".2" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient>
</defs>
<rect width="400" height="500" fill="url(#bg)"/>
<rect width="400" height="500" fill="url(#glow)"/>
<circle cx="${330 - (index % 5) * 20}" cy="${90 + (index % 4) * 25}" r="${70 + (index % 3) * 18}" fill="#fff" opacity=".08"/>
<circle cx="${60 + (index % 6) * 15}" cy="430" r="110" fill="#000" opacity=".07"/>
${hairLayer}
<path d="M${sx} 500 C${sx} 385 118 332 200 332 C282 332 ${400 - sx} 385 ${400 - sx} 500 Z" fill="url(#body)"/>
<rect x="177" y="255" width="46" height="85" rx="22" fill="url(#body)"/>
<circle cx="200" cy="205" r="62" fill="url(#body)"/>
${hairTop}
</svg>
`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const all = [currentUser, ...profiles];
all.forEach((p, i) => fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.svg`), avatarSvg(i)));
console.log(`Wrote ${all.length} avatars to ${OUT_DIR}`);

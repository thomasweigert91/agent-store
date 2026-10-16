// Healthcheck: Lebenszeichen und laufende Version aus package.json (ohne Seiteneffekte).
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function healthInfo() {
  return { ok: true, version: pkg.version };
}

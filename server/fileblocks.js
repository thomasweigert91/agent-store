// Dateiblöcke: Agents ohne Schreibrecht geben Dateien als ```datei:pfad```-Block aus,
// der Agent Store speichert sie – aber nur innerhalb des Projekt- bzw. Arbeitsordners.
import fs from 'node:fs';
import path from 'node:path';

const BLOCK_RE = /```datei:([^\n`]+)\n([\s\S]*?)\n```/g;
const BLOCKED_EXT = /\.(exe|bat|cmd|com|ps1|psm1|vbs|vbe|js|jse|wsf|msi|scr|lnk|reg|dll|sh)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

export function fileBlockHint(where) {
  return '\n\n[Hinweis vom Agent Store: Du kannst Dateien nicht direkt anlegen. Soll eine Datei entstehen, '
    + 'gib sie in deiner Antwort als Block aus – erste Zeile ```datei:relativer/pfad.md, danach der vollständige Inhalt, '
    + `zum Schluss \`\`\`. Der Agent Store speichert sie im ${where}.]`;
}

// Liefert den absoluten Zielpfad, wenn er in einem der erlaubten Ordner liegt, sonst null.
function resolveTarget(raw, roots) {
  const p = raw.trim().replace(/^["'`]|["'`]$/g, '');
  if (!p || BLOCKED_EXT.test(p)) return null;
  const target = path.isAbsolute(p) ? path.resolve(p) : path.resolve(roots[0], p);
  const inside = roots.some((root) => {
    const r = path.resolve(root).toLowerCase() + path.sep;
    return target.toLowerCase().startsWith(r);
  });
  return inside ? target : null;
}

/** Speichert alle Dateiblöcke aus `text`. roots[0] ist der Basisordner für relative Pfade. */
export function saveFileBlocks(text, roots) {
  const saved = [];
  const rejected = [];
  for (const m of String(text || '').matchAll(BLOCK_RE)) {
    const name = m[1].trim();
    const target = resolveTarget(name, roots);
    if (!target) { rejected.push(`${name} (außerhalb des erlaubten Ordners oder unzulässiger Dateityp)`); continue; }
    const content = m[2].replace(/\r?\n$/, '') + '\n';
    if (Buffer.byteLength(content) > MAX_BYTES) { rejected.push(`${name} (zu groß)`); continue; }
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
      const base = roots.find((r) => target.toLowerCase().startsWith(path.resolve(r).toLowerCase() + path.sep)) || roots[0];
      saved.push(path.relative(base, target));
    } catch (err) {
      rejected.push(`${name} (${err.message})`);
    }
  }
  return { saved, rejected };
}

// Ordnerauswahl: öffnet den Windows-Dialog „Ordner auswählen“ über PowerShell (ohne Seiteneffekte beim Import).
import { spawn } from 'node:child_process';

const PICK_TIMEOUT_MS = 5 * 60 * 1000;
let picking = false;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

// Startordner kommt nur über die Umgebung, nie in den Skripttext (keine Skript-Injection).
export function pickFolderScript() {
  return [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$owner = New-Object System.Windows.Forms.Form',
    '$owner.TopMost = $true',
    '$owner.ShowInTaskbar = $false',
    '$owner.Opacity = 0',
    '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
    '$owner.Show()',
    '$owner.Activate()',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = 'Ordner auswählen'",
    '$dialog.ShowNewFolderButton = $true',
    '$start = $env:AGENT_STORE_PICK_START',
    'if ($start -and (Test-Path -LiteralPath $start -PathType Container)) { $dialog.SelectedPath = $start }',
    'if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }',
    '$owner.Close()',
  ].join('\n');
}

// Liefert den gewählten Pfad oder null (abgebrochen bzw. Timeout). Immer nur ein Dialog gleichzeitig.
export function pickFolder(start = '') {
  if (process.platform !== 'win32') return Promise.reject(fail(501, 'Ordnerauswahl gibt es nur unter Windows – Pfad bitte eintippen'));
  if (picking) return Promise.reject(fail(409, 'Ordnerauswahl ist schon offen'));
  picking = true;
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(pickFolderScript(), 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
      windowsHide: true,
      env: { ...process.env, AGENT_STORE_PICK_START: String(start || '') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let settled = false;
    let timedOut = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      picking = false;
      fn(value);
    };
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, PICK_TIMEOUT_MS);
    child.stdout.setEncoding('utf8').on('data', (d) => (out += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (err += d));
    child.on('error', (e) => finish(reject, new Error('PowerShell konnte nicht gestartet werden: ' + e.message)));
    child.on('close', (code) => {
      if (code !== 0 && !timedOut) return finish(reject, new Error('Ordnerauswahl fehlgeschlagen' + (err.trim() ? ': ' + err.trim().slice(0, 200) : '')));
      finish(resolve, out.trim() || null);
    });
  });
}

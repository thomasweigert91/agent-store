# 🏢 Agent Store

Ein kleines Management-Spiel für KI-Agents. Du rekrutierst bis zu **10 Agents** im Store, setzt sie an
Schreibtische im Hauptquartier und gibst ihnen Aufträge. Alle können **gleichzeitig** arbeiten, und du
siehst live, was jeder gerade tut. Erledigte Aufträge bringen Münzen und XP, damit levelst du dein Team
und kaufst neue Spezialisten.

Angetrieben wird das Ganze von deinen **Abos**:

| Antrieb | Wie | Kosten |
|---|---|---|
| **Claude (Abo)** | Claude Code CLI mit deinem Claude-Login (Pro/Max) | im Abo enthalten |
| **Gemini (Abo)** | Antigravity CLI `agy` mit deinem Google-AI-Pro-Konto | im Abo enthalten |
| Claude API | Anthropic API-Key (optional) | pro Token |
| Gemini API | Gemini API-Key aus Google AI Studio (optional) | pro Token / Free Tier |
| Demo | simulierte Antworten zum Ausprobieren | kostenlos |

---

## 🚀 Schnellstart

Voraussetzung: **Node.js 20.6+** (getestet mit Node 24). Es gibt **keine npm-Abhängigkeiten**.

1. **Claude-Abo verbinden** – Claude Code ist bei dir bereits installiert. Falls du noch nicht eingeloggt bist:
   `claude-login.bat` doppelklicken, anmelden, mit `/exit` beenden.
2. **Gemini-Abo verbinden** – über die **Antigravity CLI (`agy`)**, den Nachfolger der Gemini CLI
   (Google hat die Gemini CLI für Google-AI-Pro-Konten im Juni 2026 abgeschaltet). `agy` kommt mit Antigravity
   (https://antigravity.google). Falls nicht eingeloggt: `antigravity-login.bat` doppelklicken, anmelden, `/exit`.
3. **Starten** – `start.bat` doppelklicken (oder `npm start`). Der Browser öffnet sich unter **http://localhost:4777**.
4. Im **🛒 Store** den ersten Agent rekrutieren (der Allrounder ist gratis) und am Schreibtisch einen Auftrag eintippen.

In der App zeigen die Pillen oben rechts, welche Antriebe bereit sind (● grün). Nach einem Login unter
**⚙️ Einstellungen → 🔄 Neu prüfen** klicken.

---

## 🎮 So spielst du

- **Schreibtische (1–10):** Jeder Agent sitzt als kleine Pixel-Figur an seinem Schreibtisch – darunter Level,
  XP-Balken, eine Aktivitätsanzeige mit Infozeile und die Chatleiste für Schnellaufträge.
  | Anzeige | Die Figur … | Monitor |
  |---|---|---|
  | 🟢 BEREIT | döst, trinkt Kaffee, liest, streckt sich oder schaut sich um | Bildschirmschoner / aus |
  | 🟣 ÜBERLEGT | stützt das Kinn auf, Denkblase mit Punkten | Lade-Punkte |
  | 🔵 ARBEITET | tippt | Code läuft durch |
  | 🟡 RÜCKMELDUNG | winkt mit „!“-Blase – Ergebnis wartet auf dich | grüner Haken |
  | 🔴 PROBLEM | Hände am Kopf, Schweißtropfen | rotes X |
  | 🟠 WARTET | schaut auf die Uhr, wippt mit dem Fuß | Sanduhr |
- **Schnellauftrag:** Direkt ins Feld am Schreibtisch tippen und Enter drücken.
- **Detailansicht:** Klick auf einen Agent öffnet den Verlauf mit formatierten Antworten, Live-Stream,
  Warteschlange, Stop, „Neue Session“ und „Ordner öffnen“.
- **Ausrüstung (⚙️ im Agent):** Name, Aussehen der Figur (Frisur, Haarfarbe, Hautton, Accessoire, 🎲 Zufall),
  Symbol für Meldungen, Platz, Antrieb (Claude/Gemini/API/Demo), Modell,
  Autonomie, Arbeitsordner und Persönlichkeit (System-Prompt).
- **📢 Massenauftrag:** Derselbe Auftrag an mehrere Agents, z. B. um Claude und Gemini zu vergleichen.
- **Wirtschaft:** Start mit 500 🪙. Jeder erledigte Auftrag bringt 15–75+ 🪙 und XP. Beim Entlassen gibt es 50 % zurück.
- **Level:** Praktikant → Junior → Fachkraft → Profi → Experte → Meister → Großmeister → Legende.
- **Claude-Abo-Anzeige:** Nach Claude-Aufträgen erscheint oben die Auslastung deines 5-Stunden- und 7-Tage-Limits.

**Tastatur:** `1`…`0` öffnet den jeweiligen Schreibtisch · `s` Store · `m` Massenauftrag · `Esc` schließen ·
`Strg+Enter` sendet in der Detailansicht.

### 🔗 Übergaben & Ketten

Agents können ihre Ergebnisse an andere Agents weitergeben:

- **Von Hand:** Unter jeder Antwort steht **➡️ Weitergeben an …**. Ziel-Agent wählen, optional eine Anweisung
  dazuschreiben („Mach daraus einen Blogpost“). Der Ziel-Agent bekommt Anweisung und komplettes Ergebnis als neuen
  Auftrag; im Chat erscheint er als „📨 von Forscher Nova“.
- **Automatisch (Kette):** In der **⚙️ Ausrüstung** unter „🔗 Ergebnis automatisch weitergeben an“ einen Ziel-Agent und
  eine Standardanweisung setzen. Nach jedem *erfolgreichen* Auftrag geht das Ergebnis selbstständig weiter, z. B.
  Forscher → Texter → Kritiker. Auf dem Schreibtisch zeigt „🔗 → Name“ die Verbindung, der Ticker meldet jede Übergabe.
- **Schutz:** Bei Fehler oder Abbruch wird nicht weitergegeben. Eine Kette stoppt nach **6 Übergaben**, auch wenn sie
  im Kreis läuft. Wird ein Ziel-Agent entlassen, wird die Verbindung automatisch entfernt.
- **Bonus:** +5 🪙 pro Übergabe.

### Autonomie-Stufen (nur Abo-/CLI-Agents)

| Stufe | Claude Code | Antigravity (`agy`) |
|---|---|---|
| 🔒 Sicher | Standard: liest, ändert nichts | Standard |
| ✏️ Edits | `--permission-mode acceptEdits` | `--mode accept-edits` |
| 🤖 Auto | `--permission-mode auto` | `--mode accept-edits` |
| ⚠️ Voll | `--permission-mode bypassPermissions` | `--dangerously-skip-permissions` |

Jeder Agent arbeitet in seinem eigenen Ordner unter `workspaces/`. Alternativ kannst du einen eigenen
Arbeitsordner eintragen, z. B. ein echtes Projekt für den Coder.

---

## 🧱 Architektur

```
agent-store/
├─ start.bat / claude-login.bat / antigravity-login.bat
├─ server/                  Node.js, nur Standardbibliothek
│  ├─ index.js              HTTP-Server, REST-API, statische Dateien, Sicherheits-Checks
│  ├─ events.js             Server-Sent Events (Live-Updates an den Browser)
│  ├─ store.js              Persistenz (data/state.json, data/settings.json), .env
│  ├─ agents.js             Agent-Manager: Rekrutieren, Warteschlangen, Parallelität, Belohnungen
│  ├─ catalog.js            Store-Katalog (12 Klassen), Namen, Level-Kurve
│  └─ providers/
│     ├─ claudeCli.js       claude -p --output-format stream-json (Session via --resume)
│     ├─ antigravityCli.js  agy --print --output-format stream-json (Gedächtnis via --conversation)
│     ├─ geminiCli.js       Legacy Gemini CLI (nur noch für Enterprise-Lizenzen)
│     ├─ anthropicApi.js    Messages API mit Streaming
│     ├─ geminiApi.js       streamGenerateContent (SSE)
│     ├─ demo.js            simulierter Agent
│     └─ proc.js / shared.js  Prozess-Handling, Abbruch (taskkill /T), SSE-Parser
├─ public/                  Oberfläche (Vanilla JS, kein Build-Schritt)
│  ├─ index.html, styles.css, app.js, markdown.js
│  └─ pixel.js              Pixel-Büroszenen (Canvas 80×48, 8 fps, Posen je Zustand)
├─ data/                    Spielstand + Einstellungen (git-ignoriert)
└─ workspaces/              Arbeitsordner der Agents (git-ignoriert)
```

**Ablauf eines Auftrags:** Browser → `POST /api/agents/:id/tasks` → Warteschlange des Agents → der Manager
startet ihn, sobald ein Platz frei ist (max. 10 parallel, einstellbar) → der Provider streamt Text und
Werkzeug-Aktivität → per SSE live auf Schreibtisch und Detailansicht → Ergebnis wird gespeichert, Münzen und XP
werden gutgeschrieben.

**Abos statt API-Keys:** Für die CLI-Antriebe entfernt der Server `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` aus der
Umgebung der Kindprozesse, damit garantiert dein Abo-Login genutzt wird und kein API-Key belastet wird.

**Gedächtnis:** Claude-Abo-Agents setzen ihre Claude-Code-Session fort (`--resume`), Gemini-Abo-Agents ihre
Antigravity-Unterhaltung (`--conversation`). API-Agents
bekommen die letzten Runden des Verlaufs mitgeschickt (einstellbar). „🧹 Neue Session“ leert das Gedächtnis.

**Sicherheit:** Der Server lauscht nur auf `127.0.0.1`, prüft den Host-Header (gegen DNS-Rebinding) und
verlangt für schreibende Anfragen einen eigenen Header, sodass fremde Webseiten keine Aufträge auslösen können.
API-Keys liegen nur lokal in `data/settings.json` bzw. `.env`.

### REST-API (Kurzfassung)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/state` | Gesamter Zustand (Agents, Münzen, Katalog, Antriebe) |
| GET | `/api/events` | SSE-Stream: `agent`, `delta`, `activity`, `questDone`, `game`, `limits`, … |
| POST | `/api/agents` | Rekrutieren `{archetypeId, provider?, model?, slot?}` |
| PATCH/DELETE | `/api/agents/:id` | Ausrüstung ändern (inkl. `relay: {toAgentId, instruction}`) / entlassen |
| POST | `/api/agents/:id/tasks` | Auftrag `{prompt}` |
| POST | `/api/agents/:id/stop` · `/reset` · `/ack` · `/open-folder` | Steuerung |
| POST | `/api/broadcast` | Massenauftrag `{agentIds, prompt}` |
| POST | `/api/agents/:id/handoff` | Antwort weitergeben `{toAgentId, messageId?, instruction?}` |
| PUT | `/api/settings` | Keys, Parallelität, Sound |

Schreibende Anfragen brauchen den Header `X-Agent-Store: 1`.

---

## 🛠️ Fehlerbehebung

- **Gemini: „This client is no longer supported for Gemini Code Assist for individuals“** → das ist die alte
  Gemini CLI. Den Antrieb „Gemini (Abo via Antigravity)“ verwenden (bestehende Agents werden beim Start automatisch umgestellt).
- **Gemini via Antigravity nicht verfügbar** → `antigravity-login.bat` ausführen, danach ⚙️ → „Neu prüfen“.
- **Gemini-Modell nicht verfügbar** → Modellfeld leer lassen (Standardmodell) oder einen Vorschlag aus der Liste wählen –
  die Liste kommt live aus `agy models`.
- **„Verweigert: RunCommand“** → der Agent wollte einen Befehl ausführen; Autonomie in der Ausrüstung erhöhen.
- **Claude antwortet nicht / Login abgelaufen** → `claude-login.bat` ausführen.
- **Port belegt** → in `.env` `PORT=4778` setzen (Vorlage: `.env.example`).
- **Alles zurücksetzen** → ⚙️ Einstellungen → „Neues Spiel“ (oder `data/state.json` löschen).

## 🗺️ Ideen für später

Rückkopplung in Ketten (Kritiker schickt mit Verbesserungen zurück an den Texter), Quest-Vorlagen, Achievements,
geplante Aufträge (z. B. jeden Morgen), Export der Ergebnisse als Markdown.

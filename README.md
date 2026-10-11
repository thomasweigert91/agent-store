# 🏢 Agent Store

Ein kleines Management-Spiel für KI-Agents. Du rekrutierst bis zu **10 Agents** im Store, setzt sie an
Schreibtische im Hauptquartier und gibst ihnen Aufträge. Alle können **gleichzeitig** arbeiten, und du
siehst live, was jeder gerade tut. Erledigte Aufträge bringen Münzen und XP, damit levelst du dein Team
und kaufst neue Spezialisten.

Angetrieben wird das Ganze von deinen **Abos**:

| Antrieb | Wie | Kosten |
|---|---|---|
| **Claude (Abo)** | Claude Code CLI mit deinem Claude-Login (Pro/Max) | im Abo enthalten |
| **Gemini (Abo)** | Gemini CLI mit „Login with Google“ (Google AI Pro) | im Abo enthalten |
| Claude API | Anthropic API-Key (optional) | pro Token |
| Gemini API | Gemini API-Key aus Google AI Studio (optional) | pro Token / Free Tier |
| Demo | simulierte Antworten zum Ausprobieren | kostenlos |

---

## 🚀 Schnellstart

Voraussetzung: **Node.js 20.6+** (getestet mit Node 24). Es gibt **keine npm-Abhängigkeiten**.

1. **Claude-Abo verbinden** – Claude Code ist bei dir bereits installiert. Falls du noch nicht eingeloggt bist:
   `claude-login.bat` doppelklicken, anmelden, mit `/exit` beenden.
2. **Gemini-Abo verbinden** – die Gemini CLI ist installiert (`npm i -g @google/gemini-cli`).
   `gemini-login.bat` doppelklicken → **„Login with Google“** wählen → mit deinem Google-AI-Pro-Konto anmelden → `/quit`.
3. **Starten** – `start.bat` doppelklicken (oder `npm start`). Der Browser öffnet sich unter **http://localhost:4777**.
4. Im **🛒 Store** den ersten Agent rekrutieren (der Allrounder ist gratis) und am Schreibtisch einen Auftrag eintippen.

In der App zeigen die Pillen oben rechts, welche Antriebe bereit sind (● grün). Nach einem Login unter
**⚙️ Einstellungen → 🔄 Neu prüfen** klicken.

---

## 🎮 So spielst du

- **Schreibtische (1–10):** Jeder Agent hat einen Platz mit Avatar, Level, XP-Balken, aktuellem Status,
  Live-Vorschau des Textes, Laufzeit und Warteschlange.
  - 💤 bereit · ⚡ arbeitet (Ring dreht sich, Text läuft live mit) · ✅ erledigt (goldener Rahmen, „!“) · ❌ Fehler
- **Schnellauftrag:** Direkt ins Feld am Schreibtisch tippen und Enter drücken.
- **Detailansicht:** Klick auf einen Agent öffnet den Verlauf mit formatierten Antworten, Live-Stream,
  Warteschlange, Stop, „Neue Session“ und „Ordner öffnen“.
- **Ausrüstung (⚙️ im Agent):** Name, Avatar, Platz, Antrieb (Claude/Gemini/API/Demo), Modell,
  Autonomie, Arbeitsordner und Persönlichkeit (System-Prompt).
- **📢 Massenauftrag:** Derselbe Auftrag an mehrere Agents, z. B. um Claude und Gemini zu vergleichen.
- **Wirtschaft:** Start mit 500 🪙. Jeder erledigte Auftrag bringt 15–75+ 🪙 und XP. Beim Entlassen gibt es 50 % zurück.
- **Level:** Praktikant → Junior → Fachkraft → Profi → Experte → Meister → Großmeister → Legende.
- **Claude-Abo-Anzeige:** Nach Claude-Aufträgen erscheint oben die Auslastung deines 5-Stunden- und 7-Tage-Limits.

**Tastatur:** `1`…`0` öffnet den jeweiligen Schreibtisch · `s` Store · `m` Massenauftrag · `Esc` schließen ·
`Strg+Enter` sendet in der Detailansicht.

### Autonomie-Stufen (nur Abo-/CLI-Agents)

| Stufe | Claude Code | Gemini CLI |
|---|---|---|
| 🔒 Sicher | Standard: liest, ändert nichts | Standard |
| ✏️ Edits | `--permission-mode acceptEdits` | `--approval-mode auto_edit` |
| 🤖 Auto | `--permission-mode auto` | `--approval-mode auto_edit` |
| ⚠️ Voll | `--permission-mode bypassPermissions` | `--yolo` |

Jeder Agent arbeitet in seinem eigenen Ordner unter `workspaces/`. Alternativ kannst du einen eigenen
Arbeitsordner eintragen, z. B. ein echtes Projekt für den Coder.

---

## 🧱 Architektur

```
agent-store/
├─ start.bat / claude-login.bat / gemini-login.bat
├─ server/                  Node.js, nur Standardbibliothek
│  ├─ index.js              HTTP-Server, REST-API, statische Dateien, Sicherheits-Checks
│  ├─ events.js             Server-Sent Events (Live-Updates an den Browser)
│  ├─ store.js              Persistenz (data/state.json, data/settings.json), .env
│  ├─ agents.js             Agent-Manager: Rekrutieren, Warteschlangen, Parallelität, Belohnungen
│  ├─ catalog.js            Store-Katalog (12 Klassen), Namen, Level-Kurve
│  └─ providers/
│     ├─ claudeCli.js       claude -p --output-format stream-json (Session via --resume)
│     ├─ geminiCli.js       gemini -o stream-json (Verlauf wird mitgeschickt)
│     ├─ anthropicApi.js    Messages API mit Streaming
│     ├─ geminiApi.js       streamGenerateContent (SSE)
│     ├─ demo.js            simulierter Agent
│     └─ proc.js / shared.js  Prozess-Handling, Abbruch (taskkill /T), SSE-Parser
├─ public/                  Oberfläche (Vanilla JS, kein Build-Schritt)
│  ├─ index.html, styles.css, app.js, markdown.js
├─ data/                    Spielstand + Einstellungen (git-ignoriert)
└─ workspaces/              Arbeitsordner der Agents (git-ignoriert)
```

**Ablauf eines Auftrags:** Browser → `POST /api/agents/:id/tasks` → Warteschlange des Agents → der Manager
startet ihn, sobald ein Platz frei ist (max. 10 parallel, einstellbar) → der Provider streamt Text und
Werkzeug-Aktivität → per SSE live auf Schreibtisch und Detailansicht → Ergebnis wird gespeichert, Münzen und XP
werden gutgeschrieben.

**Abos statt API-Keys:** Für die CLI-Antriebe entfernt der Server `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` aus der
Umgebung der Kindprozesse, damit garantiert dein Abo-Login genutzt wird und kein API-Key belastet wird.

**Gedächtnis:** Claude-Abo-Agents setzen ihre Claude-Code-Session fort (`--resume`). Gemini- und API-Agents
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
| PATCH/DELETE | `/api/agents/:id` | Ausrüstung ändern / entlassen |
| POST | `/api/agents/:id/tasks` | Auftrag `{prompt}` |
| POST | `/api/agents/:id/stop` · `/reset` · `/ack` · `/open-folder` | Steuerung |
| POST | `/api/broadcast` | Massenauftrag `{agentIds, prompt}` |
| PUT | `/api/settings` | Keys, Parallelität, Sound |

Schreibende Anfragen brauchen den Header `X-Agent-Store: 1`.

---

## 🛠️ Fehlerbehebung

- **Gemini: „Please set an Auth method…“** → `gemini-login.bat` ausführen und „Login with Google“ wählen.
- **Gemini-Modell nicht verfügbar** → das Modellfeld leer lassen, dann nimmt die CLI ihr Standardmodell.
- **Claude antwortet nicht / Login abgelaufen** → `claude-login.bat` ausführen.
- **Port belegt** → in `.env` `PORT=4778` setzen (Vorlage: `.env.example`).
- **Alles zurücksetzen** → ⚙️ Einstellungen → „Neues Spiel“ (oder `data/state.json` löschen).

## 🗺️ Ideen für später

Agent-zu-Agent-Übergaben (Kritiker prüft automatisch das Ergebnis des Texters), Quest-Vorlagen, Achievements,
geplante Aufträge (z. B. jeden Morgen), Export der Ergebnisse als Markdown.

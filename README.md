# Vocabulaire – Französisch-Vokabeln wissenschaftlich lernen

Eine vollständige Lern-Web-App für französische Vokabeln, die **komplett im Browser** läuft und
kostenlos über **GitHub Pages** gehostet wird. Kein Server, keine Datenbank, kein Konto –
deine Daten bleiben in deinem Browser.

- PDF-Import (Text-PDFs und eingescannte PDFs per OCR), Text- und CSV-Import mit editierbarer Vorschau
- Spaced Repetition mit **FSRS-6**, getrennt für Französisch → Deutsch und Deutsch → Französisch
- Acht Lernformen: intelligentes Lernen, Karteikarten, Texteingabe, Multiple Choice,
  Hören & Schreiben, Lückensätze, Prüfungssimulation, Prüfungsvorbereitung mit Datum
- Dashboard, Statistiken, Lernkalender, Tagesziel
- Hell/Dunkel, responsiv (Smartphone bis Desktop), Tastaturkürzel
- Offline nutzbar (PWA), Backup/Wiederherstellung als JSON, Export als CSV

---

## 1. Veröffentlichen auf GitHub Pages (Schritt für Schritt)

1. **Repository anlegen:** Auf github.com → *New repository*, z. B. `franzoesisch-lernen`
   (öffentlich; für private Repos braucht GitHub Pages ein kostenpflichtiges Konto).
2. **Code hochladen:** Den Inhalt dieses Ordners ins Repository übertragen – entweder
   - im Browser: *Add file → Upload files*, alle Dateien und Ordner (inkl. `.github`) hineinziehen, *Commit*; oder
   - per Terminal:
     ```bash
     git init
     git add .
     git commit -m "Erste Version"
     git branch -M main
     git remote add origin https://github.com/USERNAME/franzoesisch-lernen.git
     git push -u origin main
     ```
   > Hinweis: Der Ordner `.github` beginnt mit einem Punkt und ist in manchen Dateimanagern
   > ausgeblendet. Er muss mit hochgeladen werden.
3. **Pages aktivieren:** Im Repository *Settings → Pages → Build and deployment → Source:*
   **GitHub Actions** wählen.
4. **Warten:** Unter *Actions* läuft der Workflow „Build & Deploy auf GitHub Pages“
   (ca. 1–2 Minuten). Falls er vor Schritt 3 schon einmal fehlgeschlagen ist: *Actions → Workflow →
   Re-run jobs*.
5. **Öffnen:** `https://USERNAME.github.io/franzoesisch-lernen/`

Jeder weitere Push auf `main` baut und veröffentlicht die App automatisch neu.

**Repository-Name frei wählbar:** Der Workflow setzt den Basis-Pfad automatisch aus dem
Repository-Namen (`/REPO/`). Heisst das Repository `USERNAME.github.io`, wird `/` verwendet.

### Was der Workflow macht (`.github/workflows/deploy.yml`)
1. Abhängigkeiten installieren
2. Automatische Tests (`npm test`) – schlägt ein Test fehl, wird **nicht** veröffentlicht
3. Typprüfung (`npm run typecheck`) – informativ, blockiert die Veröffentlichung nicht
4. Produktions-Build mit korrektem Unterverzeichnis (`BASE_PATH`)
5. Upload und Deployment auf GitHub Pages

### Wie Unterseiten auf GitHub Pages funktionieren
GitHub Pages kennt kein „Fallback“ für Single-Page-Apps. Beim Build wird deshalb `index.html`
zusätzlich als `404.html` abgelegt: Ruft man z. B. `/franzoesisch-lernen/statistik` direkt auf oder
lädt die Seite neu, liefert GitHub die App aus und der clientseitige Router zeigt die richtige Seite.
Der Service Worker sorgt zusätzlich dafür, dass das offline klappt.

---

## 2. Lokal starten und entwickeln

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.19 (empfohlen 22).

```bash
npm install        # Abhängigkeiten
npm run dev        # Entwicklungsserver → http://localhost:5173/franzoesisch-lernen/
npm test           # Tests (FSRS, Antwortprüfung, PDF-Erkennung, Lernlogik)
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen (inkl. Unterverzeichnis)
```

Eigener Basis-Pfad lokal: `BASE_PATH=/mein-repo/ npm run build`.

---

## 3. Bedienung in Kürze

1. **Vokabellisten → Importieren:** PDF hineinziehen (oder Text einfügen / CSV wählen).
2. **Vorschau prüfen:** Gelb markierte Zeilen ansehen, Felder direkt korrigieren, mit ⇄ Sprachen
   tauschen. Einträge ohne Übersetzung lassen sich erst nach Ergänzung importieren – die App erfindet
   nichts. Duplikate sind automatisch abgewählt.
3. **Jetzt lernen:** Täglich die vorgeschlagene Einheit durcharbeiten. Mehr ist nicht nötig.
4. **Lernmodi:** Gezielt einzelne Übungsformen trainieren.
5. **Prüfungen:** Prüfung simulieren oder einen Plan mit Prüfungsdatum anlegen.
6. **Einstellungen → Sicherung:** Regelmässig eine JSON-Sicherung herunterladen.

Tastenkürzel während des Lernens: `Enter` prüfen/weiter · `Leertaste` umdrehen ·
`1`–`4` bewerten bzw. Antwort wählen · `↑` Hinweis · `Esc` „weiss nicht“ · `Strg+Z` rückgängig.

---

## 4. Wissenschaftliche Grundlagen und Umsetzung

Die App setzt bevorzugt Verfahren ein, deren Wirkung in vielen Studien und Meta-Analysen gut belegt ist.
Experimentelle oder schwächer belegte Elemente sind als solche gekennzeichnet. Auf „Lernstil“-Typologien
(visuell/auditiv …) wird bewusst verzichtet: Die Annahme, dass Unterricht nach Lernstil besser wirkt,
konnte empirisch nicht bestätigt werden (Pashler et al., 2008).

### Gut belegt – zentral umgesetzt

| Prinzip | Befund (Auswahl) | Umsetzung in der App |
|---|---|---|
| **Abrufübung / Testing-Effekt** | Aktives Abrufen festigt Gedächtnis stärker als erneutes Lesen (Roediger & Karpicke, 2006; Karpicke & Roediger, 2008; Dunlosky et al., 2013: „high utility“) | Jede Übung verlangt einen Abruf, bevor die Lösung erscheint. Neue Wörter werden nach kurzer Präsentation sofort abgefragt („study → test“). |
| **Verteiltes Wiederholen (Spacing)** | Verteilte Wiederholungen schlagen massiertes Lernen deutlich; optimale Abstände wachsen mit dem Behaltensintervall (Cepeda et al., 2006, 2008) | FSRS plant für jede Karte individuell die nächste Wiederholung kurz bevor die Abrufwahrscheinlichkeit unter die Zielquote (Standard 90 %) fällt. |
| **Korrektives Feedback** | Feedback nach Fehlern ist entscheidend, sonst werden Fehler gelernt (Pashler et al., 2005; Butler & Roediger, 2008) | Sofortige Lösung, Zeichenvergleich, verständliche Fehlerklasse (Akzent, Tippfehler, Artikel/Genus), Hinweis auf wiederkehrende Fehler. Falsche Wörter kommen in derselben Sitzung erneut. |
| **Produktiver vs. rezeptiver Wortschatz** | Abruf in Richtung L2 (produktiv) ist schwieriger und trainiert andere Kenntnisse als das Verstehen (Nation, 2013; Webb, 2009) | Zwei getrennt geplante Karten pro Wort (FR→DE, DE→FR). Produktion wird erst freigeschaltet, wenn das Wort wiedererkannt wird. Getrennte Statistik je Richtung. |
| **Erfolgreicher, anstrengender Abruf** | Schwierigerer, aber erfolgreicher Abruf fördert Behalten („desirable difficulties“, Bjork & Bjork, 2011) | Übungsform wächst mit der Stabilität: Auswahl → Karteikarte → Eintippen → Lückensatz/Diktat. Hinweise verringern die Bewertung. |

### Gut belegt, aber kontextabhängig

- **Interleaving:** Für Vokabeln ist der Effekt kleiner und weniger eindeutig als z. B. in der Mathematik
  (Brunmair & Richter, 2019). Umgesetzt wird es zurückhaltend: Wiederholungen aus allen Listen werden
  gemischt, neue Wörter gleichmässig dazwischen gestreut, die zwei Richtungen eines Wortes nie direkt
  nacheinander abgefragt.
- **Kontext / Beispielsätze:** Sätze unterstützen Bedeutung, Grammatik und Kollokationen; reines Lesen in
  Kontext ist für das Behalten allerdings nicht automatisch besser als Wortpaare. Deshalb werden Sätze als
  zusätzliche *Abruf*-Übung (Lückensatz) eingesetzt – nur mit überprüfbaren Sätzen aus deinen Unterlagen
  oder von dir; KI-Sätze sind optional und markiert.
- **Multiple Choice:** Wiedererkennen ist leichter als freier Abruf und wird nur zum Einstieg genutzt. Ein
  richtig gelöstes MC zählt bei bereits gelernten Karten nur als „Schwer“.

### Experimentell / bewusst vorsichtig
- **Automatische Bewertung über Antwortzeit** wird *nicht* verwendet; du kannst die vorgeschlagene
  Bewertung nach dem Tippen selbst anpassen (`2`/`3`/`4`).
- **Hören & Schreiben** (Diktat) verbindet Laut- und Schriftbild. Plausibel und praxisüblich, aber die
  Evidenz für einen zusätzlichen Behaltenseffekt ist begrenzt – daher nur gelegentlich im Hauptmodus
  (abschaltbar).
- **Prognosen** (Abrufwahrscheinlichkeit, Prüfungsbereitschaft) sind Modellschätzungen und werden grob
  gerundet angezeigt.

### FSRS-Implementierung (`src/lib/fsrs.ts`)

FSRS („Free Spaced Repetition Scheduler“, open-spaced-repetition) ist ein offenes, an Millionen echter
Wiederholungen trainiertes Gedächtnismodell, das in öffentlichen Benchmarks die klassischen
SM-2-Algorithmen deutlich übertrifft. Die App enthält eine eigene, kommentierte Implementierung von
**FSRS-6** mit den Standardparametern (21 Gewichte):

- Jede Karte speichert **Stabilität S** (Tage bis R = 90 %), **Schwierigkeit D** (1–10), Zustand,
  Wiederholungen, Vergessen (Lapses).
- **Vergessenskurve:** `R(t) = (1 + factor · t / S)^decay` mit `decay = −w20`.
- **Nach Erfolg** wächst S umso stärker, je kleiner S und D sind und je tiefer R zum Zeitpunkt des
  Abrufs war (Schwer: Dämpfung, Einfach: Bonus).
- **Nach Vergessen** fällt S stark ab, die Karte geht in die Wiederlernphase.
- **Wiederholungen am selben Tag** nutzen die Kurzzeit-Formel von FSRS-6.
- **Nächster Termin:** Intervall, bei dem R auf die gewünschte Behaltensquote fällt (Standard 90 %),
  leicht zufällig gestreut, damit sich Wiederholungen nicht auf einzelne Tage ballen.
- **Lernschritte** (1 min, 10 min) und Wiederlernschritt (10 min) wie in Anki.

**Fünf Lernstufen** (aus Zustand und Stabilität abgeleitet): *Noch nicht gelernt* · *Neu im Lernprozess*
(Lernschritte) · *In Wiederholung* (S < 21 Tage) · *Gut beherrscht* (S ≥ 21 Tage) · *Erneut vergessen*
(Wiederlernen). Ein Wort gilt erst als beherrscht, wenn **beide** Richtungen diese Schwelle erreichen –
drei richtige Antworten am selben Tag reichen dafür nicht.

**Prüfungsvorbereitung vs. Langzeit:** Für einen Prüfungsplan wird pro Karte die Abrufwahrscheinlichkeit
*am Prüfungstag* berechnet. Karten unter 90 % werden – schwächste zuerst – zusätzlich eingeplant, neue
Wörter gleichmässig auf die verbleibenden Tage verteilt (letzter Tag nur Wiederholung). Diese frühen
Wiederholungen werden normal von FSRS verarbeitet, das ihren geringeren Langzeitnutzen berücksichtigt.
**Prüfungssimulationen** werden nur protokolliert und verändern die Planung nicht; Fehler kannst du am
Ende bewusst als „vergessen“ übernehmen.

### Quellen (Auswahl)
- Bjork, E. L. & Bjork, R. A. (2011). Making things hard on yourself, but in a good way.
- Brunmair, M. & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning. *Psychological Bulletin*.
- Cepeda, N. J. et al. (2006). Distributed practice in verbal recall tasks. *Psychological Bulletin*; (2008) *Psychological Science*.
- Dunlosky, J. et al. (2013). Improving students’ learning with effective learning techniques. *PSPI*.
- Karpicke, J. D. & Roediger, H. L. (2008). The critical importance of retrieval for learning. *Science*.
- Nation, I. S. P. (2013). *Learning Vocabulary in Another Language*. Cambridge University Press.
- Pashler, H. et al. (2008). Learning styles: Concepts and evidence. *PSPI*.
- Roediger, H. L. & Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science*.
- Ye, J. et al. – FSRS, open-spaced-repetition (GitHub) und öffentlicher SRS-Benchmark.

---

## 5. Daten, Datenschutz, Offline

- **Speicherort:** IndexedDB des jeweiligen Browsers/Profils. Ein anderer Browser, ein anderes Gerät oder
  ein privates Fenster sieht diese Daten **nicht**. → *Einstellungen → Sicherung* nutzen, um umzuziehen.
- Die App bittet den Browser um „dauerhaften Speicher“. Besonders Safari/iOS kann Daten nach längerer
  Nichtnutzung löschen – regelmässige Sicherungen sind deshalb wichtig. Die App erinnert daran.
- **Keine Übertragung** persönlicher Daten. PDFs werden ausschliesslich im Browser verarbeitet.
- **Offline:** Nach dem ersten vollständigen Laden funktionieren Lernen, Karteikarten, Texteingabe,
  Statistiken und Speichern ohne Internet. Tipp: Auf dem Smartphone „Zum Home-Bildschirm hinzufügen“.
- **OCR:** Beim ersten Scan-Import lädt Tesseract.js einmalig ca. 10–20 MB (Programm + Sprachdaten
  Französisch/Deutsch) aus dem Internet; danach liegen sie im Browser-Cache.
- **Sprachausgabe:** nutzt die Stimmen des Betriebssystems. Fehlt eine französische Stimme, kann man sie in
  den Systemeinstellungen nachinstallieren. Manche Stimmen (z. B. „Google français“) brauchen Internet.
- **Optionale KI-Beispielsätze:** standardmässig aus. Wenn aktiviert, werden nur die ausgewählten Wörter
  mit deinem eigenen Anthropic-API-Schlüssel direkt aus dem Browser gesendet. Der Schlüssel wird nie
  exportiert.

---

## 6. Grenzen und Hinweise

- **PDF-Erkennung ist heuristisch.** Tabellen, mehrspaltige Listen, Trennzeichen (–, =, :, Tab),
  Kapitelüberschriften (Unité, Leçon, Lektion …), Genus-/Plural-/Wortartangaben und Beispielsätze werden
  erkannt; ungewöhnliche Layouts landen eventuell falsch zugeordnet in der Vorschau (gelb markiert).
  Deshalb gibt es die Vorschau mit Korrektur sowie den Rohtext zum Nachschauen.
- **OCR** liefert bei schlechten Scans (schräg, unscharf, Handschrift) fehlerhafte Wörter. Niedrige
  OCR-Konfidenz wird markiert.
- **Lückensätze** benötigen Beispielsätze, in denen das Wort (oder eine erkennbare Form davon) vorkommt.
- Daten werden nicht zwischen Geräten synchronisiert (bewusst ohne Server) – Austausch per Sicherungsdatei.

---

## 7. Projektstruktur

```
.github/workflows/deploy.yml   Automatischer Build + Deployment auf GitHub Pages
index.html                     Einstiegsseite
vite.config.ts                 Vite-Konfiguration (Basis-Pfad aus BASE_PATH)
pwa/plugin.ts, pwa/sw.js       Service Worker (Offline) + 404.html-Kopie für Unterseiten
public/                        Icons, Web-App-Manifest, .nojekyll
src/
  lib/fsrs.ts                  FSRS-6 Algorithmus
  lib/engine.ts                Lernlogik: Stufen, Tageswarteschlange, Übungswahl, Prüfungsplan, Statistik
  lib/answer.ts                Antwortprüfung: Akzente, Tippfehler, Artikel, Alternativen, Hinweise
  lib/parser.ts                Vokabel-Erkennung aus PDF-/OCR-Text und Freitext, Duplikate
  lib/pdf.ts                   PDF.js-Extraktion + Tesseract.js-OCR
  lib/db.ts, store/            IndexedDB-Zugriff und App-Zustand
  lib/backup.ts                JSON-Sicherung (validiert), CSV-Export/-Import
  lib/speech.ts, lib/ai.ts     Sprachausgabe, optionale KI-Beispielsätze
  learn/exercises.tsx          Übungskomponenten (Karte, Auswahl, Tippen, Hören, Kontext)
  pages/                       Dashboard, Lernen, Lernmodi, Listen, Import, Prüfungen, Statistik, Einstellungen
  components/                  UI-Bausteine, Diagramme, Layout
tests/                         Automatische Tests (Vitest)
```

Technik: React 19 + TypeScript, Vite, Tailwind CSS 4, PDF.js, Tesseract.js, IndexedDB.

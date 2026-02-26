```text
+======================================================================+
|    __  __ _____    ____    ____   ___  ____ _____   _    _           |
|   |  \/  |___ /   |  _ \  / __ \ / _ \|  _ \_   _| / \  | |          |
|   | |\/| | |_ \   | |_) || |  | | | | | |_) || |  / _ \ | |          |
|   | |  | |___) |  |  __/ | |__| | |_| |  _ < | | / ___ \| |___       |
|   |_|  |_|____/   |_|     \____/ \___/|_| \_\|_|/_/   \_\_____|      |
|                                                                      |
|                 H 3   P O R T A L   -   R E A D M E                  |
|                      (nfo-style / school edition)                    |
+======================================================================+
```

# H3 Portal

Statisk undervisningsportal til Techcollege (Foraar 2026) med:

- fag-overblik (emner og underemner)
- korte forklaringskort pr. fag
- fag-specifikke quizzer
- samlet quiz paa tvaers af alle 3 fag

## Live Site

Sitet kan ses aktivt her:

http://stst50.web.techcollege.dk/

## Projektbeskrivelse

H3 Portal er et rent frontend-projekt (HTML/CSS/JavaScript) bygget som en letvaegts portal til repetition og traening i tre fag:

- Kravspecifikation
- Metodik
- Softwaretest & Sikkerhed

Portalen kombinerer to ting:

- Et visuelt overblik over faglige emner (moduler + underemner)
- Et quizsystem med randomiserede runder og forklaringer til svarene

Projektet er designet til statisk hosting uden build-step eller backend.

## Indhold (Hvad der er i sitet)

### 1) Forside (`index.html`)

Forsiden fungerer som hub for hele portalen og indeholder:

- 3 fag-kort (et kort pr. fag)
- kort beskrivelse af hvert fag
- topic tags for de vigtigste omraader
- CTA til samlet quiz
- link videre til de enkelte fag-sider

Forsiden viser ogsaa samlet quiz-banner med info om:

- 180 spoergsmaal i faelles bank
- valg mellem `Blandet`, `Nem`, `Oevet` og `Avanceret`

### 2) Fag-sider (emneoversigter)

Der er 3 fag-sider med fold-ud kort og korte forklaringer:

- `kravspecifikation.html` (3 moduler, 14 emnekort)
- `metodik.html` (4 moduler, 11 emnekort)
- `softwaretest-sikkerhed.html` (4 moduler, 11 emnekort)

Faelles funktionalitet paa fag-sider:

- tilbage-link til forsiden
- header med fagbeskrivelse
- knap til fagquiz (`Start fagquiz`)
- klikbare emnekort (`toggle(this)`) der aabner/lukker detaljer
- footer + ansvarsfraskrivelse

Samlet antal emnekort i portalen: `36`.

### 3) Quiz-sider

Der er 4 quiz-sider:

- `quiz-alle.html` (samlet quiz paa tvaers af alle fag)
- `quiz-kravspecifikation.html`
- `quiz-metodik.html`
- `quiz-softwaretest-sikkerhed.html`

Quiz-siderne er tynde wrappers, som:

- loader `quiz.css`
- loader `quiz-data.js`
- loader `quiz-engine.js`
- kalder `window.QuizModule.renderSubjectQuiz(...)` eller `renderCombinedQuiz(...)`
- sender tema-farver og tekster ind som konfiguration

## Funktioner (Core Features)

### Portal og navigation

- Responsive forside med grid-layout
- Visuel farvekodning pr. fag
- Hurtig navigation fra forside til fag-side og quiz
- Samlet quiz-banner direkte fra forsiden

### Emnekort (fag-sider)

- Fold-ud/fold-ind emnekort ved klik
- Kort teaser + udvidet forklaringstekst
- Modul-opdeling med tydelig struktur (01, 02, 03, ...)
- Fokus paa repetition og overblik frem for lange tekstdokumenter

### Quizmotor (`quiz-engine.js`)

Quizmotoren er generisk og genbruges af alle quiz-sider.

Den leverer:

- startskerm med valg af svaerhedsgrad/tilstand
- randomiseret rundegenerering
- spoergsmaalsvisning med svarmuligheder
- live score (`x rigtige`)
- progress bar
- svarfeedback efter hvert spoergsmaal
- naeste-knap / resultatvisning
- resultatskerm med score, procent og tekst-feedback
- breakdown-statistikker

### Quiztyper og logik

#### Fagquiz (per fag)

- `10` tilfaeldige spoergsmaal pr. runde
- valg af svaerhedsgrad: `nem`, `oevet`, `avanceret`
- spoergsmaal hentes fra valgt fag + valgt svaerhedsgrad

#### Samlet quiz (alle fag)

- `20` tilfaeldige spoergsmaal pr. runde
- valg af tilstand: `blandet`, `nem`, `oevet`, `avanceret`
- `blandet` betyder balanceret miks paa tvaers af fag + svaerhedsgrad
- `nem` / `oevet` / `avanceret` laaser samlet quiz til den valgte svaerhedsgrad

Balancering i samlet quiz:

- Ved valgt svaerhedsgrad: `6` fra hvert fag + `2` ekstra fra to fag (samlet `20`)
- Ved `blandet`: `2` spoergsmaal fra hver af de `9` fag/svaerhedsgrad-buckets (`18`) + `2` ekstra, saa runden spredes paent

### Svar- og resultatfunktioner

- Korrekte/forkerte svar markeres visuelt
- Korrekt svar fremhaeves ved forkert klik
- Forklaring (`explain`) vises efter hvert svar
- Resultattekst skifter efter score-procent
- Samlet quiz viser breakdown per fag
- Samlet quiz viser breakdown per svaerhedsgrad
- Fagquiz viser fordeling for valgt fag og svaerhedsgrad

### Data- og valideringsfunktioner (`quiz-data.js`)

Quizdata er ikke bare en liste. Filen bygger og validerer banken ved load.

Funktioner i data-laget:

- `QUIZ_META` med fag og svaerhedsgrader
- manuel kildebank (`QUIZ_BANK_SOURCE`)
- opbygning af runtime-bank (`QUIZ_BANK`)
- automatisk rotation af svarmuligheder (variation i korrekt svar-position)
- auto-tags til spoergsmaal (fallback hvis tags ikke er sat)
- validering af total laengde
- validering af unikke IDs
- validering af korrekt antal svarmuligheder (4)
- validering af gyldigt svarindeks
- validering af tags til alle spoergsmaal
- validering af emne/subemne mapping
- validering af forventet coverage
- forfatter-lint (advarsler i console ved lange/spoergsmaal-skabeloner/dubletter)

Hvis validering fejler, kaster filen fejl ved indlaesning, saa problemer opdages tidligt.

## Quizbank (tal og struktur)

Quizbanken er struktureret og valideret til faste fordelinger:

- `180` spoergsmaal i alt
- `3` fag
- `3` svaerhedsgrader
- `60` spoergsmaal pr. fag
- `60` spoergsmaal pr. svaerhedsgrad (pa tvaers af fag)
- `20` spoergsmaal pr. kombination af `fag x svaerhedsgrad`
- `4` svarmuligheder pr. spoergsmaal

Hvert spoergsmaal indeholder bl.a.:

- `id`
- `fag` / `fagLabel`
- `module`
- `subtopic`
- `difficulty`
- `q` (spoergsmaalstekst)
- `options` (4 svar)
- `answer` (index)
- `explain` (forklaring)
- `tags`

## Filstruktur (repo oversigt)

Projektet er simpelt og fladt struktureret:

- `index.html` - forside / portal-hub
- `kravspecifikation.html` - fagside med emner og forklaringer
- `metodik.html` - fagside med emner og forklaringer
- `softwaretest-sikkerhed.html` - fagside med emner og forklaringer
- `quiz-alle.html` - samlet quiz-side
- `quiz-kravspecifikation.html` - fagquiz for kravspecifikation
- `quiz-metodik.html` - fagquiz for metodik
- `quiz-softwaretest-sikkerhed.html` - fagquiz for softwaretest & sikkerhed
- `quiz.css` - delt styling til quiz-UI
- `quiz-engine.js` - quizmotor (UI + state + rundelogik + resultater)
- `quiz-data.js` - quizdata, datamodel, validering og coverage checks
- `README.md` - denne dokumentation

## Teknisk Stack

- HTML (statiske sider)
- CSS (custom properties, responsive layout, tema-farver)
- Vanilla JavaScript (ingen frameworks, ingen build tools)

## Drift / Lokal visning

### Lokal visning (hurtigst)

- Aabn `index.html` direkte i en browser

### Lokal visning via simpel webserver (valgfrit)

Hvis du vil teste som "rigtig" hosted side:

- brug en simpel lokal webserver (fx VS Code Live Server eller Python HTTP server)

### Hosting

Projektet er velegnet til:

- skole-webhotel
- Apache/Nginx statisk hosting
- FTP upload af filer direkte

## Styling og UX-noter

Quiz-UI (`quiz.css`) indeholder bl.a.:

- farvetema via CSS variables (`--q-*`)
- subject badges og difficulty badges
- progress bar
- feedback-paneler (korrekt/forkert)
- resultatkort/statistik
- mobiltilpasning via `@media (max-width: 640px)`

Hver quiz-side kan tema-saettes individuelt ved at sende CSS variabler i konfig til quizmotoren.

## Ansvarsfraskrivelse / datakilde

Alle sider indeholder ansvarsfraskrivelse:

- indholdet er AI-genereret
- baseret paa Moodle-rummet
- ingen garanti for korrekthed, fuldstaendighed eller aktualitet

Det er vigtigt at bruge portalen som repetitionstraening og ikke som eneste kilde.

## Vedligeholdelse (hvor man redigerer hvad)

- Rediger fagtekster og emnekort i de enkelte fag-HTML filer
- Rediger quiz-spoergsmaal i `quiz-data.js`
- Rediger quiz-udseende i `quiz.css`
- Rediger quiz-flow/logik i `quiz-engine.js`
- Rediger forside-layout og links i `index.html`

Ved aendringer i quiz-data:

- behold den forventede struktur (`fag x svaerhedsgrad`)
- behold 4 svarmuligheder pr. spoergsmaal
- behold forklaringsfelt (`explain`)
- respekter valideringen i `quiz-data.js` (ellers fejler load)

## Quick Facts (scene-style)

- Release name: `H3 Portal`
- Type: `Static educational portal + quiz trainer`
- Platform: `Web browser`
- Backend: `None`
- Build step: `None`
- Status: `Live`
- URL: `http://stst50.web.techcollege.dk/`

## Credits

Udviklet som skoleprojekt / undervisningsportal for H3-forloeb.

NFO-viben er kun stil. Ingen warez, kun fag og quizzer.

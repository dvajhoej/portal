(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : globalThis;

  const QUIZ_META = {
    difficulties: [
      { key: 'nem', label: 'Nem' },
      { key: 'oevet', label: 'Øvet' },
      { key: 'avanceret', label: 'Avanceret' },
    ],
    subjects: [
      { key: 'kravspecifikation', label: 'Kravspecifikation' },
      { key: 'metodik', label: 'Metodik' },
      { key: 'softwaretest-sikkerhed', label: 'Softwaretest & Sikkerhed' },
    ],
  };

  const SUBJECT_SHORT = {
    'kravspecifikation': 'krav',
    'metodik': 'met',
    'softwaretest-sikkerhed': 'test',
  };

  const SUBJECT_LABELS = Object.fromEntries(QUIZ_META.subjects.map((s) => [s.key, s.label]));

  const TOPIC_INDEX = {
    'kravspecifikation': [
      {
        module: 'Modeller & Metoder',
        subtopics: [
          'Udviklingsmodeller',
          'Brainstorming',
          'Interview',
          'Casearbejde & eksempler',
        ],
      },
      {
        module: 'Prototyping',
        subtopics: [
          'Begreb og definition',
          'Prototype-modeller',
          'Fordele og ulemper',
          'Værktøjer til prototyping',
        ],
      },
      {
        module: 'Krav, Accepttest & UML',
        subtopics: [
          'Formål og formalitet',
          'Kravformulering og kvalitet',
          'Sprogformer og opdeling',
          'Kravtyper og indhold',
          'Accepttestspecifikation',
          'UML',
        ],
      },
    ],
    'metodik': [
      {
        module: 'Agile Grundlag',
        subtopics: [
          'Agilt manifest & principper',
          'Metodeoverblik',
          'Mål og evaluering',
        ],
      },
      {
        module: 'Scrum Framework',
        subtopics: [
          'Scrum-roller',
          'Scrum-ceremonier',
          'Scrum-værktøjer / artefakter',
        ],
      },
      {
        module: 'Extreme Programming & TDD',
        subtopics: [
          'Extreme Programming (XP)',
          'Pair Programming & TTD',
        ],
      },
      {
        module: 'User Stories & Planning Poker',
        subtopics: [
          'User Stories',
          'Planning Poker',
          'Agilt scenarie (Scrum + XP)',
        ],
      },
    ],
    'softwaretest-sikkerhed': [
      {
        module: 'Motivation, Begreber & Unit Testing',
        subtopics: [
          'Motivation for test',
          'Begreber, aktiviteter og testniveauer',
          'Unit test framework',
        ],
      },
      {
        module: 'GUI & System Test',
        subtopics: [
          'System / GUI test',
          'Capture/Playback og udfordringer',
          'Playwright',
        ],
      },
      {
        module: 'Integrationstest & Andre Testformer',
        subtopics: [
          'Andre testformer',
          'Integration og API-test',
          'Moq og Dependency Injection',
        ],
      },
      {
        module: 'Coverage, CI & Opsamling',
        subtopics: [
          'Coverage og Continuous Integration',
          'Test af fysiske systemer',
        ],
      },
    ],
  };

  const MODULE_QUOTAS = {
    'kravspecifikation': [5, 5, 10],
    'metodik': [5, 5, 4, 6],
    'softwaretest-sikkerhed': [5, 5, 5, 5],
  };

  const DIFFICULTY_ORDER = ['nem', 'oevet', 'avanceret'];
  const DIFFICULTY_OFFSET = { nem: 0, oevet: 1, avanceret: 2 };

  const BANNED_TERMS = [
    /\bforløbet\b/i,
    /\bundervisningen\b/i,
    /\bslides?\b/i,
    /\bmateriale(?:t)?\b/i,
    /\bøvelse(?:r)?\b/i,
    /\bMoodle\b/i,
    /\bintrofil\b/i,
  ];

  const STRUCTURE_QUIZ_PATTERNS = [
    /\bHvilket underemne\b/i,
    /\bHvilket modul\b/i,
    /\bmodul og underemne\b/i,
    /\bhvilket emne hører\b/i,
  ];

  const WARN_PATTERNS = [
    /^Hvad beskriver\s+".+"\s+bedst\?$/i,
    /^Hvilket udsagn passer bedst til\s+".+"\?$/i,
  ];

  function normalizeSpaces(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function stripDiacritics(v) {
    return normalizeSpaces(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function unique(arr) {
    return [...new Set(arr)];
  }

  function allocateCounts(topicCount, target, offset) {
    if (topicCount <= 0) throw new Error('Module without topics');
    if (target < topicCount) throw new Error(`Target ${target} below topic count ${topicCount}`);
    const counts = Array(topicCount).fill(1);
    let remaining = target - topicCount;
    let i = ((offset % topicCount) + topicCount) % topicCount;
    while (remaining > 0) {
      counts[i] += 1;
      i = (i + 1) % topicCount;
      remaining -= 1;
    }
    return counts;
  }

  function computeCoverageTargets() {
    const targets = new Map();
    for (const subjectKey of Object.keys(TOPIC_INDEX)) {
      const modules = TOPIC_INDEX[subjectKey];
      const quotas = MODULE_QUOTAS[subjectKey];
      if (!quotas || quotas.length !== modules.length) {
        throw new Error(`Module quotas mismatch for ${subjectKey}`);
      }
      for (const difficulty of DIFFICULTY_ORDER) {
        const offset = DIFFICULTY_OFFSET[difficulty];
        modules.forEach((moduleDef, moduleIndex) => {
          const counts = allocateCounts(moduleDef.subtopics.length, quotas[moduleIndex], offset);
          moduleDef.subtopics.forEach((subtopic, subIndex) => {
            const key = [subjectKey, difficulty, moduleDef.module, subtopic].join('::');
            targets.set(key, counts[subIndex]);
          });
        });
      }
    }
    return targets;
  }

  const COVERAGE_TARGETS = computeCoverageTargets();

  const TOPIC_LOOKUP = (() => {
    const bySubject = new Map();
    const flat = [];
    for (const [subjectKey, modules] of Object.entries(TOPIC_INDEX)) {
      const moduleMap = new Map();
      modules.forEach((moduleDef) => {
        moduleMap.set(moduleDef.module, new Set(moduleDef.subtopics));
        moduleDef.subtopics.forEach((subtopic) => {
          flat.push({ subjectKey, module: moduleDef.module, subtopic });
        });
      });
      bySubject.set(subjectKey, moduleMap);
    }
    return { bySubject, flat };
  })();

  function autoTags(subjectKey, module, subtopic, question) {
    const base = [subjectKey, module, subtopic, question]
      .map(stripDiacritics)
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9æøå\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    return unique(base).slice(0, 8);
  }

  function rotateOptions(correct, distractors, seed) {
    const options = [correct, ...distractors].map(normalizeSpaces);
    if (options.length !== 4) throw new Error('Exactly 4 options are required in source');
    if (new Set(options).size !== 4) throw new Error(`Duplicate options in source set: ${options.join(' | ')}`);
    const offset = ((seed % 4) + 4) % 4;
    const rotated = [...options.slice(offset), ...options.slice(0, offset)];
    return { options: rotated, answer: rotated.indexOf(normalizeSpaces(correct)) };
  }

  function Q(module, subtopic, q, correct, d1, d2, d3, explain, tags) {
    return {
      module,
      subtopic,
      q,
      correct,
      distractors: [d1, d2, d3],
      explain,
      tags: tags || null,
    };
  }

  const QUIZ_BANK_SOURCE = {
    'kravspecifikation': {
      nem: [
        // Modul 1: Modeller & Metoder (5)
        Q('Modeller & Metoder', 'Udviklingsmodeller', 'Hvad kendetegner en klassisk vandfaldsmodel?', 'Arbejdet gennemføres typisk i sekventielle faser med begrænset tilbagehop', 'Udvikling og drift er den samme fase', 'Krav ændres løbende uden planpåvirkning', 'Der leveres automatisk en ny version hver dag', 'Vandfaldsmodellen organiserer arbejdet fasevist, så større ændringer sent i projektet ofte bliver dyrere.'),
        Q('Modeller & Metoder', 'Udviklingsmodeller', 'Hvornår er en iterativ udviklingsmodel ofte en fordel?', 'Når man forventer læring og justering undervejs', 'Når alle krav er låst og aldrig må ændres', 'Når systemet ikke skal testes', 'Når der kun er brug for dokumentation og ingen løsning', 'Iterativ udvikling gør det muligt at lære af feedback og justere løsning og krav i flere runder.'),
        Q('Modeller & Metoder', 'Brainstorming', 'Hvad er et vigtigt princip i den tidlige del af brainstorming?', 'At udsætte vurdering af idéer, så der kommer mange forslag frem', 'At vælge én idé med det samme', 'At afvise idéer, der ikke er teknisk perfekte', 'At fokusere på detaljeret implementering før behovet er forstået', 'Brainstorming virker bedst tidligt, når man først skaber mange idéer og først senere vurderer dem.'),
        Q('Modeller & Metoder', 'Interview', 'Hvad er hovedformålet med interview i kravarbejde?', 'At indsamle viden om behov, arbejdsgange og problemer fra relevante interessenter', 'At vælge programmeringssprog til løsningen', 'At udarbejde en testplan for CI', 'At tegne UML automatisk', 'Interview bruges til at få direkte input fra personer, der kender behov og arbejdsprocesser.'),
        Q('Modeller & Metoder', 'Casearbejde & eksempler', 'Hvorfor bruges casearbejde ofte i kravspecifikation?', 'Det gør det lettere at omsætte teori til en konkret problemstilling', 'Det fjerner behovet for at tale med interessenter', 'Det erstatter kravspecifikationen helt', 'Det gør test unødvendig', 'Casearbejde hjælper med at afgrænse opgaven og anvende begreber som krav, prototyper og test i en realistisk kontekst.'),

        // Modul 2: Prototyping (5)
        Q('Prototyping', 'Begreb og definition', 'Hvad er en prototype i systemudvikling?', 'En tidlig og ikke-komplet version af en løsning, der bruges til afprøvning', 'Den endelige version, som er klar til drift', 'Kun et juridisk dokument om krav', 'Et fast format for accepttestcases', 'En prototype er en foreløbig udgave, der bruges til at undersøge idéer, funktioner eller brugergrænseflade.'),
        Q('Prototyping', 'Begreb og definition', 'Hvad er et typisk formål med prototyping?', 'At få feedback tidligt, før man bruger tid på fuld udvikling', 'At undgå kontakt med brugere og interessenter', 'At erstatte alle krav og al dokumentation', 'At gøre test overflødig', 'Prototyping bruges til at lære hurtigt og afklare behov, før løsningen bygges færdig.'),
        Q('Prototyping', 'Prototype-modeller', 'Hvad betyder en throwaway-prototype typisk?', 'En prototype der laves for læring og derefter kasseres', 'En prototype der altid går direkte i produktion', 'En prototype der kun bruges til performance-test', 'En prototype der ikke må ændres', 'Throwaway-prototyper bruges til afklaring, ikke som basis for den endelige løsning.'),
        Q('Prototyping', 'Fordele og ulemper', 'Hvilken risiko kan opstå ved prototyping?', 'At en foreløbig prototype bliver opfattet som en færdig løsning', 'At man ikke kan få feedback på idéer', 'At krav bliver tydeligere', 'At misforståelser opdages tidligere', 'En klassisk ulempe er, at en prototype kan skabe forkerte forventninger, hvis dens status ikke er tydelig.'),
        Q('Prototyping', 'Værktøjer til prototyping', 'Hvad passer bedst til en hurtig low-fidelity prototype?', 'Papir, whiteboard og post-its', 'Produktionsdatabase og live integrationer', 'Load test-værktøjer', 'Krypteringsnøgler til drift', 'Low-fidelity prototyper laves ofte med simple værktøjer, så man hurtigt kan skitsere og ændre løsningen.'),

        // Modul 3: Krav, Accepttest & UML (10)
        Q('Krav, Accepttest & UML', 'Formål og formalitet', 'Hvad er hovedformålet med en kravspecifikation?', 'At skabe fælles forståelse for hvad løsningen skal kunne', 'At beskrive den færdige kildekode i detaljer', 'At erstatte test og acceptkriterier', 'At vælge teamets mødetider', 'Kravspecifikationen samler og tydeliggør aftalte krav, så kunde og udvikler arbejder mod samme mål.'),
        Q('Krav, Accepttest & UML', 'Formål og formalitet', 'Hvorfor er formalitet i kravspecifikation især vigtig i et udbud?', 'Fordi flere løsninger skal kunne vurderes ud fra samme grundlag', 'Fordi UML ikke må bruges i udbud', 'Fordi test først planlægges efter levering', 'Fordi kun funktionelle krav er relevante', 'Et formelt kravgrundlag gør det muligt at sammenligne tilbud og vurdere leverancer mere ensartet.'),
        Q('Krav, Accepttest & UML', 'Kravformulering og kvalitet', 'Hvad gør et krav mere testbart?', 'At kravet er konkret og kan verificeres med tydelige kriterier', 'At kravet er så bredt som muligt', 'At kravet bruger ord som "hurtig" uden definition', 'At kravet beskriver flere funktioner på én linje', 'Testbare krav er klare og målbare nok til, at man kan afgøre om de er opfyldt.'),
        Q('Krav, Accepttest & UML', 'Kravformulering og kvalitet', 'Hvilken formulering er typisk for uklar til at være et godt krav alene?', 'Systemet skal være brugervenligt', 'Systemet skal kunne oprette en bruger med e-mail og adgangskode', 'Systemet skal logge fejl med tidsstempel', 'Systemet skal vise fejlbesked ved ugyldigt input', 'Ord som "brugervenligt" er ofte for uklare uden mere præcis beskrivelse eller målbare kriterier.'),
        Q('Krav, Accepttest & UML', 'Sprogformer og opdeling', 'Hvorfor er en hierarkisk opdeling af krav nyttig?', 'Den gør krav lettere at finde igen og koble til test', 'Den gør alle krav kortere automatisk', 'Den erstatter behovet for prioritering', 'Den gør UML unødvendig', 'En tydelig struktur forbedrer overblik, vedligeholdelse og sporbarhed mellem krav og test.'),
        Q('Krav, Accepttest & UML', 'Sprogformer og opdeling', 'Hvad bruges BDD/Gherkin ofte til i kravarbejde?', 'At beskrive adfærd og scenarier i et læsbart format', 'At tegne klassediagrammer', 'At måle CPU-belastning', 'At styre versionskontrol', 'BDD/Gherkin hjælper med at gøre forventet adfærd og testscenarier tydelige for flere roller.'),
        Q('Krav, Accepttest & UML', 'Kravtyper og indhold', 'Hvad beskriver funktionelle krav primært?', 'Hvilke handlinger og funktioner systemet skal udføre', 'Hvordan teamet fordeler arbejdsopgaver', 'Hvilken hardware leverandøren bruger internt', 'Hvordan koden formatteres', 'Funktionelle krav handler om systemets funktionalitet set udefra.'),
        Q('Krav, Accepttest & UML', 'Kravtyper og indhold', 'Hvilket er et eksempel på et ikke-funktionelt krav?', 'Systemet skal kunne håndtere svartid under 2 sekunder ved normal belastning', 'Systemet skal kunne oprette en ordre', 'Systemet skal kunne slette en bruger', 'Systemet skal sende en kvitteringsmail', 'Ikke-funktionelle krav beskriver kvaliteter som ydelse, sikkerhed og brugervenlighed.'),
        Q('Krav, Accepttest & UML', 'Accepttestspecifikation', 'Hvorfor kobles accepttestcases til konkrete krav?', 'Så man kan verificere hvert krav systematisk', 'Så man kan undgå at skrive kravnumre', 'Så test kun behøver at dække UI', 'Så udviklere ikke behøver dokumentation', 'Sporbarhed mellem krav og accepttest gør det tydeligt, hvad der er testet, og hvad der mangler.'),
        Q('Krav, Accepttest & UML', 'UML', 'Hvad bruges UML primært til?', 'At visualisere systemets struktur og adfærd med diagrammer', 'At skrive automatiske integrationstests', 'At estimere sprintstørrelser', 'At styre versionsnumre', 'UML bruges som modelleringsværktøj til at forklare løsningen visuelt gennem relevante diagramtyper.'),
      ],
      oevet: [
        // Modul 1: Modeller & Metoder (5)
        Q('Modeller & Metoder', 'Udviklingsmodeller', 'Et projekt har uklare behov og forventede ændringer. Hvilken tilgang passer ofte bedst?', 'En iterativ tilgang med feedback og løbende justering', 'En faseplan hvor alle krav låses fra dag ét uanset ny viden', 'En tilgang uden test indtil slutningen', 'En tilgang hvor dokumentation helt undgås', 'Når behov ændrer sig, giver iterativ udvikling bedre mulighed for at lære og justere undervejs.'),
        Q('Modeller & Metoder', 'Brainstorming', 'Hvilket valg styrker kvaliteten af en brainstormingsession?', 'Tydelige rammer som timeboxing og fælles spilleregler', 'At vurdere og rangere alle idéer efter hver ny kommentar', 'At begrænse deltagelse til én faggruppe', 'At springe opsamling over for at spare tid', 'Brainstorming bliver mere effektiv med klare rammer og en adskillelse mellem idégenerering og vurdering.'),
        Q('Modeller & Metoder', 'Brainstorming', 'Hvad er et godt næste skridt efter den frie idégenerering i brainstorming?', 'At sortere og vurdere idéer ud fra relevante kriterier', 'At vælge den første idé uden diskussion', 'At starte kodning uden afklaring', 'At kassere alle idéer som ikke er detaljerede', 'Efter idégenerering bør man strukturere og vurdere idéerne, så de kan omsættes til konkrete beslutninger.'),
        Q('Modeller & Metoder', 'Interview', 'Hvad er god praksis før et kravinterview?', 'At forberede formål og spørgsmål, så samtalen bliver målrettet', 'At undgå at definere formålet for ikke at påvirke svarene', 'At kun spørge om tekniske detaljer uanset rolle', 'At springe notater over for at holde tempo', 'Et interview bliver bedre, når formålet er klart, og spørgsmålene er forberedt i forhold til interessentens viden.'),
        Q('Modeller & Metoder', 'Casearbejde & eksempler', 'Hvordan kan casearbejde forbedre kravarbejdet?', 'Ved at gøre afgrænsning og prioritering mere konkret i en realistisk kontekst', 'Ved at erstatte behovet for kravformulering', 'Ved at fjerne behovet for interessenter', 'Ved at fokusere kun på teknisk implementering', 'En konkret case gør det lettere at vurdere hvad der er vigtigst, og hvilke krav der faktisk giver værdi.'),

        // Modul 2: Prototyping (5)
        Q('Prototyping', 'Begreb og definition', 'Hvilket udsagn passer bedst til prototyping i et tidligt designforløb?', 'Prototyping bruges til læring og afklaring, ikke nødvendigvis som færdig løsning', 'Prototyping giver altid et produktionsklart resultat', 'Prototyping er kun relevant efter systemtest', 'Prototyping erstatter kravspecifikation og accepttest', 'En prototype er et middel til afprøvning og feedback, ikke automatisk den endelige implementering.'),
        Q('Prototyping', 'Prototype-modeller', 'Hvornår passer en evolutionary prototype ofte bedst?', 'Når prototypen gradvist skal udvikles videre mod en egentlig løsning', 'Når prototypen kun skal bruges i fem minutter og kasseres straks', 'Når målet kun er belastningstest af database', 'Når man ikke vil ændre design undervejs', 'En evolutionary prototype kan være et trin i en gradvis udvikling, hvor løsningen forbedres i flere iterationer.'),
        Q('Prototyping', 'Prototype-modeller', 'Hvilken prototype-model forbindes typisk med web-løsninger og tidligt fokus på brugergrænseflade?', 'Extreme prototyping', 'Throwaway prototyping', 'Regression testing', 'Pair programming', 'Extreme prototyping bruges ofte i webkontekster, hvor UI og brugerflow afprøves tidligt.'),
        Q('Prototyping', 'Fordele og ulemper', 'Hvad er en god måde at reducere risikoen for misforståelser omkring en prototype?', 'At gøre det tydeligt hvad prototypen viser, og hvad den ikke viser', 'At kalde prototypen færdig for at skabe ro', 'At undgå feedback indtil udviklingen er afsluttet', 'At skjule begrænsninger for brugerne', 'Tydelig forventningsafstemning om prototype-scope reducerer risikoen for, at den opfattes som færdig løsning.'),
        Q('Prototyping', 'Værktøjer til prototyping', 'Hvordan bør man typisk vælge værktøj til prototyping?', 'Efter formålet med prototypen og ønsket detaljeringsgrad', 'Efter hvad teamet bruger til kildekode i produktion', 'Efter hvilket værktøj der har flest funktioner', 'Tilfældigt, så man undgår bias', 'Valg af værktøj bør styres af hvad der skal afprøves, og hvor hurtigt ændringer skal kunne laves.'),

        // Modul 3: Krav, Accepttest & UML (10)
        Q('Krav, Accepttest & UML', 'Formål og formalitet', 'Hvornår bør kravspecifikationens formelle niveau typisk øges?', 'Når flere parter skal kunne tolke krav ens, fx ved udbud eller kontrakt', 'Når teamet kun arbejder med interne skitser', 'Når der ikke er behov for testbarhed', 'Når løsningen er så lille at ingen afklaringer er nødvendige', 'Et højere formelt niveau hjælper især, når krav skal være entydige på tværs af flere parter.'),
        Q('Krav, Accepttest & UML', 'Kravformulering og kvalitet', 'Hvilken omskrivning gør kravet mest testbart?', 'Brugeren skal kunne nulstille adgangskode via e-mail inden for 5 minutter', 'Systemet skal have god sikkerhed', 'Login skal være nemt', 'Brugerne skal være tilfredse med adgangskoder', 'Det testbare krav gør funktion og forventning konkret nok til at kunne verificeres.'),
        Q('Krav, Accepttest & UML', 'Kravformulering og kvalitet', 'Hvilket problem peger på manglende konsistens i en kravspecifikation?', 'To krav beskriver forskellig maksimal svartid for samme funktion', 'Et krav har et nummer', 'Et krav er opdelt i underpunkter', 'Et krav henviser til en accepttest', 'Inkonsekvente krav skaber tvivl om hvad der faktisk skal leveres og testes.'),
        Q('Krav, Accepttest & UML', 'Sprogformer og opdeling', 'Hvornår er semi-formelle eller formelle beskrivelser ofte nyttige?', 'Når man skal øge præcision og reducere tvetydighed i centrale krav', 'Når målet kun er hurtig idéopsamling', 'Når der ikke findes interessenter', 'Når alt allerede er implementeret', 'Mere formelle beskrivelser kan øge præcisionen, især hvor tvetydighed giver stor risiko.'),
        Q('Krav, Accepttest & UML', 'Sprogformer og opdeling', 'Hvad opnår man ved konsekvent begrebsbrug i kravdokumentet?', 'At reducere misforståelser og gøre vedligeholdelse lettere', 'At gøre kravene længere og mere tekniske', 'At erstatte behovet for testcases', 'At undgå prioritering af krav', 'Ens begreber gør det lettere at læse, sammenligne og ændre krav uden at skabe uklarhed.'),
        Q('Krav, Accepttest & UML', 'Kravtyper og indhold', 'Hvilket udsagn viser korrekt skelnen mellem kravtyper?', 'Funktionelle krav beskriver adfærd, mens ikke-funktionelle krav beskriver kvaliteter', 'Ikke-funktionelle krav beskriver kun GUI-funktioner', 'Funktionelle krav handler kun om performance', 'Begge typer krav betyder det samme', 'Skelnen er vigtig, fordi systemets funktion og kvalitet vurderes på forskellige måder.'),
        Q('Krav, Accepttest & UML', 'Kravtyper og indhold', 'Hvilket krav hører bedst til kategorien eksterne grænseflader?', 'Systemet skal kunne udveksle ordredata med ERP via et dokumenteret API', 'Systemet skal kunne oprette kunde', 'Systemet skal have kort svartid', 'Systemet skal være let at lære', 'Krav om integration med andre systemer hører til krav om eksterne grænseflader.'),
        Q('Krav, Accepttest & UML', 'Accepttestspecifikation', 'Hvad er en stærk kobling mellem krav og accepttest?', 'Hvert væsentligt krav har en test, der viser hvornår kravet er opfyldt', 'Kun de teknisk svære krav får tests', 'Accepttest skrives uden reference til krav', 'Accepttest dækker kun brugergrænsefladen', 'Krav og accepttest bør hænge sammen, så man kan dokumentere opfyldelse systematisk.'),
        Q('Krav, Accepttest & UML', 'Accepttestspecifikation', 'Hvad er en typisk konsekvens af manglende sporbarhed mellem krav og accepttest?', 'Det bliver uklart hvilke krav der faktisk er verificeret', 'Testene bliver automatisk mere præcise', 'Kravene bliver lettere at vedligeholde', 'UML-diagrammerne bliver unødvendige', 'Uden sporbarhed er det sværere at se om alle aftalte krav er dækket af test.'),
        Q('Krav, Accepttest & UML', 'UML', 'Hvornår giver UML størst værdi i krav- og designkommunikation?', 'Når relevante diagrammer vælges til at forklare netop de vigtigste dele af løsningen', 'Når man tegner alle UML-diagramtyper uanset behov', 'Når UML bruges i stedet for kravtekst', 'Når diagrammerne kun læses af udviklere', 'UML virker bedst som målrettet visualisering af struktur eller forløb, ikke som et mål i sig selv.'),
      ],
      avanceret: [
        // Modul 1: Modeller & Metoder (5)
        Q('Modeller & Metoder', 'Udviklingsmodeller', 'Et projekt har stabile myndighedskrav men usikkert brugerflow. Hvilken arbejdsform er oftest mest hensigtsmæssig?', 'En kombination, hvor stabile krav fastholdes tydeligt mens brugeroplevelsen udvikles iterativt', 'Kun ren vandfald uden feedback undervejs', 'Kun fri udvikling uden kravstyring', 'Ingen model, fordi modeller kun bremser arbejdet', 'Når dele af projektet er stabile og andre er usikre, er en kombineret arbejdsform ofte mere realistisk end en ren model.'),
        Q('Modeller & Metoder', 'Brainstorming', 'Et team oplever at én person dominerer brainstorming. Hvad er den bedste justering?', 'Indfør tydelig facilitering og struktur, så flere idéer kommer frem før vurdering', 'Lad den mest erfarne vælge idéerne alene', 'Stop brainstorm og gå direkte til implementering', 'Fjern tidsrammer for at undgå pres', 'Brainstorming kræver rammer, der beskytter bred deltagelse og udskyder tidlig bedømmelse.'),
        Q('Modeller & Metoder', 'Interview', 'Du får modstridende svar fra to interessenter om samme proces. Hvad er den stærkeste næste handling?', 'Dokumentér forskellen, afklar kontekst og planlæg opfølgning med konkrete eksempler', 'Vælg det svar der passer bedst til den foretrukne løsning', 'Ignorér konflikten og skriv et generelt krav', 'Lad udviklerne afgøre forretningens behov alene', 'Interviewdata skal afklares systematisk, især når forskellige interessenter beskriver forskellige arbejdsgange.'),
        Q('Modeller & Metoder', 'Interview', 'Hvilket valg forbedrer kvaliteten af et interviewgrundlag til senere kravformulering mest?', 'At koble noter til observationer, opfølgning og konkrete afklaringspunkter', 'At gemme kun konklusioner og kassere spørgsmålene', 'At undgå referat for at arbejde hurtigere', 'At omskrive svar direkte til løsningsdesign under mødet', 'Strukturerede noter og opfølgning gør det lettere at omsætte interviewresultater til præcise og testbare krav.'),
        Q('Modeller & Metoder', 'Casearbejde & eksempler', 'Hvad er vigtigst, når en case bruges til at træffe kravmæssige prioriteringer?', 'At case og afgrænsning er tydelig, så prioriteringer kan begrundes fagligt', 'At casen indeholder alle tænkelige detaljer', 'At casen matcher en tidligere løsning præcist', 'At casen bruges uden dialog med interessenter', 'Casearbejde giver værdi, når rammer og mål er tydelige nok til at støtte konkrete prioriteringer.'),

        // Modul 2: Prototyping (5)
        Q('Prototyping', 'Begreb og definition', 'Et team vil bruge en prototype som bevis for endelig performance. Hvad er den bedste faglige vurdering?', 'Det er risikabelt, fordi en prototype ofte ikke repræsenterer den endelige løsning eller belastning', 'Det er sikkert, fordi alle prototyper viser endelig ydelse', 'Det er korrekt, hvis prototypen ser færdig ud', 'Det er kun et problem ved papirprototyper', 'Prototyper bruges primært til afprøvning og læring; de er ikke nødvendigvis gyldige som endeligt performance-bevis.'),
        Q('Prototyping', 'Prototype-modeller', 'Et team vil først afklare behov hurtigt og derefter videreudvikle den bedste løsning. Hvilken strategi passer bedst?', 'Start med en throwaway-prototype til afklaring og vælg derefter en model til gradvis videreudvikling', 'Brug kun capture/playback-tests fra start', 'Undgå prototyper og skriv alle detaljer i kode først', 'Brug kun én prototype uden feedback', 'Det er ofte fornuftigt at skille tidlig afklaring fra senere videreudvikling, hvis formålet ændrer sig undervejs.'),
        Q('Prototyping', 'Fordele og ulemper', 'Hvornår bliver prototyping typisk dyrere end forventet?', 'Når formål, scope og evalueringskriterier er uklare under arbejdet', 'Når prototypen bruges til tidlig feedback', 'Når der testes brugerflow tidligt', 'Når teamet dokumenterer hvad prototypen skal bruges til', 'Uklart formål gør det svært at stoppe i tide og øger risikoen for omarbejde uden læring.'),
        Q('Prototyping', 'Fordele og ulemper', 'Hvad er den bedste beslutning, hvis en prototype giver god læring men dårlig kodekvalitet?', 'Bevar læringen, men vurder kritisk om implementeringen skal bygges ordentligt op fra ny struktur', 'Send prototypen direkte i drift for at spare tid', 'Stop al videre udvikling fordi prototyper ikke må ændres', 'Ignorér læringen og behold planen uændret', 'Prototypeværdi ligger ofte i indsigt, ikke i at genbruge al kode ukritisk.'),
        Q('Prototyping', 'Værktøjer til prototyping', 'Et team vil afprøve informationsarkitektur hurtigt med mange ændringer. Hvilket valg er mest hensigtsmæssigt?', 'Et simpelt low-fidelity værktøj, så struktur kan ændres hurtigt', 'Et detaljeret produktionsnært setup med alle integrationer', 'Kun performance-testværktøjer', 'Et fast UML-klassediagram uden skitser', 'Når fokus er struktur og hurtige ændringer, er simple værktøjer ofte mere effektive end detaljerede løsninger.'),

        // Modul 3: Krav, Accepttest & UML (10)
        Q('Krav, Accepttest & UML', 'Formål og formalitet', 'Et projekt har både tekniske specialister og forretningsbrugere som modtagere af krav. Hvad er et stærkt valg?', 'Kombinér tydelig struktur med passende præcision, så krav kan læses af flere målgrupper uden at miste testbarhed', 'Skriv kun meget teknisk tekst for at undgå forenkling', 'Skriv kun overordnede mål uden konkrete krav', 'Erstat krav med diagrammer alene', 'Kravdokumentet skal balancere læsbarhed og præcision, så flere roller kan bruge det.'),
        Q('Krav, Accepttest & UML', 'Kravformulering og kvalitet', 'Hvilken ændring forbedrer et sammensat krav mest?', 'Del kravet op i mindre krav med hver sin verificerbare forventning', 'Tilføj flere funktioner i samme krav for at samle dem', 'Fjern alle tal og grænseværdier', 'Beskriv løsningen med generelle ord som "god" og "hurtig"', 'Opdeling af sammensatte krav gør dem lettere at forstå, prioritere og teste.'),
        Q('Krav, Accepttest & UML', 'Sprogformer og opdeling', 'Hvornår giver det mest mening at supplere naturligt sprog med mere strukturerede beskrivelser?', 'Når centrale krav har høj risiko for tvetydighed eller fejlfortolkning', 'Kun når systemet allerede er færdigudviklet', 'Kun hvis der ikke findes accepttest', 'Aldrig, fordi naturligt sprog altid er entydigt', 'Kritiske krav kan kræve mere struktur for at reducere tvetydighed og styrke testbarhed.'),
        Q('Krav, Accepttest & UML', 'Sprogformer og opdeling', 'Hvad er den vigtigste gevinst ved at koble opdeling, navngivning og reference-id’er i kravdokumentet?', 'At ændringer, reviews og testkoblinger bliver lettere at styre', 'At dokumentet automatisk bliver kortere', 'At ikke-funktionelle krav ikke længere er nødvendige', 'At interessenter ikke behøver at gennemlæse kravene', 'Struktur med klare id’er understøtter sporbarhed og ændringshåndtering gennem hele arbejdet.'),
        Q('Krav, Accepttest & UML', 'Kravtyper og indhold', 'Et team prioriterer kun funktionelle krav tidligt. Hvad er den største risiko?', 'At vigtige kvalitetskrav som sikkerhed og performance opdages for sent', 'At systemet får for mange use cases', 'At UML-diagrammer bliver for detaljerede', 'At backloggen får færre items', 'Ikke-funktionelle krav påvirker ofte arkitektur og design tidligt og bør ikke udskydes uden overvejelse.'),
        Q('Krav, Accepttest & UML', 'Kravtyper og indhold', 'Hvilken prioritering er mest fagligt stærk, når et system skal være både hurtigt og korrekt?', 'At behandle funktionelle og ikke-funktionelle krav som sammenhængende og afveje dem eksplicit', 'At ignorere performance indtil efter levering', 'At fokusere kun på UI-krav', 'At skrive alle krav som generelle ønsker uden grænseværdier', 'Kvalitet og funktion påvirker hinanden; derfor bør de prioriteres og afvejes sammen.'),
        Q('Krav, Accepttest & UML', 'Accepttestspecifikation', 'Et krav ændres sent i projektet. Hvad er den vigtigste handling i accepttestspecifikationen?', 'Gennemgå og opdatér de testcases der er koblet til kravet', 'Behold testcases uændrede for at sikre sammenligning', 'Fjern kravet fra dokumentationen', 'Erstat accepttest med unit tests alene', 'Sporbarhed gør det muligt at se præcist hvilke accepttests der påvirkes af en kravændring.'),
        Q('Krav, Accepttest & UML', 'Accepttestspecifikation', 'Hvordan styrker man accepttest i et projekt med mange krav og begrænset tid?', 'Prioritér testcases ud fra kravenes risiko og forretningsværdi samtidig med sporbarhed bevares', 'Test kun de krav der er lettest at demonstrere', 'Undlad at dokumentere hvilke krav der er testet', 'Kør kun tekniske tests og spring accepttest over', 'Ved begrænset tid bør accepttest stadig være målrettet og sporbar, især for de vigtigste krav.'),
        Q('Krav, Accepttest & UML', 'UML', 'Hvilket valg er mest relevant, hvis man vil forklare et brugerforløb mellem systemdele?', 'Vælg et UML-diagram der viser interaktion eller sekvens frem for kun statisk struktur', 'Vælg kun et farvetema til kravdokumentet', 'Undgå diagrammer og brug kun klasselister', 'Brug altid samme diagramtype uanset formål', 'UML giver mest værdi, når diagramtypen passer til det perspektiv man vil forklare, fx forløb eller struktur.'),
        Q('Krav, Accepttest & UML', 'UML', 'Hvad er en typisk risiko ved at bruge for mange UML-diagrammer uden klart formål?', 'At dokumentationen bliver tungere uden at forbedre forståelsen', 'At kravene bliver mere testbare automatisk', 'At performancekrav bliver opfyldt hurtigere', 'At interessenter lettere bliver enige om prioriteter', 'Diagrammer bør vælges selektivt, ellers kan de øge kompleksitet uden tilsvarende værdi.'),
      ],
    },
    'metodik': {
      nem: [
        // Modul 1: Agile Grundlag (5)
        Q('Agile Grundlag', 'Agilt manifest & principper', 'Hvad er hovedformålet med agil udvikling?', 'At levere værdi løbende og kunne tilpasse sig ændringer', 'At undgå samarbejde med kunden', 'At fjerne behovet for test', 'At fastlåse alle krav før første feedback', 'Agile arbejdsformer lægger vægt på løbende levering, feedback og tilpasning frem for stiv planfølgning.'),
        Q('Agile Grundlag', 'Agilt manifest & principper', 'Hvad betyder det, at software leveres inkrementelt?', 'At funktionalitet leveres i mindre brugbare dele over tid', 'At hele systemet leveres i én samlet afslutning', 'At man kun leverer dokumentation først', 'At man udsætter test til sidst', 'Inkrementel levering betyder, at løsningen bygges og afleveres i mindre trin, som kan vurderes undervejs.'),
        Q('Agile Grundlag', 'Metodeoverblik', 'Hvad kalder man en kort udviklingsperiode i Scrum?', 'Et sprint', 'En release note', 'Et use case', 'En backlog', 'I Scrum organiseres arbejdet i korte tidsbokse, der kaldes sprint.'),
        Q('Agile Grundlag', 'Metodeoverblik', 'Hvilket er et eksempel på et agilt framework?', 'Scrum', 'Vandfald', 'UML', 'SQL', 'Scrum er et agilt framework med roller, ceremonier og artefakter.'),
        Q('Agile Grundlag', 'Mål og evaluering', 'Hvad hjælper tydelige læringsmål og evaluering især med i et fagligt forløb?', 'At afklare hvad der forventes, og hvad der vurderes', 'At vælge programmeringssprog automatisk', 'At erstatte behovet for opgaver', 'At undgå feedback på arbejdet', 'Mål og evaluering gør det tydeligt, hvilke kompetencer der skal demonstreres.'),

        // Modul 2: Scrum Framework (5)
        Q('Scrum Framework', 'Scrum-roller', 'Hvem har typisk ansvar for at prioritere arbejdet i Product Backlog?', 'Product Owner', 'Scrum Master', 'Udviklingsteamet alene', 'Kunden uden dialog med teamet', 'Product Owner har ansvar for prioritering og retning i backloggen.'),
        Q('Scrum Framework', 'Scrum-roller', 'Hvad er Scrum Masters primære fokus?', 'At understøtte processen og fjerne hindringer for teamet', 'At skrive alle user stories selv', 'At godkende al kode før commit', 'At eje produktets forretningsprioritering', 'Scrum Master hjælper teamet med processen og forbedringer, ikke med at eje produktprioriteringen.'),
        Q('Scrum Framework', 'Scrum-ceremonier', 'Hvad hedder mødet, hvor teamet planlægger arbejdet for næste sprint?', 'Sprint Planning', 'Sprint Review', 'Daily Scrum', 'Retrospective', 'I Sprint Planning vælger og planlægger teamet arbejdet til det kommende sprint.'),
        Q('Scrum Framework', 'Scrum-ceremonier', 'Hvad er formålet med en retrospektiv i Scrum?', 'At forbedre samarbejde og proces til næste sprint', 'At demonstrere færdigt produkt til kunde', 'At estimere alle backlog-items på ny', 'At skrive kravspecifikation fra bunden', 'Retrospektiven fokuserer på læring og forbedring af måden teamet arbejder på.'),
        Q('Scrum Framework', 'Scrum-værktøjer / artefakter', 'Hvad bruges Product Backlog primært til?', 'At samle og prioritere det arbejde der kan skabe produktværdi', 'At logge systemfejl fra drift', 'At vise dagens standup-noter', 'At lagre UML-diagrammer', 'Product Backlog er den prioriterede liste over behov og opgaver for produktet.'),

        // Modul 3: Extreme Programming & TDD (4)
        Q('Extreme Programming & TDD', 'Extreme Programming (XP)', 'Hvad kendetegner XP som metode?', 'Fokus på teknisk kvalitet, hurtig feedback og små forbedringer', 'Fokus på lange release-cyklusser uden tests', 'Fokus på kun dokumentation og ingen kode', 'Fokus på én stor leverance til sidst', 'XP lægger vægt på praksisser, der giver hurtig feedback og høj kodekvalitet.'),
        Q('Extreme Programming & TDD', 'Extreme Programming (XP)', 'Hvilket er et typisk XP-princip i praksis?', 'At forbedre koden løbende gennem refactoring', 'At undgå tests for at arbejde hurtigere', 'At samle alle ændringer i store batch-leverancer', 'At lade én udvikler eje al viden', 'Refactoring og hyppig feedback er centrale elementer i XP.'),
        Q('Extreme Programming & TDD', 'Pair Programming & TTD', 'Hvad betyder pair programming?', 'To udviklere arbejder sammen om samme opgave og deler ansvar for kvalitet', 'To teams arbejder uden kontakt og sammenligner bagefter', 'Én udvikler skriver kode, mens en anden kun tester i drift', 'At man altid er to om at godkende release-noter', 'Pair programming giver løbende sparring og fælles forståelse under udviklingen.'),
        Q('Extreme Programming & TDD', 'Pair Programming & TTD', 'Hvad er den klassiske TDD-cyklus?', 'Skriv test, få den til at bestå, og refaktorér derefter', 'Skriv kode, deploy, og skriv test senere', 'Tegn UML, estimér, og skip test', 'Kør performance-test før kravafklaring', 'TDD arbejder i korte cykler, hvor test driver udviklingen og efterfølges af refaktorering.'),

        // Modul 4: User Stories & Planning Poker (6)
        Q('User Stories & Planning Poker', 'User Stories', 'Hvad beskriver en user story primært?', 'Et behov set fra brugerens perspektiv', 'Et detaljeret klassediagram', 'En liste over database-tabeller', 'Et færdigt sprintresultat', 'User stories beskriver ønsket funktionalitet ud fra hvem der får værdi og hvorfor.'),
        Q('User Stories & Planning Poker', 'User Stories', 'Hvad er formålet med acceptkriterier til en user story?', 'At tydeliggøre hvornår historien kan betragtes som opfyldt', 'At erstatte Product Backlog', 'At fastlåse teamets roller', 'At beregne performance automatisk', 'Acceptkriterier skaber fælles forståelse af hvad der skal være på plads, før storyen er færdig.'),
        Q('User Stories & Planning Poker', 'Planning Poker', 'Hvad bruges Planning Poker primært til?', 'At estimere opgaver relativt gennem fælles vurdering', 'At prioritere bugs automatisk', 'At planlægge daglige møder', 'At generere testdata', 'Planning Poker hjælper teamet med at sammenligne størrelse og kompleksitet på stories.'),
        Q('User Stories & Planning Poker', 'Planning Poker', 'Hvorfor viser deltagere ofte kort samtidig i Planning Poker?', 'For at reducere påvirkning og anchoring fra andres estimater', 'For at sikre at Product Owner altid bestemmer tallet', 'For at undgå diskussion om forskelle', 'For at gøre estimering mere formel end nødvendig', 'Samtidig visning gør det lettere at få uafhængige vurderinger før diskussion.'),
        Q('User Stories & Planning Poker', 'Agilt scenarie (Scrum + XP)', 'Hvad er pointen med et agilt scenarie, der kombinerer Scrum og XP?', 'At vise hvordan proces og tekniske practices kan bruges sammen', 'At vælge mellem Scrum og XP som gensidigt udelukkende', 'At erstatte user stories med UML', 'At undgå sprintplanlægning', 'Scrum kan give struktur, mens XP-practices kan styrke den tekniske kvalitet i arbejdet.'),
        Q('User Stories & Planning Poker', 'Agilt scenarie (Scrum + XP)', 'Hvilket eksempel viser bedst kombinationen af Scrum og XP?', 'Teamet planlægger i sprint og bruger TDD under implementering', 'Teamet dropper backlog men holder retrospektiv', 'Teamet skriver kun dokumentation og ingen tests', 'Teamet laver kun estimater uden udvikling', 'Kombinationen giver mening, når Scrum styrer samarbejde og prioritering, mens XP-practices styrker kodningen.'),
      ],
      oevet: [
        // Modul 1: Agile Grundlag (5)
        Q('Agile Grundlag', 'Agilt manifest & principper', 'Hvilket valg er mest i tråd med agile principper, når krav ændrer sig undervejs?', 'At tilpasse planen og løbende levere værdi frem for at fastholde planen blindt', 'At fryse alt arbejde indtil næste store release', 'At ignorere ændringer for at beskytte dokumentationen', 'At stoppe samarbejdet med kunden', 'Agile principper vægter tilpasning og løbende værdi højt, især når ny viden opstår.'),
        Q('Agile Grundlag', 'Metodeoverblik', 'Hvornår giver en mere faseopdelt metode typisk mening?', 'Når krav og proces er relativt stabile og ændringer er begrænsede', 'Når løsningen forventes at ændre sig ugentligt', 'Når teamet vil have feedback flere gange om ugen men undgå iterationer', 'Når prioritering ikke er nødvendig', 'Mere faseopdelte metoder kan passe bedre i situationer med høj stabilitet og færre ændringer.'),
        Q('Agile Grundlag', 'Metodeoverblik', 'Hvilken forskel er central mellem klassiske og agile arbejdsformer?', 'Agile metoder arbejder typisk med kortere feedbacksløjfer og hyppigere tilpasning', 'Klassiske metoder bruger aldrig dokumentation', 'Agile metoder bruger aldrig planlægning', 'Klassiske metoder kan ikke teste software', 'En vigtig forskel er tempoet i feedback og evnen til at tilpasse prioriteringer løbende.'),
        Q('Agile Grundlag', 'Mål og evaluering', 'Hvordan bruges læringsmål bedst i planlægning af fagligt arbejde?', 'Som styrende pejlemærker for hvad der skal forstås, forklares og anvendes', 'Kun som tekst der læses til sidst', 'Som erstatning for opgavekrav og vurdering', 'Kun til at vælge værktøjer', 'Læringsmål hjælper med at styre fokus, så arbejdet retter sig mod det der faktisk skal demonstreres.'),
        Q('Agile Grundlag', 'Mål og evaluering', 'Hvad er en god kobling mellem evaluering og læringsmål?', 'At vurderingskriterierne gør det tydeligt hvilke kompetencer der vises i opgaven', 'At evaluering kun fokuserer på layout og formalia', 'At evaluering bevidst ignorerer læringsmålene', 'At alle afleveringer vurderes ens uden hensyn til indhold', 'Når evaluering og mål hænger sammen, bliver det klart hvad der tæller fagligt.'),

        // Modul 2: Scrum Framework (5)
        Q('Scrum Framework', 'Scrum-roller', 'Hvilket ansvar ligger bedst hos udviklingsteamet i Scrum?', 'At omsætte backlog-items til fungerende løsning i sprintet', 'At eje produktprioriteringen alene', 'At godkende budget uden Product Owner', 'At definere alle forretningsmål uden interessenter', 'Udviklingsteamet har ansvar for at levere og organisere arbejdet mod sprintmålet.'),
        Q('Scrum Framework', 'Scrum-ceremonier', 'Hvornår giver Daily Scrum mest værdi?', 'Når teamet bruger mødet til kort koordinering og synliggørelse af fremdrift og hindringer', 'Når alle problemer løses i dybden på mødet', 'Når Product Owner alene fordeler opgaver minut for minut', 'Når teamet gennemgår hele backloggen i detaljer hver dag', 'Daily Scrum er et kort koordineringsmøde, ikke et langt problemløsningsmøde.'),
        Q('Scrum Framework', 'Scrum-ceremonier', 'Hvad er den vigtigste forskel på Sprint Review og Retrospective?', 'Review fokuserer på produktresultat, mens retrospektiv fokuserer på procesforbedring', 'Review er internt og retrospektiv er altid kundemøde', 'Review bruges til estimering og retrospektiv til deployment', 'Der er ingen reel forskel', 'Scrum skelner mellem evaluering af leverancen og forbedring af samarbejdet.'),
        Q('Scrum Framework', 'Scrum-værktøjer / artefakter', 'Hvad skelner Sprint Backlog fra Product Backlog?', 'Sprint Backlog er teamets aktuelle sprintarbejde, mens Product Backlog er den samlede prioriterede liste', 'Sprint Backlog ejes af kunden og Product Backlog af udviklerne', 'Sprint Backlog indeholder kun bugs', 'Der er ingen forskel i indhold eller tidshorisont', 'Product Backlog er bredere og længere sigtet, mens Sprint Backlog er sprintets konkrete plan.'),
        Q('Scrum Framework', 'Scrum-værktøjer / artefakter', 'Hvad kan et Burn Down Chart hjælpe teamet med?', 'At se om sprintets arbejde falder i det forventede tempo over tid', 'At definere alle acceptkriterier automatisk', 'At erstatte retrospektiven', 'At beslutte arkitektur alene', 'Et Burn Down Chart kan give et visuelt overblik over fremdrift og hjælpe med tidlig opfølgning.'),

        // Modul 3: Extreme Programming & TDD (4)
        Q('Extreme Programming & TDD', 'Extreme Programming (XP)', 'Hvad er et typisk mål med XP-practices som små leverancer og refactoring?', 'At øge kvalitet og feedback uden at miste udviklingstempoet', 'At undgå ændringer i design over tid', 'At flytte al test til slutningen', 'At gøre dokumentation umulig', 'XP-practices skal støtte hurtig læring og robust kode gennem løbende forbedring.'),
        Q('Extreme Programming & TDD', 'Extreme Programming (XP)', 'Hvornår giver XP særligt god værdi i et team?', 'Når teamet ønsker disciplineret teknisk praksis og hurtig feedback i hverdagen', 'Når teamet vil minimere samarbejde mellem udviklere', 'Når teamet kun leverer én gang om året', 'Når test skal undgås i starten', 'XP er stærk, når teknisk kvalitet og feedback skal bygges ind i den daglige udvikling.'),
        Q('Extreme Programming & TDD', 'Pair Programming & TTD', 'Hvilken gevinst er typisk ved pair programming ud over fejlreduktion?', 'Mere delt forståelse af kode og beslutninger i teamet', 'Mindre behov for kommunikation i teamet', 'At én udvikler kan arbejde helt uden kontekst', 'At tests ikke længere behøves', 'Pair programming kan styrke vidensdeling og gøre teamet mindre sårbart over for flaskehalse.'),
        Q('Extreme Programming & TDD', 'Pair Programming & TTD', 'Hvad er det vigtigste formål med refactor-trinnet i TDD-cyklussen?', 'At forbedre design og læsbarhed uden at ændre adfærden', 'At tilføje nye features uden tests', 'At slette tests for at gøre build hurtigere', 'At omskrive kravspecifikationen', 'Refactor-trinnet bruges til at rydde op i koden, mens tests bevarer den forventede adfærd.'),

        // Modul 4: User Stories & Planning Poker (6)
        Q('User Stories & Planning Poker', 'User Stories', 'Hvad gør en user story mere anvendelig i planlægning?', 'At den kombineres med tydelige acceptkriterier og afgrænsning', 'At den beskriver alle tekniske detaljer fra start', 'At den skrives uden brugerperspektiv', 'At den undgår prioritering', 'En story bliver lettere at arbejde med, når teamet ved hvad der forventes, og hvornår den er færdig.'),
        Q('User Stories & Planning Poker', 'User Stories', 'Hvad er et tegn på at en user story bør deles op?', 'Den er for stor eller uklar til at kunne planlægges meningsfuldt i et sprint', 'Den har et brugerperspektiv', 'Den har acceptkriterier', 'Den er skrevet i et standardformat', 'For store stories skaber usikkerhed i estimering og udførelse og bør ofte opdeles.'),
        Q('User Stories & Planning Poker', 'Planning Poker', 'Hvad gør Planning Poker fagligt nyttigt ud over selve tallet?', 'Diskussionen synliggør forskellig forståelse og skjulte antagelser', 'Det fjerner behovet for prioritering', 'Det bestemmer automatisk sprintmålet', 'Det erstatter retrospektiver', 'Den vigtigste værdi ligger ofte i samtalen om hvorfor estimaterne er forskellige.'),
        Q('User Stories & Planning Poker', 'Planning Poker', 'Hvornår er det mest relevant at tage en ny estimeringsrunde i Planning Poker?', 'Når stor forskel i kortvalg viser forskellig forståelse af opgaven', 'Når alle straks har samme kort', 'Når Product Owner allerede har valgt tallet alene', 'Når backloggen er tom', 'Stor spredning i estimater er ofte et tegn på uklare antagelser, som bør afklares og estimeres igen.'),
        Q('User Stories & Planning Poker', 'Agilt scenarie (Scrum + XP)', 'Hvilket valg viser en meningsfuld kombination af Scrum og XP i et team?', 'Sprintplanlægning bruges til prioritering, mens TDD og refactoring bruges i udviklingen', 'Scrum bruges kun til standup og XP kun til estimering', 'XP erstatter alle Scrum-roller', 'Scrum og XP må ikke kombineres', 'Scrum og XP kan supplere hinanden ved at kombinere processtruktur og tekniske practices.'),
        Q('User Stories & Planning Poker', 'Agilt scenarie (Scrum + XP)', 'Et team leverer ofte features men får mange regressionsfejl. Hvilken kombination er mest relevant?', 'Behold sprintstruktur og styrk XP-practices som tests og refactoring', 'Fjern sprintplanlægning og skriv længere user stories', 'Drop retrospektiver og fokusér kun på estimater', 'Undgå automatiske tests for at øge hastighed', 'Når regressionsfejl er et problem, kan Scrum alene være for lidt; tekniske practices fra XP kan styrke kvaliteten.'),
      ],
      avanceret: [
        // Modul 1: Agile Grundlag (5)
        Q('Agile Grundlag', 'Agilt manifest & principper', 'En kunde kræver fast dato men er usikker på detaljer. Hvilken tilgang er mest i tråd med agil tænkning?', 'Fastlæg rammer og prioriter løbende indhold, så de vigtigste funktioner leveres først', 'Udskyd al dialog til slutningen for at beskytte planen', 'Lås alle detaljer med det samme uden mulighed for feedback', 'Stop arbejdet indtil alle krav er perfekte', 'Agil tænkning kan godt arbejde med faste rammer, hvis scope og prioritering håndteres aktivt undervejs.'),
        Q('Agile Grundlag', 'Agilt manifest & principper', 'Hvad er den stærkeste konsekvens af at måle fremdrift primært på dokumentmængde frem for fungerende software?', 'Man kan få et falsk billede af fremdrift uden sikker viden om faktisk leveret værdi', 'Det gør teamet mere agilt automatisk', 'Det reducerer behovet for test og feedback', 'Det forbedrer estimater uden yderligere data', 'Agile principper fremhæver fungerende software som centralt mål, fordi det viser reel fremdrift og læring.'),
        Q('Agile Grundlag', 'Metodeoverblik', 'Et projekt har både stabil integration til myndighedssystemer og et eksperimentelt brugerflow. Hvad er mest fagligt stærkt?', 'At kombinere metodegreb, så stabile dele styres mere planlagt og usikre dele itereres hurtigere', 'At bruge én metode rigidt på alle dele uanset usikkerhed', 'At droppe planlægning helt fordi noget er usikkert', 'At vælge værktøj før man forstår forskellen i risici', 'Metodevalg bør afspejle forskelle i risiko og usikkerhed mellem projektets dele.'),
        Q('Agile Grundlag', 'Mål og evaluering', 'Hvordan kan læringsmål bruges til at undgå spild i en faglig opgave?', 'Ved at fravælge dybder der ikke understøtter de kompetencer der skal demonstreres', 'Ved at skrive mest muligt uanset relevans', 'Ved kun at fokusere på layout og formalia', 'Ved at undgå at koble metodevalg til begrundelser', 'Læringsmål hjælper med at prioritere indsats, så opgaven fokuserer på det der faktisk vurderes fagligt.'),
        Q('Agile Grundlag', 'Mål og evaluering', 'Hvad er et tegn på god sammenhæng mellem læringsmål og evaluering?', 'At kriterierne gør det tydeligt hvordan forståelse og anvendelse af metoder bedømmes', 'At evalueringen kun handler om antal sider', 'At kriterierne er skjulte til sidste øjeblik', 'At alle metoder vurderes ens uden kontekst', 'God sammenhæng gør det muligt at planlægge arbejdet efter det der skal vises og vurderes.'),

        // Modul 2: Scrum Framework (5)
        Q('Scrum Framework', 'Scrum-roller', 'Hvad er den største risiko, hvis Product Owner sjældent er tilgængelig for afklaringer?', 'Teamet arbejder lettere på forkerte antagelser og mister retning i prioriteringen', 'Sprintets tekniske kvalitet stiger automatisk', 'Scrum Master kan uden videre overtage produktansvaret permanent', 'Det påvirker kun retrospektiven og ikke backloggen', 'Manglende Product Owner-tilgængelighed øger risikoen for misforståelser om værdi og prioritering.'),
        Q('Scrum Framework', 'Scrum-roller', 'Hvornår svækkes Scrum Masters rolle typisk?', 'Når rollen bliver ren opgavefordeler i stedet for facilitator for proces og forbedring', 'Når Scrum Master hjælper med at fjerne impediments', 'Når teamet arbejder med retrospektiver', 'Når teamet bruger Daily Scrum til koordinering', 'Scrum Master skaber værdi ved at støtte processen, ikke ved at fungere som traditionel task-manager.'),
        Q('Scrum Framework', 'Scrum-ceremonier', 'Et Sprint Review bliver til et langt statusmøde uden feedback på produktet. Hvad bør forbedres først?', 'Flyt fokus til demonstreret funktionalitet og dialog om værdi og næste prioriteringer', 'Fjern alle interessenter for at spare tid', 'Erstat review med ekstra Daily Scrum', 'Brug mødet kun til at gennemgå timer og opgaver', 'Sprint Review skal primært bruges til at se resultatet og få feedback, ikke kun rapportere aktivitet.'),
        Q('Scrum Framework', 'Scrum-værktøjer / artefakter', 'Et sprint fejler ofte fordi teamet tager for meget ind. Hvilket artefakt-arbejde bør styrkes mest?', 'Sprint Backlog-planlægning og afgrænsning ud fra kapacitet og mål', 'Kun Product Backlog-formatet uden ændring af sprintvalg', 'Burndown-farver og graf-design', 'Kun flere Daily Scrums', 'Problemet peger ofte på dårlig afgrænsning af sprintarbejdet snarere end manglende aktivitet.'),
        Q('Scrum Framework', 'Scrum-værktøjer / artefakter', 'Hvordan kan et Burn Down Chart bruges bedst ved afvigelser midt i sprintet?', 'Som signal til at undersøge scope, blokeringer og plan frem for at gætte på årsager', 'Som bevis for at teamet arbejder forkert uden dialog', 'Som erstatning for backlog og standups', 'Som værktøj til at fjerne acceptkriterier', 'Burndown bør bruges som et visuelt signal, der åbner for opfølgning og justering.'),

        // Modul 3: Extreme Programming & TDD (4)
        Q('Extreme Programming & TDD', 'Extreme Programming (XP)', 'Et team leverer ofte hurtigt men får mange fejl efter ændringer. Hvilken XP-retning er mest relevant?', 'Styrk feedback- og kvalitetspractices som tests, refactoring og små sikre ændringer', 'Øg batch-størrelsen så der deployes sjældnere', 'Fjern code reviews og pararbejde for fart', 'Undgå at ændre design for at spare tid', 'XP fokuserer på praksisser, der reducerer fejl ved at forbedre feedback og kodekvalitet løbende.'),
        Q('Extreme Programming & TDD', 'Extreme Programming (XP)', 'Hvad er den vigtigste tradeoff ved XP-practices set positivt?', 'De kræver disciplin nu, men reducerer ofte fejl og omarbejde senere', 'De fjerner behovet for prioritering i teamet', 'De virker kun i meget store organisationer', 'De kan erstatte al dialog med interessenter', 'XP-practices koster tid i hverdagen, men kan betale sig gennem bedre kvalitet og hurtigere læring.'),
        Q('Extreme Programming & TDD', 'Pair Programming & TTD', 'Hvornår giver målrettet pair programming ofte mest værdi?', 'Ved komplekse opgaver eller risikofyldte ændringer hvor fælles forståelse er vigtig', 'Kun ved rutineopgaver uden usikkerhed', 'Kun når en udvikler mangler tastatur', 'Aldrig, hvis teamet bruger Scrum', 'Pair programming kan bruges strategisk dér hvor kvalitet, læring eller risiko gør samarbejdet særligt værdifuldt.'),
        Q('Extreme Programming & TDD', 'Pair Programming & TTD', 'Et team vil indføre TDD men har eksisterende kode uden tests. Hvad er en stærk start?', 'Start i afgrænsede områder og byg testbarhed gradvist omkring ændringer', 'Skriv alle nye features uden tests indtil systemet er stabilt', 'Omskriv hele systemet på én gang før første test', 'Vent med tests til efter næste release', 'TDD indføres ofte bedst gradvist, hvor man arbejder i små sikre skridt og forbedrer testbarheden løbende.'),

        // Modul 4: User Stories & Planning Poker (6)
        Q('User Stories & Planning Poker', 'User Stories', 'Hvad er den største risiko ved en user story, der kun beskriver en teknisk løsning og ingen bruger-værdi?', 'Teamet kan implementere noget korrekt teknisk men med uklar forretningsværdi', 'Estimering bliver altid mere præcis', 'Storyen bliver automatisk mindre', 'Definition of Done bliver overflødig', 'User stories virker bedst når bruger, behov og værdi er tydelige nok til at styre prioritering.'),
        Q('User Stories & Planning Poker', 'User Stories', 'Hvad er et godt næste skridt, hvis en story virker for stor og uklar til sprintplanlægning?', 'Split storyen i mindre værdiskabende dele med tydelige acceptkriterier', 'Øg sprintets længde uden at ændre storyen', 'Flyt storyen direkte til Done for at undgå forsinkelse', 'Fjern alle acceptkriterier for at gøre den enklere', 'Store eller uklare stories bør opdeles, så de bliver mere estimerbare og gennemførlige.'),
        Q('User Stories & Planning Poker', 'Planning Poker', 'Hvordan skaber Planning Poker bedst værdi i et erfarent team?', 'Ved at synliggøre antagelser og usikkerhed før arbejdet starter', 'Ved at erstatte backlog-prioritering helt', 'Ved at låse estimater permanent uden ny viden', 'Ved at gøre diskussion unødvendig', 'Planning Poker giver værdi gennem fælles forståelse, ikke kun gennem et tal.'),
        Q('User Stories & Planning Poker', 'Planning Poker', 'Hvad bør teamet typisk gøre, når estimaterne spreder sig meget i Planning Poker?', 'Undersøge forskelle i forståelse og afklare afhængigheder før nyt estimat', 'Vælge gennemsnittet uden diskussion', 'Lade Scrum Master bestemme estimatet alene', 'Slette storyen fra backloggen', 'Stor spredning peger ofte på uklarhed, som bør afklares før estimeringen bruges til planlægning.'),
        Q('User Stories & Planning Poker', 'Agilt scenarie (Scrum + XP)', 'Et team har god planrytme men ustabil kodekvalitet. Hvad er den bedste kombinationstilpasning?', 'Behold Scrum-rammen og styrk XP-practices som TDD, pair programming og refactoring', 'Fjern Scrum-ceremonier og behold kun estimater', 'Udskyd test til slutningen af kvartalet', 'Skift alle stories til tekniske tasks uden brugerfokus', 'Scrum kan give struktur, men teknisk kvalitet kræver også konkrete udviklingspractices som dem XP bidrager med.'),
        Q('User Stories & Planning Poker', 'Agilt scenarie (Scrum + XP)', 'Hvilken kombination viser bedst sammenhæng mellem planlægning og teknisk udførelse i et agilt scenarie?', 'User stories prioriteres i backloggen, estimeres i teamet og implementeres med tests og løbende forbedringer', 'Produktet planlægges uden backlog og bygges uden feedback', 'Estimering bruges som erstatning for acceptkriterier', 'Scrum bruges kun til statusrapportering og XP ignoreres', 'Et stærkt agilt scenarie kobler prioritering, estimering og tekniske practices i én sammenhængende arbejdsgang.'),
      ],
    },
    'softwaretest-sikkerhed': {
      nem: [
        // Modul 1: Motivation, Begreber & Unit Testing (5)
        Q('Motivation, Begreber & Unit Testing', 'Motivation for test', 'Hvorfor tester man software?', 'For at finde fejl og reducere risiko før de rammer brugere og drift', 'For at gøre kravspecifikation overflødig', 'For at undgå behov for kodegennemgang', 'For kun at dokumentere arbejdstimer', 'Test bruges til at opdage fejl og reducere konsekvenserne af dem, før systemet bruges i praksis.'),
        Q('Motivation, Begreber & Unit Testing', 'Motivation for test', 'Hvad betyder en risikobaseret teststrategi?', 'At testindsatsen prioriteres efter sandsynlighed og konsekvens af fejl', 'At man altid tester alle dele lige meget', 'At man kun tester det der er lettest', 'At test kun udføres efter release', 'Risikobaseret test hjælper med at bruge tid dér hvor fejl vil gøre størst skade.'),
        Q('Motivation, Begreber & Unit Testing', 'Begreber, aktiviteter og testniveauer', 'Hvad betyder det at sammenligne actual og expected results i test?', 'At kontrollere om systemets faktiske output matcher det forventede', 'At måle hvor hurtigt udvikleren skrev koden', 'At sammenligne to versioner af dokumentation', 'At rangere backlog-items efter værdi', 'En test vurderer om den observerede opførsel svarer til det man forventer.'),
        Q('Motivation, Begreber & Unit Testing', 'Begreber, aktiviteter og testniveauer', 'Hvad er formålet med en regressionstest?', 'At genkøre relevante tests efter ændringer for at finde utilsigtede fejl', 'At teste kun nye features og ignorere gammel funktionalitet', 'At måle netværkslatens i drift', 'At skrive kravspecifikation', 'Regressionstest bruges til at kontrollere at ændringer ikke har ødelagt noget der virkede før.'),
        Q('Motivation, Begreber & Unit Testing', 'Unit test framework', 'Hvad er en assertion i en unit test?', 'Et udsagn der kontrollerer om et forventet resultat er opfyldt', 'En type databaseindeks', 'Et værktøj til GUI-optagelse', 'En metode til sprintestimering', 'Assertions er centrale i unit tests, fordi de afgør om testens forventning er opfyldt.'),

        // Modul 2: GUI & System Test (5)
        Q('GUI & System Test', 'System / GUI test', 'Hvad tester man typisk med system- eller GUI-test?', 'Om hele løsningen fungerer korrekt set udefra gennem brugerflows og integrationer', 'Kun interne helper-metoder uden UI', 'Kun database-tabellers navne', 'Kun kravprioritering i backloggen', 'System- og GUI-test ser ofte på den samlede opførsel af systemet som brugeren oplever det.'),
        Q('GUI & System Test', 'System / GUI test', 'Hvad betyder det, at en test er black-box?', 'At man vurderer input og output uden at skulle kende den interne kode', 'At testen altid kører om natten', 'At testen kun kan bruges på sikkerhed', 'At testen ikke må have forventede resultater', 'Black-box test fokuserer på observerbar adfærd i stedet for intern implementering.'),
        Q('GUI & System Test', 'Capture/Playback og udfordringer', 'Hvad gør et capture/playback-værktøj typisk?', 'Optager brugerhandlinger og forsøger senere at afspille dem automatisk', 'Genererer kravspecifikation fra kode', 'Måler kun CPU-forbrug', 'Erstatter alle unit tests', 'Capture/playback automatiserer GUI-handlinger ved at optage og afspille brugerinteraktioner.'),
        Q('GUI & System Test', 'Capture/Playback og udfordringer', 'Hvad er en almindelig udfordring ved capture/playback-tests?', 'De kan være følsomme over for ændringer i UI og timing', 'De kan ikke teste klik', 'De virker kun på API’er', 'De kræver ingen vedligeholdelse', 'Optagede GUI-tests kan blive skrøbelige, hvis UI eller timing ændrer sig.'),
        Q('GUI & System Test', 'Playwright', 'Hvad bruges Playwright primært til?', 'Automatisering af browserbaserede tests og brugerflows', 'Planlægning af sprint og backlog', 'Tegning af UML-diagrammer', 'Måling af code coverage uden tests', 'Playwright er et værktøj til browserautomatisering og test af webgrænseflader.'),

        // Modul 3: Integrationstest & Andre Testformer (5)
        Q('Integrationstest & Andre Testformer', 'Andre testformer', 'Hvad undersøger performance test primært?', 'Hvordan systemet opfører sig under belastning', 'Om brugergrænsefladen er intuitiv', 'Om rollen Product Owner prioriterer korrekt', 'Om en class har private felter', 'Performance test fokuserer på hastighed, kapacitet og stabilitet under belastning.'),
        Q('Integrationstest & Andre Testformer', 'Andre testformer', 'Hvad undersøger usability test primært?', 'Hvordan brugere oplever og kan anvende løsningen', 'Kun serverens svartid i millisekunder', 'Om alle unit tests bruger mocks', 'Om databasen er normaliseret', 'Usability test handler om brugeroplevelse og hvor let systemet er at forstå og bruge.'),
        Q('Integrationstest & Andre Testformer', 'Integration og API-test', 'Hvad er hovedformålet med integrationstest?', 'At kontrollere at moduler og services arbejder korrekt sammen', 'At teste en enkelt metode isoleret', 'At estimere sprintbacklog', 'At skrive user stories', 'Integrationstest fokuserer på samspillet mellem systemdele og dataflow mellem dem.'),
        Q('Integrationstest & Andre Testformer', 'Integration og API-test', 'Hvad fokuserer API-test typisk på?', 'Endpoints, data og kontrakter mellem systemdele', 'Farvevalg i brugergrænsefladen', 'Tastaturgenveje i IDE', 'Planlægning af retrospektiv', 'API-test undersøger om systemets grænseflader opfører sig korrekt og leverer forventede data.'),
        Q('Integrationstest & Andre Testformer', 'Moq og Dependency Injection', 'Hvorfor bruges mocks og dependency injection ofte i unit tests?', 'For at isolere den kode man tester fra eksterne afhængigheder', 'For at gøre GUI-tests langsommere', 'For at undgå assertions', 'For at erstatte accepttest', 'Mocks og dependency injection gør det lettere at teste logik uden at være afhængig af fx database eller netværk.'),

        // Modul 4: Coverage, CI & Opsamling (5)
        Q('Coverage, CI & Opsamling', 'Coverage og Continuous Integration', 'Hvad beskriver code coverage?', 'Hvor stor del af koden der udføres af test', 'Hvor mange brugere der har logget ind', 'Hvor lang tid et sprint varer', 'Hvor mange diagrammer der findes i dokumentationen', 'Coverage viser testomfang i koden, men siger ikke alene noget om testkvaliteten.'),
        Q('Coverage, CI & Opsamling', 'Coverage og Continuous Integration', 'Hvad er hovedformålet med Continuous Integration (CI)?', 'At bygge og teste ændringer automatisk, så fejl opdages tidligt', 'At erstatte alle manuelle tests permanent', 'At planlægge backlog-items', 'At generere UML-diagrammer', 'CI hjælper med at opdage problemer hurtigt ved løbende build og test af ændringer.'),
        Q('Coverage, CI & Opsamling', 'Coverage og Continuous Integration', 'Hvad er korrekt om coverage?', 'Høj coverage er nyttigt, men er ikke bevis for at al vigtig adfærd er testet godt', 'Høj coverage betyder automatisk fejlfrie systemer', 'Coverage gør accepttest overflødig', 'Coverage måles kun i GUI-tests', 'Coverage er et nyttigt signal, men skal vurderes sammen med testindhold og risici.'),
        Q('Coverage, CI & Opsamling', 'Test af fysiske systemer', 'Hvorfor kan test være sværere når software er koblet til fysiske enheder?', 'Fordi adgang til rigtigt udstyr og testmiljø kan være begrænset', 'Fordi unit tests ikke kan skrives i sådanne systemer', 'Fordi krav ikke behøver dokumenteres', 'Fordi GUI-tests altid er nok', 'Hardwareafhængigheder gør testmiljø og tilgængeligt udstyr til en vigtig del af teststrategien.'),
        Q('Coverage, CI & Opsamling', 'Test af fysiske systemer', 'Hvad bruges simulatorer eller emulatorer typisk til i test?', 'At efterligne hardware eller miljø så tests kan køres mere kontrolleret', 'At erstatte alle acceptkriterier', 'At prioritere backloggen', 'At skrive automatiske user stories', 'Simulatorer og emulatorer hjælper med test, når fysisk hardware er dyrt, utilgængeligt eller risikabelt at bruge direkte.'),
      ],
      oevet: [
        // Modul 1: Motivation, Begreber & Unit Testing (5)
        Q('Motivation, Begreber & Unit Testing', 'Motivation for test', 'Et team har begrænset tid til test. Hvilken prioritering er mest fagligt stærk?', 'At starte med de dele hvor fejl har størst konsekvens eller sandsynlighed', 'At teste tilfældige funktioner for at være neutral', 'At kun teste det der er lettest at automatisere', 'At udskyde test til efter release', 'Risikobaseret prioritering giver mest effekt, når testressourcerne er begrænsede.'),
        Q('Motivation, Begreber & Unit Testing', 'Begreber, aktiviteter og testniveauer', 'Hvilket testniveau er mest direkte knyttet til at vurdere om kunden kan acceptere løsningen?', 'Acceptance test', 'Unit test', 'Linting', 'Refactoring', 'Acceptance test vurderer om leverancen opfylder de aftalte behov og kan accepteres.'),
        Q('Motivation, Begreber & Unit Testing', 'Begreber, aktiviteter og testniveauer', 'Hvad er den vigtigste pointe ved at “total test” ikke er realistisk i praksis?', 'At man må prioritere tests og reducere risiko frem for at forsøge at bevise fejlfrihed', 'At test derfor ikke har værdi', 'At kun manuelle tests bør bruges', 'At regressionstest kan udelades', 'Når total test er urealistisk, bliver valg og prioritering af test vigtigere.'),
        Q('Motivation, Begreber & Unit Testing', 'Unit test framework', 'Hvilken egenskab gør unit tests særligt nyttige i en CI-pipeline?', 'At de kan køres hurtigt og gentageligt ved hver ændring', 'At de kræver manuel vurdering for hvert resultat', 'At de kun kan bruges sent i projektet', 'At de erstatter systemtest fuldstændigt', 'Hurtige og stabile unit tests giver tidlig feedback ved ændringer i koden.'),
        Q('Motivation, Begreber & Unit Testing', 'Unit test framework', 'Hvad er et tegn på en svag unit test?', 'Den er afhængig af eksterne systemer og giver ustabile resultater', 'Den har tydelige assertions', 'Den tester en afgrænset del af logikken', 'Den kan køres automatisk mange gange', 'Unit tests bør være stabile og isolerede; eksterne afhængigheder gør dem ofte langsomme og skrøbelige.'),

        // Modul 2: GUI & System Test (5)
        Q('GUI & System Test', 'System / GUI test', 'Hvornår giver system-/GUI-test mest værdi sammen med unit tests?', 'Når man vil verificere hele brugerflows og samspil mellem komponenter', 'Når man kun vil teste en enkelt metode i isolation', 'Når man ikke har nogen krav', 'Når man kun måler code coverage', 'System- og GUI-tests supplerer unit tests ved at dække helhedsadfærd og integrationer.'),
        Q('GUI & System Test', 'Capture/Playback og udfordringer', 'Hvornår kan capture/playback være en rimelig start?', 'Når man hurtigt vil automatisere simple flows og accepterer vedligeholdelsesbehovet', 'Når man vil teste komplekse API-kontrakter uden UI', 'Når man vil undgå al vedligeholdelse af tests', 'Når løsningen ikke har brugergrænseflade', 'Capture/playback kan give hurtig startværdi, men man skal være bevidst om robusthed og vedligeholdelse.'),
        Q('GUI & System Test', 'Capture/Playback og udfordringer', 'Hvad er en god reaktion på skrøbelige capture/playback-tests?', 'At forbedre testdesign og reducere afhængighed af ustabile UI-detaljer', 'At droppe al automatiseret test', 'At fjerne assertions fra testene', 'At ignorere flaky fejl som normale', 'Problemet løses typisk ved bedre testdesign og mere robuste locatorer frem for at opgive testformen helt.'),
        Q('GUI & System Test', 'Playwright', 'Hvornår er Playwright et stærkt valg?', 'Når man vil automatisere browserflows og verificere webadfærd på tværs af sider', 'Når man kun vil skrive unit tests for forretningslogik', 'Når man vil erstatte CI med manuel test', 'Når man vil modellere databaserelationer', 'Playwright er målrettet browserautomatisering og egner sig til webflows og UI-verifikation.'),
        Q('GUI & System Test', 'Playwright', 'Hvad er en praktisk fordel ved traces/skærmbilleder i Playwright-fejlfinding?', 'De gør det lettere at forstå hvor og hvorfor en test fejlede', 'De øger code coverage automatisk', 'De erstatter assertions', 'De gør API-tests unødvendige', 'Fejlspor og screenshots hjælper med at diagnosticere testfejl og ustabile flows mere effektivt.'),

        // Modul 3: Integrationstest & Andre Testformer (5)
        Q('Integrationstest & Andre Testformer', 'Andre testformer', 'Hvilken testtype er mest relevant, hvis risikoen er datalæk eller uautoriseret adgang?', 'Security test', 'Usability test', 'Snapshot test', 'Planning Poker', 'Når risikoen handler om misbrug eller sårbarheder, er security test den mest direkte testtype.'),
        Q('Integrationstest & Andre Testformer', 'Integration og API-test', 'Hvad gør API-test særligt nyttig tidligt i integrationstest?', 'Den kan verificere kontrakter og dataudveksling uden at være afhængig af hele UI-laget', 'Den kan erstatte alle krav til sporbarhed', 'Den bruges kun efter systemtest er færdig', 'Den virker kun sammen med capture/playback', 'API-test kan give tidlig sikkerhed for integrationer, før hele brugergrænsefladen er klar.'),
        Q('Integrationstest & Andre Testformer', 'Integration og API-test', 'Hvornår er integrationstest især vigtig, selvom unit tests er grønne?', 'Når fejl kan opstå i samspillet mellem moduler, services eller datakilder', 'Når systemet kun har én funktion', 'Når koden har høj coverage', 'Når teamet bruger Scrum', 'Unit tests dækker dele isoleret, men integrationstest dækker fejl i samspillet mellem delene.'),
        Q('Integrationstest & Andre Testformer', 'Moq og Dependency Injection', 'Hvad er en typisk fordel ved dependency injection for testbarhed?', 'At afhængigheder kan udskiftes med testdobler uden at ændre forretningslogikken', 'At GUI-tests bliver hurtigere automatisk', 'At man ikke længere behøver interfaces', 'At accepttest kan droppes', 'Dependency injection gør det lettere at styre afhængigheder og teste logik isoleret.'),
        Q('Integrationstest & Andre Testformer', 'Moq og Dependency Injection', 'Hvornår giver det mening at bruge mocks i en unit test?', 'Når eksterne samarbejdspartnere skal simuleres for at teste en afgrænset adfærd', 'Når man vil teste hele systemet inkl. rigtige databaser', 'Når målet er performance under høj belastning', 'Når man vil validere UX med rigtige brugere', 'Mocks er nyttige når man vil isolere testobjektet og kontrollere dets omgivelser.'),

        // Modul 4: Coverage, CI & Opsamling (5)
        Q('Coverage, CI & Opsamling', 'Coverage og Continuous Integration', 'Hvad er en god brug af coverage-tal i et team?', 'Som et signal til at finde blinde vinkler, ikke som eneste kvalitetsmål', 'Som bevis for at systemet er fejlfrit', 'Som erstatning for review og teststrategi', 'Som mål for hvor mange features der er leveret', 'Coverage er mest nyttigt som indikator, der skal tolkes sammen med risiko og testindhold.'),
        Q('Coverage, CI & Opsamling', 'Coverage og Continuous Integration', 'Hvad er den største gevinst ved CI ved hyppige commits?', 'Fejl opdages tættere på ændringen, så de er lettere at finde og rette', 'Teamet behøver ikke længere tests', 'Planlægning af sprint bliver overflødig', 'Krav bliver automatisk entydige', 'CI giver hurtig feedback på build og tests, hvilket reducerer tiden fra fejl til opdagelse.'),
        Q('Coverage, CI & Opsamling', 'Test af fysiske systemer', 'Hvornår er simulator/emulator særligt nyttig i test af fysiske systemer?', 'Når rigtig hardware er dyr, utilgængelig eller risikabel at teste direkte på', 'Når man vil bevise endelig hardware-performance alene', 'Når man vil erstatte alle former for integrationstest', 'Når man kun tester UI-farver', 'Simulatorer og emulatorer kan gøre test mere tilgængelig og gentagelig, især tidligt eller ved begrænset hardware.'),
        Q('Coverage, CI & Opsamling', 'Test af fysiske systemer', 'Hvad er en vigtig begrænsning ved simulatorer i forhold til rigtig hardware?', 'De kan afvige fra virkeligt udstyr og bør suppleres med test på realistisk miljø', 'De kan ikke bruges i automatisering', 'De gør dokumentation umulig', 'De virker kun til sikkerhedstest', 'Simulatorer er nyttige, men de repræsenterer ikke altid alle timing- og hardwareforhold perfekt.'),
        Q('Coverage, CI & Opsamling', 'Test af fysiske systemer', 'Hvad er en stærk teststrategi for software med hardwareafhængigheder?', 'Kombinér simulatorbaserede tests med målrettede tests på rigtigt udstyr', 'Test kun på simulator og spring hardware over permanent', 'Test kun manuelt på hardware og undgå automatisering', 'Brug kun unit tests uden integration', 'En kombination giver både høj testhastighed og bedre realisme i kritiske dele af løsningen.'),
      ],
      avanceret: [
        // Modul 1: Motivation, Begreber & Unit Testing (5)
        Q('Motivation, Begreber & Unit Testing', 'Motivation for test', 'Et team skal vælge mellem ekstra test af login eller rapport-export. Hvad er det bedste udgangspunkt for beslutningen?', 'Vurdér sandsynlighed og konsekvens af fejl i de to områder før testindsatsen prioriteres', 'Vælg altid den funktion der er hurtigst at teste', 'Test kun den nyeste kode uanset konsekvens', 'Fordel tiden ligeligt uden analyse', 'Risikobaseret test kræver en konkret vurdering af både sandsynlighed og konsekvens, ikke kun arbejdsmængde.'),
        Q('Motivation, Begreber & Unit Testing', 'Motivation for test', 'Hvad er den vigtigste faglige konsekvens af udsagnet “test kan vise fejl, men ikke bevise fravær af fejl”?', 'At testresultater skal tolkes som risikoreduktion, ikke som garanti for fejlfrihed', 'At test derfor er unødvendig i praksis', 'At kun manuelle tests giver mening', 'At coverage automatisk løser problemet', 'Test forbedrer tillid og reducerer risiko, men kan ikke bevise at der ikke findes skjulte fejl.'),
        Q('Motivation, Begreber & Unit Testing', 'Begreber, aktiviteter og testniveauer', 'Et team laver en rettelse i et kritisk område. Hvilken kombination er mest relevant efter ændringen?', 'Regressionstest af berørte områder samt relevante niveauer afhængigt af ændringens scope', 'Kun nye unit tests og ingen genkørsel af gamle tests', 'Kun UI-test fordi brugeren ser resultatet', 'Ingen tests hvis koden compiles', 'Efter ændringer i kritiske områder bør man kombinere passende testniveauer med regressionstest for at fange utilsigtede effekter.'),
        Q('Motivation, Begreber & Unit Testing', 'Unit test framework', 'Hvad er den største risiko ved unit tests der afhænger af tid, netværk eller delt miljøtilstand?', 'Tests bliver ustabile og mister værdi som hurtig feedback i CI', 'Coverage bliver automatisk højere', 'Assertions bliver mere præcise', 'Systemtests bliver overflødige', 'Unit tests skal være stabile og gentagelige; skjulte afhængigheder skaber flakiness og svag feedback.'),
        Q('Motivation, Begreber & Unit Testing', 'Unit test framework', 'Et team har mange unit tests men refactoring er stadig svært. Hvad mangler ofte?', 'Tests der fokuserer på adfærd frem for interne implementeringsdetaljer', 'Flere tests der låser private metodenavne', 'Færre assertions per test uden begrundelse', 'Kun højere coverage-krav', 'Tests der er tæt koblet til implementeringsdetaljer gør ændringer svære selv om antallet af tests er højt.'),

        // Modul 2: GUI & System Test (5)
        Q('GUI & System Test', 'System / GUI test', 'Hvad er en stærk strategi, når end-to-end GUI-tests er værdifulde men langsomme og skrøbelige?', 'Behold få kritiske GUI-flows og suppler med hurtigere tests på lavere niveauer', 'Flyt alle tests til GUI-niveau for konsistens', 'Fjern alle GUI-tests og stol kun på review', 'Brug kun capture/playback uden assertions', 'En lagdelt strategi giver ofte bedre balance mellem dækning, hastighed og stabilitet.'),
        Q('GUI & System Test', 'System / GUI test', 'Hvornår er black-box systemtest særligt vigtig selv i et team med stærke unit tests?', 'Når man vil validere den samlede brugeroplevelse og integration på tværs af komponenter', 'Når man kun vil teste private hjælpefunktioner', 'Når man mangler backlog-items', 'Når man vil erstatte acceptkriterier med kodecoverage', 'Helhedsadfærd og integration kan fejle selv om de enkelte enheder ser korrekte ud isoleret.'),
        Q('GUI & System Test', 'Capture/Playback og udfordringer', 'Hvornår bør et team typisk overveje at erstatte mange capture/playback-tests med mere vedligeholdbar automation?', 'Når små UI-ændringer giver hyppige falske fejl og høj vedligeholdelsesomkostning', 'Når tests aldrig fejler og er stabile', 'Når systemet ikke har brugergrænseflade', 'Når teamet ønsker færre assertions', 'Hyppig skrøbelighed er et tegn på at testdesignet eller værktøjsvalget bør forbedres.'),
        Q('GUI & System Test', 'Playwright', 'Hvad forbedrer typisk robustheden af Playwright-tests mest?', 'Stabile locatorer og tydelig synkronisering frem for timing-gæt', 'Flere tilfældige sleeps i alle tests', 'Færre assertions for at undgå fejl', 'At genoptage samme testflow manuelt ved hver kørsel', 'Robuste locatorer og kontrolleret ventelogik reducerer flaky tests markant.'),
        Q('GUI & System Test', 'Playwright', 'Et Playwright-flow fejler sporadisk i CI men ikke lokalt. Hvad er den bedste første undersøgelse?', 'Brug trace/logs og screenshots til at identificere præcist hvor flowet bryder', 'Hæv coverage-kravet og prøv igen', 'Fjern alle waits og assertions', 'Skift til unit tests for hele UI-behovet', 'Fejlsporing i Playwright giver konkret indsigt i timing, locatorer og UI-tilstand under fejlen.'),

        // Modul 3: Integrationstest & Andre Testformer (5)
        Q('Integrationstest & Andre Testformer', 'Andre testformer', 'Et system skal lanceres til mange samtidige brugere. Hvilken testprioritering er mest relevant før release?', 'Performance test kombineret med relevante funktionelle checks på kritiske flows', 'Kun usability test, fordi funktioner allerede findes', 'Kun code coverage-analyse', 'Kun pair programming-review', 'Ved høj belastningsrisiko bør performance testes målrettet, men stadig sammen med centrale funktionelle verifikationer.'),
        Q('Integrationstest & Andre Testformer', 'Andre testformer', 'Hvilken afvejning er mest fagligt stærk, når tid er knap og risici findes i både sikkerhed og brugervenlighed?', 'Prioritér de testformer der matcher de største forretnings- og risikokonsekvenser først', 'Vælg altid den testtype der er lettest at forklare', 'Test kun performance, da det er målbart', 'Undgå specialiserede testformer og håb på unit tests', 'Forskellige testformer dækker forskellige risici; prioriteringen bør ske efter konsekvens og sandsynlighed.'),
        Q('Integrationstest & Andre Testformer', 'Integration og API-test', 'To services ændrer dataformat uafhængigt af hinanden. Hvad er den stærkeste testmæssige reaktion?', 'Styrk API- og integrationstest omkring kontrakter og dataudveksling mellem services', 'Fokuser kun på GUI-test for at se fejlene senere', 'Drop mocks og DI i unit tests som hovedløsning', 'Test kun hver service isoleret uden kontraktkontrol', 'Når integrationer ændres, er kontrakt- og integrationstest afgørende for at opdage brud mellem systemdele.'),
        Q('Integrationstest & Andre Testformer', 'Moq og Dependency Injection', 'Hvad er en typisk risiko ved at mocke for mange ting i unit tests?', 'At tests bliver blinde for fejl i reelle integrationer og samarbejde mellem komponenter', 'At code coverage altid falder til nul', 'At assertions ikke længere kan bruges', 'At GUI-test bliver mere stabile', 'Mocks er nyttige til isolation, men overdreven mocking kan skjule problemer som kun ses i integration.'),
        Q('Integrationstest & Andre Testformer', 'Moq og Dependency Injection', 'Hvordan bruges dependency injection bedst i forhold til teststrategi?', 'Til at gøre afhængigheder udskiftelige, så unit tests kan isolere logik og integrationstest kan bruge rigtige komponenter', 'Til kun at støtte GUI-automation', 'Til at fjerne behovet for interfaces', 'Til at erstatte CI', 'Dependency injection understøtter flere testniveauer ved at gøre afhængigheder bevidst styrbare.'),

        // Modul 4: Coverage, CI & Opsamling (5)
        Q('Coverage, CI & Opsamling', 'Coverage og Continuous Integration', 'Hvad er den største risiko ved at bruge et hårdt coverage-tal som eneste kvalitetsmål?', 'Teamet kan optimere mod tallet i stedet for at teste de vigtigste risici og scenarier', 'CI holder op med at køre', 'Unit tests bliver automatisk langsommere', 'Integrationstest kan ikke længere skrives', 'Coverage kan misbruges, hvis fokus flyttes fra meningsfuld test til blot at ramme en procent.'),
        Q('Coverage, CI & Opsamling', 'Coverage og Continuous Integration', 'Hvordan giver CI mest værdi i et voksende projekt?', 'Når build og relevante tests kører konsekvent på ændringer og fejl håndteres hurtigt', 'Når CI kun køres før release for at spare ressourcer', 'Når fejl i pipeline ignoreres indtil sprintslut', 'Når CI bruges uden test', 'CI er stærkest som løbende feedbackmekanisme, ikke som lejlighedsvis kontrol.'),
        Q('Coverage, CI & Opsamling', 'Coverage og Continuous Integration', 'Et team har høj coverage men mange produktionsfejl. Hvad peger det mest på?', 'At testomfang og testkvalitet ikke er det samme, og at teststrategien skal forbedres', 'At coverage-målingen er for høj til at være realistisk', 'At CI bør fjernes', 'At unit tests altid bør erstattes af GUI-tests', 'Høj coverage kan eksistere samtidig med mangelfuld test af kritisk adfærd, grænsetilfælde eller integrationer.'),
        Q('Coverage, CI & Opsamling', 'Test af fysiske systemer', 'Hvad er en stærk måde at håndtere hardwareafhængige timingfejl på?', 'Kombinér kontrollerede simulator-tests med målrettede tests på realistisk hardwaremiljø', 'Undgå automatisering og test kun visuelt', 'Stol kun på unit tests uden miljøtest', 'Fjern timingkrav fra specifikationen', 'Timingproblemer i hardware-nære systemer kræver ofte både kontrolleret reproduktion og realistisk verifikation.'),
        Q('Coverage, CI & Opsamling', 'Test af fysiske systemer', 'Hvilken strategi giver bedst balance mellem testhastighed og realisme i hardwareprojekter?', 'Brug mange hurtige tests i simuleret miljø og få kritiske verificeringer på rigtigt udstyr', 'Kør alle tests kun på rigtigt udstyr fra start', 'Kør alle tests kun i simulator og antag identisk adfærd', 'Brug kun manuel accepttest ved slutningen', 'En kombineret strategi giver højere feedbackhastighed uden at opgive verifikation i realistiske omgivelser.'),
      ],
    },
  };

  function buildBankFromManualSource(source) {
    const bank = [];
    for (const subject of QUIZ_META.subjects) {
      const subjectKey = subject.key;
      const subjectLabel = subject.label;
      for (const difficulty of DIFFICULTY_ORDER) {
        const list = (((source || {})[subjectKey] || {})[difficulty] || []);
        list.forEach((item, index) => {
          const built = rotateOptions(item.correct, item.distractors, index + difficulty.length + subjectKey.length);
          bank.push({
            id: `${SUBJECT_SHORT[subjectKey]}-${difficulty}-${String(index + 1).padStart(3, '0')}`,
            fag: subjectKey,
            fagLabel: subjectLabel,
            module: normalizeSpaces(item.module),
            subtopic: normalizeSpaces(item.subtopic),
            difficulty,
            q: normalizeSpaces(item.q),
            options: built.options,
            answer: built.answer,
            explain: normalizeSpaces(item.explain),
            tags: Array.isArray(item.tags) && item.tags.length
              ? item.tags.map((t) => normalizeSpaces(t)).filter(Boolean).slice(0, 8)
              : autoTags(subjectKey, item.module, item.subtopic, item.q),
          });
        });
      }
    }
    return bank;
  }

  function validateTopicMapping(question) {
    const modules = TOPIC_LOOKUP.bySubject.get(question.fag);
    if (!modules) throw new Error(`Unknown subject in question ${question.id}: ${question.fag}`);
    const subtopics = modules.get(question.module);
    if (!subtopics) throw new Error(`Unknown module for ${question.id}: ${question.fag} / ${question.module}`);
    if (!subtopics.has(question.subtopic)) {
      throw new Error(`Unknown subtopic for ${question.id}: ${question.fag} / ${question.module} / ${question.subtopic}`);
    }
  }

  function validateCoverage(bank) {
    const actual = new Map();
    for (const q of bank) {
      const key = [q.fag, q.difficulty, q.module, q.subtopic].join('::');
      actual.set(key, (actual.get(key) || 0) + 1);
    }
    for (const [key, target] of COVERAGE_TARGETS.entries()) {
      const got = actual.get(key) || 0;
      if (got !== target) throw new Error(`Coverage mismatch for ${key}: expected ${target}, got ${got}`);
    }
    for (const key of actual.keys()) {
      if (!COVERAGE_TARGETS.has(key)) throw new Error(`Unexpected coverage key in bank: ${key}`);
    }
  }

  function authoringLint(bank) {
    const warnings = [];
    const qSeen = new Map();
    for (const q of bank) {
      if (q.q.length > 170) warnings.push(`[langt spørgsmål] ${q.id}: ${q.q.length} tegn`);
      if (q.explain.length > 240) warnings.push(`[lang forklaring] ${q.id}: ${q.explain.length} tegn`);
      if ((q.q.match(/"/g) || []).length >= 4) warnings.push(`[mange citationstegn] ${q.id}`);
      if (WARN_PATTERNS.some((rx) => rx.test(q.q))) warnings.push(`[mulig skabelonagtig formulering] ${q.id}: ${q.q}`);
      const qKey = normalizeSpaces(q.q).toLowerCase();
      if (!qSeen.has(qKey)) qSeen.set(qKey, []);
      qSeen.get(qKey).push(q.id);
    }
    for (const [qText, ids] of qSeen.entries()) {
      if (ids.length > 1) warnings.push(`[dublet spørgsmålstekst] ${ids.join(', ')} :: ${qText}`);
    }
    if (warnings.length && typeof console !== 'undefined' && console.warn) {
      console.warn(`[quiz-data] Authoring lint: ${warnings.length} advarsler`);
      warnings.slice(0, 25).forEach((w) => console.warn(w));
      if (warnings.length > 25) console.warn(`[quiz-data] ... ${warnings.length - 25} flere advarsler`);
    }
  }

  function validateBank(bank) {
    if (!Array.isArray(bank) || bank.length !== 180) {
      throw new Error(`QUIZ_BANK length expected 180, got ${Array.isArray(bank) ? bank.length : 'non-array'}`);
    }
    const ids = new Set();
    const diffCount = new Map();
    const subjectCount = new Map();
    const comboCount = new Map();

    for (const q of bank) {
      if (ids.has(q.id)) throw new Error(`Duplicate id: ${q.id}`);
      ids.add(q.id);
      validateTopicMapping(q);

      if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error(`Invalid options length for ${q.id}`);
      if (new Set(q.options).size !== 4) throw new Error(`Duplicate options in ${q.id}`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) throw new Error(`Invalid answer index for ${q.id}`);
      if (!Array.isArray(q.tags) || !q.tags.length) throw new Error(`Missing tags for ${q.id}`);

      for (const field of [q.q, q.explain]) {
        for (const rx of BANNED_TERMS) {
          if (rx.test(field)) throw new Error(`Banned term matched in ${q.id}: ${rx}`);
        }
      }
      for (const rx of STRUCTURE_QUIZ_PATTERNS) {
        if (rx.test(q.q)) throw new Error(`Structure-style quiz wording matched in ${q.id}: ${rx}`);
      }

      diffCount.set(q.difficulty, (diffCount.get(q.difficulty) || 0) + 1);
      subjectCount.set(q.fag, (subjectCount.get(q.fag) || 0) + 1);
      comboCount.set(`${q.fag}::${q.difficulty}`, (comboCount.get(`${q.fag}::${q.difficulty}`) || 0) + 1);
    }

    for (const diff of DIFFICULTY_ORDER) {
      if ((diffCount.get(diff) || 0) !== 60) throw new Error(`Difficulty ${diff} expected 60, got ${diffCount.get(diff) || 0}`);
    }
    for (const subject of QUIZ_META.subjects) {
      if ((subjectCount.get(subject.key) || 0) !== 60) {
        throw new Error(`Subject ${subject.key} expected 60, got ${subjectCount.get(subject.key) || 0}`);
      }
      for (const diff of DIFFICULTY_ORDER) {
        const key = `${subject.key}::${diff}`;
        if ((comboCount.get(key) || 0) !== 20) {
          throw new Error(`Combo ${key} expected 20, got ${comboCount.get(key) || 0}`);
        }
      }
    }

    validateCoverage(bank);
  }

  const QUIZ_BANK = buildBankFromManualSource(QUIZ_BANK_SOURCE);
  validateBank(QUIZ_BANK);
  authoringLint(QUIZ_BANK);

  root.QUIZ_META = QUIZ_META;
  root.QUIZ_BANK = QUIZ_BANK;
})();

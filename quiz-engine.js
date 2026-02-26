(() => {
  'use strict';

  const SUBJECT_CLASS = {
    'kravspecifikation': 'subject-kravspecifikation',
    'metodik': 'subject-metodik',
    'softwaretest-sikkerhed': 'subject-softwaretest-sikkerhed',
  };

  const DIFF_CLASS = {
    nem: 'diff-nem',
    oevet: 'diff-oevet',
    avanceret: 'diff-avanceret',
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shuffle(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function pickRandom(items, count) {
    if (items.length < count) {
      throw new Error(`Kan ikke vælge ${count} elementer fra liste på ${items.length}`);
    }
    return shuffle(items).slice(0, count);
  }

  function createMetaMaps() {
    if (!window.QUIZ_BANK || !Array.isArray(window.QUIZ_BANK)) {
      throw new Error('QUIZ_BANK er ikke indlæst. Sørg for at quiz-data.js indlæses før quiz-engine.js.');
    }
    if (!window.QUIZ_META || !Array.isArray(window.QUIZ_META.difficulties) || !Array.isArray(window.QUIZ_META.subjects)) {
      throw new Error('QUIZ_META er ikke indlæst korrekt fra quiz-data.js.');
    }

    const difficultyLabels = Object.fromEntries(window.QUIZ_META.difficulties.map((d) => [d.key, d.label]));
    const subjectLabels = Object.fromEntries(window.QUIZ_META.subjects.map((s) => [s.key, s.label]));
    const subjectOrder = window.QUIZ_META.subjects.map((s) => s.key);
    const difficultyOrder = window.QUIZ_META.difficulties.map((d) => d.key);

    return { difficultyLabels, subjectLabels, subjectOrder, difficultyOrder };
  }

  function buildFrameHtml(config, choiceOptions, metaItems, chipsHtml) {
    const titleHtml = config.titleHighlight
      ? `${esc(config.titlePrefix)}<br><span>${esc(config.titleHighlight)}</span>`
      : esc(config.title);

    return `
      <div class="quiz-shell ${config.kind === 'combined' ? 'is-combined' : 'is-subject'}">
        <a class="back" href="${esc(config.backHref)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
          ${esc(config.backText)}
        </a>

        <section id="start" class="screen">
          <span class="tag ${config.kind === 'combined' ? 'gradient' : ''}" id="start-tag">${esc(config.tag)}</span>
          <h1 class="screen-title">${titleHtml}</h1>
          <p class="lead">${esc(config.description)}</p>
          ${chipsHtml}
          <div class="meta">
            ${metaItems.map((item) => `<span>${esc(item)}</span>`).join('')}
          </div>
          <div class="choice-panel">
            <div class="choice-label">${esc(config.choiceLabel)}</div>
            <div class="choice-grid" id="choice-grid" role="group" aria-label="${esc(config.choiceLabel)}">
              ${choiceOptions.map((opt) => `<button type="button" class="choice-btn" data-choice="${esc(opt.key)}">${esc(opt.label)}</button>`).join('')}
            </div>
          </div>
          <div class="actions-row">
            <button type="button" class="btn-primary" id="start-btn">${esc(config.startButtonLabel)}</button>
          </div>
        </section>

        <section id="quiz" class="screen" hidden>
          <div class="quiz-panel">
            <div class="quiz-header">
              <span class="counter" id="counter"></span>
              <span class="score-live" id="score-live"></span>
            </div>
            <div class="progress-track"><div class="progress-fill" id="progress"></div></div>

            <div class="question-card">
              <div class="badge-row">
                <span class="badge subject" id="badge-subject" hidden></span>
                <span class="badge difficulty" id="badge-difficulty"></span>
              </div>
              <div class="question-topic" id="question-topic"></div>
              <div class="question-text" id="question"></div>
              <div class="options" id="options"></div>
              <div class="feedback" id="feedback" hidden></div>
              <button type="button" class="next-btn" id="next-btn" hidden></button>
            </div>
          </div>
        </section>

        <section id="results" class="screen" hidden>
          <span class="tag ${config.kind === 'combined' ? 'gradient' : ''}">Færdig</span>
          <div class="result-score" id="result-score"></div>
          <div class="result-label" id="result-label"></div>
          <div class="result-context" id="result-context"></div>
          <div class="result-msg" id="result-msg"></div>
          <div class="result-breakdowns" id="result-breakdowns"></div>
          <div class="result-actions">
            <button type="button" class="btn-primary" id="retry-btn">${esc(config.retryLabel)}</button>
            <button type="button" class="btn-secondary" id="change-choice-btn">${esc(config.changeChoiceLabel)}</button>
            <a class="btn-ghost" id="home-link" href="${esc(config.homeHref)}">${esc(config.homeLabel)}</a>
          </div>
        </section>
      </div>
    `;
  }

  function showScreen(app, screenId) {
    ['start', 'quiz', 'results'].forEach((id) => {
      app.el[id].hidden = id !== screenId;
    });
  }

  function setChoiceButtonsActive(choiceButtons, selectedKey) {
    choiceButtons.forEach((btn) => {
      const isActive = btn.dataset.choice === selectedKey;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  function buildStatsMap(keys) {
    const out = {};
    keys.forEach((key) => {
      out[key] = { correct: 0, total: 0 };
    });
    return out;
  }

  function renderStatsCards(container, cards) {
    if (!cards.length) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }
    container.hidden = false;
    container.innerHTML = cards.map((card) => `
      <section class="stats-card">
        <h3 class="stats-title">${esc(card.title)}</h3>
        <div class="stats-list">
          ${card.items.map((item) => `
            <div class="stat-item">
              <span class="stat-label">${esc(item.label)}</span>
              <span class="stat-value">${esc(item.value)}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `).join('');
  }

  function createApp(root, config) {
    const { difficultyLabels, subjectLabels, subjectOrder, difficultyOrder } = createMetaMaps();
    const bank = window.QUIZ_BANK;

    const choiceOptions = config.kind === 'combined'
      ? [{ key: 'blandet', label: 'Blandet' }, ...window.QUIZ_META.difficulties.map((d) => ({ key: d.key, label: d.label }))]
      : window.QUIZ_META.difficulties.map((d) => ({ key: d.key, label: d.label }));

    const subjectQuestionCount = config.subjectKey
      ? bank.filter((q) => q.fag === config.subjectKey).length
      : null;
    const subjectDifficultyCount = config.subjectKey
      ? bank.filter((q) => q.fag === config.subjectKey && q.difficulty === difficultyOrder[0]).length
      : null;

    const metaItems = config.kind === 'combined'
      ? [
          `${bank.length} spørgsmål i fælles bank`,
          `${config.quizSize} tilfældige pr. runde`,
          'Balanceret udvælgelse på fag og sværhedsgrad',
          'Svar forklares undervejs',
        ]
      : [
          `${subjectQuestionCount} spørgsmål i fagets bank`,
          `${subjectDifficultyCount} pr. sværhedsgrad`,
          `${config.quizSize} tilfældige pr. runde`,
          'Svar forklares undervejs',
        ];

    const chipsHtml = config.kind === 'combined'
      ? `
        <div class="subject-chips">
          ${window.QUIZ_META.subjects.map((s) => `
            <span class="chip ${esc(SUBJECT_CLASS[s.key] || '')}">${esc(s.label)}</span>
          `).join('')}
        </div>
      `
      : '';

    root.innerHTML = buildFrameHtml(config, choiceOptions, metaItems, chipsHtml);

    const shell = root.querySelector('.quiz-shell');
    if (config.theme) {
      Object.entries(config.theme).forEach(([key, value]) => {
        if (value != null) {
          shell.style.setProperty(key, String(value));
        }
      });
    }

    const app = {
      config,
      bank,
      maps: { difficultyLabels, subjectLabels, subjectOrder, difficultyOrder },
      round: [],
      currentIndex: 0,
      score: 0,
      locked: false,
      selectedChoice: config.defaultChoice || choiceOptions[0].key,
      stats: {
        subject: buildStatsMap(subjectOrder),
        difficulty: buildStatsMap(difficultyOrder),
      },
      el: {
        start: root.querySelector('#start'),
        quiz: root.querySelector('#quiz'),
        results: root.querySelector('#results'),
        choiceGrid: root.querySelector('#choice-grid'),
        startBtn: root.querySelector('#start-btn'),
        counter: root.querySelector('#counter'),
        scoreLive: root.querySelector('#score-live'),
        progress: root.querySelector('#progress'),
        badgeSubject: root.querySelector('#badge-subject'),
        badgeDifficulty: root.querySelector('#badge-difficulty'),
        questionTopic: root.querySelector('#question-topic'),
        question: root.querySelector('#question'),
        options: root.querySelector('#options'),
        feedback: root.querySelector('#feedback'),
        nextBtn: root.querySelector('#next-btn'),
        resultScore: root.querySelector('#result-score'),
        resultLabel: root.querySelector('#result-label'),
        resultContext: root.querySelector('#result-context'),
        resultMsg: root.querySelector('#result-msg'),
        resultBreakdowns: root.querySelector('#result-breakdowns'),
        retryBtn: root.querySelector('#retry-btn'),
        changeChoiceBtn: root.querySelector('#change-choice-btn'),
      },
    };

    const choiceButtons = Array.from(app.el.choiceGrid.querySelectorAll('.choice-btn'));
    choiceButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        app.selectedChoice = btn.dataset.choice;
        setChoiceButtonsActive(choiceButtons, app.selectedChoice);
      });
    });
    setChoiceButtonsActive(choiceButtons, app.selectedChoice);

    app.el.startBtn.addEventListener('click', () => startRound(app));
    app.el.retryBtn.addEventListener('click', () => startRound(app));
    app.el.changeChoiceBtn.addEventListener('click', () => showScreen(app, 'start'));
    app.el.nextBtn.addEventListener('click', () => nextQuestion(app));

    showScreen(app, 'start');
    return app;
  }

  function resetRoundStats(app) {
    app.maps.subjectOrder.forEach((key) => {
      app.stats.subject[key] = { correct: 0, total: 0 };
    });
    app.maps.difficultyOrder.forEach((key) => {
      app.stats.difficulty[key] = { correct: 0, total: 0 };
    });
  }

  function startRound(app) {
    app.round = app.config.kind === 'combined'
      ? buildCombinedRound(app)
      : buildSubjectRound(app);

    app.currentIndex = 0;
    app.score = 0;
    app.locked = false;
    resetRoundStats(app);

    showScreen(app, 'quiz');
    renderQuestion(app);
  }

  function buildSubjectRound(app) {
    const pool = app.bank.filter((q) => q.fag === app.config.subjectKey && q.difficulty === app.selectedChoice);
    if (pool.length < app.config.quizSize) {
      throw new Error(`For få spørgsmål i puljen for ${app.config.subjectKey}/${app.selectedChoice}: ${pool.length}`);
    }
    return pickRandom(pool, app.config.quizSize);
  }

  function buildCombinedRound(app) {
    if (app.selectedChoice === 'blandet') {
      return buildCombinedMixedRound(app);
    }
    return buildCombinedDifficultyRound(app, app.selectedChoice);
  }

  function buildCombinedDifficultyRound(app, difficultyKey) {
    const { subjectOrder } = app.maps;
    const bySubject = {};
    subjectOrder.forEach((subjectKey) => {
      const items = app.bank.filter((q) => q.fag === subjectKey && q.difficulty === difficultyKey);
      if (items.length < 7) {
        throw new Error(`For få spørgsmål for ${subjectKey}/${difficultyKey}. Forventer mindst 7, fik ${items.length}`);
      }
      bySubject[subjectKey] = shuffle(items);
    });

    const selected = [];
    const remainders = {};

    subjectOrder.forEach((subjectKey) => {
      selected.push(...bySubject[subjectKey].slice(0, 6));
      remainders[subjectKey] = bySubject[subjectKey].slice(6);
    });

    const extraSubjects = pickRandom(subjectOrder, 2);
    extraSubjects.forEach((subjectKey) => {
      selected.push(remainders[subjectKey][0]);
    });

    return shuffle(selected);
  }

  function buildCombinedMixedRound(app) {
    const { subjectOrder, difficultyOrder } = app.maps;
    const buckets = [];

    subjectOrder.forEach((subjectKey) => {
      difficultyOrder.forEach((difficultyKey) => {
        const items = app.bank.filter((q) => q.fag === subjectKey && q.difficulty === difficultyKey);
        if (items.length < 3) {
          throw new Error(`For få spørgsmål i bucket ${subjectKey}/${difficultyKey}. Forventer mindst 3, fik ${items.length}`);
        }
        buckets.push({
          key: `${subjectKey}__${difficultyKey}`,
          subjectKey,
          difficultyKey,
          items: shuffle(items),
        });
      });
    });

    const selected = [];
    const remainders = {};

    buckets.forEach((bucket) => {
      selected.push(...bucket.items.slice(0, 2));
      remainders[bucket.key] = bucket.items.slice(2);
    });

    const validPairs = [];
    for (let i = 0; i < buckets.length; i++) {
      for (let j = i + 1; j < buckets.length; j++) {
        const a = buckets[i];
        const b = buckets[j];
        if (a.subjectKey !== b.subjectKey && a.difficultyKey !== b.difficultyKey) {
          validPairs.push([a, b]);
        }
      }
    }

    const [pair] = pickRandom(validPairs, 1);
    pair.forEach((bucket) => {
      selected.push(remainders[bucket.key][0]);
    });

    return shuffle(selected);
  }

  function renderQuestion(app) {
    const q = app.round[app.currentIndex];
    const total = app.config.quizSize;

    app.el.counter.textContent = `Spørgsmål ${app.currentIndex + 1} af ${total}`;
    app.el.scoreLive.textContent = `${app.score} rigtige`;
    app.el.progress.style.width = `${(app.currentIndex / total) * 100}%`;

    if (app.config.kind === 'combined') {
      app.el.badgeSubject.hidden = false;
      app.el.badgeSubject.textContent = q.fagLabel || app.maps.subjectLabels[q.fag];
      app.el.badgeSubject.className = `badge subject ${SUBJECT_CLASS[q.fag] || ''}`;
    } else {
      app.el.badgeSubject.hidden = true;
      app.el.badgeSubject.className = 'badge subject';
      app.el.badgeSubject.textContent = '';
    }

    app.el.badgeDifficulty.textContent = app.maps.difficultyLabels[q.difficulty] || q.difficulty;
    app.el.badgeDifficulty.className = `badge difficulty ${DIFF_CLASS[q.difficulty] || ''}`;

    const topicBits = [];
    if (q.module) topicBits.push(q.module);
    if (q.subtopic) topicBits.push(q.subtopic);
    app.el.questionTopic.textContent = topicBits.join(' • ');
    app.el.question.textContent = q.q;

    app.el.options.innerHTML = '';
    q.options.forEach((optionText, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = optionText;
      btn.addEventListener('click', () => submitAnswer(app, index));
      app.el.options.appendChild(btn);
    });

    app.el.feedback.hidden = true;
    app.el.feedback.className = 'feedback';
    app.el.feedback.textContent = '';
    app.el.nextBtn.hidden = true;
    app.el.nextBtn.textContent = '';
    app.locked = false;
  }

  function submitAnswer(app, selectedIndex) {
    if (app.locked) return;
    app.locked = true;

    const q = app.round[app.currentIndex];
    const correct = selectedIndex === q.answer;
    const optionButtons = Array.from(app.el.options.querySelectorAll('.option'));
    optionButtons.forEach((btn) => { btn.disabled = true; });

    app.stats.subject[q.fag].total += 1;
    app.stats.difficulty[q.difficulty].total += 1;

    if (correct) {
      app.score += 1;
      app.stats.subject[q.fag].correct += 1;
      app.stats.difficulty[q.difficulty].correct += 1;
      optionButtons[selectedIndex].classList.add('correct');
    } else {
      optionButtons[selectedIndex].classList.add('wrong');
      if (optionButtons[q.answer]) optionButtons[q.answer].classList.add('correct');
    }

    app.el.scoreLive.textContent = `${app.score} rigtige`;
    app.el.feedback.textContent = `${correct ? 'Korrekt. ' : 'Ikke korrekt. '}${q.explain}`;
    app.el.feedback.className = `feedback ${correct ? 'correct-fb' : 'wrong-fb'}`;
    app.el.feedback.hidden = false;

    app.el.nextBtn.textContent = app.currentIndex + 1 < app.config.quizSize ? 'Næste spørgsmål' : 'Se resultat';
    app.el.nextBtn.hidden = false;
  }

  function nextQuestion(app) {
    app.currentIndex += 1;
    if (app.currentIndex >= app.config.quizSize) {
      renderResults(app);
      return;
    }
    renderQuestion(app);
  }

  function getResultMessage(app, pct) {
    if (app.config.kind === 'combined') {
      if (pct >= 80) return 'Stærkt resultat på tværs af alle tre fag.';
      if (pct >= 60) return 'Godt overblik. Brug per-fag og per-sværhedsgrad breakdown til at se, hvor du kan forbedre dig.';
      return 'Prøv igen med en ny runde, eller vælg en specifik sværhedsgrad for mere fokuseret træning.';
    }
    if (pct >= 80) return 'Stærk forståelse af emnerne på det valgte niveau.';
    if (pct >= 60) return 'Godt fundament. Prøv igen eller skift sværhedsgrad for at træne flere typer spørgsmål.';
    return 'Tag en ny runde og gennemgå emnerne i oversigten for at styrke de svageste områder.';
  }

  function renderResults(app) {
    showScreen(app, 'results');
    const total = app.config.quizSize;
    const pct = Math.round((app.score / total) * 100);
    const scoreColor = pct >= 80 ? '#4ecf9b' : pct >= 60 ? '#f5a623' : '#ff7c5c';

    const choiceLabel = app.selectedChoice === 'blandet'
      ? 'Blandet'
      : (app.maps.difficultyLabels[app.selectedChoice] || app.selectedChoice);

    app.el.resultScore.textContent = `${app.score}/${total}`;
    app.el.resultScore.style.color = scoreColor;
    app.el.resultLabel.textContent = `${pct}% korrekte svar`;
    app.el.resultContext.textContent = app.config.kind === 'combined'
      ? `Tilstand: ${choiceLabel}`
      : `Sværhedsgrad: ${choiceLabel}`;
    app.el.resultMsg.textContent = getResultMessage(app, pct);

    if (app.config.kind === 'combined') {
      const subjectCards = [{
        title: 'Per fag',
        items: app.maps.subjectOrder.map((key) => ({
          label: app.maps.subjectLabels[key] || key,
          value: `${app.stats.subject[key].correct}/${app.stats.subject[key].total}`,
        })),
      }];

      const difficultyCards = [{
        title: 'Per sværhedsgrad',
        items: app.maps.difficultyOrder.map((key) => ({
          label: app.maps.difficultyLabels[key] || key,
          value: `${app.stats.difficulty[key].correct}/${app.stats.difficulty[key].total}`,
        })),
      }];

      renderStatsCards(app.el.resultBreakdowns, [...subjectCards, ...difficultyCards]);
    } else {
      renderStatsCards(app.el.resultBreakdowns, [{
        title: 'Fordeling i runden',
        items: [{
          label: app.config.subjectLabel,
          value: `${app.stats.subject[app.config.subjectKey].correct}/${app.stats.subject[app.config.subjectKey].total}`,
        }, {
          label: 'Sværhedsgrad',
          value: `${choiceLabel} (${app.stats.difficulty[app.selectedChoice].correct}/${app.stats.difficulty[app.selectedChoice].total})`,
        }],
      }]);
    }
  }

  function renderSubjectQuiz(config) {
    const root = document.getElementById(config.mountId || 'app');
    if (!root) throw new Error(`Mount element ikke fundet: #${config.mountId || 'app'}`);

    const maps = createMetaMaps();
    const subjectLabel = config.subjectLabel || maps.subjectLabels[config.subjectKey];
    if (!subjectLabel) throw new Error(`Ukendt subjectKey: ${config.subjectKey}`);

    createApp(root, {
      kind: 'subject',
      subjectKey: config.subjectKey,
      subjectLabel,
      quizSize: 10,
      tag: config.tag || 'Fagquiz',
      title: config.title || `Quiz: ${subjectLabel}`,
      description: config.description || `Test din viden i emnerne for ${subjectLabel}.`,
      choiceLabel: 'Vælg sværhedsgrad',
      startButtonLabel: 'Start quiz',
      retryLabel: 'Prøv igen med nye spørgsmål',
      changeChoiceLabel: 'Skift sværhedsgrad',
      backHref: config.backHref,
      backText: config.backText || 'Tilbage',
      homeHref: config.homeHref || 'index.html',
      homeLabel: config.homeLabel || '← Tilbage til forsiden',
      defaultChoice: config.defaultChoice || 'nem',
      theme: config.theme || null,
      mountId: config.mountId || 'app',
    });
  }

  function renderCombinedQuiz(config) {
    const root = document.getElementById(config.mountId || 'app');
    if (!root) throw new Error(`Mount element ikke fundet: #${config.mountId || 'app'}`);

    createApp(root, {
      kind: 'combined',
      quizSize: 20,
      tag: config.tag || 'Samlet quiz',
      titlePrefix: config.titlePrefix || 'Quiz:',
      titleHighlight: config.titleHighlight || 'Alle 3 fag',
      description: config.description || 'Blandet quiz på tværs af kravspecifikation, metodik og softwaretest & sikkerhed.',
      choiceLabel: 'Vælg tilstand',
      startButtonLabel: 'Start samlet quiz',
      retryLabel: 'Prøv igen med nye spørgsmål',
      changeChoiceLabel: 'Skift tilstand',
      backHref: config.backHref,
      backText: config.backText || 'Tilbage',
      homeHref: config.homeHref || 'index.html',
      homeLabel: config.homeLabel || '← Tilbage til forsiden',
      defaultChoice: config.defaultChoice || 'blandet',
      theme: config.theme || null,
      mountId: config.mountId || 'app',
    });
  }

  window.QuizModule = {
    renderSubjectQuiz,
    renderCombinedQuiz,
  };
})();

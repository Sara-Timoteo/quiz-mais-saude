/* ============================================
   QUIZ MAIS SAÚDE — Lógica da aplicação
   ============================================ */

// ============================================
// 🐛 Overlay de erros visível (ajuda em debug)
// ============================================
// Se algo falhar, em vez de a app ficar "estática", aparece um aviso
// no topo da página com a mensagem. Podes apagar este bloco quando
// tudo estiver estável.
function showFatalError(msg) {
  let bar = document.getElementById('__err_bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = '__err_bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#B91C1C;color:#fff;padding:12px 16px;font:14px/1.4 system-ui,sans-serif;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
    document.body.appendChild(bar);
  }
  bar.textContent = '⚠️  ' + msg;
  console.error(msg);
}
window.addEventListener('error', (e) => {
  showFatalError('JS error: ' + (e.message || 'desconhecido') + ' — verifica a consola (F12).');
});
window.addEventListener('unhandledrejection', (e) => {
  showFatalError('Async error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
});

// ============================================
// ⚙️  CONFIGURAÇÃO — EDITA APENAS ESTAS LINHAS
// ============================================

const SUPABASE_URL = 'https://hhozgecuyczrbvyzvaoz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhob3pnZWN1eWN6cmJ2eXp2YW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MjA1NjUsImV4cCI6MjA2MjM5NjU2NX0.26C81920FzVHVCp6OFqCUhoo6NfDnVnTZhskVNuR5qo';

// Login real-only — consulta verificar_beneficiario no Supabase.
// Para voltar ao modo de teste (aceita qualquer número/ano), muda para false.
const REQUIRE_LOGIN = true;

// Nomes das tabelas no Supabase (case-sensitive!).
// Se as tuas tabelas tiverem outros nomes, ajusta aqui:
const TABLE_NIVEIS = 'niveis';
const TABLE_QUIZ   = 'quiz_questoes';

// Tempo de feedback após resposta (milisegundos)
const FEEDBACK_MS = 1600;

// ============================================
// Setup Supabase
// ============================================

if (!window.supabase || !window.supabase.createClient) {
  showFatalError('A biblioteca Supabase não carregou (verifica ligação à internet ou bloqueios de rede).');
  throw new Error('Supabase library not loaded');
}
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✓ Supabase client criado:', SUPABASE_URL);

// ============================================
// Estado da aplicação
// ============================================

const state = {
  user: null,
  niveis: [],
  currentLevel: null,
  questions: [],
  qIndex: 0,
  correctCount: 0,
};

// ============================================
// Navegação entre views
// ============================================

function showView(name) {
  document.querySelectorAll('[data-view]').forEach(v => {
    v.hidden = v.dataset.view !== name;
  });
  window.scrollTo(0, 0);
}

// ============================================
// Sessão (guardada no browser)
// ============================================

const SESSION_KEY = 'mais_saude_user';

function saveSession(user) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch(_) {}
  state.user = user;
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) { state.user = JSON.parse(raw); return true; }
  } catch(_) {}
  return false;
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch(_) {}
  state.user = null;
}

// ============================================
// LOGIN
// ============================================

const loginForm   = document.getElementById('login-form');
const loginError  = document.getElementById('login-error');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const numero = loginForm.numero.value.trim();
  const ano = parseInt(loginForm.ano.value, 10);

  alert('PASSO 1: submit disparou. numero="' + numero + '", ano=' + ano);

  if (!numero || !ano) {
    showLoginError('Preencha o número e o ano de nascimento.');
    alert('PASSO 2: campos vazios, parámos aqui.');
    return;
  }

  // Modo de teste — sem verificação no Supabase
  if (!REQUIRE_LOGIN) {
    saveSession({ numero_beneficiario: numero, modo_teste: true });
    await goToNiveis();
    return;
  }

  alert('PASSO 3: vou chamar Supabase verificar_beneficiario...');

  // Modo real — chama a função verificar_beneficiario no Supabase
  try {
    const { data, error } = await sb.rpc('verificar_beneficiario', {
      p_numero: numero,
      p_ano: ano,
    });
    alert('PASSO 4: Supabase respondeu. error=' + JSON.stringify(error) + '  data=' + JSON.stringify(data));
    if (error) {
      console.error('RPC error:', error);
      showLoginError('Supabase: ' + (error.message || JSON.stringify(error)) + ' (código: ' + (error.code || '?') + ')');
      return;
    }
    if (!data || data.length === 0) {
      showLoginError('Número de beneficiário ou ano de nascimento inválidos.');
      return;
    }
    alert('PASSO 5: credenciais OK, a guardar sessão e navegar.');
    saveSession(data[0]);
    await goToNiveis();
  } catch (err) {
    console.error('Login exception:', err);
    alert('PASSO 4-EXCEPÇÃO: ' + (err.message || err));
    showLoginError('Excepção: ' + (err.message || err));
  }
});

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.hidden = false;
}

document.getElementById('logout').addEventListener('click', () => {
  clearSession();
  loginForm.reset();
  showView('login');
});

// ============================================
// NÍVEIS
// ============================================

async function goToNiveis() {
  showView('niveis');
  await loadNiveis();
}

async function loadNiveis() {
  const list = document.getElementById('niveis-list');
  list.innerHTML = '<li class="loading">A carregar níveis…</li>';

  console.log('▶ Querying Supabase:', TABLE_NIVEIS);
  const { data, error } = await sb
    .from(TABLE_NIVEIS)
    .select('id, nome')
    .order('id', { ascending: true });

  if (error) {
    console.error('✗ Supabase error loading niveis:', error);
    list.innerHTML = `<li class="loading">Não foi possível carregar os níveis.<small>${escapeHTML(error.message)}</small></li>`;
    return;
  }

  console.log('✓ Niveis recebidos:', data);
  state.niveis = data || [];

  if (state.niveis.length === 0) {
    list.innerHTML = '<li class="loading">Ainda não há níveis disponíveis.</li>';
    return;
  }

  list.innerHTML = state.niveis.map((n, i) => `
    <li class="nivel-item" tabindex="0" role="button"
        data-nivel-id="${n.id}"
        data-nivel-nome="${escapeAttr(n.nome || `Nível ${i+1}`)}">
      <span class="nivel-number">${i + 1}</span>
      <span class="nivel-name">${escapeHTML(n.nome || `Nível ${i+1}`)}</span>
      <span class="nivel-arrow" aria-hidden="true">→</span>
    </li>
  `).join('');

  list.querySelectorAll('.nivel-item').forEach(item => {
    const open = () => startQuiz({
      id: parseInt(item.dataset.nivelId, 10),
      nome: item.dataset.nivelNome,
    });
    item.addEventListener('click', open);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

// ============================================
// QUIZ
// ============================================

async function startQuiz(nivel) {
  state.currentLevel = nivel;
  state.qIndex = 0;
  state.correctCount = 0;

  document.getElementById('quiz-level-name').textContent = nivel.nome;
  document.getElementById('question-text').textContent = 'A carregar…';
  document.getElementById('options').innerHTML = '';
  document.getElementById('progress-fill').style.width = '0%';
  showView('quiz');

  const { data, error } = await sb
    .from(TABLE_QUIZ)
    .select('*')
    .eq('id_niveis', nivel.id)
    .order('id', { ascending: true });

  if (error) {
    document.getElementById('question-text').textContent = 'Erro ao carregar perguntas.';
    document.getElementById('options').innerHTML =
      `<li class="loading"><small>${escapeHTML(error.message)}</small></li>`;
    return;
  }

  state.questions = data || [];

  if (state.questions.length === 0) {
    document.getElementById('question-text').textContent = 'Sem perguntas neste nível.';
    return;
  }

  document.getElementById('q-total').textContent = state.questions.length;
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.qIndex];
  document.getElementById('question-text').textContent = q.questao || `Pergunta ${state.qIndex + 1}`;
  document.getElementById('q-current').textContent = state.qIndex + 1;
  document.getElementById('progress-fill').style.width =
    `${(state.qIndex / state.questions.length) * 100}%`;

  const feedback = document.getElementById('feedback');
  feedback.hidden = true;
  feedback.className = 'feedback';

  const letters = ['A', 'B', 'C', 'D'];
  const opts = [
    { texto: q.opcao_1, num: 1 },
    { texto: q.opcao_2, num: 2 },
    { texto: q.opcao_3, num: 3 },
  ].filter(o => o.texto != null && String(o.texto).trim() !== '');

  const optionsEl = document.getElementById('options');
  optionsEl.innerHTML = opts.map((o, i) => `
    <li class="option" data-num="${o.num}" tabindex="0" role="button">
      <span class="option__letter">${letters[i]}</span>
      <span class="option__text">${escapeHTML(o.texto)}</span>
    </li>
  `).join('');

  optionsEl.querySelectorAll('.option').forEach(opt => {
    const choose = () => answer(parseInt(opt.dataset.num, 10), opt);
    opt.addEventListener('click', choose);
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
    });
  });
}

function answer(chosen, chosenEl) {
  const q = state.questions[state.qIndex];
  const correct = q.opcao_correta;

  // Desactivar todas as opções
  document.querySelectorAll('.option').forEach(o => o.classList.add('option--disabled'));

  if (chosen === correct) {
    chosenEl.classList.add('option--correct');
    state.correctCount++;
    showFeedback('✓  Resposta correcta!', 'success');
  } else {
    chosenEl.classList.add('option--wrong');
    const correctEl = document.querySelector(`.option[data-num="${correct}"]`);
    if (correctEl) correctEl.classList.add('option--correct');
    showFeedback('✗  A resposta certa está realçada a verde.', 'error');
  }

  setTimeout(() => {
    state.qIndex++;
    if (state.qIndex >= state.questions.length) {
      finishLevel();
    } else {
      renderQuestion();
    }
  }, FEEDBACK_MS);
}

function showFeedback(text, kind) {
  const fb = document.getElementById('feedback');
  fb.textContent = text;
  fb.className = `feedback feedback--${kind === 'success' ? 'success' : 'error'}`;
  fb.hidden = false;
}

document.getElementById('quiz-back').addEventListener('click', () => {
  showView('niveis');
});

// ============================================
// TERMINAR
// ============================================

function finishLevel() {
  document.getElementById('progress-fill').style.width = '100%';
  const total = state.questions.length;
  const correct = state.correctCount;
  document.getElementById('score-text').textContent =
    `${correct} de ${total} respostas correctas`;
  showView('terminar');
}

document.getElementById('next-level').addEventListener('click', () => {
  const currentIdx = state.niveis.findIndex(n => n.id === state.currentLevel.id);
  const next = state.niveis[currentIdx + 1];
  if (next) {
    startQuiz(next);
  } else {
    showView('niveis');
  }
});

document.getElementById('back-to-levels').addEventListener('click', () => {
  showView('niveis');
});

// ============================================
// Helpers
// ============================================

function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function escapeAttr(str) { return escapeHTML(str); }

// ============================================
// Service Worker (PWA — offline)
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.warn('Service worker não registado:', err)
    );
  });
}

// ============================================
// Arranque
// ============================================

(async function init() {
  // Aviso útil se as credenciais Supabase não foram preenchidas
  if (SUPABASE_URL.includes('__') || SUPABASE_ANON_KEY.includes('__')) {
    console.warn('⚠️  Edita app.js e preenche SUPABASE_URL e SUPABASE_ANON_KEY.');
  }

  if (loadSession()) {
    await goToNiveis();
  } else {
    showView('login');
  }
})();

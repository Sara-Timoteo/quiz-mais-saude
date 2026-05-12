/* ============================================
   QUIZ MAIS SAÚDE — Lógica da aplicação
   Fase 2a: splash, welcome, dashboard, resultado %, histórico, perfil
   ============================================ */

// ============================================
// CONFIGURAÇÃO
// ============================================

const SUPABASE_URL = 'https://hhozgecuyczrbvyzvaoz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhob3pnZWN1eWN6cmJ2eXp2YW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MjA1NjUsImV4cCI6MjA2MjM5NjU2NX0.26C81920FzVHVCp6OFqCUhoo6NfDnVnTZhskVNuR5qo';

// Login real-only — consulta verificar_beneficiario no Supabase
const REQUIRE_LOGIN = true;

const TABLE_NIVEIS     = 'niveis';
const TABLE_QUIZ       = 'quiz_questoes';
const TABLE_RESULTADOS = 'resultados';
const FEEDBACK_MS = 1600;

const SESSION_KEY  = 'mais_saude_user';
const WELCOMED_KEY = 'mais_saude_welcomed';

// ============================================
// Rede de segurança: erros de JS aparecem no topo
// ============================================

function showFatalError(msg) {
  let bar = document.getElementById('__fatal');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = '__fatal';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#D8394A;color:#fff;padding:10px 14px;font:14px/1.4 system-ui,sans-serif;z-index:9999;text-align:center;';
    document.body.appendChild(bar);
  }
  bar.textContent = msg;
}
window.addEventListener('error', e => showFatalError('Erro: ' + e.message));
window.addEventListener('unhandledrejection', e => showFatalError('Erro: ' + (e.reason?.message || e.reason)));

if (!window.supabase || !window.supabase.createClient) {
  showFatalError('Biblioteca Supabase não carregou. Verifique a sua ligação.');
  throw new Error('Supabase library not loaded');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// Estado da aplicação
// ============================================

const state = {
  user: null,         // { numbeneficiario: '...' }
  niveis: [],
  currentLevel: null,
  questions: [],
  qIndex: 0,
  correctCount: 0,
};

// ============================================
// Helpers
// ============================================

function $(id) { return document.getElementById(id); }

function showView(name) {
  document.querySelectorAll('[data-view]').forEach(v => {
    v.hidden = v.dataset.view !== name;
  });
  window.scrollTo(0, 0);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escapeHTML(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]}`;
}

// ============================================
// Sessão e welcome flag
// ============================================

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
function hasWelcomed() {
  try { return localStorage.getItem(WELCOMED_KEY) === '1'; } catch(_) { return false; }
}
function markWelcomed() {
  try { localStorage.setItem(WELCOMED_KEY, '1'); } catch(_) {}
}

function userNumber() {
  return state.user?.numbeneficiario || state.user?.numero_beneficiario || '';
}

// ============================================
// LOGIN
// ============================================

const loginForm  = $('login-form');
const loginError = $('login-error');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const numero = loginForm.numero.value.trim();
  const ano = parseInt(loginForm.ano.value, 10);

  if (!numero || !ano) {
    showLoginError('Preencha o número e o ano de nascimento.');
    return;
  }

  if (!REQUIRE_LOGIN) {
    saveSession({ numbeneficiario: numero, modo_teste: true });
    await goToDashboard();
    return;
  }

  try {
    const { data, error } = await sb.rpc('verificar_beneficiario', {
      p_numero: numero, p_ano: ano,
    });
    if (error) throw error;
    if (!data || data.length === 0) {
      showLoginError('Número de beneficiário ou ano de nascimento inválidos.');
      return;
    }
    saveSession(data[0]);
    await goToDashboard();
  } catch (err) {
    console.error('Login error:', err);
    showLoginError('Erro ao verificar credenciais. Tente novamente.');
  }
});

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.hidden = false;
}

// ============================================
// WELCOME
// ============================================

$('welcome-start').addEventListener('click', () => {
  markWelcomed();
  showView('login');
});

// ============================================
// DASHBOARD
// ============================================

async function goToDashboard() {
  showView('dashboard');
  await loadDashboard();
}

async function loadDashboard() {
  const num = userNumber();
  $('dashboard-user').textContent = num;

  // Pre-carregar pontuação enquanto carrega níveis em segundo plano
  $('stat-quizzes').textContent = '…';
  $('stat-media').textContent = '…';

  const stats = await loadUserStats(num);
  $('stat-quizzes').textContent = stats.total;
  $('stat-media').textContent = stats.total > 0 ? `${stats.media}%` : '—';

  // Preload níveis em background para abrir mais depressa quando carregar no Iniciar Quiz
  loadNiveis().catch(() => {});
}

async function loadUserStats(numero) {
  if (!numero) return { total: 0, media: 0 };
  const { data, error } = await sb
    .from(TABLE_RESULTADOS)
    .select('percentagem')
    .eq('numero_beneficiario', numero);
  if (error || !data) {
    console.warn('Erro ao carregar stats:', error);
    return { total: 0, media: 0 };
  }
  const total = data.length;
  const media = total > 0
    ? Math.round(data.reduce((acc, r) => acc + (r.percentagem || 0), 0) / total)
    : 0;
  return { total, media };
}

$('dashboard-quiz').addEventListener('click', () => goToNiveis());
$('dashboard-historico').addEventListener('click', () => goToHistorico());
$('dashboard-perfil').addEventListener('click', () => goToPerfil());
$('dashboard-perfil-card').addEventListener('click', () => goToPerfil());

// ============================================
// NÍVEIS
// ============================================

async function goToNiveis() {
  showView('niveis');
  if (state.niveis.length === 0) await loadNiveis();
  renderNiveis();
}

async function loadNiveis() {
  const { data, error } = await sb
    .from(TABLE_NIVEIS)
    .select('id, nome')
    .order('id', { ascending: true });
  if (error) {
    $('niveis-list').innerHTML = `<li class="loading">Não foi possível carregar os níveis.<small>${escapeHTML(error.message)}</small></li>`;
    return;
  }
  state.niveis = data || [];
}

function renderNiveis() {
  const list = $('niveis-list');
  if (state.niveis.length === 0) {
    list.innerHTML = '<li class="loading">Ainda não há níveis disponíveis.</li>';
    return;
  }
  list.innerHTML = state.niveis.map((n, i) => `
    <li class="nivel-item" tabindex="0" role="button"
        data-nivel-id="${n.id}"
        data-nivel-nome="${escapeHTML(n.nome || `Nível ${i+1}`)}">
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

$('niveis-back').addEventListener('click', () => goToDashboard());

// ============================================
// QUIZ
// ============================================

async function startQuiz(nivel) {
  state.currentLevel = nivel;
  state.qIndex = 0;
  state.correctCount = 0;
  $('quiz-level-name').textContent = nivel.nome;
  $('question-text').textContent = 'A carregar…';
  $('options').innerHTML = '';
  $('progress-fill').style.width = '0%';
  showView('quiz');

  const { data, error } = await sb.from(TABLE_QUIZ).select('*')
    .eq('id_niveis', nivel.id)
    .order('id', { ascending: true });
  if (error) {
    $('question-text').textContent = 'Erro ao carregar perguntas.';
    return;
  }
  state.questions = data || [];
  if (state.questions.length === 0) {
    $('question-text').textContent = 'Sem perguntas neste nível.';
    return;
  }
  $('q-total').textContent = state.questions.length;
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.qIndex];
  $('question-text').textContent = q.questao || `Pergunta ${state.qIndex + 1}`;
  $('q-current').textContent = state.qIndex + 1;
  $('progress-fill').style.width = `${(state.qIndex / state.questions.length) * 100}%`;
  const feedback = $('feedback');
  feedback.hidden = true;
  feedback.className = 'feedback';

  const letters = ['A', 'B', 'C', 'D'];
  const opts = [
    { texto: q.opcao_1, num: 1 },
    { texto: q.opcao_2, num: 2 },
    { texto: q.opcao_3, num: 3 },
  ].filter(o => o.texto != null && String(o.texto).trim() !== '');

  const optionsEl = $('options');
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
  const fb = $('feedback');
  fb.textContent = text;
  fb.className = `feedback feedback--${kind === 'success' ? 'success' : 'error'}`;
  fb.hidden = false;
}

$('quiz-back').addEventListener('click', () => goToNiveis());

// ============================================
// RESULTADO + Guardar no Supabase
// ============================================

async function finishLevel() {
  $('progress-fill').style.width = '100%';

  const total = state.questions.length;
  const correct = state.correctCount;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Mensagem motivacional consoante a percentagem
  let msg;
  if (percent === 100) msg = 'Perfeito! 🎉';
  else if (percent >= 80) msg = 'Excelente trabalho!';
  else if (percent >= 60) msg = 'Bom resultado!';
  else if (percent >= 40) msg = 'Continue a praticar.';
  else msg = 'Pode melhorar — tente de novo.';

  $('resultado-percent').textContent = `${percent}%`;
  $('resultado-detail').textContent = `${correct} de ${total} respostas correctas`;
  $('resultado-msg').textContent = msg;

  // Mostra ou esconde botão "Próximo nível" consoante haja próximo
  const currentIdx = state.niveis.findIndex(n => n.id === state.currentLevel.id);
  const hasNext = currentIdx >= 0 && state.niveis[currentIdx + 1];
  $('resultado-next').hidden = !hasNext;

  showView('resultado');

  // Guardar resultado no Supabase em background (não bloqueia o ecrã)
  saveResultado({
    numero_beneficiario: userNumber(),
    id_nivel: state.currentLevel.id,
    nivel_nome: state.currentLevel.nome,
    total_perguntas: total,
    acertos: correct,
    percentagem: percent,
  }).catch(err => console.warn('Não foi possível guardar o resultado:', err));
}

async function saveResultado(row) {
  if (!row.numero_beneficiario) return;
  const { error } = await sb.from(TABLE_RESULTADOS).insert(row);
  if (error) console.warn('Erro ao guardar resultado:', error);
}

$('resultado-next').addEventListener('click', () => {
  const currentIdx = state.niveis.findIndex(n => n.id === state.currentLevel.id);
  const next = state.niveis[currentIdx + 1];
  if (next) startQuiz(next); else goToDashboard();
});

$('resultado-home').addEventListener('click', () => goToDashboard());

// ============================================
// HISTÓRICO
// ============================================

async function goToHistorico() {
  showView('historico');
  await loadHistorico();
}

async function loadHistorico() {
  const list = $('historico-list');
  list.innerHTML = '<li class="loading">A carregar…</li>';
  const { data, error } = await sb
    .from(TABLE_RESULTADOS)
    .select('id, nivel_nome, percentagem, acertos, total_perguntas, criado_em')
    .eq('numero_beneficiario', userNumber())
    .order('criado_em', { ascending: false })
    .limit(50);

  if (error) {
    list.innerHTML = `<li class="loading">Erro ao carregar histórico.<small>${escapeHTML(error.message)}</small></li>`;
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = '<li class="historico-empty">Ainda não fez nenhum quiz. Comece um agora!</li>';
    return;
  }
  list.innerHTML = data.map(r => `
    <li class="historico-item">
      <span class="historico-item__date">${escapeHTML(formatDate(r.criado_em))}</span>
      <span class="historico-item__name">${escapeHTML(r.nivel_nome || 'Quiz')}</span>
      <span class="historico-item__percent">${r.percentagem}%</span>
    </li>
  `).join('');
}

$('historico-back').addEventListener('click', () => goToDashboard());

// ============================================
// PERFIL
// ============================================

async function goToPerfil() {
  showView('perfil');
  $('perfil-numero').textContent = userNumber() || '—';

  const stats = await loadUserStats(userNumber());
  $('perfil-total-quizzes').textContent = stats.total;
  $('perfil-media').textContent = stats.total > 0 ? `${stats.media}%` : '—';
}

$('perfil-back').addEventListener('click', () => goToDashboard());

$('perfil-logout').addEventListener('click', () => {
  if (confirm('Quer mesmo terminar sessão?')) {
    clearSession();
    loginForm.reset();
    showView('login');
  }
});

// ============================================
// Service Worker
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ============================================
// ARRANQUE — splash → welcome / login / dashboard
// ============================================

(async function init() {
  // Splash dura ~2.2s (animação CSS já gere o fade-out)
  await sleep(2200);

  if (loadSession()) {
    await goToDashboard();
  } else if (hasWelcomed()) {
    showView('login');
  } else {
    showView('welcome');
  }
})();

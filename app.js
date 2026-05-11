

/* ============================================
   QUIZ MAIS SAÚDE — VERSÃO DEBUG
   Mostra mensagens visíveis em cada passo do login.
   Quando o problema estiver resolvido, voltamos à versão normal.
   ============================================ */
 
// ============================================
// 🐛 PAINEL DE DEBUG VISÍVEL
// ============================================
 
const dbgPanel = document.createElement('div');
dbgPanel.id = '__debug';
dbgPanel.style.cssText = `
  position:fixed; bottom:0; left:0; right:0;
  background:#0a0a0a; color:#0f0;
  padding:10px 14px; font:12px/1.5 monospace;
  z-index:99999; max-height:45vh; overflow-y:auto;
  border-top:2px solid #0f0;
`;
document.body.appendChild(dbgPanel);
 
function dbg(msg, kind = 'ok') {
  const colors = { ok: '#0f0', err: '#f55', warn: '#fc0', step: '#0cf' };
  const line = document.createElement('div');
  line.style.color = colors[kind] || '#0f0';
  const time = new Date().toISOString().slice(11, 19);
  line.textContent = `[${time}] ${msg}`;
  dbgPanel.appendChild(line);
  dbgPanel.scrollTop = dbgPanel.scrollHeight;
  console.log(`[DBG] ${msg}`);
}
 
window.addEventListener('error', (e) => {
  dbg('JS ERROR: ' + (e.message || 'desconhecido'), 'err');
});
window.addEventListener('unhandledrejection', (e) => {
  dbg('PROMISE ERROR: ' + (e.reason?.message || e.reason), 'err');
});
 
dbg('Script app.js a carregar...', 'step');
 
// ============================================
// CONFIGURAÇÃO
// ============================================
 
const SUPABASE_URL = 'https://hhozgecuyczrbvyzvaoz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhob3pnZWN1eWN6cmJ2eXp2YW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MjA1NjUsImV4cCI6MjA2MjM5NjU2NX0.26C81920FzVHVCp6OFqCUhoo6NfDnVnTZhskVNuR5qo';
 
const REQUIRE_LOGIN = false;
const TABLE_NIVEIS = 'niveis';
const TABLE_QUIZ   = 'quiz_questoes';
const FEEDBACK_MS = 1600;
 
dbg('Modo: REQUIRE_LOGIN = ' + REQUIRE_LOGIN + ' (test mode: aceita qualquer número/ano)', 'warn');
 
// ============================================
// Setup Supabase
// ============================================
 
if (!window.supabase || !window.supabase.createClient) {
  dbg('Biblioteca Supabase NÃO carregou!', 'err');
  throw new Error('Supabase library not loaded');
}
dbg('Biblioteca Supabase carregada ✓');
 
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
dbg('Cliente Supabase criado ✓');
 
// ============================================
// Estado
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
// Navegação
// ============================================
 
function showView(name) {
  dbg('showView("' + name + '")', 'step');
  const views = document.querySelectorAll('[data-view]');
  dbg('  ' + views.length + ' views encontradas no DOM');
  views.forEach(v => {
    const shouldHide = v.dataset.view !== name;
    v.hidden = shouldHide;
    dbg('    [' + v.dataset.view + '] hidden=' + shouldHide);
  });
  window.scrollTo(0, 0);
}
 
// ============================================
// Sessão
// ============================================
 
const SESSION_KEY = 'mais_saude_user';
 
function saveSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    dbg('Sessão guardada no localStorage ✓');
  } catch(err) {
    dbg('localStorage falhou: ' + err.message, 'err');
  }
  state.user = user;
}
 
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      state.user = JSON.parse(raw);
      dbg('Sessão anterior encontrada no localStorage');
      return true;
    }
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
 
const loginForm  = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
 
if (!loginForm) {
  dbg('ELEMENTO #login-form NÃO ENCONTRADO no DOM!', 'err');
} else {
  dbg('#login-form encontrado ✓');
}
if (!loginError) {
  dbg('ELEMENTO #login-error NÃO ENCONTRADO no DOM!', 'err');
} else {
  dbg('#login-error encontrado ✓');
}
 
loginForm?.addEventListener('submit', async (e) => {
  dbg('────────────────────────', 'step');
  dbg('EVENTO SUBMIT disparou!', 'step');
  e.preventDefault();
  dbg('  e.preventDefault() chamado');
 
  loginError.hidden = true;
 
  const numero = loginForm.numero.value.trim();
  const ano = parseInt(loginForm.ano.value, 10);
  dbg('  Inputs: numero="' + numero + '", ano=' + ano);
 
  if (!numero || !ano) {
    dbg('  Validação FALHOU (campo vazio)', 'warn');
    showLoginError('Preencha o número e o ano de nascimento.');
    return;
  }
  dbg('  Validação passou ✓');
 
  if (!REQUIRE_LOGIN) {
    dbg('  Modo teste: a guardar sessão fake...');
    saveSession({ numero_beneficiario: numero, modo_teste: true });
    dbg('  A chamar goToNiveis()...');
    await goToNiveis();
    dbg('  goToNiveis() terminou', 'step');
    return;
  }
 
  dbg('  Modo real: a chamar RPC verificar_beneficiario...', 'step');
  try {
    const { data, error } = await sb.rpc('verificar_beneficiario', {
      p_numero: numero, p_ano: ano,
    });
    if (error) throw error;
    if (!data || data.length === 0) {
      dbg('  RPC retornou vazio (credenciais inválidas)', 'warn');
      showLoginError('Número de beneficiário ou ano de nascimento inválidos.');
      return;
    }
    dbg('  RPC OK, a guardar sessão...');
    saveSession(data[0]);
    await goToNiveis();
  } catch (err) {
    dbg('  RPC FALHOU: ' + err.message, 'err');
    showLoginError('Erro ao verificar credenciais. Tente novamente.');
  }
});
 
dbg('Listener de submit ligado ao formulário ✓');
 
function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.hidden = false;
  dbg('  Erro mostrado ao utilizador: "' + msg + '"', 'warn');
}
 
document.getElementById('logout')?.addEventListener('click', () => {
  clearSession();
  loginForm.reset();
  showView('login');
});
 
// ============================================
// NÍVEIS
// ============================================
 
async function goToNiveis() {
  dbg('goToNiveis() iniciado', 'step');
  showView('niveis');
  dbg('  Vista mudada para "niveis"');
  await loadNiveis();
}
 
async function loadNiveis() {
  dbg('loadNiveis() iniciado', 'step');
  const list = document.getElementById('niveis-list');
  if (!list) {
    dbg('  ELEMENTO #niveis-list NÃO ENCONTRADO!', 'err');
    return;
  }
  list.innerHTML = '<li class="loading">A carregar níveis…</li>';
  dbg('  A consultar Supabase tabela "' + TABLE_NIVEIS + '"...');
 
  const { data, error } = await sb
    .from(TABLE_NIVEIS)
    .select('id, nome')
    .order('id', { ascending: true });
 
  if (error) {
    dbg('  Erro Supabase: ' + error.message, 'err');
    list.innerHTML = `<li class="loading">Não foi possível carregar os níveis.<small>${escapeHTML(error.message)}</small></li>`;
    return;
  }
 
  dbg('  Níveis recebidos: ' + (data?.length || 0));
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
  dbg('  Lista de níveis renderizada ✓');
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
  const { data, error } = await sb.from(TABLE_QUIZ).select('*')
    .eq('id_niveis', nivel.id).order('id', { ascending: true });
  if (error) {
    document.getElementById('question-text').textContent = 'Erro ao carregar perguntas.';
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
 
document.getElementById('quiz-back')?.addEventListener('click', () => showView('niveis'));
 
// ============================================
// TERMINAR
// ============================================
 
function finishLevel() {
  document.getElementById('progress-fill').style.width = '100%';
  const total = state.questions.length;
  const correct = state.correctCount;
  document.getElementById('score-text').textContent = `${correct} de ${total} respostas correctas`;
  showView('terminar');
}
 
document.getElementById('next-level')?.addEventListener('click', () => {
  const currentIdx = state.niveis.findIndex(n => n.id === state.currentLevel.id);
  const next = state.niveis[currentIdx + 1];
  if (next) startQuiz(next); else showView('niveis');
});
 
document.getElementById('back-to-levels')?.addEventListener('click', () => showView('niveis'));
 
// ============================================
// Helpers
// ============================================
 
function escapeHTML(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function escapeAttr(str) { return escapeHTML(str); }
 
// ============================================
// Service Worker
// ============================================
 
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(() => {
      dbg('Service worker registado ✓');
    }).catch(err => dbg('SW falhou: ' + err.message, 'warn'));
  });
}
 
// ============================================
// Arranque
// ============================================
 
(async function init() {
  dbg('Init iniciado', 'step');
  if (loadSession()) {
    dbg('Sessão prévia detectada — a ir para níveis');
    await goToNiveis();
  } else {
    dbg('Sem sessão — a mostrar login');
    showView('login');
  }
  dbg('Init terminou ✓', 'step');
})();

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

  // Carregar agendamentos e mostrar próxima toma
  await renderProximaToma();

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
$('dashboard-medicamentos').addEventListener('click', () => goToMedicamentos());
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

  renderPerfilNotif();
}

function renderPerfilNotif() {
  const statusEl = $('perfil-notif-status');
  const btn = $('perfil-notif-btn');

  if (!Notifications.isSupported()) {
    statusEl.textContent = 'O seu browser não suporta notificações.';
    statusEl.className = 'perfil-notif__status perfil-notif__status--denied';
    btn.hidden = true;
    return;
  }

  const perm = Notifications.permissionStatus();
  const enabled = Notifications.isEnabled() && perm === 'granted';

  if (perm === 'denied') {
    statusEl.textContent = 'Permissão bloqueada. Ative nas definições do browser.';
    statusEl.className = 'perfil-notif__status perfil-notif__status--denied';
    btn.hidden = true;
    return;
  }

  if (enabled) {
    statusEl.textContent = 'Activas';
    statusEl.className = 'perfil-notif__status perfil-notif__status--on';
    btn.hidden = false;
    btn.textContent = 'Desactivar';
    btn.className = 'perfil-notif__btn perfil-notif__btn--off';
  } else {
    statusEl.textContent = 'Desligadas';
    statusEl.className = 'perfil-notif__status perfil-notif__status--off';
    btn.hidden = false;
    btn.textContent = 'Activar';
    btn.className = 'perfil-notif__btn';
  }
}

$('perfil-notif-btn').addEventListener('click', async () => {
  const enabled = Notifications.isEnabled() && Notifications.permissionStatus() === 'granted';
  if (enabled) {
    Notifications.disable();
  } else {
    const ok = await Notifications.enable();
    if (!ok && Notifications.permissionStatus() === 'denied') {
      alert('Permissão bloqueada. Para activar, vá às definições do browser e permita notificações para esta app.');
    }
  }
  renderPerfilNotif();
});

$('perfil-back').addEventListener('click', () => goToDashboard());

$('perfil-logout').addEventListener('click', () => {
  if (confirm('Quer mesmo terminar sessão? Os seus medicamentos ficam guardados no telemóvel.')) {
    Notifications._clearTimers();
    clearSession();
    invalidateMedCaches();
    loginForm.reset();
    showView('login');
  }
});

// ============================================
// MEDICAMENTOS — armazenamento LOCAL no dispositivo
// (decisão de privacidade: dados de saúde não saem do equipamento)
// ============================================

const DIAS_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Chaves localStorage (incluem número do utente para isolamento por sessão)
function storeKey(suffix) {
  const num = userNumber() || 'anon';
  return `mais_saude_${num}_${suffix}`;
}

// Store: API local com a mesma forma da que tínhamos com Supabase
const Store = {
  async getAgendamentos() {
    try {
      const raw = localStorage.getItem(storeKey('agendamentos'));
      const all = raw ? JSON.parse(raw) : [];
      return all.filter(a => a.ativo !== false)
        .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    } catch { return []; }
  },

  async _saveAgendamentos(arr) {
    try { localStorage.setItem(storeKey('agendamentos'), JSON.stringify(arr)); }
    catch (e) { console.warn('Falha a guardar agendamentos local:', e); }
  },

  async addAgendamento(row) {
    const all = await this._readAllAgendamentos();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const novo = { id, criado_em: new Date().toISOString(), ativo: true, ...row };
    all.push(novo);
    await this._saveAgendamentos(all);
    return novo;
  },

  async updateAgendamento(id, patch) {
    const all = await this._readAllAgendamentos();
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Agendamento não encontrado');
    all[idx] = { ...all[idx], ...patch };
    await this._saveAgendamentos(all);
    return all[idx];
  },

  async deleteAgendamento(id) {
    const all = await this._readAllAgendamentos();
    const filtrado = all.filter(a => a.id !== id);
    await this._saveAgendamentos(filtrado);
    // remover também histórico associado
    const hist = await this._readAllHistorico();
    const histFiltrado = hist.filter(h => h.agendamento_id !== id);
    await this._saveHistorico(histFiltrado);
  },

  async _readAllAgendamentos() {
    try {
      const raw = localStorage.getItem(storeKey('agendamentos'));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async getHistoricoHoje() {
    try {
      const raw = localStorage.getItem(storeKey('historico'));
      const all = raw ? JSON.parse(raw) : [];
      return all.filter(h => h.data === todayISO());
    } catch { return []; }
  },

  async _readAllHistorico() {
    try {
      const raw = localStorage.getItem(storeKey('historico'));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async _saveHistorico(arr) {
    try { localStorage.setItem(storeKey('historico'), JSON.stringify(arr)); }
    catch (e) { console.warn('Falha a guardar histórico local:', e); }
  },

  async marcarTomado(agendamentoId, tomado) {
    const all = await this._readAllHistorico();
    const data = todayISO();
    const idx = all.findIndex(h => h.agendamento_id === agendamentoId && h.data === data);
    const row = {
      agendamento_id: agendamentoId,
      data,
      tomado: !!tomado,
      hora_real: tomado ? new Date().toISOString() : null,
    };
    if (idx === -1) all.push(row);
    else all[idx] = row;
    await this._saveHistorico(all);
  },

  // Limpar tudo (usado no logout)
  clearAll() {
    const num = userNumber() || 'anon';
    try {
      localStorage.removeItem(`mais_saude_${num}_agendamentos`);
      localStorage.removeItem(`mais_saude_${num}_historico`);
      localStorage.removeItem(`mais_saude_${num}_medicoes`);
    } catch {}
  },

  // ---------- MEDIÇÕES (tensão arterial e glicemia) ----------

  async _readAllMedicoes() {
    try {
      const raw = localStorage.getItem(storeKey('medicoes'));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async _saveMedicoes(arr) {
    try { localStorage.setItem(storeKey('medicoes'), JSON.stringify(arr)); }
    catch (e) { console.warn('Falha a guardar medições local:', e); }
  },

  async getMedicoes(tipo) {
    const all = await this._readAllMedicoes();
    const filtered = tipo ? all.filter(m => m.tipo === tipo) : all;
    return filtered.sort((a, b) => (b.data_hora || '').localeCompare(a.data_hora || ''));
  },

  async getMedicaoById(id) {
    const all = await this._readAllMedicoes();
    return all.find(m => m.id === id) || null;
  },

  async addMedicao(row) {
    const all = await this._readAllMedicoes();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const nova = { id, criado_em: new Date().toISOString(), ...row };
    all.push(nova);
    await this._saveMedicoes(all);
    return nova;
  },

  async updateMedicao(id, patch) {
    const all = await this._readAllMedicoes();
    const idx = all.findIndex(m => m.id === id);
    if (idx === -1) throw new Error('Medição não encontrada');
    all[idx] = { ...all[idx], ...patch };
    await this._saveMedicoes(all);
    return all[idx];
  },

  async deleteMedicao(id) {
    const all = await this._readAllMedicoes();
    const filtered = all.filter(m => m.id !== id);
    await this._saveMedicoes(filtered);
  },
};

// ============================================
// NOTIFICAÇÕES PWA (lembretes de medicação)
// ============================================

const Notifications = {
  _timers: [],
  KEY_ENABLED: 'mais_saude_notif_enabled',

  isSupported() {
    return 'Notification' in window;
  },

  isEnabled() {
    try { return localStorage.getItem(this.KEY_ENABLED) === '1'; }
    catch { return false; }
  },

  permissionStatus() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  },

  async requestPermission() {
    if (!this.isSupported()) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch { return false; }
  },

  async enable() {
    const granted = await this.requestPermission();
    if (!granted) return false;
    try { localStorage.setItem(this.KEY_ENABLED, '1'); } catch {}
    await this.reschedule();
    return true;
  },

  disable() {
    try { localStorage.removeItem(this.KEY_ENABLED); } catch {}
    this._clearTimers();
  },

  _clearTimers() {
    this._timers.forEach(id => clearTimeout(id));
    this._timers = [];
  },

  async reschedule() {
    this._clearTimers();
    if (!this.isEnabled()) return;
    if (!this.isSupported() || Notification.permission !== 'granted') return;

    const [agendamentos, historicos] = await Promise.all([
      Store.getAgendamentos(),
      Store.getHistoricoHoje(),
    ]);

    const dow = todayDOW();
    const now = Date.now();

    for (const ag of agendamentos) {
      if (!Array.isArray(ag.dias_semana) || !ag.dias_semana.includes(dow)) continue;
      // já tomado hoje?
      const tomado = historicos.some(h => h.agendamento_id === ag.id && h.tomado);
      if (tomado) continue;

      const [h, m] = String(ag.hora).split(':').map(Number);
      const target = new Date();
      target.setHours(h || 0, m || 0, 0, 0);
      const delay = target.getTime() - now;
      if (delay <= 0) continue; // já passou
      if (delay > 86400000) continue; // > 24h, ignorar por segurança

      const tid = setTimeout(() => this._show(ag), delay);
      this._timers.push(tid);
    }
  },

  async _show(ag) {
    const title = 'Hora da medicação';
    const body = ag.dose ? `${ag.medicamento} · ${ag.dose}` : ag.medicamento;
    const options = {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: `med-${ag.id}-${todayISO()}`,
      requireInteraction: false,
      vibrate: [200, 100, 200],
    };
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
    } catch (e) {
      console.warn('Notificação falhou:', e);
    }
  },
};

// estado em memória dos agendamentos do utente
let _agendamentosCache = null;
let _historicoHojeCache = null;

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayDOW() { return new Date().getDay(); }
function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function timeToMinutes(hhmm) { if (!hhmm) return 0; const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); }
function timeShort(hhmm) { if (!hhmm) return ''; return String(hhmm).slice(0, 5); }

async function fetchAgendamentos(force = false) {
  if (!force && _agendamentosCache) return _agendamentosCache;
  _agendamentosCache = await Store.getAgendamentos();
  return _agendamentosCache;
}

async function fetchHistoricoHoje(force = false) {
  if (!force && _historicoHojeCache) return _historicoHojeCache;
  _historicoHojeCache = await Store.getHistoricoHoje();
  return _historicoHojeCache;
}

function invalidateMedCaches() {
  _agendamentosCache = null;
  _historicoHojeCache = null;
  // Re-agendar notificações sempre que algo mude
  Notifications.reschedule().catch(() => {});
}

function agendamentosHoje(todos) {
  const dow = todayDOW();
  return todos.filter(a => Array.isArray(a.dias_semana) && a.dias_semana.includes(dow));
}

function isAgendamentoTomado(agendamentoId, historicos) {
  const h = historicos.find(x => x.agendamento_id === agendamentoId);
  return !!(h && h.tomado);
}

// ---------- Card "Próxima toma" no Dashboard ----------

async function renderProximaToma() {
  const card = $('proxima-toma-card');
  const num = userNumber();
  if (!num) { card.hidden = true; return; }

  const [agendamentos, historicos] = await Promise.all([
    fetchAgendamentos(),
    fetchHistoricoHoje(),
  ]);

  const total = agendamentos.length;
  $('dashboard-medicamentos-sub').textContent =
    total === 0 ? 'Nenhum medicamento agendado · adicione já'
    : total === 1 ? '1 medicamento activo'
    : `${total} medicamentos activos`;

  const hojeList = agendamentosHoje(agendamentos);
  const naoTomados = hojeList.filter(a => !isAgendamentoTomado(a.id, historicos));

  if (naoTomados.length === 0) {
    card.hidden = true;
    return;
  }

  naoTomados.sort((a, b) => timeToMinutes(a.hora) - timeToMinutes(b.hora));
  const proxima = naoTomados[0];

  card.hidden = false;
  $('proxima-toma-hora').textContent = timeShort(proxima.hora);
  $('proxima-toma-nome').textContent = proxima.dose
    ? `${proxima.medicamento} · ${proxima.dose}`
    : proxima.medicamento;

  const btn = $('proxima-toma-marcar');
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    await Store.marcarTomado(proxima.id, true);
    invalidateMedCaches();
    btn.disabled = false;
    btn.textContent = 'Marcar como tomado';
    await renderProximaToma();
  };
}

// ---------- Página Medicamentos ----------

async function goToMedicamentos() {
  showView('medicamentos');
  await renderMedicamentos();
}

async function renderMedicamentos() {
  const hojeUl = $('hoje-list');
  const todosUl = $('agendamentos-list');
  hojeUl.innerHTML = '<li class="hoje-empty">A carregar…</li>';
  todosUl.innerHTML = '<li class="agendamentos-empty">A carregar…</li>';

  const [agendamentos, historicos] = await Promise.all([
    fetchAgendamentos(true),
    fetchHistoricoHoje(true),
  ]);

  const hoje = agendamentosHoje(agendamentos);
  if (hoje.length === 0) {
    hojeUl.innerHTML = '<li class="hoje-empty">Não há medicamentos agendados para hoje.</li>';
  } else {
    hojeUl.innerHTML = hoje.map(a => {
      const tomado = isAgendamentoTomado(a.id, historicos);
      const dose = a.dose ? ` · ${escapeHTML(a.dose)}` : '';
      return `
        <li class="hoje-item ${tomado ? 'hoje-item--tomado' : ''}" data-id="${escapeHTML(a.id)}" data-tomado="${tomado}">
          <span class="hoje-check" aria-hidden="true"></span>
          <span class="hoje-item__hora">${timeShort(a.hora)}</span>
          <span class="hoje-item__info">
            <span class="hoje-item__nome">${escapeHTML(a.medicamento)}</span>
            ${dose ? `<span class="hoje-item__detalhe">${dose.replace(/^ · /, '')}</span>` : ''}
          </span>
        </li>
      `;
    }).join('');
    hojeUl.querySelectorAll('.hoje-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        const era = item.dataset.tomado === 'true';
        const novo = !era;
        item.classList.toggle('hoje-item--tomado', novo);
        item.dataset.tomado = novo;
        await Store.marcarTomado(id, novo);
        invalidateMedCaches();
      });
    });
  }

  if (agendamentos.length === 0) {
    todosUl.innerHTML = '<li class="agendamentos-empty">Ainda sem agendamentos. Toque no + para adicionar.</li>';
  } else {
    todosUl.innerHTML = agendamentos.map(a => {
      const dias = (a.dias_semana || []).slice().sort((x,y) => ((x+6)%7) - ((y+6)%7))
        .map(d => `<span class="dia-pill">${DIAS_LABELS[d]}</span>`).join('');
      const dose = a.dose ? ` · ${escapeHTML(a.dose)}` : '';
      return `
        <li class="agendamento-item" data-id="${escapeHTML(a.id)}" role="button" tabindex="0">
          <span class="agendamento-item__hora">${timeShort(a.hora)}</span>
          <span class="agendamento-item__info">
            <span class="agendamento-item__nome">${escapeHTML(a.medicamento)}${dose}</span>
            <span class="agendamento-item__detalhe"><span class="dias-resumo">${dias}</span></span>
          </span>
          <span class="agendamento-item__arrow" aria-hidden="true">→</span>
        </li>
      `;
    }).join('');
    todosUl.querySelectorAll('.agendamento-item').forEach(item => {
      const id = item.dataset.id;
      const open = () => goToMedForm('edit', id);
      item.addEventListener('click', open);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }
}

$('medicamentos-back').addEventListener('click', () => goToDashboard());
$('medicamentos-add').addEventListener('click', () => goToMedForm('new'));

// ---------- Formulário de Medicamento (novo + editar) ----------

let _editingMedId = null;

function goToMedForm(modo, id = null) {
  _editingMedId = (modo === 'edit') ? id : null;
  $('med-form-title').textContent = (modo === 'edit') ? 'Editar medicamento' : 'Novo medicamento';
  $('med-form-error').hidden = true;

  if (modo === 'edit') {
    const ag = (_agendamentosCache || []).find(a => a.id === id);
    if (ag) fillMedForm(ag);
    else fetchAgendamentos(true).then(() => {
      const a = (_agendamentosCache || []).find(x => x.id === id);
      if (a) fillMedForm(a);
    });
    $('med-form-delete').hidden = false;
  } else {
    clearMedForm();
    $('med-form-delete').hidden = true;
  }

  showView('med-form');
}

function clearMedForm() {
  $('med-form-id').value = '';
  $('med-form-nome').value = '';
  $('med-form-dose').value = '';
  $('med-form-hora').value = '08:00';
  $('med-form-notas').value = '';
  document.querySelectorAll('#med-form-dias input[type="checkbox"]').forEach(c => c.checked = true);
}

function fillMedForm(a) {
  $('med-form-id').value = a.id;
  $('med-form-nome').value = a.medicamento || '';
  $('med-form-dose').value = a.dose || '';
  $('med-form-hora').value = timeShort(a.hora) || '08:00';
  $('med-form-notas').value = a.notas || '';
  const checks = document.querySelectorAll('#med-form-dias input[type="checkbox"]');
  checks.forEach(c => {
    c.checked = (a.dias_semana || []).includes(parseInt(c.value, 10));
  });
}

function getMedFormDias() {
  const checks = document.querySelectorAll('#med-form-dias input[type="checkbox"]:checked');
  return Array.from(checks).map(c => parseInt(c.value, 10));
}

$('med-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('med-form-error').hidden = true;

  const nome = $('med-form-nome').value.trim();
  const dose = $('med-form-dose').value.trim();
  const hora = $('med-form-hora').value;
  const notas = $('med-form-notas').value.trim();
  const dias = getMedFormDias();

  if (!nome) { showMedFormError('Indique o nome do medicamento.'); return; }
  if (!hora) { showMedFormError('Indique a hora.'); return; }
  if (dias.length === 0) { showMedFormError('Escolha pelo menos um dia da semana.'); return; }

  const row = {
    medicamento: nome,
    dose: dose || null,
    hora,
    dias_semana: dias,
    notas: notas || null,
    ativo: true,
  };

  try {
    if (_editingMedId) {
      await Store.updateAgendamento(_editingMedId, row);
    } else {
      await Store.addAgendamento(row);
    }
    invalidateMedCaches();
    goToMedicamentos();
  } catch (err) {
    showMedFormError('Erro ao guardar: ' + err.message);
  }
});

function showMedFormError(msg) {
  $('med-form-error').textContent = msg;
  $('med-form-error').hidden = false;
}

$('med-form-delete').addEventListener('click', async () => {
  if (!_editingMedId) return;
  if (!confirm('Apagar este agendamento? Vai também apagar o histórico associado.')) return;
  try {
    await Store.deleteAgendamento(_editingMedId);
    invalidateMedCaches();
    goToMedicamentos();
  } catch (err) {
    showMedFormError('Erro ao apagar: ' + err.message);
  }
});

$('med-form-back').addEventListener('click', () => goToMedicamentos());

// ============================================
// MEDIÇÕES (tensão arterial e glicemia) — local, igual aos medicamentos
// ============================================

const CONTEXTO_LABELS = {
  'jejum': 'Em jejum',
  'antes-refeicao': 'Antes da refeição',
  'pos-refeicao': 'Depois da refeição',
  'antes-deitar': 'Antes de deitar',
  'outro': 'Outro',
};

let _currentMedicaoTipo = 'tensao';
let _editingMedicaoId = null;

// Formata data ISO para visualização curta
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} · ${hh}:${mm}`;
}

// Para o input datetime-local (formato YYYY-MM-DDTHH:MM, sem segundos)
function nowDatetimeLocal() {
  const d = new Date();
  const tzo = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzo * 60000);
  return local.toISOString().slice(0, 16);
}
function isoFromDatetimeLocal(value) {
  // 'YYYY-MM-DDTHH:MM' -> 'YYYY-MM-DDTHH:MM:00.000Z' (em hora local interpretada como local)
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return d.toISOString();
}
function datetimeLocalFromISO(iso) {
  if (!iso) return nowDatetimeLocal();
  const d = new Date(iso);
  const tzo = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzo * 60000);
  return local.toISOString().slice(0, 16);
}

// ---------- Página Medições ----------

async function goToMedicoes(tipo = 'tensao') {
  _currentMedicaoTipo = tipo;
  showView('medicoes');
  syncSegmented();
  await renderMedicoesContent();
}

function syncSegmented() {
  document.querySelectorAll('.segmented__btn').forEach(btn => {
    const active = btn.dataset.tipo === _currentMedicaoTipo;
    btn.classList.toggle('segmented__btn--active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

async function renderMedicoesContent() {
  const wrap = $('medicoes-content');
  wrap.innerHTML = '<p class="loading">A carregar…</p>';

  const tipo = _currentMedicaoTipo;
  const medicoes = await Store.getMedicoes(tipo);

  const ultima = medicoes[0] || null;
  const resto = medicoes.slice(1);

  let html = '';

  // Card "Última medição"
  if (ultima) {
    html += renderMedicaoUltimaCard(ultima, tipo);
  } else {
    html += `
      <div class="medicao-ultima medicao-ultima--vazia">
        <div>Ainda não há medições. Toque no <strong>+</strong> para adicionar a primeira.</div>
      </div>
    `;
  }

  // Histórico
  if (resto.length > 0) {
    html += `<h2 class="medicao-historico__title">Histórico</h2>`;
    html += `<ul class="medicao-lista">${resto.map(m => renderMedicaoItem(m, tipo)).join('')}</ul>`;
  } else if (ultima) {
    html += `<p class="medicoes-empty" style="margin-top:14px">Apenas uma medição registada por agora.</p>`;
  }

  wrap.innerHTML = html;

  // Ligar cliques nos items (abre form de edição)
  wrap.querySelectorAll('.medicao-item').forEach(item => {
    item.addEventListener('click', () => {
      goToMedicaoForm('edit', item.dataset.id, tipo);
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
    });
  });
}

function renderMedicaoUltimaCard(m, tipo) {
  if (tipo === 'tensao') {
    const pulso = m.pulso ? ` · pulso ${m.pulso} bpm` : '';
    return `
      <div class="medicao-ultima">
        <div class="medicao-ultima__label">Última medição</div>
        <div class="medicao-ultima__valor">${m.sistolica}/${m.diastolica}<small>mmHg</small></div>
        <div class="medicao-ultima__sub">${formatDateTime(m.data_hora)}${pulso}</div>
      </div>
    `;
  } else {
    const ctx = m.contexto ? ` · ${CONTEXTO_LABELS[m.contexto] || m.contexto}` : '';
    return `
      <div class="medicao-ultima">
        <div class="medicao-ultima__label">Última medição</div>
        <div class="medicao-ultima__valor">${m.valor}<small>mg/dL</small></div>
        <div class="medicao-ultima__sub">${formatDateTime(m.data_hora)}${ctx}</div>
      </div>
    `;
  }
}

function renderMedicaoItem(m, tipo) {
  if (tipo === 'tensao') {
    const pulso = m.pulso ? `pulso ${m.pulso}` : '';
    return `
      <li class="medicao-item" data-id="${escapeHTML(m.id)}" role="button" tabindex="0">
        <span class="medicao-item__valor">${m.sistolica}/${m.diastolica}</span>
        <span class="medicao-item__info">
          <span class="medicao-item__quando">${formatDateTime(m.data_hora)}</span>
          ${pulso ? `<span>${pulso} bpm</span>` : ''}
        </span>
      </li>
    `;
  } else {
    const ctx = m.contexto ? CONTEXTO_LABELS[m.contexto] || m.contexto : '';
    return `
      <li class="medicao-item" data-id="${escapeHTML(m.id)}" role="button" tabindex="0">
        <span class="medicao-item__valor">${m.valor}</span>
        <span class="medicao-item__info">
          <span class="medicao-item__quando">${formatDateTime(m.data_hora)}</span>
          ${ctx ? `<span class="medicao-item__contexto">${escapeHTML(ctx)}</span>` : ''}
        </span>
      </li>
    `;
  }
}

// Liga segmentos Tensão/Glicemia
document.querySelectorAll('.segmented__btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    _currentMedicaoTipo = btn.dataset.tipo;
    syncSegmented();
    await renderMedicoesContent();
  });
});

$('medicoes-back').addEventListener('click', () => goToDashboard());
$('medicoes-add').addEventListener('click', () => goToMedicaoForm('new', null, _currentMedicaoTipo));
$('dashboard-medicoes').addEventListener('click', () => goToMedicoes('tensao'));

// ---------- Formulário medição ----------

async function goToMedicaoForm(modo, id, tipo) {
  _editingMedicaoId = (modo === 'edit') ? id : null;
  const tipoFinal = tipo || _currentMedicaoTipo;

  // Mostrar/esconder grupos de campos conforme o tipo
  $('medicao-fields-tensao').hidden = (tipoFinal !== 'tensao');
  $('medicao-fields-glicemia').hidden = (tipoFinal !== 'glicemia');
  $('medicao-form-tipo').value = tipoFinal;

  $('medicao-form-error').hidden = true;

  if (modo === 'edit') {
    const m = await Store.getMedicaoById(id);
    if (m) fillMedicaoForm(m);
    $('medicao-form-delete').hidden = false;
    $('medicao-form-title').textContent = (tipoFinal === 'tensao') ? 'Editar tensão' : 'Editar glicemia';
  } else {
    clearMedicaoForm();
    $('medicao-form-delete').hidden = true;
    $('medicao-form-title').textContent = (tipoFinal === 'tensao') ? 'Nova medição de tensão' : 'Nova medição de glicemia';
  }

  showView('medicao-form');
}

function clearMedicaoForm() {
  $('medicao-form-id').value = '';
  $('medicao-form-sistolica').value = '';
  $('medicao-form-diastolica').value = '';
  $('medicao-form-pulso').value = '';
  $('medicao-form-valor').value = '';
  $('medicao-form-contexto').value = '';
  $('medicao-form-datahora').value = nowDatetimeLocal();
  $('medicao-form-notas').value = '';
}

function fillMedicaoForm(m) {
  $('medicao-form-id').value = m.id;
  if (m.tipo === 'tensao') {
    $('medicao-form-sistolica').value = m.sistolica || '';
    $('medicao-form-diastolica').value = m.diastolica || '';
    $('medicao-form-pulso').value = m.pulso || '';
  } else {
    $('medicao-form-valor').value = m.valor || '';
    $('medicao-form-contexto').value = m.contexto || '';
  }
  $('medicao-form-datahora').value = datetimeLocalFromISO(m.data_hora);
  $('medicao-form-notas').value = m.notas || '';
}

$('medicao-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('medicao-form-error').hidden = true;

  const tipo = $('medicao-form-tipo').value;
  const dataHoraISO = isoFromDatetimeLocal($('medicao-form-datahora').value);
  const notas = $('medicao-form-notas').value.trim();

  const row = {
    tipo,
    data_hora: dataHoraISO,
    notas: notas || null,
  };

  if (tipo === 'tensao') {
    const sis = parseInt($('medicao-form-sistolica').value, 10);
    const dia = parseInt($('medicao-form-diastolica').value, 10);
    const pulso = $('medicao-form-pulso').value;
    if (!sis || !dia) {
      showMedicaoFormError('Indique a sistólica e a diastólica.');
      return;
    }
    if (sis <= dia) {
      showMedicaoFormError('A sistólica (máxima) tem de ser maior que a diastólica (mínima).');
      return;
    }
    row.sistolica = sis;
    row.diastolica = dia;
    row.pulso = pulso ? parseInt(pulso, 10) : null;
  } else if (tipo === 'glicemia') {
    const valor = parseInt($('medicao-form-valor').value, 10);
    if (!valor) {
      showMedicaoFormError('Indique o valor da glicemia.');
      return;
    }
    row.valor = valor;
    row.contexto = $('medicao-form-contexto').value || null;
  }

  try {
    if (_editingMedicaoId) {
      await Store.updateMedicao(_editingMedicaoId, row);
    } else {
      await Store.addMedicao(row);
    }
    goToMedicoes(tipo);
  } catch (err) {
    showMedicaoFormError('Erro ao guardar: ' + err.message);
  }
});

function showMedicaoFormError(msg) {
  $('medicao-form-error').textContent = msg;
  $('medicao-form-error').hidden = false;
}

$('medicao-form-delete').addEventListener('click', async () => {
  if (!_editingMedicaoId) return;
  if (!confirm('Apagar esta medição?')) return;
  try {
    await Store.deleteMedicao(_editingMedicaoId);
    goToMedicoes(_currentMedicaoTipo);
  } catch (err) {
    showMedicaoFormError('Erro ao apagar: ' + err.message);
  }
});

$('medicao-form-back').addEventListener('click', () => goToMedicoes(_currentMedicaoTipo));

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

  // Restaurar agendamento de notificações se o utente as activou anteriormente
  if (Notifications.isEnabled() && Notifications.permissionStatus() === 'granted') {
    Notifications.reschedule().catch(() => {});
  }
})();

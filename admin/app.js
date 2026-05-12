// ============================================
// Painel Admin · abem:
// Login com Supabase Auth + gestão completa
// ============================================

const SUPABASE_URL = 'https://hhozgecuyczrbvyzvaoz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhob3pnZWN1eWN6cmJ2eXp2YW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MjI1MjEsImV4cCI6MjA3NTA5ODUyMX0.s4kvjFEBlSP9ZL2BMrVLPNGfk2bs1Qny5WPaWNlVlD8';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper rápido
function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }
function escapeHTML(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function showView(name) {
  $$('.admin-view').forEach(v => {
    v.hidden = (v.dataset.view !== name);
  });
}

function showSection(name) {
  $$('.admin-section').forEach(s => { s.hidden = !s.id.endsWith(name); });
  $$('.admin-nav__btn').forEach(b => {
    b.classList.toggle('admin-nav__btn--active', b.dataset.section === name);
  });
}

// ============================================
// SESSÃO + LOGIN
// ============================================

let _adminProfile = null; // { user_id, nome, cargo }

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    showView('login');
    return false;
  }
  // Verificar se este user_id é admin
  const { data: admin, error } = await sb.from('admins')
    .select('user_id, nome, cargo')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !admin) {
    // Não é admin — força logout
    await sb.auth.signOut();
    showLoginError('Esta conta não tem permissões de administrador.');
    showView('login');
    return false;
  }

  _adminProfile = admin;
  $('admin-nome').textContent = admin.nome;
  showView('app');
  await loadDashboard();
  return true;
}

function showLoginError(msg) {
  const el = $('login-error');
  el.textContent = msg;
  el.hidden = false;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').hidden = true;

  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) {
    showLoginError('Indique email e password.');
    return;
  }

  const btn = e.submitter || e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'A entrar…';

  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = original;

  if (error) {
    showLoginError('Credenciais inválidas.');
    return;
  }
  await checkSession();
});

$('admin-logout').addEventListener('click', async () => {
  if (!confirm('Terminar sessão?')) return;
  await sb.auth.signOut();
  _adminProfile = null;
  $('login-form').reset();
  showView('login');
});

// ============================================
// NAVEGAÇÃO ENTRE SECÇÕES
// ============================================

$$('.admin-nav__btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const sec = btn.dataset.section;
    showSection(sec);
    if (sec === 'dashboard') await loadDashboard();
    else if (sec === 'utilizadores') await loadUtilizadores();
    else if (sec === 'pontuacoes') await loadPontuacoes();
    else if (sec === 'recompensas') await loadRecompensas();
  });
});

// ============================================
// DASHBOARD
// ============================================

async function loadDashboard() {
  // Stats globais em paralelo
  const [utilizadoresCount, resultadosAll, recompensasCount, top10, recRecentes] = await Promise.all([
    sb.from('Utilizadores').select('*', { count: 'exact', head: true }),
    sb.from('resultados').select('percentagem'),
    sb.from('recompensas').select('*', { count: 'exact', head: true }),
    sb.from('resultados')
      .select('numero_beneficiario, nivel_nome, percentagem, acertos, total_perguntas, criado_em')
      .order('percentagem', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(10),
    sb.from('recompensas')
      .select('id, numero_beneficiario, tipo, titulo, criado_em')
      .order('criado_em', { ascending: false })
      .limit(5),
  ]);

  $('stat-utilizadores').textContent = utilizadoresCount.count ?? '—';
  const totalResultados = resultadosAll.data?.length || 0;
  $('stat-quizzes').textContent = totalResultados;
  $('stat-recompensas').textContent = recompensasCount.count ?? '—';

  if (totalResultados > 0) {
    const media = Math.round(
      resultadosAll.data.reduce((s, r) => s + (r.percentagem || 0), 0) / totalResultados
    );
    $('stat-media').textContent = `${media}%`;
  } else {
    $('stat-media').textContent = '—';
  }

  renderTop10(top10.data || []);
  renderRecompensasRecentes(recRecentes.data || []);
}

function renderTop10(rows) {
  const wrap = $('top10');
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="empty">Ainda sem resultados de quizzes.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>#</th><th>Beneficiário</th><th>Nível</th><th class="num">Pontuação</th><th>Data</th></tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr class="clickable" data-numero="${escapeHTML(r.numero_beneficiario)}">
            <td class="num">${i + 1}</td>
            <td>${escapeHTML(r.numero_beneficiario)}</td>
            <td>${escapeHTML(r.nivel_nome || '—')}</td>
            <td class="num">${r.percentagem}% <small>(${r.acertos}/${r.total_perguntas})</small></td>
            <td>${formatDateShort(r.criado_em)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('tr.clickable').forEach(tr => {
    tr.addEventListener('click', () => goToDetalheUtilizador(tr.dataset.numero));
  });
}

function renderRecompensasRecentes(rows) {
  const wrap = $('recompensas-recentes');
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="empty">Ainda nenhuma recompensa atribuída.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>Beneficiário</th><th>Tipo</th><th>Título</th><th>Data</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="clickable" data-numero="${escapeHTML(r.numero_beneficiario)}">
            <td>${escapeHTML(r.numero_beneficiario)}</td>
            <td><span class="badge badge--${r.tipo}">${r.tipo === 'imagem' ? '🖼️ Imagem' : '🎟️ Voucher'}</span></td>
            <td>${escapeHTML(r.titulo)}</td>
            <td>${formatDateShort(r.criado_em)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('tr.clickable').forEach(tr => {
    tr.addEventListener('click', () => goToDetalheUtilizador(tr.dataset.numero));
  });
}

// ============================================
// UTILIZADORES
// ============================================

let _utilizadoresAll = [];

async function loadUtilizadores() {
  const wrap = $('utilizadores-lista');
  wrap.innerHTML = '<div class="loading">A carregar…</div>';

  const { data, error } = await sb.from('Utilizadores')
    .select('numbeneficiario, anonascimento')
    .order('numbeneficiario');

  if (error) {
    wrap.innerHTML = `<div class="error">Erro: ${escapeHTML(error.message)}</div>`;
    return;
  }
  _utilizadoresAll = data || [];
  renderUtilizadores(_utilizadoresAll);
}

function renderUtilizadores(rows) {
  const wrap = $('utilizadores-lista');
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="empty">Sem utilizadores. Toque em "+ Novo utilizador" para adicionar.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Número de beneficiário</th><th>Ano nascimento</th><th></th></tr></thead>
      <tbody>
        ${rows.map(u => `
          <tr class="clickable" data-numero="${escapeHTML(u.numbeneficiario)}">
            <td><strong>${escapeHTML(u.numbeneficiario)}</strong></td>
            <td>${u.anonascimento}</td>
            <td style="text-align:right">→</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('tr.clickable').forEach(tr => {
    tr.addEventListener('click', () => goToDetalheUtilizador(tr.dataset.numero));
  });
}

$('utilizadores-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderUtilizadores(_utilizadoresAll); return; }
  const filtrados = _utilizadoresAll.filter(u =>
    String(u.numbeneficiario).toLowerCase().includes(q)
  );
  renderUtilizadores(filtrados);
});

// ============================================
// DETALHE DO UTILIZADOR
// ============================================

let _detalheNumero = null;

async function goToDetalheUtilizador(numero) {
  _detalheNumero = numero;
  showSection('utilizador-detalhe');

  const wrap = $('detalhe-conteudo');
  wrap.innerHTML = '<div class="loading">A carregar…</div>';

  // Carregar tudo em paralelo
  const [user, resultados, recompensas] = await Promise.all([
    sb.from('Utilizadores')
      .select('numbeneficiario, anonascimento')
      .eq('numbeneficiario', numero)
      .maybeSingle(),
    sb.from('resultados')
      .select('*')
      .eq('numero_beneficiario', numero)
      .order('criado_em', { ascending: false }),
    sb.from('recompensas')
      .select('*')
      .eq('numero_beneficiario', numero)
      .order('criado_em', { ascending: false }),
  ]);

  if (!user.data) {
    wrap.innerHTML = '<div class="error">Utilizador não encontrado.</div>';
    return;
  }

  const u = user.data;
  const res = resultados.data || [];
  const rec = recompensas.data || [];
  const totalQuizzes = res.length;
  const media = totalQuizzes > 0
    ? Math.round(res.reduce((s, r) => s + (r.percentagem || 0), 0) / totalQuizzes)
    : 0;

  wrap.innerHTML = `
    <div class="detalhe-header">
      <div>
        <div class="detalhe-numero">${escapeHTML(u.numbeneficiario)}</div>
        <div class="detalhe-info">Ano de nascimento: ${u.anonascimento}</div>
      </div>
      <button id="atribuir-rec" class="btn btn--primary btn--small">+ Atribuir recompensa</button>
    </div>

    <div class="stats-grid stats-grid--admin">
      <div class="stat-card">
        <span class="stat-card__label">Quizzes feitos</span>
        <span class="stat-card__value">${totalQuizzes}</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Pontuação média</span>
        <span class="stat-card__value">${totalQuizzes > 0 ? media + '%' : '—'}</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__label">Recompensas</span>
        <span class="stat-card__value">${rec.length}</span>
      </div>
    </div>

    <div class="admin-card">
      <h3>Recompensas atribuídas</h3>
      ${rec.length === 0
        ? '<div class="empty">Sem recompensas atribuídas.</div>'
        : rec.map(renderRecompensaCard).join('')
      }
    </div>

    <div class="admin-card">
      <h3>Histórico de quizzes</h3>
      ${res.length === 0
        ? '<div class="empty">Sem quizzes realizados.</div>'
        : `<table class="admin-table">
            <thead><tr><th>Nível</th><th class="num">Resultado</th><th>Data</th></tr></thead>
            <tbody>
              ${res.map(r => `
                <tr>
                  <td>${escapeHTML(r.nivel_nome || '—')}</td>
                  <td class="num">${r.percentagem}% <small>(${r.acertos}/${r.total_perguntas})</small></td>
                  <td>${formatDateShort(r.criado_em)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    </div>
  `;

  $('atribuir-rec').addEventListener('click', () => openModalRecompensa(numero));
}

function renderRecompensaCard(r) {
  const dataStr = formatDateShort(r.criado_em);
  if (r.tipo === 'imagem' && r.imagem_url) {
    return `
      <div class="recompensa-card">
        <img src="${escapeHTML(r.imagem_url)}" alt="" class="recompensa-card__img">
        <div class="recompensa-card__body">
          <div class="recompensa-card__titulo">${escapeHTML(r.titulo)}</div>
          ${r.descricao ? `<div class="recompensa-card__meta">${escapeHTML(r.descricao)}</div>` : ''}
          <div class="recompensa-card__meta">Atribuída em ${dataStr}</div>
        </div>
      </div>
    `;
  }
  // voucher
  return `
    <div class="recompensa-card">
      <div class="recompensa-card__icon">🎟️</div>
      <div class="recompensa-card__body">
        <div class="recompensa-card__titulo">${escapeHTML(r.titulo)}</div>
        ${r.descricao ? `<div class="recompensa-card__meta">${escapeHTML(r.descricao)}</div>` : ''}
        ${r.voucher_codigo ? `<span class="recompensa-card__codigo">${escapeHTML(r.voucher_codigo)}</span>` : ''}
        <div class="recompensa-card__meta">Atribuída em ${dataStr}</div>
      </div>
    </div>
  `;
}

$('detalhe-voltar').addEventListener('click', () => {
  showSection('utilizadores');
});

// ============================================
// PONTUAÇÕES (todos, filtrável por nível)
// ============================================

async function loadPontuacoes() {
  const wrap = $('pontuacoes-lista');
  wrap.innerHTML = '<div class="loading">A carregar…</div>';

  // Carregar níveis para o filtro (uma vez)
  const filtroNivel = $('pontuacoes-filtro-nivel');
  if (filtroNivel.options.length <= 1) {
    const { data: niveis } = await sb.from('niveis').select('id, nome').order('id');
    (niveis || []).forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = n.nome;
      filtroNivel.appendChild(opt);
    });
  }

  await applyPontuacoesFiltro();
}

async function applyPontuacoesFiltro() {
  const wrap = $('pontuacoes-lista');
  const filtro = $('pontuacoes-filtro-nivel').value;

  let q = sb.from('resultados')
    .select('numero_beneficiario, nivel_nome, percentagem, acertos, total_perguntas, criado_em, id_nivel')
    .order('percentagem', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(100);

  if (filtro) q = q.eq('id_nivel', parseInt(filtro, 10));

  const { data, error } = await q;
  if (error) {
    wrap.innerHTML = `<div class="error">Erro: ${escapeHTML(error.message)}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    wrap.innerHTML = '<div class="empty">Sem resultados para este filtro.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>#</th><th>Beneficiário</th><th>Nível</th><th class="num">Pontuação</th><th>Data</th></tr>
      </thead>
      <tbody>
        ${data.map((r, i) => `
          <tr class="clickable" data-numero="${escapeHTML(r.numero_beneficiario)}">
            <td class="num">${i + 1}</td>
            <td>${escapeHTML(r.numero_beneficiario)}</td>
            <td>${escapeHTML(r.nivel_nome || '—')}</td>
            <td class="num">${r.percentagem}% <small>(${r.acertos}/${r.total_perguntas})</small></td>
            <td>${formatDateShort(r.criado_em)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('tr.clickable').forEach(tr => {
    tr.addEventListener('click', () => goToDetalheUtilizador(tr.dataset.numero));
  });
}

$('pontuacoes-filtro-nivel').addEventListener('change', applyPontuacoesFiltro);

// ============================================
// RECOMPENSAS (todas)
// ============================================

async function loadRecompensas() {
  const wrap = $('recompensas-lista');
  wrap.innerHTML = '<div class="loading">A carregar…</div>';

  const { data, error } = await sb.from('recompensas')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(200);

  if (error) {
    wrap.innerHTML = `<div class="error">Erro: ${escapeHTML(error.message)}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    wrap.innerHTML = '<div class="empty">Ainda nenhuma recompensa atribuída.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>Beneficiário</th><th>Tipo</th><th>Título</th><th>Código/Imagem</th><th>Data</th></tr>
      </thead>
      <tbody>
        ${data.map(r => `
          <tr class="clickable" data-numero="${escapeHTML(r.numero_beneficiario)}">
            <td><strong>${escapeHTML(r.numero_beneficiario)}</strong></td>
            <td><span class="badge badge--${r.tipo}">${r.tipo === 'imagem' ? '🖼️ Imagem' : '🎟️ Voucher'}</span></td>
            <td>${escapeHTML(r.titulo)}</td>
            <td>${
              r.tipo === 'imagem' && r.imagem_url
                ? `<img src="${escapeHTML(r.imagem_url)}" style="width:40px;height:40px;border-radius:6px;object-fit:cover">`
                : (r.voucher_codigo ? `<code>${escapeHTML(r.voucher_codigo)}</code>` : '—')
            }</td>
            <td>${formatDateShort(r.criado_em)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('tr.clickable').forEach(tr => {
    tr.addEventListener('click', () => goToDetalheUtilizador(tr.dataset.numero));
  });
}

// ============================================
// MODAL: Atribuir recompensa
// ============================================

function openModalRecompensa(numero) {
  $('rec-beneficiario').textContent = numero;
  $('recompensa-form').reset();
  $('rec-imagem-preview').hidden = true;
  $('rec-error').hidden = true;
  // Default: imagem
  syncTipoUI('imagem');
  $('modal-recompensa').hidden = false;
}

function syncTipoUI(tipo) {
  $('rec-imagem-wrap').hidden = (tipo !== 'imagem');
  $('rec-voucher-wrap').hidden = (tipo !== 'voucher');
}

$$('input[name="rec-tipo"]').forEach(r => {
  r.addEventListener('change', () => syncTipoUI(r.value));
});

// Preview da imagem
$('rec-imagem').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const prev = $('rec-imagem-preview');
  if (!file) { prev.hidden = true; return; }
  if (file.size > 2 * 1024 * 1024) {
    $('rec-error').textContent = 'Imagem maior que 2 MB. Reduza o tamanho.';
    $('rec-error').hidden = false;
    e.target.value = '';
    prev.hidden = true;
    return;
  }
  $('rec-error').hidden = true;
  const url = URL.createObjectURL(file);
  prev.innerHTML = `<img src="${url}" alt="Pré-visualização">`;
  prev.hidden = false;
});

// Submeter recompensa
$('recompensa-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('rec-error').hidden = true;

  const numero = $('rec-beneficiario').textContent;
  const tipo = document.querySelector('input[name="rec-tipo"]:checked').value;
  const titulo = $('rec-titulo').value.trim();
  const descricao = $('rec-descricao').value.trim();

  if (!titulo) {
    showRecError('Indique um título.');
    return;
  }

  const btn = e.submitter || e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'A guardar…';

  try {
    const row = {
      numero_beneficiario: numero,
      tipo,
      titulo,
      descricao: descricao || null,
      atribuido_por: _adminProfile?.user_id || null,
    };

    if (tipo === 'imagem') {
      const file = $('rec-imagem').files[0];
      if (!file) throw new Error('Escolha uma imagem.');
      // Upload para Storage
      const ext = file.name.split('.').pop();
      const path = `${numero}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from('recompensas').upload(path, file);
      if (upErr) throw upErr;
      const { data: { publicUrl } } = sb.storage.from('recompensas').getPublicUrl(path);
      row.imagem_url = publicUrl;
    } else {
      const codigo = $('rec-voucher-codigo').value.trim();
      if (!codigo) throw new Error('Indique o código do voucher.');
      row.voucher_codigo = codigo;
    }

    const { error } = await sb.from('recompensas').insert(row);
    if (error) throw error;

    closeModais();
    // Refrescar a vista actual
    if (_detalheNumero) await goToDetalheUtilizador(_detalheNumero);
  } catch (err) {
    showRecError('Erro: ' + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Atribuir';
  }
});

function showRecError(msg) {
  $('rec-error').textContent = msg;
  $('rec-error').hidden = false;
}

// ============================================
// MODAL: Novo utilizador
// ============================================

$('utilizador-novo').addEventListener('click', () => {
  $('utilizador-form').reset();
  $('user-error').hidden = true;
  $('modal-utilizador').hidden = false;
});

$('utilizador-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('user-error').hidden = true;

  const numero = $('user-numero').value.trim();
  const ano = parseInt($('user-ano').value, 10);

  if (!numero || !ano) {
    $('user-error').textContent = 'Preencha número e ano.';
    $('user-error').hidden = false;
    return;
  }

  const btn = e.submitter || e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'A guardar…';

  const { error } = await sb.from('Utilizadores').insert({
    numbeneficiario: numero,
    anonascimento: ano,
  });

  btn.disabled = false;
  btn.textContent = 'Criar';

  if (error) {
    $('user-error').textContent = error.code === '23505'
      ? 'Já existe um utilizador com esse número.'
      : 'Erro: ' + error.message;
    $('user-error').hidden = false;
    return;
  }

  closeModais();
  await loadUtilizadores();
});

// ============================================
// MODAL — fechar
// ============================================

function closeModais() {
  $$('.modal').forEach(m => m.hidden = true);
}

$$('[data-modal-close]').forEach(el => {
  el.addEventListener('click', closeModais);
});

// Esc fecha modais
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModais();
});

// ============================================
// UTILS
// ============================================

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================
// ARRANQUE
// ============================================

(async function init() {
  await checkSession();
})();

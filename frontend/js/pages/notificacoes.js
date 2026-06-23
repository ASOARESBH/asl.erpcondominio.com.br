/**
 * notificacoes.js — Módulo de Configuração de Notificações
 * Versão: 1.0 | 2026-06-22
 */
'use strict';

const _API = '/api/api_notificacoes_os.php';
let _listeners = [];
let _usuarios   = [];
let _regraAtual = null;

// ─── Lifecycle ────────────────────────────────────────────────────────────
export function init() {
    console.log('[Notificacoes] Inicializando módulo...');
    _carregarRegrasOS();
    _carregarUsuarios();
    _bindModal();
}

export function destroy() {
    _listeners.forEach(({ el, ev, fn }) => el.removeEventListener(ev, fn));
    _listeners = [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function _on(el, ev, fn) {
    if (!el) return;
    el.addEventListener(ev, fn);
    _listeners.push({ el, ev, fn });
}

async function _get(acao, params = {}) {
    const qs = new URLSearchParams({ acao, ...params }).toString();
    const r  = await fetch(`${_API}?${qs}`, { credentials: 'include' });
    return r.json();
}

async function _post(acao, body = {}) {
    const r = await fetch(`${_API}?acao=${acao}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, ...body })
    });
    return r.json();
}

// ─── Carregar regras de O.S ───────────────────────────────────────────────
async function _carregarRegrasOS() {
    const lista  = document.getElementById('regras-os');
    const badge  = document.getElementById('badge-os');
    if (!lista) return;

    lista.innerHTML = '<div class="notif-loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

    const json = await _get('listar_regras', { modulo: 'os' });
    if (!json.sucesso || !json.dados) {
        lista.innerHTML = '<div class="notif-loading">Erro ao carregar regras.</div>';
        return;
    }

    const regras = json.dados;
    const ativas = regras.filter(r => r.ativo == 1).length;

    if (badge) {
        badge.textContent = ativas > 0 ? `${ativas} ativa${ativas > 1 ? 's' : ''}` : 'Nenhuma ativa';
        badge.className   = 'notif-modulo-badge' + (ativas > 0 ? ' ativas' : '');
    }

    if (!regras.length) {
        lista.innerHTML = '<div class="notif-loading">Nenhuma regra encontrada.</div>';
        return;
    }

    const _labelEvento = {
        'os_criada':            'Notificar sempre que uma O.S for criada',
        'os_aberta_horas':      'O.S em aberto por mais de X horas',
        'os_prioridade_urgente':'O.S com prioridade Urgente criada',
        'os_prioridade_alta':   'O.S com prioridade Alta criada',
    };

    lista.innerHTML = regras.map(r => {
        const canais = (r.canais || 'sistema').split(',').map(c => c.trim()).filter(Boolean);
        const canalTags = canais.map(c => {
            const iconMap = { sistema: 'fas fa-desktop', email: 'fas fa-envelope', whatsapp: 'fab fa-whatsapp', telegram: 'fab fa-telegram' };
            const labels  = { sistema: 'Sistema', email: 'E-mail', whatsapp: 'WhatsApp', telegram: 'Telegram' };
            return `<span class="notif-canal-tag ${c}"><i class="${iconMap[c] || 'fas fa-bell'}"></i>${labels[c] || c}</span>`;
        }).join('');

        let desc = _labelEvento[r.evento] || r.evento;
        if (r.evento === 'os_aberta_horas' && r.horas_limite)
            desc = `Alertar quando aberta há mais de <strong>${r.horas_limite}h</strong>`;
        else if (r.evento.startsWith('os_prioridade') && r.prioridade)
            desc = `Alertar quando prioridade for <strong>${r.prioridade}</strong>`;

        return `<div class="notif-regra-item ${r.ativo == 1 ? '' : 'inativa'}" data-id="${r.id}">
            <div class="notif-regra-status-dot ${r.ativo == 1 ? 'ativa' : ''}"></div>
            <div class="notif-regra-info">
                <p class="notif-regra-titulo">${_labelEvento[r.evento] || r.evento}</p>
                <p class="notif-regra-desc">${desc}</p>
            </div>
            <div class="notif-regra-canais">${canalTags}</div>
            <button class="notif-regra-btn-editar" onclick="window._notifEditarRegra(${r.id})">
                <i class="fas fa-pencil-alt"></i> Configurar
            </button>
        </div>`;
    }).join('');
}

// ─── Carregar usuários ────────────────────────────────────────────────────
async function _carregarUsuarios() {
    try {
        const r    = await fetch('/api/api_usuarios.php', { credentials: 'include' });
        const json = await r.json();
        _usuarios  = Array.isArray(json.dados) ? json.dados : [];
    } catch (e) {
        _usuarios = [];
    }
}

// ─── Bind do modal ────────────────────────────────────────────────────────
function _bindModal() {
    const overlay    = document.getElementById('notif-modal-overlay');
    const btnClose   = document.getElementById('notif-modal-close');
    const btnCancel  = document.getElementById('notif-btn-cancelar');
    const btnSalvar  = document.getElementById('notif-btn-salvar');
    const canalEmail = document.getElementById('canal-email');

    _on(btnClose,   'click', _fecharModal);
    _on(btnCancel,  'click', _fecharModal);
    _on(overlay,    'click', (e) => { if (e.target === overlay) _fecharModal(); });
    _on(btnSalvar,  'click', _salvarRegra);
    _on(canalEmail, 'change', () => {
        const grp = document.getElementById('notif-emails-group');
        if (grp) grp.style.display = canalEmail.checked ? '' : 'none';
    });
}

function _fecharModal() {
    const overlay = document.getElementById('notif-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    _regraAtual = null;
}

// ─── Abrir modal de edição ────────────────────────────────────────────────
window._notifEditarRegra = async function(id) {
    const json = await _get('listar_regras', { modulo: 'os' });
    if (!json.sucesso) return;
    const regra = json.dados.find(r => r.id == id);
    if (!regra) return;
    _regraAtual = regra;

    const overlay = document.getElementById('notif-modal-overlay');
    if (!overlay) return;

    document.getElementById('notif-regra-id').value     = regra.id;
    document.getElementById('notif-regra-evento').value  = regra.evento;
    document.getElementById('notif-ativo').checked       = regra.ativo == 1;
    document.getElementById('notif-titulo-tpl').value    = regra.titulo_tpl || '';
    document.getElementById('notif-corpo-tpl').value     = regra.corpo_tpl  || '';

    const canais = (regra.canais || 'sistema').split(',').map(c => c.trim());
    ['sistema','email','whatsapp','telegram'].forEach(c => {
        const el = document.getElementById(`canal-${c}`);
        if (el) el.checked = canais.includes(c);
    });

    const grpHoras  = document.getElementById('notif-horas-group');
    const grpPrior  = document.getElementById('notif-prioridade-group');
    const grpEmails = document.getElementById('notif-emails-group');

    if (grpHoras)  grpHoras.style.display  = regra.evento === 'os_aberta_horas' ? '' : 'none';
    if (grpPrior)  grpPrior.style.display  = regra.evento.startsWith('os_prioridade') ? '' : 'none';
    if (grpEmails) grpEmails.style.display = canais.includes('email') ? '' : 'none';

    const horasEl = document.getElementById('notif-horas-limite');
    if (horasEl) horasEl.value = regra.horas_limite || '';

    const priorEl = document.getElementById('notif-prioridade');
    if (priorEl) priorEl.value = regra.prioridade || '';

    const emailEl = document.getElementById('notif-emails');
    if (emailEl) emailEl.value = regra.emails || '';

    _renderizarUsuarios(regra.usuarios_ids || '');

    const _labels = {
        'os_criada':            'O.S Criada',
        'os_aberta_horas':      'O.S em Aberto por X Horas',
        'os_prioridade_urgente':'O.S Urgente',
        'os_prioridade_alta':   'O.S Alta Prioridade',
    };
    const titulo = document.getElementById('notif-modal-titulo');
    if (titulo) titulo.innerHTML = `<i class="fas fa-bell"></i> Configurar: ${_labels[regra.evento] || regra.evento}`;

    overlay.style.display = 'flex';
};

function _renderizarUsuarios(uidsSelecionados) {
    const lista = document.getElementById('notif-usuarios-lista');
    if (!lista) return;
    const selecionados = String(uidsSelecionados).split(',').map(s => s.trim()).filter(Boolean);

    if (!_usuarios.length) {
        lista.innerHTML = '<span style="font-size:.8rem;color:#94a3b8;">Nenhum usuário encontrado.</span>';
        return;
    }

    lista.innerHTML = _usuarios.map(u => {
        const sel = selecionados.includes(String(u.id));
        return `<div class="notif-usuario-item ${sel ? 'selecionado' : ''}" data-uid="${u.id}" onclick="this.classList.toggle('selecionado')">
            <i class="fas fa-user"></i> ${u.nome || u.login}
        </div>`;
    }).join('');
}

// ─── Salvar regra ─────────────────────────────────────────────────────────
async function _salvarRegra() {
    const id = parseInt(document.getElementById('notif-regra-id').value || '0');
    if (!id) return;

    const canaisSelecionados = ['sistema','email','whatsapp','telegram']
        .filter(c => document.getElementById(`canal-${c}`)?.checked)
        .join(',') || 'sistema';

    const uidsSelecionados = Array.from(
        document.querySelectorAll('#notif-usuarios-lista .notif-usuario-item.selecionado')
    ).map(el => el.dataset.uid).join(',');

    const body = {
        id,
        ativo:        document.getElementById('notif-ativo').checked ? 1 : 0,
        canais:       canaisSelecionados,
        emails:       document.getElementById('notif-emails')?.value || '',
        usuarios_ids: uidsSelecionados,
        horas_limite: document.getElementById('notif-horas-limite')?.value || '',
        prioridade:   document.getElementById('notif-prioridade')?.value || '',
        titulo_tpl:   document.getElementById('notif-titulo-tpl').value,
        corpo_tpl:    document.getElementById('notif-corpo-tpl').value,
    };

    const btn = document.getElementById('notif-btn-salvar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    const json = await _post('salvar_regra', body);

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Configuração'; }

    if (json.sucesso) {
        _fecharModal();
        _carregarRegrasOS();
        _toast('Configuração salva com sucesso!', 'success');
    } else {
        _toast(json.mensagem || 'Erro ao salvar.', 'error');
    }
}

// ─── Toast ────────────────────────────────────────────────────────────────
function _toast(msg, tipo = 'success') {
    let t = document.getElementById('notif-page-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'notif-page-toast';
        t.style.cssText = 'position:fixed;bottom:2rem;right:2rem;z-index:999999;padding:.875rem 1.25rem;border-radius:10px;font-size:.875rem;font-weight:600;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.2);transition:opacity .3s;';
        document.body.appendChild(t);
    }
    t.style.background = tipo === 'success' ? '#22c55e' : '#ef4444';
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

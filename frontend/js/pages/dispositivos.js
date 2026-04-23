/**
 * dispositivos.js — Módulo Dispositivos Control iD — Push Mode v2
 *
 * Arquitetura: Push-only. O dispositivo é o único iniciador de conexão.
 * Sem lógica PULL, cURL, Bridge ou polling de rede.
 *
 * Abas: Dispositivos (CRUD) | Eventos | Fila de Comandos
 */
'use strict';

const API = '../api/api_dispositivos_controlid.php';

const _state = {
    dispositivoEditandoId: null,
    tokenDispositivoId: null,
    tokenAtual: '',
    evPagina: 1,
    _listeners: [],
};

// ─────────────────────────────────────────────
// Ciclo de vida
// ─────────────────────────────────────────────

export function init() {
    console.log('[Dispositivos] init()');
    _setupTabs();
    _setupDispositivosTab();
    _setupEventosTab();
    _setupFilaTab();
    _carregarDispositivos();
    window.DispModule = _publicAPI();
}

export function destroy() {
    console.log('[Dispositivos] destroy()');
    _state._listeners.forEach(({ el, ev, fn }) => el.removeEventListener(ev, fn));
    _state._listeners = [];
    window.DispModule = null;
    _state.dispositivoEditandoId = null;
    _state.tokenDispositivoId    = null;
}

// ─────────────────────────────────────────────
// Abas
// ─────────────────────────────────────────────

function _setupTabs() {
    document.querySelectorAll('.page-dispositivos .tab-btn').forEach(btn => {
        const fn = () => {
            document.querySelectorAll('.page-dispositivos .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.page-dispositivos .tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            const el  = document.getElementById('tab-' + tab);
            if (el) el.classList.add('active');
            if (tab === 'eventos') _carregarEventos();
            if (tab === 'fila')    _carregarFila();
        };
        _on(btn, 'click', fn);
    });
}

// ─────────────────────────────────────────────
// Aba: Dispositivos
// ─────────────────────────────────────────────

function _setupDispositivosTab() {
    _on(_el('btnDispSalvar'),  'click', _salvarDispositivo);
    _on(_el('btnDispCancelar'),'click', _cancelarEdicao);
    _on(_el('btnDispBuscar'),  'click', _carregarDispositivos);
    _on(_el('disp-busca'), 'keydown', e => { if (e.key === 'Enter') _carregarDispositivos(); });
}

async function _carregarDispositivos() {
    const busca  = _val('disp-busca');
    const lista  = _el('disp-lista');
    lista.innerHTML = _spinnerHTML('Carregando...');

    const data = await _apiGet(`${API}?acao=listar&busca=${encodeURIComponent(busca)}`);
    if (!data?.sucesso) {
        lista.innerHTML = _emptyHTML('Erro ao carregar dispositivos.');
        return;
    }

    const devs = data.dispositivos ?? [];
    if (devs.length === 0) {
        lista.innerHTML = _emptyHTML('Nenhum dispositivo cadastrado. Adicione o primeiro acima.');
        return;
    }

    lista.innerHTML = devs.map(d => `
      <div class="disp-card" style="display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;margin-bottom:8px;transition:box-shadow .2s;">
        <div style="width:42px;height:42px;border-radius:10px;background:${d.online ? '#dcfce7' : '#f1f5f9'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="fas fa-microchip" style="font-size:18px;color:${d.online ? '#16a34a' : '#94a3b8'};"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:#1e293b;">${_esc(d.nome_dispositivo)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;font-family:monospace;">${_esc(d.serial_number)}</div>
          ${d.descricao ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px;">${_esc(d.descricao)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
          <span style="font-size:11px;padding:3px 10px;border-radius:999px;font-weight:600;background:${d.online ? '#dcfce7' : '#f1f5f9'};color:${d.online ? '#166534' : '#64748b'};">
            ${d.online ? '● Online' : '○ Offline'}
          </span>
          ${d.ultimo_keep_alive
            ? `<span style="font-size:11px;color:#94a3b8;">Último ping: ${_fmtDatetime(d.ultimo_keep_alive)}</span>`
            : '<span style="font-size:11px;color:#94a3b8;">Nunca conectado</span>'}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="action-btn edit" title="Editar" onclick="window.DispModule?.editarDispositivo(${d.id})">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn" title="Token" onclick="window.DispModule?.verToken(${d.id})"
            style="background:#eff6ff;color:#2563eb;border-color:#bfdbfe;">
            <i class="fas fa-key"></i>
          </button>
          <button class="action-btn delete" title="Excluir" onclick="window.DispModule?.excluirDispositivo(${d.id}, '${_esc(d.nome_dispositivo)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`).join('');

    // Popula selects de outras abas
    _popularSelectDispositivos(devs);
}

async function _salvarDispositivo() {
    const nome   = _val('disp-nome').trim();
    const serial = _val('disp-serial').trim();
    const desc   = _val('disp-descricao').trim();

    if (!nome || !serial) {
        _toast('Nome e Serial Number são obrigatórios.', 'error');
        return;
    }

    const btn = _el('btnDispSalvar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    const payload = { nome_dispositivo: nome, serial_number: serial, descricao: desc };
    let data;

    if (_state.dispositivoEditandoId) {
        data = await _apiPost(`${API}?acao=atualizar`, { id: _state.dispositivoEditandoId, ...payload });
    } else {
        data = await _apiPost(`${API}?acao=criar`, payload);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar Dispositivo';

    if (!data?.sucesso) {
        _toast(data?.erro ?? 'Erro ao salvar.', 'error');
        return;
    }

    if (!_state.dispositivoEditandoId && data.token_autenticacao) {
        _mostrarToken(data.id, data.token_autenticacao);
    } else if (!_state.dispositivoEditandoId) {
        _toast(data.reativado ? 'Dispositivo reativado com sucesso.' : 'Dispositivo cadastrado com sucesso.', 'success');
    } else {
        _toast('Dispositivo atualizado com sucesso.', 'success');
    }

    _cancelarEdicao();
    _carregarDispositivos();
}

async function _editarDispositivo(id) {
    const data = await _apiGet(`${API}?acao=obter&id=${id}`);
    if (!data?.sucesso || !data.dispositivo) {
        _toast('Erro ao carregar dispositivo.', 'error');
        return;
    }
    const d = data.dispositivo;
    _state.dispositivoEditandoId = id;

    _setVal('disp-nome',      d.nome_dispositivo);
    _setVal('disp-serial',    d.serial_number);
    _setVal('disp-descricao', d.descricao ?? '');

    _el('disp-serial').disabled = true; // serial imutável após criação
    _el('disp-form-titulo').innerHTML = '<i class="fas fa-edit"></i> Editar Dispositivo';
    _el('btnDispCancelar').style.display = 'inline-flex';

    _el('disp-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _cancelarEdicao() {
    _state.dispositivoEditandoId = null;
    _setVal('disp-nome',      '');
    _setVal('disp-serial',    '');
    _setVal('disp-descricao', '');
    _el('disp-serial').disabled = false;
    _el('disp-form-titulo').innerHTML = '<i class="fas fa-plus-circle"></i> Novo Dispositivo';
    _el('btnDispCancelar').style.display = 'none';
}

async function _excluirDispositivo(id, nome) {
    if (!confirm(`Desativar o dispositivo "${nome}"?\n\nEle não receberá mais comandos e seus eventos não serão registrados.`)) return;
    const data = await _apiPost(`${API}?acao=excluir`, { id });
    if (data?.sucesso) {
        _toast('Dispositivo desativado.', 'success');
        _carregarDispositivos();
    } else {
        _toast(data?.erro ?? 'Erro ao excluir.', 'error');
    }
}

// ─────────────────────────────────────────────
// Token
// ─────────────────────────────────────────────

async function _verToken(id) {
    const data = await _apiGet(`${API}?acao=obter&id=${id}`);
    if (!data?.sucesso) {
        _toast('Erro ao obter token.', 'error');
        return;
    }
    _mostrarToken(id, data.dispositivo.token_autenticacao);
}

function _mostrarToken(id, token) {
    _state.tokenDispositivoId = id;
    _state.tokenAtual         = token;
    _setVal('token-display', token);
    const overlay = _el('disp-token-overlay');
    overlay.style.display = 'flex';
}

function _copiarToken() {
    navigator.clipboard.writeText(_state.tokenAtual).then(() => {
        _toast('Token copiado!', 'success');
    });
}

async function _regenerarToken() {
    if (!confirm('Gerar um novo token?\n\nO token atual deixará de funcionar imediatamente. Atualize o dispositivo antes de confirmar.')) return;
    const data = await _apiPost(`${API}?acao=gerar_token`, { id: _state.tokenDispositivoId });
    if (!data?.sucesso) {
        _toast(data?.erro ?? 'Erro ao gerar token.', 'error');
        return;
    }
    _state.tokenAtual = data.token_autenticacao;
    _setVal('token-display', data.token_autenticacao);
    _toast('Novo token gerado! Configure no dispositivo.', 'success');
}

// ─────────────────────────────────────────────
// Aba: Eventos
// ─────────────────────────────────────────────

function _setupEventosTab() {
    _on(_el('btnEventosBuscar'), 'click', () => { _state.evPagina = 1; _carregarEventos(); });
    _on(_el('btnEventosRefresh'),'click', () => { _state.evPagina = 1; _carregarEventos(); });
}

async function _carregarEventos() {
    const serial  = _val('ev-filtro-serial');
    const tipo    = _val('ev-filtro-tipo');
    const de      = _val('ev-filtro-de');
    const ate     = _val('ev-filtro-ate');
    const tbody   = _el('ev-tbody');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8;">
      <i class="fas fa-spinner fa-spin"></i></td></tr>`;

    const params = new URLSearchParams({
        acao: 'listar_eventos',
        pagina: String(_state.evPagina),
        ...(serial && { serial_number: serial }),
        ...(tipo   && { tipo_evento: tipo }),
        ...(de     && { data_de: de }),
        ...(ate    && { data_ate: ate }),
    });

    const data = await _apiGet(`${API}?${params}`);
    if (!data?.sucesso) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#ef4444;">Erro ao carregar eventos.</td></tr>`;
        return;
    }

    const evs = data.eventos ?? [];
    if (evs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8;">Nenhum evento encontrado.</td></tr>`;
        _el('ev-paginacao').innerHTML = '';
        return;
    }

    tbody.innerHTML = evs.map(e => `
      <tr>
        <td style="font-family:monospace;color:#64748b;">${e.id}</td>
        <td style="font-family:monospace;font-size:12px;">${_esc(e.serial_number)}</td>
        <td>${e.user_id || '—'}</td>
        <td>${_labelTipoEvento(e.tipo_evento)}</td>
        <td>${_fmtDatetime(e.data_hora)}</td>
      </tr>`).join('');

    _renderPaginacao('ev-paginacao', data.pagina, data.paginas, p => {
        _state.evPagina = p;
        _carregarEventos();
    });
}

// ─────────────────────────────────────────────
// Aba: Fila de Comandos
// ─────────────────────────────────────────────

function _setupFilaTab() {
    _on(_el('btnFilaEnfileirar'), 'click', _enfileirarComando);
    _on(_el('btnFilaRefresh'),    'click', _carregarFila);
    _on(_el('fila-filtro-status'),'change', _carregarFila);
}

async function _carregarFila() {
    const status = _val('fila-filtro-status');
    const tbody  = _el('fila-tbody');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8;">
      <i class="fas fa-spinner fa-spin"></i></td></tr>`;

    const params = new URLSearchParams({
        acao: 'listar_fila',
        ...(status && { status }),
    });

    const data = await _apiGet(`${API}?${params}`);
    if (!data?.sucesso) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#ef4444;">Erro ao carregar fila.</td></tr>`;
        return;
    }

    const cmds = data.comandos ?? [];
    if (cmds.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8;">Nenhum comando na fila.</td></tr>`;
        return;
    }

    // Badge
    const pendentes = cmds.filter(c => c.status === 'pendente').length;
    const badge = _el('badge-fila');
    if (badge) {
        badge.textContent  = String(pendentes);
        badge.style.display = pendentes > 0 ? 'inline' : 'none';
    }

    tbody.innerHTML = cmds.map(c => `
      <tr>
        <td style="font-family:monospace;color:#64748b;">${c.id}</td>
        <td style="font-size:12px;font-family:monospace;">${_esc(c.serial_number)}</td>
        <td><span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${_esc(c.verbo)}</span></td>
        <td style="font-size:12px;font-family:monospace;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(c.endpoint)}">${_esc(c.endpoint)}</td>
        <td>${_labelStatus(c.status)}</td>
        <td style="font-size:12px;">${_fmtDatetime(c.criado_em)}</td>
        <td>
          ${c.status === 'pendente'
            ? `<button class="action-btn delete" title="Cancelar" onclick="window.DispModule?.cancelarComando(${c.id})">
                 <i class="fas fa-ban"></i>
               </button>`
            : '—'}
        </td>
      </tr>`).join('');
}

async function _enfileirarComando() {
    const serial   = _val('fila-serial');
    const verbo    = _val('fila-verbo');
    const endpoint = _val('fila-endpoint').trim();
    const corpoTxt = _val('fila-corpo').trim();

    if (!serial) {
        _toast('Selecione o dispositivo.', 'error');
        return;
    }
    if (!endpoint) {
        _toast('Endpoint é obrigatório.', 'error');
        return;
    }

    let corpo = {};
    if (corpoTxt) {
        try {
            corpo = JSON.parse(corpoTxt);
        } catch {
            _toast('Corpo JSON inválido. Verifique a sintaxe.', 'error');
            return;
        }
    }

    const btn = _el('btnFilaEnfileirar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    const data = await _apiPost(`${API}?acao=enfileirar_comando`, {
        serial_number: serial,
        verbo,
        endpoint,
        corpo_json: corpo,
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enfileirar Comando';

    if (!data?.sucesso) {
        _toast(data?.erro ?? 'Erro ao enfileirar.', 'error');
        return;
    }

    _toast(`Comando #${data.id} enfileirado com sucesso.`, 'success');
    _setVal('fila-endpoint', '');
    _setVal('fila-corpo',    '');
    _carregarFila();
}

async function _cancelarComando(id) {
    if (!confirm(`Cancelar o comando #${id}?`)) return;
    const data = await _apiPost(`${API}?acao=cancelar_comando`, { id });
    if (data?.sucesso) {
        _toast('Comando cancelado.', 'success');
        _carregarFila();
    } else {
        _toast(data?.erro ?? 'Erro ao cancelar.', 'error');
    }
}

// ─────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────

function _popularSelectDispositivos(devs) {
    const selectors = ['ev-filtro-serial', 'fila-serial'];
    selectors.forEach(id => {
        const sel = _el(id);
        if (!sel) return;
        const atual = sel.value;
        const placeholder = id === 'fila-serial'
            ? '<option value="">Selecione o dispositivo...</option>'
            : '<option value="">Todos</option>';
        sel.innerHTML = placeholder + devs.map(d =>
            `<option value="${_esc(d.serial_number)}">${_esc(d.nome_dispositivo)} — ${_esc(d.serial_number)}</option>`
        ).join('');
        if (atual) sel.value = atual;
    });
}

function _renderPaginacao(containerId, paginaAtual, totalPaginas, onPage) {
    const c = _el(containerId);
    if (!c) return;
    if (totalPaginas <= 1) { c.innerHTML = ''; return; }

    let html = '';
    for (let p = 1; p <= totalPaginas; p++) {
        const ativo = p === paginaAtual ? 'background:#2563eb;color:#fff;border-color:#2563eb;' : '';
        html += `<button onclick="(${onPage.toString()})(${p})"
          style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;${ativo}">
          ${p}
        </button>`;
    }
    c.innerHTML = html;
}

function _labelTipoEvento(tipo) {
    const map = {
        7: '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">7 — Liberado</span>',
        4: '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">4 — Negado</span>',
        1: '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">1 — Saída</span>',
    };
    return map[tipo] ?? `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">${tipo}</span>`;
}

function _labelStatus(status) {
    const map = {
        pendente:  '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Pendente</span>',
        enviado:   '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Enviado</span>',
        cancelado: '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">Cancelado</span>',
    };
    return map[status] ?? status;
}

function _fmtDatetime(str) {
    if (!str) return '—';
    try {
        return new Date(str).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return str; }
}

function _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _el(id) { return document.getElementById(id); }
function _val(id) { return (_el(id)?.value ?? ''); }
function _setVal(id, v) { if (_el(id)) _el(id).value = v; }

function _on(el, ev, fn) {
    if (!el) return;
    el.addEventListener(ev, fn);
    _state._listeners.push({ el, ev, fn });
}

function _spinnerHTML(msg) {
    return `<div style="text-align:center;padding:40px;color:#94a3b8;">
      <i class="fas fa-spinner fa-spin" style="font-size:28px;display:block;margin-bottom:12px;"></i>${msg}</div>`;
}

function _emptyHTML(msg) {
    return `<div style="text-align:center;padding:40px;color:#94a3b8;">
      <i class="fas fa-microchip" style="font-size:36px;display:block;margin-bottom:12px;"></i>${msg}</div>`;
}

async function _apiGet(url) {
    try {
        const r = await fetch(url, { credentials: 'include' });
        return await r.json();
    } catch (e) {
        console.error('[Dispositivos] GET error:', e);
        return null;
    }
}

async function _apiPost(url, payload) {
    try {
        const r = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return await r.json();
    } catch (e) {
        console.error('[Dispositivos] POST error:', e);
        return null;
    }
}

function _toast(msg, type = 'info') {
    const bg = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#2563eb';
    const t  = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
        position: 'fixed', bottom: '24px', right: '24px', zIndex: '9999',
        background: bg, color: '#fff', padding: '12px 20px',
        borderRadius: '10px', fontSize: '14px', fontWeight: '600',
        boxShadow: '0 4px 16px rgba(0,0,0,.2)', transition: 'opacity .3s',
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ─────────────────────────────────────────────
// API pública (window.DispModule)
// ─────────────────────────────────────────────

function _publicAPI() {
    return {
        editarDispositivo: _editarDispositivo,
        excluirDispositivo: _excluirDispositivo,
        verToken: _verToken,
        copiarToken: _copiarToken,
        regenerarToken: _regenerarToken,
        cancelarComando: _cancelarComando,
    };
}

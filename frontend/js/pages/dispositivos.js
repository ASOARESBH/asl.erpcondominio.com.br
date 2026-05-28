/**
 * dispositivos.js — Módulo Dispositivos Control iD v3
 *
 * Suporta múltiplos dispositivos com campos completos de comunicação:
 * IP, porta, usuário/senha, tipo de integração, modelo, sentido de acesso,
 * bridge_api_key, token de autenticação.
 *
 * Abas: Dispositivos (CRUD) | Eventos | Fila de Comandos
 */
'use strict';

const API = '../api/api_dispositivos_controlid.php';

const _state = {
    dispositivoEditandoId: null,
    tokenDispositivoId: null,
    tokenAtual: '',
    bridgeKeyTemp: '',
    evPagina: 1,
    _listeners: [],
};

// ─────────────────────────────────────────────
// Ciclo de vida
// ─────────────────────────────────────────────

export function init() {
    console.log('[Dispositivos] init() v3');
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

    // Mostrar/ocultar bloco de rede conforme tipo de integração
    document.querySelectorAll('input[name="tipo_integracao"]').forEach(radio => {
        _on(radio, 'change', _atualizarBlocoRede);
    });
    _atualizarBlocoRede();
}

function _atualizarBlocoRede() {
    const tipo = document.querySelector('input[name="tipo_integracao"]:checked')?.value ?? 'bridge_local';
    const bloco = _el('bloco-rede');
    if (bloco) {
        bloco.style.display = tipo === 'manual' ? 'none' : 'grid';
    }
    // Destaque visual no radio selecionado
    document.querySelectorAll('.radio-card').forEach(card => {
        const inp = card.querySelector('input[type="radio"]');
        card.classList.toggle('selected', inp?.checked ?? false);
    });
}

async function _carregarDispositivos() {
    const busca  = _val('disp-busca');
    const lista  = _el('disp-lista');
    lista.innerHTML = _spinnerHTML('Carregando dispositivos...');

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

    lista.innerHTML = devs.map(d => {
        const online = !!d.online;
        const tipoLabel = { bridge_local: 'Bridge Local', monitor_nativo: 'Monitor Nativo', manual: 'Manual' }[d.tipo_integracao] ?? d.tipo_integracao;
        const tipoIcon  = { bridge_local: 'fa-laptop-code', monitor_nativo: 'fa-satellite-dish', manual: 'fa-hand-paper' }[d.tipo_integracao] ?? 'fa-microchip';
        const leitorLabel = { uhf: 'UHF', rfid: 'RFID', facial: 'Facial', biometria: 'Biometria', qrcode: 'QR Code', outro: 'Outro' }[d.tipo_leitor] ?? d.tipo_leitor ?? 'UHF';
        const sentidoLabel = { entrada: 'Entrada', saida: 'Saída', ambos: 'Entrada/Saída' }[d.sentido_acesso] ?? 'Ambos';

        return `
      <div class="disp-card">
        <div class="disp-card-icon ${online ? 'online' : ''}">
          <i class="fas fa-microchip"></i>
        </div>
        <div class="disp-card-info">
          <div class="disp-card-nome">${_esc(d.nome_dispositivo)}</div>
          <div class="disp-card-serial">${_esc(d.serial_number)}</div>
          <div class="disp-card-meta">
            ${d.modelo ? `<span class="disp-badge disp-badge-gray"><i class="fas fa-cog"></i> ${_esc(d.modelo)}</span>` : ''}
            <span class="disp-badge disp-badge-blue"><i class="fas ${tipoIcon}"></i> ${tipoLabel}</span>
            <span class="disp-badge disp-badge-gray"><i class="fas fa-tag"></i> ${leitorLabel}</span>
            <span class="disp-badge disp-badge-gray"><i class="fas fa-arrows-alt-h"></i> ${sentidoLabel}</span>
            ${d.area_instalacao ? `<span class="disp-badge disp-badge-gray"><i class="fas fa-map-marker-alt"></i> ${_esc(d.area_instalacao)}</span>` : ''}
            ${d.ip_local ? `<span class="disp-badge disp-badge-gray"><i class="fas fa-network-wired"></i> ${_esc(d.ip_local)}:${d.porta_local ?? 80}</span>` : ''}
          </div>
        </div>
        <div class="disp-card-status">
          <span class="disp-status-badge ${online ? 'online' : 'offline'}">
            ${online ? '● Online' : '○ Offline'}
          </span>
          ${d.ultimo_keep_alive
            ? `<span class="disp-ping">Último ping: ${_fmtDatetime(d.ultimo_keep_alive)}</span>`
            : '<span class="disp-ping">Nunca conectado</span>'}
        </div>
        <div class="disp-card-actions">
          <button class="action-btn edit" title="Editar" onclick="window.DispModule?.editarDispositivo(${d.id})">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn" title="Token / Bridge Key" onclick="window.DispModule?.verToken(${d.id})"
            style="background:#eff6ff;color:#2563eb;border-color:#bfdbfe;">
            <i class="fas fa-key"></i>
          </button>
          <button class="action-btn" title="Guia de Configuração" onclick="window.DispModule?.verGuia(${d.id})"
            style="background:#f0fdf4;color:#16a34a;border-color:#bbf7d0;">
            <i class="fas fa-book"></i>
          </button>
          <button class="action-btn delete" title="Desativar" onclick="window.DispModule?.excluirDispositivo(${d.id}, '${_esc(d.nome_dispositivo)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
    }).join('');

    _popularSelectDispositivos(devs);
}

async function _salvarDispositivo() {
    const nome   = _val('disp-nome').trim();
    const serial = _val('disp-serial').trim();

    if (!nome || !serial) {
        _toast('Nome e Serial Number são obrigatórios.', 'error');
        return;
    }

    const tipo = document.querySelector('input[name="tipo_integracao"]:checked')?.value ?? 'bridge_local';

    const payload = {
        nome_dispositivo:    nome,
        serial_number:       serial,
        descricao:           _val('disp-descricao').trim(),
        tipo_integracao:     tipo,
        ip_local:            _val('disp-ip').trim(),
        porta_local:         parseInt(_val('disp-porta') || '80', 10),
        usuario_api:         _val('disp-usuario').trim() || 'admin',
        senha_api:           _val('disp-senha').trim(),
        modelo:              _val('disp-modelo').trim(),
        tipo_leitor:         _val('disp-tipo-leitor'),
        area_instalacao:     _val('disp-area').trim(),
        sentido_acesso:      _val('disp-sentido'),
        device_id_controlid: parseInt(_val('disp-device-id') || '0', 10) || null,
    };

    const btn = _el('btnDispSalvar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

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
    _setVal('disp-modelo',    d.modelo ?? '');
    _setVal('disp-area',      d.area_instalacao ?? '');
    _setVal('disp-ip',        d.ip_local ?? '');
    _setVal('disp-porta',     d.porta_local ?? '80');
    _setVal('disp-usuario',   d.usuario_api ?? 'admin');
    _setVal('disp-senha',     ''); // não preenche senha por segurança
    _setVal('disp-device-id', d.device_id_controlid ?? '');
    _setVal('disp-bridge-key', d.bridge_api_key ?? '');
    _setVal('disp-tipo-leitor', d.tipo_leitor ?? 'uhf');
    _setVal('disp-sentido',   d.sentido_acesso ?? 'ambos');

    // Radio de tipo de integração
    const radio = document.querySelector(`input[name="tipo_integracao"][value="${d.tipo_integracao ?? 'bridge_local'}"]`);
    if (radio) radio.checked = true;
    _atualizarBlocoRede();

    _el('disp-serial').disabled = true;
    _el('disp-form-titulo').innerHTML = '<i class="fas fa-edit"></i> Editar Dispositivo';
    _el('btnDispCancelar').style.display = 'inline-flex';
    _el('disp-id').value = id;

    _el('disp-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _cancelarEdicao() {
    _state.dispositivoEditandoId = null;
    ['disp-nome','disp-serial','disp-descricao','disp-modelo','disp-area',
     'disp-ip','disp-porta','disp-usuario','disp-senha','disp-device-id',
     'disp-bridge-key','disp-id'].forEach(id => _setVal(id, ''));
    _setVal('disp-porta', '80');
    _setVal('disp-usuario', 'admin');
    _setVal('disp-tipo-leitor', 'uhf');
    _setVal('disp-sentido', 'ambos');
    const radio = document.querySelector('input[name="tipo_integracao"][value="bridge_local"]');
    if (radio) radio.checked = true;
    _atualizarBlocoRede();
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
// Gerar Bridge Key temporária
// ─────────────────────────────────────────────

function _gerarBridgeKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 48; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    _setVal('disp-bridge-key', key);
    _state.bridgeKeyTemp = key;
}

// ─────────────────────────────────────────────
// Toggle senha
// ─────────────────────────────────────────────

function _toggleSenha() {
    const inp  = _el('disp-senha');
    const icon = _el('disp-senha-icon');
    if (!inp) return;
    if (inp.type === 'password') {
        inp.type = 'text';
        if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
    } else {
        inp.type = 'password';
        if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
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
    _state.tokenAtual         = token ?? '';
    _setVal('token-display', token ?? '(sem token)');
    _el('disp-token-overlay').classList.add('open');
}

function _copiarToken() {
    navigator.clipboard.writeText(_state.tokenAtual).then(() => {
        _toast('Token copiado!', 'success');
    });
}

async function _regenerarToken() {
    if (!confirm('Gerar um novo token?\n\nO token atual deixará de funcionar imediatamente. Atualize o bridge antes de confirmar.')) return;
    const data = await _apiPost(`${API}?acao=gerar_token`, { id: _state.tokenDispositivoId });
    if (!data?.sucesso) {
        _toast(data?.erro ?? 'Erro ao gerar token.', 'error');
        return;
    }
    _state.tokenAtual = data.token_autenticacao;
    _setVal('token-display', data.token_autenticacao);
    _toast('Novo token gerado! Atualize o bridge.', 'success');
}

// ─────────────────────────────────────────────
// Guia de Configuração
// ─────────────────────────────────────────────

async function _verGuia(id) {
    const data = await _apiGet(`${API}?acao=obter&id=${id}`);
    if (!data?.sucesso || !data.dispositivo) {
        _toast('Erro ao carregar dados do dispositivo.', 'error');
        return;
    }
    const d = data.dispositivo;
    const token = d.token_autenticacao ?? '(gere um token clicando na chave)';
    const ip    = d.ip_local ?? '192.168.X.XXX';
    const porta = d.porta_local ?? 80;
    const user  = d.usuario_api ?? 'admin';
    const tipo  = d.tipo_integracao ?? 'bridge_local';
    const serverUrl = window.location.origin;

    let html = '';

    if (tipo === 'bridge_local') {
        html = `
          <h4 style="color:#1e293b;margin:0 0 12px;">Bridge Local — Script Python no PC da Portaria</h4>
          <ol style="padding-left:20px;margin:0 0 16px;">
            <li>Instale o Python 3.x em <a href="https://python.org" target="_blank">python.org</a></li>
            <li>Baixe o arquivo <code>bridge_local/controlid_bridge.py</code> do repositório do projeto</li>
            <li>Edite as configurações no topo do arquivo:</li>
          </ol>
          <pre style="background:#1e293b;color:#e2e8f0;padding:14px;border-radius:8px;font-size:12px;overflow-x:auto;margin-bottom:12px;">
CONTROLID_HOST = "${ip}"
CONTROLID_PORT = ${porta}
CONTROLID_USER = "${user}"
CONTROLID_PASS = "SENHA_DO_EQUIPAMENTO"

SERVER_URL     = "${serverUrl}/api/bridge_receiver.php"
BRIDGE_API_KEY = "${token}"
SERIAL_NUMBER  = "${_esc(d.serial_number)}"</pre>
          <ol start="4" style="padding-left:20px;margin:0 0 12px;">
            <li>Execute: <code>python controlid_bridge.py</code></li>
            <li>Para iniciar automaticamente com o Windows, use <code>instalar_servico_windows.bat</code></li>
          </ol>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;font-size:12px;color:#1d4ed8;">
            <i class="fas fa-info-circle"></i> <strong>Dica:</strong> O equipamento continua funcionando mesmo sem internet. O bridge sincroniza os eventos quando a conexão for restabelecida.
          </div>`;
    } else if (tipo === 'monitor_nativo') {
        html = `
          <h4 style="color:#1e293b;margin:0 0 12px;">Monitor Nativo — Equipamento envia eventos diretamente</h4>
          <p style="font-size:13px;color:#64748b;margin-bottom:12px;">Configure o Monitor no equipamento via API REST:</p>
          <pre style="background:#1e293b;color:#e2e8f0;padding:14px;border-radius:8px;font-size:12px;overflow-x:auto;margin-bottom:12px;">
POST http://${ip}:${porta}/set_configuration.fcgi?session=TOKEN_SESSION
{
  "monitor": {
    "hostname": "${window.location.hostname}",
    "port": "443",
    "path": "api/controlid_monitor.php",
    "token": "${token}"
  }
}</pre>
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;color:#92400e;">
            <i class="fas fa-exclamation-triangle"></i> <strong>Atenção:</strong> Requer conexão de internet estável. Se a internet cair, o equipamento pode travar aguardando resposta do servidor.
          </div>`;
    } else {
        html = `
          <h4 style="color:#1e293b;margin:0 0 12px;">Modo Manual</h4>
          <p style="font-size:13px;color:#64748b;">Este dispositivo está configurado para registros manuais apenas. Nenhuma integração automática está ativa.</p>
          <p style="font-size:13px;color:#64748b;">Para habilitar integração automática, edite o dispositivo e selecione "Bridge Local" ou "Monitor Nativo".</p>`;
    }

    const guia = _el('guia-conteudo');
    if (guia) guia.innerHTML = html;
    _el('disp-guia-overlay').classList.add('open');
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8;">
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#ef4444;">Erro ao carregar eventos.</td></tr>`;
        return;
    }

    const evs = data.eventos ?? [];
    if (evs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#94a3b8;">Nenhum evento encontrado.</td></tr>`;
        _el('ev-paginacao').innerHTML = '';
        return;
    }

    tbody.innerHTML = evs.map(e => `
      <tr>
        <td style="font-family:monospace;color:#64748b;">${e.id}</td>
        <td style="font-family:monospace;font-size:12px;">${_esc(e.serial_number)}</td>
        <td style="font-family:monospace;font-size:12px;">${_esc(e.card_value ?? e.user_id ?? '—')}</td>
        <td style="font-size:12px;">${_esc(e.veiculo_placa ?? '—')} ${e.morador_nome ? '<br><small style="color:#64748b;">' + _esc(e.morador_nome) + '</small>' : ''}</td>
        <td>${_labelTipoEvento(e.tipo_evento)}</td>
        <td style="font-size:12px;">${_fmtDatetime(e.data_hora)}</td>
        <td>${e.acesso_liberado ? '<span class="status-badge ativa">Liberado</span>' : '<span class="status-badge inativa">Negado</span>'}</td>
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

    const pendentes = cmds.filter(c => c.status === 'pendente').length;
    const badge = _el('badge-fila');
    if (badge) {
        badge.textContent   = String(pendentes);
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

    if (!serial)   { _toast('Selecione o dispositivo.', 'error'); return; }
    if (!endpoint) { _toast('Endpoint é obrigatório.', 'error'); return; }

    let corpo = {};
    if (corpoTxt) {
        try { corpo = JSON.parse(corpoTxt); }
        catch { _toast('Corpo JSON inválido. Verifique a sintaxe.', 'error'); return; }
    }

    const btn = _el('btnFilaEnfileirar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    const data = await _apiPost(`${API}?acao=enfileirar_comando`, {
        serial_number: serial, verbo, endpoint, corpo_json: corpo,
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enfileirar Comando';

    if (!data?.sucesso) { _toast(data?.erro ?? 'Erro ao enfileirar.', 'error'); return; }

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
    ['ev-filtro-serial', 'fila-serial'].forEach(id => {
        const sel = _el(id);
        if (!sel) return;
        const atual = sel.value;
        const ph = id === 'fila-serial'
            ? '<option value="">Selecione o dispositivo...</option>'
            : '<option value="">Todos</option>';
        sel.innerHTML = ph + devs.map(d =>
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
    for (let p = 1; p <= Math.min(totalPaginas, 20); p++) {
        const ativo = p === paginaAtual ? 'pag-btn active' : 'pag-btn';
        html += `<button class="${ativo}" onclick="(${onPage.toString()})(${p})">${p}</button>`;
    }
    c.innerHTML = html;
}

function _labelTipoEvento(tipo) {
    const map = {
        7: '<span class="status-badge ativa">Liberado</span>',
        4: '<span class="status-badge inativa">Negado</span>',
        1: '<span class="status-badge" style="background:#dbeafe;color:#1d4ed8;">Saída</span>',
    };
    return map[tipo] ?? `<span class="status-badge">${tipo}</span>`;
}

function _labelStatus(status) {
    const map = {
        pendente:  '<span class="status-badge" style="background:#fef3c7;color:#b45309;">Pendente</span>',
        enviado:   '<span class="status-badge ativa">Enviado</span>',
        cancelado: '<span class="status-badge" style="background:#f1f5f9;color:#64748b;">Cancelado</span>',
    };
    return map[status] ?? status;
}

function _fmtDatetime(str) {
    if (!str) return '—';
    try { return new Date(str).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return str; }
}

function _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _el(id)       { return document.getElementById(id); }
function _val(id)      { return (_el(id)?.value ?? ''); }
function _setVal(id,v) { if (_el(id)) _el(id).value = v; }

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
        if (!r.ok) { console.error('[Dispositivos] HTTP', r.status, url); return null; }
        return await r.json();
    } catch (e) { console.error('[Dispositivos] GET error:', e); return null; }
}

async function _apiPost(url, payload) {
    try {
        const r = await fetch(url, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!r.ok) { console.error('[Dispositivos] HTTP', r.status, url); return null; }
        return await r.json();
    } catch (e) { console.error('[Dispositivos] POST error:', e); return null; }
}

function _toast(msg, type = 'info') {
    const bg = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#2563eb';
    const t  = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
        position:'fixed', bottom:'24px', right:'24px', zIndex:'9999',
        background:bg, color:'#fff', padding:'12px 20px',
        borderRadius:'10px', fontSize:'14px', fontWeight:'600',
        boxShadow:'0 4px 16px rgba(0,0,0,.2)', transition:'opacity .3s',
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ─────────────────────────────────────────────
// API pública (window.DispModule)
// ─────────────────────────────────────────────

function _publicAPI() {
    return {
        editarDispositivo:  _editarDispositivo,
        excluirDispositivo: _excluirDispositivo,
        verToken:           _verToken,
        copiarToken:        _copiarToken,
        regenerarToken:     _regenerarToken,
        cancelarComando:    _cancelarComando,
        gerarBridgeKey:     _gerarBridgeKey,
        toggleSenha:        _toggleSenha,
        verGuia:            _verGuia,
    };
}

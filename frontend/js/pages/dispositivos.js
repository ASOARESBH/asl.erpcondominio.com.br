/**
 * dispositivos.js — Módulo de Dispositivos Control ID v2.0
 *
 * Gerencia leitores Control ID (IDUHF, iDAccess, etc.) e integração
 * com a API REST dos equipamentos — inclui Push Mode e Online Mode.
 */
'use strict';

const API = '../api/api_dispositivos_controlid.php';
let _dispExcluirId = null;
let _listeners = [];
let _autoRefreshTimer = null;

// ============================================================
// INIT / DESTROY
// ============================================================
export function init() {
    console.log('[Dispositivos] Inicializando módulo v2.0...');
    _setupTabs();
    _setupForm();
    _setupSincronizacao();
    _setupPushMode();
    _setupEventos();
    _setupModais();
    _setupBridge();
    _carregarDispositivos();
    _carregarSyncLog();
    _carregarLeituras();
    console.log('[Dispositivos] Módulo inicializado.');
}

export function destroy() {
    console.log('[Dispositivos] Destruindo módulo...');
    if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
    _listeners.forEach(({ el, ev, fn }) => el.removeEventListener(ev, fn));
    _listeners = [];
    console.log('[Dispositivos] Módulo destruído.');
}

function _on(el, ev, fn) {
    if (!el) return;
    el.addEventListener(ev, fn);
    _listeners.push({ el, ev, fn });
}

// ============================================================
// ABAS
// ============================================================
function _setupTabs() {
    document.querySelectorAll('.page-dispositivos .tab-btn').forEach(btn => {
        _on(btn, 'click', () => {
            document.querySelectorAll('.page-dispositivos .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.page-dispositivos .tab-content').forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            const content = document.getElementById(`tab-${tab}`);
            if (content) content.style.display = 'block';
            console.log(`[Dispositivos] Tab ativa: ${tab}`);

            // Controle de auto-refresh na aba eventos
            if (tab === 'eventos') {
                _carregarEventos();
                const chk = document.getElementById('eventos-auto-refresh');
                if (chk?.checked) _iniciarAutoRefresh();
            } else {
                _pararAutoRefresh();
            }
            // Carregar dados da aba bridge ao abrir
            if (tab === 'bridge') {
                _carregarStatusBridge();
                _carregarApiKey();
            }
        });
    });
}

// ============================================================
// FORMULÁRIO DE CADASTRO
// ============================================================
function _setupForm() {
    const form = document.getElementById('formDispositivo');
    _on(form, 'submit', async (e) => {
        e.preventDefault();
        await _salvarDispositivo();
    });

    _on(document.getElementById('btnLimparForm'), 'click', _limparForm);
    _on(document.getElementById('btnAtualizarLista'), 'click', _carregarDispositivos);
}

async function _salvarDispositivo() {
    const id    = document.getElementById('disp-id').value;
    const nome  = document.getElementById('disp-nome').value.trim();
    const modelo = document.getElementById('disp-modelo').value;
    const tipo  = document.getElementById('disp-tipo').value;
    const ip    = document.getElementById('disp-ip').value.trim();
    const porta = document.getElementById('disp-porta').value;
    const usuario = document.getElementById('disp-usuario').value.trim();
    const senha = document.getElementById('disp-senha').value;
    const area  = document.getElementById('disp-area').value.trim();
    const desc  = document.getElementById('disp-descricao').value.trim();
    const ativo = document.getElementById('disp-ativo').value;

    if (!nome || !ip) {
        _showToast('Nome e IP são obrigatórios.', 'erro');
        return;
    }

    const payload = { acao: 'salvar', nome, modelo, tipo, ip_address: ip, porta: parseInt(porta),
                      usuario_api: usuario, senha_api: senha, area_instalacao: area,
                      descricao: desc, ativo: parseInt(ativo) };
    if (id) payload.id = parseInt(id);

    console.log('[Dispositivos] Salvando dispositivo...', payload);
    const btn = document.getElementById('btnSalvarDisp');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const resp = await _api(payload);
        console.log('[Dispositivos] Resposta salvar:', resp);
        if (resp.sucesso) {
            _showToast(resp.mensagem || 'Dispositivo salvo com sucesso!', 'sucesso');
            _limparForm();
            _carregarDispositivos();
            _carregarSelectDispositivos();
        } else {
            _showToast(resp.mensagem || 'Erro ao salvar.', 'erro');
        }
    } catch (err) {
        console.error('[Dispositivos] Erro ao salvar:', err);
        _showToast('Erro de comunicação com a API.', 'erro');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Dispositivo';
    }
}

function _limparForm() {
    document.getElementById('disp-id').value = '';
    document.getElementById('disp-nome').value = '';
    document.getElementById('disp-modelo').value = 'IDUHF';
    document.getElementById('disp-tipo').value = 'uhf';
    document.getElementById('disp-ip').value = '';
    document.getElementById('disp-porta').value = '80';
    document.getElementById('disp-usuario').value = 'admin';
    document.getElementById('disp-senha').value = '';
    document.getElementById('disp-area').value = '';
    document.getElementById('disp-descricao').value = '';
    document.getElementById('disp-ativo').value = '1';
    document.getElementById('form-titulo').innerHTML = '<i class="fas fa-plus-circle"></i> Novo Dispositivo';
    document.getElementById('btnLimparForm').style.display = 'none';
    document.getElementById('disp-senha-hint').style.display = 'none';
    document.getElementById('disp-senha').placeholder = 'Senha de acesso ao equipamento';
}

function _editarDispositivo(disp) {
    document.getElementById('disp-id').value = disp.id;
    document.getElementById('disp-nome').value = disp.nome;
    document.getElementById('disp-modelo').value = disp.modelo;
    document.getElementById('disp-tipo').value = disp.tipo;
    document.getElementById('disp-ip').value = disp.ip_address;
    document.getElementById('disp-porta').value = disp.porta;
    document.getElementById('disp-usuario').value = disp.usuario_api;
    document.getElementById('disp-senha').value = '';
    document.getElementById('disp-area').value = disp.area_instalacao || '';
    document.getElementById('disp-descricao').value = disp.descricao || '';
    document.getElementById('disp-ativo').value = disp.ativo;
    document.getElementById('form-titulo').innerHTML = '<i class="fas fa-edit"></i> Editando: ' + disp.nome;
    document.getElementById('btnLimparForm').style.display = 'inline-flex';
    document.getElementById('disp-senha-hint').style.display = 'block';
    document.getElementById('disp-senha').placeholder = '(deixe em branco para manter)';

    // Scroll para o formulário
    document.getElementById('formDispositivo').scrollIntoView({ behavior: 'smooth', block: 'start' });
    console.log('[Dispositivos] Editando dispositivo ID:', disp.id);
}

// ============================================================
// CARREGAR LISTA DE DISPOSITIVOS
// ============================================================
async function _carregarDispositivos() {
    const loading = document.getElementById('loading-dispositivos');
    const tbody   = document.getElementById('tbody-dispositivos');
    if (loading) loading.style.display = 'block';

    try {
        const resp = await _apiGet('?acao=listar');
        console.log('[Dispositivos] Resposta listar:', resp);
        if (!resp.sucesso) { tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${resp.mensagem}</td></tr>`; return; }

        const lista = resp.dados?.dispositivos || [];
        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum dispositivo cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = lista.map(d => {
            const statusClass = d.status_online == 1 ? 'badge-success' : 'badge-danger';
            const statusTxt   = d.status_online == 1 ? 'Online' : 'Offline';
            const ativoClass  = d.ativo == 1 ? '' : 'row-inativo';
            const ultimoPing  = d.ultimo_ping ? _formatarData(d.ultimo_ping) : '—';
            return `<tr class="${ativoClass}">
              <td><span class="badge ${statusClass}">${statusTxt}</span></td>
              <td><strong>${_esc(d.nome)}</strong><br><small class="text-muted">${_esc(d.modelo)} · ${_esc(d.tipo)}</small></td>
              <td>${_esc(d.modelo)}<br><small>${_tipoLabel(d.tipo)}</small></td>
              <td><code>${_esc(d.ip_address)}:${d.porta}</code></td>
              <td>${_esc(d.area_instalacao || '—')}</td>
              <td>${ultimoPing}</td>
              <td class="actions-col">
                <button class="btn-icon btn-primary-icon" title="Editar" onclick="window.DispositivosPage._editar(${d.id})">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-success-icon" title="Testar Conexão" onclick="window.DispositivosPage._testar(${d.id})">
                  <i class="fas fa-plug"></i>
                </button>
                <button class="btn-icon btn-danger-icon" title="Excluir" onclick="window.DispositivosPage._confirmarExcluir(${d.id}, '${_esc(d.nome)}')">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>`;
        }).join('');

        // Atualizar selects de sincronização e filtros
        _carregarSelectDispositivos(lista);

    } catch (err) {
        console.error('[Dispositivos] Erro ao carregar lista:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar dispositivos.</td></tr>';
    } finally {
        if (loading) loading.style.display = 'none';
    }
}


// ============================================================
// SINCRONIZAÇÃO
// ============================================================
function _setupSincronizacao() {
    _on(document.getElementById('btnTestarConexao'), 'click', async () => {
        const id = document.getElementById('sync-dispositivo-id').value;
        if (!id) { _showToast('Selecione um dispositivo.', 'aviso'); return; }
        await _executarAcaoSync('testar_conexao', { acao: 'testar_conexao', id: parseInt(id) }, 'Testando conexão...');
    });

    _on(document.getElementById('btnSincronizar'), 'click', async () => {
        const id = document.getElementById('sync-dispositivo-id').value;
        if (!id) { _showToast('Selecione um dispositivo.', 'aviso'); return; }
        const apenas_novos = document.getElementById('sync-modo').value === '1';
        await _executarAcaoSync('sincronizar_tags', { acao: 'sincronizar_tags', id: parseInt(id), apenas_novos }, 'Sincronizando TAGs com o equipamento...');
    });

    _on(document.getElementById('btnColetarLogs'), 'click', async () => {
        const id = document.getElementById('sync-dispositivo-id').value;
        if (!id) { _showToast('Selecione um dispositivo.', 'aviso'); return; }
        await _executarAcaoSync('coletar_logs', { acao: 'coletar_logs', id: parseInt(id) }, 'Coletando logs do equipamento...');
    });

    _on(document.getElementById('btnAtualizarSyncLog'), 'click', _carregarSyncLog);
    _on(document.getElementById('btnAtualizarLeituras'), 'click', _carregarLeituras);
    _on(document.getElementById('filtro-leituras-disp'), 'change', _carregarLeituras);
}

async function _executarAcaoSync(tipo, payload, msgProgresso) {
    const progresso = document.getElementById('sync-progresso');
    const resultado = document.getElementById('sync-resultado');
    const msgEl     = document.getElementById('sync-progresso-msg');

    progresso.style.display = 'flex';
    resultado.style.display = 'none';
    msgEl.textContent = msgProgresso;

    // Desabilitar botões
    ['btnTestarConexao','btnSincronizar','btnColetarLogs'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = true;
    });

    console.log(`[Dispositivos] Executando ação: ${tipo}`, payload);

    try {
        const resp = await _api(payload);
        console.log(`[Dispositivos] Resposta ${tipo}:`, resp);

        const content = document.getElementById('sync-resultado-content');
        if (resp.sucesso) {
            content.innerHTML = _renderResultado(tipo, resp);
            resultado.className = 'sync-resultado-box sync-resultado-sucesso';
        } else {
            content.innerHTML = `<div class="resultado-erro"><i class="fas fa-times-circle"></i> <strong>Erro:</strong> ${_esc(resp.mensagem)}</div>`;
            resultado.className = 'sync-resultado-box sync-resultado-erro';
        }
        resultado.style.display = 'block';

        // Atualizar listas
        _carregarSyncLog();
        _carregarDispositivos();
        if (tipo === 'coletar_logs') _carregarLeituras();

    } catch (err) {
        console.error(`[Dispositivos] Erro em ${tipo}:`, err);
        const content = document.getElementById('sync-resultado-content');
        content.innerHTML = `<div class="resultado-erro"><i class="fas fa-times-circle"></i> Erro de comunicação com a API.</div>`;
        document.getElementById('sync-resultado').className = 'sync-resultado-box sync-resultado-erro';
        document.getElementById('sync-resultado').style.display = 'block';
    } finally {
        progresso.style.display = 'none';
        ['btnTestarConexao','btnSincronizar','btnColetarLogs'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = false;
        });
    }
}

function _renderResultado(tipo, resp) {
    const dados = resp.dados || {};
    if (tipo === 'testar_conexao') {
        return `<div class="resultado-sucesso">
          <i class="fas fa-check-circle"></i>
          <strong>Conexão estabelecida!</strong><br>
          IP: <code>${dados.ip}:${dados.porta}</code> · Session: <code>${dados.session}</code>
        </div>`;
    }
    if (tipo === 'sincronizar_tags') {
        const detalhes = (dados.detalhes || []).slice(0, 20);
        const rows = detalhes.map(d => `
          <tr>
            <td>${d.placa || '—'}</td>
            <td>${d.tag || '—'}</td>
            <td><span class="badge ${d.status === 'sucesso' ? 'badge-success' : d.status === 'parcial' ? 'badge-warning' : 'badge-danger'}">${d.status}</span></td>
            <td>${d.motivo || (d.controlid_tag_id ? 'TAG ID: ' + d.controlid_tag_id : '—')}</td>
          </tr>`).join('');
        return `<div class="resultado-sucesso">
          <i class="fas fa-check-circle"></i>
          <strong>${resp.mensagem}</strong>
        </div>
        <div class="resultado-stats">
          <span class="stat-item stat-total">Total: ${dados.total}</span>
          <span class="stat-item stat-sucesso">Enviados: ${dados.enviados}</span>
          <span class="stat-item stat-erro">Erros: ${dados.erros}</span>
        </div>
        ${rows ? `<div class="table-responsive" style="max-height:300px;overflow-y:auto;margin-top:12px;">
          <table class="data-table"><thead><tr><th>Placa</th><th>TAG</th><th>Status</th><th>Detalhe</th></tr></thead>
          <tbody>${rows}</tbody></table></div>` : ''}`;
    }
    if (tipo === 'coletar_logs') {
        return `<div class="resultado-sucesso">
          <i class="fas fa-check-circle"></i>
          <strong>${resp.mensagem}</strong><br>
          Logs no equipamento: ${dados.total_logs} · Importados: ${dados.importados}
        </div>`;
    }
    return `<div class="resultado-sucesso"><i class="fas fa-check-circle"></i> ${resp.mensagem}</div>`;
}

// ============================================================
// LOG DE SINCRONIZAÇÕES
// ============================================================
async function _carregarSyncLog() {
    const tbody = document.getElementById('tbody-sync-log');
    try {
        const resp = await _apiGet('?acao=sync_log&limit=30');
        const logs = resp.dados?.logs || [];
        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum registro.</td></tr>';
            return;
        }
        tbody.innerHTML = logs.map(l => {
            const statusClass = l.status === 'sucesso' ? 'badge-success' : l.status === 'parcial' ? 'badge-warning' : 'badge-danger';
            const acaoLabel = { testar_conexao: 'Teste Conexão', sincronizar_tags: 'Sincronizar TAGs',
                                coletar_logs: 'Coletar Logs', criar_usuario: 'Criar Usuário',
                                remover_usuario: 'Remover Usuário', criar_tag: 'Criar TAG', remover_tag: 'Remover TAG' };
            return `<tr>
              <td>${_formatarData(l.data_hora)}</td>
              <td>${_esc(l.dispositivo_nome || '—')}</td>
              <td>${acaoLabel[l.acao] || l.acao}</td>
              <td><span class="badge ${statusClass}">${l.status}</span></td>
              <td>${l.total_enviados}</td>
              <td>${l.total_erros}</td>
              <td><small class="text-muted">${_resumoDetalhes(l.detalhes)}</small></td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('[Dispositivos] Erro ao carregar sync log:', err);
    }
}

// ============================================================
// LEITURAS
// ============================================================
async function _carregarLeituras() {
    const tbody  = document.getElementById('tbody-leituras');
    const dispId = document.getElementById('filtro-leituras-disp')?.value || '';
    const url    = `?acao=leituras&limit=100${dispId ? '&dispositivo_id=' + dispId : ''}`;
    try {
        const resp = await _apiGet(url);
        const leituras = resp.dados?.leituras || [];
        if (!leituras.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhuma leitura importada.</td></tr>';
            return;
        }
        tbody.innerHTML = leituras.map(l => {
            const acessoClass = l.acesso_liberado == 1 ? 'badge-success' : 'badge-danger';
            const acessoTxt   = l.acesso_liberado == 1 ? 'Liberado' : 'Negado';
            const eventoTxt   = _eventoLabel(l.tipo_evento);
            return `<tr>
              <td>${_formatarData(l.data_hora)}</td>
              <td>${_esc(l.dispositivo_nome || '—')}</td>
              <td><code>${_esc(l.tag_value || l.card_value || '—')}</code></td>
              <td>${l.placa ? `<strong>${_esc(l.placa)}</strong><br><small>${_esc(l.modelo || '')} ${_esc(l.cor || '')}</small>` : '—'}</td>
              <td>${_esc(l.morador_nome || '—')}<br><small>${_esc(l.unidade || '')}</small></td>
              <td><small>${eventoTxt}</small></td>
              <td><span class="badge ${acessoClass}">${acessoTxt}</span></td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('[Dispositivos] Erro ao carregar leituras:', err);
    }
}

// ============================================================
// MODAIS
// ============================================================
function _setupModais() {
    _on(document.getElementById('btnCancelarExcluir'), 'click', () => {
        document.getElementById('modal-excluir-disp').style.display = 'none';
        _dispExcluirId = null;
    });
    _on(document.getElementById('btnConfirmarExcluir'), 'click', async () => {
        if (!_dispExcluirId) return;
        document.getElementById('modal-excluir-disp').style.display = 'none';
        try {
            const resp = await _api({ acao: 'excluir', id: _dispExcluirId });
            _showToast(resp.mensagem || (resp.sucesso ? 'Removido.' : 'Erro.'), resp.sucesso ? 'sucesso' : 'erro');
            if (resp.sucesso) { _carregarDispositivos(); _carregarSyncLog(); }
        } catch (err) {
            _showToast('Erro ao excluir.', 'erro');
        }
        _dispExcluirId = null;
    });
}

// ============================================================
// AÇÕES GLOBAIS (chamadas pelo HTML via onclick)
// ============================================================
window.DispositivosPage = {
    _editar: async (id) => {
        const resp = await _apiGet(`?acao=obter&id=${id}`);
        if (resp.sucesso) _editarDispositivo(resp.dados.dispositivo);
        // Scroll para a aba dispositivos
        document.querySelector('.page-dispositivos .tab-btn[data-tab="dispositivos"]')?.click();
    },
    _testar: async (id) => {
        // Mudar para aba sincronização e selecionar dispositivo
        document.querySelector('.page-dispositivos .tab-btn[data-tab="sincronizacao"]')?.click();
        const sel = document.getElementById('sync-dispositivo-id');
        if (sel) sel.value = id;
        await _executarAcaoSync('testar_conexao', { acao: 'testar_conexao', id: parseInt(id) }, 'Testando conexão...');
    },
    _confirmarExcluir: (id, nome) => {
        _dispExcluirId = id;
        document.getElementById('modal-excluir-nome').textContent = nome;
        document.getElementById('modal-excluir-disp').style.display = 'flex';
    }
};

// ============================================================
// PUSH MODE — Configuração e Status
// ============================================================
function _setupPushMode() {
    _on(document.getElementById('push-dispositivo-id'), 'change', async () => {
        const id = document.getElementById('push-dispositivo-id').value;
        if (id) await _carregarStatusPush(parseInt(id));
        else document.getElementById('push-status-area').style.display = 'none';
    });

    _on(document.getElementById('btnAtualizarStatusPush'), 'click', async () => {
        const id = document.getElementById('push-dispositivo-id').value;
        if (!id) { _showToast('Selecione um dispositivo.', 'aviso'); return; }
        await _carregarStatusPush(parseInt(id));
    });

    _on(document.getElementById('btnConfigurarPush'), 'click', async () => {
        const id = document.getElementById('push-dispositivo-id').value;
        if (!id) { _showToast('Selecione um dispositivo.', 'aviso'); return; }
        await _acionarPush('configurar_push', {
            acao: 'configurar_push',
            id: parseInt(id),
            push_url: document.getElementById('push-url').value.trim(),
            periodo:  parseInt(document.getElementById('push-periodo').value),
            timeout:  parseInt(document.getElementById('push-timeout').value)
        }, 'push-config-resultado', 'Configurando push mode no equipamento...');
    });

    _on(document.getElementById('btnConfigurarOnline'), 'click', async () => {
        const id = document.getElementById('push-dispositivo-id').value;
        if (!id) { _showToast('Selecione um dispositivo.', 'aviso'); return; }
        await _acionarPush('configurar_online', {
            acao: 'configurar_online',
            id: parseInt(id),
            server_url:   document.getElementById('online-servidor').value.trim(),
            modo:         document.getElementById('online-modo').value,
            acao_acesso:  document.getElementById('online-acao-acesso').value,
            acao_params:  document.getElementById('online-acao-params').value.trim()
        }, 'online-config-resultado', 'Configurando online mode no equipamento...');
    });

    _on(document.getElementById('btnEnviarComandoPush'), 'click', async () => {
        const id = document.getElementById('push-dispositivo-id').value;
        if (!id) { _showToast('Selecione um dispositivo.', 'aviso'); return; }
        const bodyStr = document.getElementById('push-cmd-body').value.trim();
        let body = {};
        if (bodyStr) {
            try { body = JSON.parse(bodyStr); }
            catch { _showToast('JSON do comando inválido.', 'erro'); return; }
        }
        await _acionarPush('enviar_comando', {
            acao: 'enviar_comando',
            id: parseInt(id),
            endpoint: document.getElementById('push-cmd-endpoint').value,
            verb:     document.getElementById('push-cmd-verb').value,
            body
        }, 'push-cmd-resultado', 'Enfileirando comando...');
    });

    _on(document.getElementById('btnAtualizarFila'), 'click', _carregarFilaPush);
}

async function _carregarStatusPush(id) {
    document.getElementById('push-status-area').style.display = 'none';
    try {
        const resp = await _apiGet(`?acao=status_push&id=${id}`);
        if (!resp.sucesso) { _showToast(resp.mensagem, 'erro'); return; }

        const d = resp.dados;
        document.getElementById('push-stat-modo').textContent   = _modoLabel(d.modo_operacao);
        document.getElementById('push-stat-status').innerHTML   =
            d.status_online
                ? '<span class="badge badge-success">Online</span>'
                : '<span class="badge badge-danger">Offline</span>';
        document.getElementById('push-stat-ping').textContent   = d.push_ultimo_contato ? _formatarData(d.push_ultimo_contato) : '—';
        document.getElementById('push-stat-fila').textContent   = d.fila_pendente ?? 0;
        document.getElementById('push-stat-eventos').textContent = d.total_eventos ?? 0;
        document.getElementById('push-stat-url').textContent    = d.push_server_url || d.online_server_url || '—';
        document.getElementById('push-status-area').style.display = 'block';

        // Pre-preencher formulários com URLs atuais
        if (d.push_server_url)
            document.getElementById('push-url').value = d.push_server_url;
        if (d.online_server_url)
            document.getElementById('online-servidor').value = d.online_server_url;

        // Atualizar fila
        await _carregarFilaPush();

    } catch (err) {
        console.error('[Dispositivos Push] Erro ao carregar status:', err);
    }
}

async function _acionarPush(tipo, payload, resultadoId, msgProgresso) {
    const el = document.getElementById(resultadoId);
    if (!el) return;
    el.style.display = 'none';

    const btn = tipo === 'configurar_push'  ? document.getElementById('btnConfigurarPush') :
                tipo === 'configurar_online' ? document.getElementById('btnConfigurarOnline') :
                                               document.getElementById('btnEnviarComandoPush');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${msgProgresso}`; }

    console.log(`[Dispositivos Push] Ação: ${tipo}`, payload);

    try {
        const resp = await _api(payload);
        console.log(`[Dispositivos Push] Resposta ${tipo}:`, resp);

        el.className = resp.sucesso
            ? 'sync-resultado-box sync-resultado-sucesso'
            : 'sync-resultado-box sync-resultado-erro';
        el.innerHTML = resp.sucesso
            ? `<div class="resultado-sucesso"><i class="fas fa-check-circle"></i> <strong>${_esc(resp.mensagem)}</strong></div>
               ${_renderDadosPush(tipo, resp.dados)}`
            : `<div class="resultado-erro"><i class="fas fa-times-circle"></i> <strong>Erro:</strong> ${_esc(resp.mensagem)}</div>`;
        el.style.display = 'block';

        if (resp.sucesso) {
            const id = parseInt(payload.id);
            if (id) await _carregarStatusPush(id);
            _carregarDispositivos();
        }
    } catch (err) {
        console.error(`[Dispositivos Push] Erro ${tipo}:`, err);
        el.className = 'sync-resultado-box sync-resultado-erro';
        el.innerHTML = '<div class="resultado-erro"><i class="fas fa-times-circle"></i> Erro de comunicação com a API.</div>';
        el.style.display = 'block';
    } finally {
        if (btn) {
            btn.disabled = false;
            const icons = { configurar_push: 'satellite-dish', configurar_online: 'wifi', enviar_comando: 'paper-plane' };
            const labels = { configurar_push: 'Configurar Push Mode', configurar_online: 'Configurar Online Mode', enviar_comando: 'Enfileirar Comando' };
            btn.innerHTML = `<i class="fas fa-${icons[tipo] || 'check'}"></i> ${labels[tipo] || 'OK'}`;
        }
    }
}

function _renderDadosPush(tipo, dados) {
    if (!dados) return '';
    if (tipo === 'configurar_push') {
        return `<div class="resultado-stats">
          <span class="stat-item stat-total">URL: ${_esc(dados.push_url)}</span>
          <span class="stat-item stat-sucesso">Intervalo: ${dados.periodo}s</span>
        </div>`;
    }
    if (tipo === 'configurar_online') {
        return `<div class="resultado-stats">
          <span class="stat-item stat-total">Modo: ${_esc(dados.modo)}</span>
          <span class="stat-item stat-sucesso">Servidor: ${_esc(dados.servidor)}</span>
        </div>`;
    }
    if (tipo === 'enviar_comando') {
        return `<div class="resultado-stats">
          <span class="stat-item stat-total">Fila ID: #${dados.queue_id}</span>
          <span class="stat-item">Endpoint: ${_esc(dados.endpoint)}</span>
        </div>`;
    }
    return '';
}

async function _carregarFilaPush() {
    const tbody = document.getElementById('tbody-fila-push');
    const dispId = document.getElementById('push-dispositivo-id')?.value || '';
    const url = `?acao=fila_push&limit=30${dispId ? '&dispositivo_id=' + dispId : ''}`;
    try {
        const resp = await _apiGet(url);
        const fila = resp.dados?.fila || [];
        if (!fila.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhum comando na fila.</td></tr>';
            return;
        }
        tbody.innerHTML = fila.map(c => {
            const statusClass = { pendente: 'badge-warning', enviado: 'badge-info',
                                  executado: 'badge-success', erro: 'badge-danger' }[c.status] || 'badge-secondary';
            return `<tr>
              <td>${c.id}</td>
              <td>${_esc(c.dispositivo_nome || '—')}</td>
              <td><code>${_esc(c.endpoint)}</code></td>
              <td><span class="badge badge-secondary">${c.verb}</span></td>
              <td><span class="badge ${statusClass}">${c.status}</span></td>
              <td>${c.tentativas}</td>
              <td>${_formatarData(c.criado_em)}</td>
              <td>${c.executado_em ? _formatarData(c.executado_em) : '—'}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('[Dispositivos] Erro ao carregar fila push:', err);
    }
}

// ============================================================
// EVENTOS — Recebidos via Push/Online Mode
// ============================================================
function _setupEventos() {
    _on(document.getElementById('btnAtualizarEventos'), 'click', _carregarEventos);
    _on(document.getElementById('filtro-eventos-disp'), 'change', _carregarEventos);
    _on(document.getElementById('filtro-eventos-tipo'), 'change', _carregarEventos);

    const chkAutoRefresh = document.getElementById('eventos-auto-refresh');
    if (chkAutoRefresh) {
        _on(chkAutoRefresh, 'change', () => {
            if (chkAutoRefresh.checked) _iniciarAutoRefresh();
            else _pararAutoRefresh();
        });
    }
}

function _iniciarAutoRefresh() {
    _pararAutoRefresh();
    const badge = document.getElementById('eventos-live-badge');
    if (badge) badge.style.display = 'inline-flex';
    _autoRefreshTimer = setInterval(() => {
        const aba = document.querySelector('.page-dispositivos .tab-btn[data-tab="eventos"]');
        if (aba?.classList.contains('active')) _carregarEventos();
    }, 10000);
}

function _pararAutoRefresh() {
    if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
    const badge = document.getElementById('eventos-live-badge');
    if (badge) badge.style.display = 'none';
}

async function _carregarEventos() {
    const tbody  = document.getElementById('tbody-eventos');
    const dispId = document.getElementById('filtro-eventos-disp')?.value || '';
    const tipo   = document.getElementById('filtro-eventos-tipo')?.value  || '';
    let url = `?acao=eventos&limit=100`;
    if (dispId) url += `&dispositivo_id=${dispId}`;
    if (tipo)   url += `&tipo=${encodeURIComponent(tipo)}`;

    try {
        const resp = await _apiGet(url);
        const eventos = resp.dados?.eventos || [];
        if (!eventos.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum evento recebido.</td></tr>';
            return;
        }
        tbody.innerHTML = eventos.map(ev => {
            const acessoClass = ev.acesso_liberado == 1 ? 'badge-success' : 'badge-danger';
            const acessoTxt   = ev.acesso_liberado == 1 ? 'Liberado' : 'Negado';
            const tipoLabel   = _tipoEventoLabel(ev.tipo_evento);
            const identificador = ev.tag_value || ev.card_value || ev.qrcode_value || '—';
            return `<tr class="${ev.acesso_liberado == 1 ? '' : 'row-negado'}">
              <td>${_formatarData(ev.data_recebimento)}</td>
              <td>${_esc(ev.dispositivo_nome || '—')}</td>
              <td><span class="badge badge-info">${tipoLabel}</span></td>
              <td><code>${_esc(identificador)}</code></td>
              <td>${ev.placa ? `<strong>${_esc(ev.placa)}</strong><br><small>${_esc(ev.veiculo_modelo || '')} ${_esc(ev.cor || '')}</small>` : '—'}</td>
              <td>${ev.morador_nome ? `${_esc(ev.morador_nome)}<br><small>${_esc(ev.unidade || '')}</small>` : '—'}</td>
              <td><span class="badge ${acessoClass}">${acessoTxt}</span></td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('[Dispositivos] Erro ao carregar eventos:', err);
    }
}

// ============================================================
// Sincronizar selects de dispositivos para Push e Eventos
// ============================================================
function _carregarSelectDispositivos(lista) {
    if (!lista) return;
    const opts = lista.map(d => `<option value="${d.id}">${_esc(d.nome)} (${_esc(d.ip_address)})</option>`).join('');

    const selSync      = document.getElementById('sync-dispositivo-id');
    const selFiltro    = document.getElementById('filtro-leituras-disp');
    const selPush      = document.getElementById('push-dispositivo-id');
    const selFiltroEv  = document.getElementById('filtro-eventos-disp');

    if (selSync)     selSync.innerHTML     = '<option value="">— Selecione um dispositivo —</option>' + opts;
    if (selFiltro)   selFiltro.innerHTML   = '<option value="">Todos os dispositivos</option>' + opts;
    if (selPush)     selPush.innerHTML     = '<option value="">— Selecione um dispositivo —</option>' + opts;
    if (selFiltroEv) selFiltroEv.innerHTML = '<option value="">Todos os dispositivos</option>' + opts;
}

// ============================================================
// HELPERS
// ============================================================
async function _api(payload) {
    const resp = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    });
    return resp.json();
}

async function _apiGet(query) {
    const resp = await fetch(API + query, { credentials: 'include' });
    return resp.json();
}

function _showToast(msg, tipo = 'info') {
    if (window.showToast) { window.showToast(msg, tipo); return; }
    if (window.Notificacoes?.mostrar) { window.Notificacoes.mostrar(msg, tipo); return; }
    alert(msg);
}

function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatarData(dt) {
    if (!dt) return '—';
    const d = new Date(dt.replace(' ', 'T'));
    if (isNaN(d)) return dt;
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function _tipoLabel(tipo) {
    const labels = { uhf: 'UHF Veicular', rfid: 'RFID/Wiegand', facial: 'Facial', biometria: 'Biometria', qrcode: 'QR Code', outro: 'Outro' };
    return labels[tipo] || tipo;
}

function _modoLabel(modo) {
    const labels = {
        standalone:         'Standalone (PULL)',
        push:               'Push Polling',
        online_pro:         'Online Pro',
        online_enterprise:  'Online Enterprise'
    };
    return labels[modo] || modo || '—';
}

function _tipoEventoLabel(tipo) {
    const labels = {
        uhf_tag:         'UHF Tag',
        card:            'Cartão',
        qrcode:          'QR Code',
        user_identified: 'Identificado Pro',
        heartbeat:       'Heartbeat',
        dao:             'Monitor DAO',
        door:            'Porta/Relay'
    };
    return labels[tipo] || tipo || '—';
}

function _eventoLabel(ev) {
    const labels = { 0: 'Equip. inválido', 1: 'Parâm. inválidos', 2: 'Não identificado', 3: 'Ident. pendente',
                     4: 'Tempo esgotado', 5: 'Acesso negado', 6: 'Acesso concedido', 7: 'Acesso pendente',
                     8: 'Não é admin', 9: 'Não identificado', 10: 'Por botoeira', 11: 'Interface web', 12: 'Desistência' };
    return labels[parseInt(ev)] || `Evento ${ev}`;
}

function _resumoDetalhes(detalhes) {
    if (!detalhes) return '—';
    try {
        const d = JSON.parse(detalhes);
        if (d.total !== undefined) return `Total: ${d.total}, Enviados: ${d.enviados || 0}, Erros: ${d.erros || 0}`;
        if (d.total_logs !== undefined) return `Logs: ${d.total_logs}, Importados: ${d.importados || 0}`;
    } catch {}
    return detalhes.substring(0, 80) + (detalhes.length > 80 ? '...' : '');
}

// ============================================================
// BRIDGE / API KEY
// ============================================================
function _setupBridge() {
    // Botão: Gerar nova chave
    _on(document.getElementById('btnGerarKey'), 'click', async () => {
        if (!confirm('Gerar uma nova chave irá invalidar a chave anterior.\nO Bridge precisará ser atualizado com a nova chave.\n\nDeseja continuar?')) return;
        console.log('[Bridge] Gerando nova API Key...');
        try {
            const resp = await _api({ acao: 'gerar_api_key' });
            console.log('[Bridge] Resposta gerar_api_key:', resp);
            if (resp.sucesso) {
                _exibirApiKey(resp.dados.api_key);
                _atualizarConfigPreview(resp.dados.api_key);
                _showToast('Nova chave gerada com sucesso! Atualize o config.json do Bridge.', 'sucesso');
            } else {
                _showToast(resp.mensagem || 'Erro ao gerar chave.', 'erro');
            }
        } catch (err) {
            console.error('[Bridge] Erro ao gerar chave:', err);
            _showToast('Erro de comunicação com a API.', 'erro');
        }
    });

    // Botão: Revogar chave
    _on(document.getElementById('btnRevogarKey'), 'click', async () => {
        if (!confirm('Revogar a chave irá desconectar o Bridge imediatamente.\nVocê precisará gerar uma nova chave e reconfigurá-la.\n\nDeseja continuar?')) return;
        console.log('[Bridge] Revogando API Key...');
        try {
            const resp = await _api({ acao: 'revogar_api_key' });
            if (resp.sucesso) {
                _exibirApiKey('');
                _showToast('Chave revogada. O Bridge foi desconectado.', 'aviso');
            } else {
                _showToast(resp.mensagem || 'Erro ao revogar.', 'erro');
            }
        } catch (err) {
            _showToast('Erro de comunicação com a API.', 'erro');
        }
    });

    // Botão: Mostrar/ocultar chave
    _on(document.getElementById('btnToggleKeyVisibility'), 'click', () => {
        const input = document.getElementById('bridge-api-key-input');
        const icon  = document.getElementById('bridge-key-eye-icon');
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    });

    // Botão: Copiar chave
    _on(document.getElementById('btnCopiarKey'), 'click', async () => {
        const input = document.getElementById('bridge-api-key-input');
        if (!input?.value) { _showToast('Nenhuma chave para copiar.', 'aviso'); return; }
        try {
            await navigator.clipboard.writeText(input.value);
            const feedback = document.getElementById('bridge-key-copy-feedback');
            if (feedback) {
                feedback.style.display = 'flex';
                setTimeout(() => { feedback.style.display = 'none'; }, 3000);
            }
            console.log('[Bridge] Chave copiada para a área de transferência.');
        } catch {
            // Fallback para navegadores sem clipboard API
            input.type = 'text';
            input.select();
            document.execCommand('copy');
            _showToast('Chave copiada!', 'sucesso');
        }
    });

    // Botão: Copiar config.json
    _on(document.getElementById('btnCopiarConfigJson'), 'click', async () => {
        const pre = document.getElementById('bridge-config-preview');
        if (!pre) return;
        try {
            await navigator.clipboard.writeText(pre.textContent);
            _showToast('Configuração copiada!', 'sucesso');
        } catch {
            _showToast('Não foi possível copiar automaticamente. Selecione o texto manualmente.', 'aviso');
        }
    });

    // Botão: Atualizar status do bridge
    _on(document.getElementById('btnAtualizarStatusBridge'), 'click', () => {
        _carregarStatusBridge();
    });
}

async function _carregarApiKey() {
    console.log('[Bridge] Carregando API Key atual...');
    try {
        const resp = await _apiGet('?acao=obter_api_key');
        console.log('[Bridge] Resposta obter_api_key:', resp);
        if (resp.sucesso) {
            _exibirApiKey(resp.dados?.api_key || '');
        }
    } catch (err) {
        console.error('[Bridge] Erro ao carregar API Key:', err);
    }
}

function _exibirApiKey(chave) {
    const input = document.getElementById('bridge-api-key-input');
    const btnRevogar = document.getElementById('btnRevogarKey');
    if (!input) return;
    input.value = chave || '';
    input.type = 'password';
    const icon = document.getElementById('bridge-key-eye-icon');
    if (icon) icon.className = 'fas fa-eye';
    if (btnRevogar) btnRevogar.style.display = chave ? 'inline-flex' : 'none';
    _atualizarConfigPreview(chave);
}

function _atualizarConfigPreview(chave) {
    const pre = document.getElementById('bridge-config-preview');
    if (!pre) return;
    const url = window.location.origin;
    pre.textContent = JSON.stringify({
        erp: {
            url: url,
            api_key: chave || '(gere a chave acima)',
            poll_interval: 10
        },
        dispositivos: [
            {
                id: 1,
                nome: 'Leitor UHF Portaria',
                ip: '192.168.3.150',
                porta: 80,
                usuario: 'admin',
                senha: 'admin'
            }
        ],
        bridge: {
            porta_local: 8765,
            log_level: 'INFO'
        }
    }, null, 2);
}

async function _carregarStatusBridge() {
    console.log('[Bridge] Verificando status do bridge...');
    try {
        const resp = await _apiGet('?acao=status_bridge');
        console.log('[Bridge] Resposta status_bridge:', resp);
        const dados = resp.dados || {};

        // Status geral
        const online = dados.online == 1 || dados.online === true;
        const statusEl = document.getElementById('bridge-stat-status');
        if (statusEl) {
            statusEl.innerHTML = online
                ? '<span class="badge-online" style="display:inline-block;padding:3px 10px;border-radius:12px;background:#dcfce7;color:#166534;font-size:12px;"><i class="fas fa-circle" style="font-size:8px;"></i> Online</span>'
                : '<span class="badge-offline" style="display:inline-block;padding:3px 10px;border-radius:12px;background:#fee2e2;color:#991b1b;font-size:12px;"><i class="fas fa-circle" style="font-size:8px;"></i> Offline</span>';
        }

        // Versão
        const versaoEl = document.getElementById('bridge-stat-versao');
        if (versaoEl) versaoEl.textContent = dados.versao || '—';

        // Último contato
        const pingEl = document.getElementById('bridge-stat-ping');
        if (pingEl) pingEl.textContent = dados.ultimo_contato ? _formatarData(dados.ultimo_contato) : '—';

        // Dispositivos
        const dispEl = document.getElementById('bridge-stat-dispositivos');
        const dispOnline = dados.dispositivos_online ?? 0;
        const dispTotal  = dados.dispositivos_total  ?? 0;
        if (dispEl) dispEl.textContent = `${dispOnline} / ${dispTotal}`;

        // Tabela de dispositivos do bridge
        const areaDisp = document.getElementById('bridge-dispositivos-area');
        const tbody = document.getElementById('tbody-bridge-dispositivos');
        if (tbody && dados.dispositivos_lista?.length) {
            if (areaDisp) areaDisp.style.display = 'block';
            tbody.innerHTML = dados.dispositivos_lista.map(d => {
                const st = d.online ? '<span style="color:#16a34a;"><i class="fas fa-circle" style="font-size:8px;"></i> Online</span>'
                                    : '<span style="color:#dc2626;"><i class="fas fa-circle" style="font-size:8px;"></i> Offline</span>';
                return `<tr>
                  <td>${_esc(d.nome)}</td>
                  <td><code>${_esc(d.ip)}</code></td>
                  <td>${st}</td>
                  <td>${d.ultimo_contato ? _formatarData(d.ultimo_contato) : '—'}</td>
                  <td>${d.erros_consecutivos ?? 0}</td>
                </tr>`;
            }).join('');
        } else if (areaDisp) {
            areaDisp.style.display = 'none';
        }

    } catch (err) {
        console.error('[Bridge] Erro ao verificar status:', err);
    }
}

// Função global para toggle de senha
window.toggleSenha = function(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fas fa-eye"></i>';
    }
};

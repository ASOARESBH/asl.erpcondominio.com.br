/**
 * dispositivos.js — Módulo de Dispositivos Control ID v1.0
 *
 * Gerencia leitores Control ID (IDUHF, iDAccess, etc.) e integração
 * com a API REST dos equipamentos para sincronização de TAGs UHF.
 */
'use strict';

const API = '../api/api_dispositivos_controlid.php';
let _dispExcluirId = null;
let _listeners = [];

// ============================================================
// INIT / DESTROY
// ============================================================
export function init() {
    console.log('[Dispositivos] Inicializando módulo v1.0...');
    _setupTabs();
    _setupForm();
    _setupSincronizacao();
    _setupModais();
    _carregarDispositivos();
    _carregarSyncLog();
    _carregarLeituras();
    console.log('[Dispositivos] Módulo inicializado.');
}

export function destroy() {
    console.log('[Dispositivos] Destruindo módulo...');
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

function _carregarSelectDispositivos(lista) {
    if (!lista) return;
    const selSync    = document.getElementById('sync-dispositivo-id');
    const selFiltro  = document.getElementById('filtro-leituras-disp');
    const opts = lista.map(d => `<option value="${d.id}">${_esc(d.nome)} (${_esc(d.ip_address)})</option>`).join('');
    if (selSync)   selSync.innerHTML   = '<option value="">— Selecione um dispositivo —</option>' + opts;
    if (selFiltro) selFiltro.innerHTML = '<option value="">Todos os dispositivos</option>' + opts;
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

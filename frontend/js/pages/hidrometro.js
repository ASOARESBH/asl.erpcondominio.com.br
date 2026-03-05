/**
 * Hidrometro Page Module
 * 
 * Gerencia o CRUD completo de hidrômetros:
 *  - Cadastro com seleção de unidade → morador
 *  - Listagem com busca e filtros
 *  - Edição com registro de histórico
 *  - Visualização do histórico de alterações
 * 
 * @module hidrometro
 * @version 2.0.0
 */

'use strict';

// ============================================================
// CONSTANTES
// ============================================================
const API_HIDROMETROS  = window.location.origin + '/api/api_hidrometros.php';
const API_UNIDADES     = window.location.origin + '/api/api_unidades.php';
const API_MORADORES    = window.location.origin + '/api/api_moradores.php';
// ============================================================
// ESTADO DO MÓDULO
// ============================================================

let _state = {
    hidrometros    : [],
    unidades       : [],
    moradores      : [],
    buscarTimer    : null,
    currentTab     : 'cadastro',
    // Referência ao handler para remoção no destroy()
    _modalClickRef : null,
};

// ============================================================
// LIFECYCLE
// ============================================================

export function init() {
    console.log('[Hidrometro] Inicializando módulo v2.0...');

    _setupTabs();
    _setupForms();
    _setDataAtual();
    _carregarUnidades();
    _carregarHidrometros();

    // Listener para fechar modal ao clicar fora — registrado aqui para
    // poder ser removido no destroy() e evitar acúmulo de listeners
    _state._modalClickRef = e => {
        if (e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('show');
            document.body.style.overflow = '';
        }
    };
    document.addEventListener('click', _state._modalClickRef);

    // Expõe API pública para onclick inline
    window.HidrometroPage = {
        buscar          : buscar,
        buscarDebounce  : buscarDebounce,
        limparBusca     : limparBusca,
        limparCadastro  : limparCadastro,
        editar          : abrirModalEditar,
        verHistorico    : abrirModalHistorico,
        fecharModal     : fecharModal,
        salvarEdicao    : salvarEdicao,
    };

    console.log('[Hidrometro] Módulo pronto.');
}

export function destroy() {
    console.log('[Hidrometro] Destruindo módulo...');
    if (_state.buscarTimer) clearTimeout(_state.buscarTimer);
    // Remove o listener de click fora do modal
    if (_state._modalClickRef) {
        document.removeEventListener('click', _state._modalClickRef);
    }
    // Garante que o body scroll seja restaurado
    document.body.style.overflow = '';
    delete window.HidrometroPage;
    _state = { hidrometros: [], unidades: [], moradores: [], buscarTimer: null, currentTab: 'cadastro', _modalClickRef: null };
}

// ============================================================
// TABS
// ============================================================

function _setupTabs() {
    document.querySelectorAll('.page-hidrometro .tab-button').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
    });
}

function _switchTab(tabName) {
    document.querySelectorAll('.page-hidrometro .tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.page-hidrometro .tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    _state.currentTab = tabName;

    // Recarrega lista ao abrir a aba
    if (tabName === 'lista') {
        _carregarHidrometros();
    }
}

// ============================================================
// FORMULÁRIOS
// ============================================================

function _setupForms() {
    // Cadastro
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) {
        formCadastro.addEventListener('submit', e => {
            e.preventDefault();
            _salvarHidrometro();
        });
    }

    // Unidade → Moradores (cadastro)
    const selUnidade = document.getElementById('cad_unidade');
    if (selUnidade) {
        selUnidade.addEventListener('change', () => _carregarMoradoresPorUnidade('cad'));
    }

    // Unidade → Moradores (edição)
    const selEditUnidade = document.getElementById('edit_unidade');
    if (selEditUnidade) {
        selEditUnidade.addEventListener('change', () => _carregarMoradoresPorUnidade('edit'));
    }
}

// ============================================================
// DATA ATUAL
// ============================================================

function _setDataAtual() {
    const campo = document.getElementById('cad_data');
    if (!campo) return;
    const agora = new Date();
    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
    campo.value = agora.toISOString().slice(0, 16);
}

// ============================================================
// CARREGAMENTO DE DADOS
// ============================================================

async function _carregarUnidades() {
    console.log('[Hidrometro] Carregando unidades...');
    try {
        const data = await _apiCall(API_UNIDADES);
        if (!data.sucesso) throw new Error(data.mensagem);

        _state.unidades = data.dados || [];
        _popularSelectUnidades('cad_unidade');
        _popularSelectUnidades('edit_unidade');
        console.log(`[Hidrometro] ${_state.unidades.length} unidades carregadas.`);
    } catch (err) {
        console.error('[Hidrometro] Erro ao carregar unidades:', err);
        _toast('Erro ao carregar unidades: ' + err.message, 'error');
    }
}

function _popularSelectUnidades(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = '<option value="">Selecione uma unidade...</option>';
    _state.unidades.forEach(u => {
        const opt = new Option(u.unidade || u.nome || u, u.unidade || u.nome || u);
        sel.add(opt);
    });
    if (valorAtual) sel.value = valorAtual;
}

async function _carregarMoradoresPorUnidade(prefixo) {
    const unidade = document.getElementById(`${prefixo}_unidade`)?.value;
    const selMorador = document.getElementById(`${prefixo}_morador`);
    if (!selMorador) return;

    selMorador.innerHTML = '<option value="">Carregando...</option>';
    selMorador.disabled = true;

    if (!unidade) {
        selMorador.innerHTML = '<option value="">Primeiro selecione a unidade</option>';
        return;
    }

    try {
        const data = await _apiCall(`${API_MORADORES}?unidade=${encodeURIComponent(unidade)}`);
        selMorador.innerHTML = '<option value="">Selecione um morador...</option>';

        if (data.sucesso && data.dados?.length > 0) {
            data.dados.forEach(m => {
                const opt = new Option(m.nome, m.id);
                selMorador.add(opt);
            });
            selMorador.disabled = false;
        } else {
            selMorador.innerHTML = '<option value="">Nenhum morador nesta unidade</option>';
        }
    } catch (err) {
        console.error('[Hidrometro] Erro ao carregar moradores:', err);
        selMorador.innerHTML = '<option value="">Erro ao carregar moradores</option>';
    }
}

async function _carregarHidrometros(busca = '') {
    console.log('[Hidrometro] Carregando hidrômetros...');
    const loading = document.getElementById('loadingLista');
    const tbody   = document.getElementById('listaHidrometros');

    if (loading) loading.style.display = 'block';
    if (tbody)   tbody.innerHTML = '';

    try {
        const url = busca
            ? `${API_HIDROMETROS}?busca=${encodeURIComponent(busca)}`
            : API_HIDROMETROS;

        const data = await _apiCall(url);
        if (!data.sucesso) throw new Error(data.mensagem);

        _state.hidrometros = data.dados || [];
        _renderTabela(_state.hidrometros);
        _atualizarKPIs(_state.hidrometros);
        console.log(`[Hidrometro] ${_state.hidrometros.length} hidrômetros carregados.`);
    } catch (err) {
        console.error('[Hidrometro] Erro ao carregar hidrômetros:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="9">
                        <i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i>
                        <p>Erro ao carregar dados: ${err.message}</p>
                    </td>
                </tr>`;
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// ============================================================
// RENDER TABELA
// ============================================================

function _renderTabela(lista) {
    const tbody = document.getElementById('listaHidrometros');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <i class="fas fa-tint"></i>
                    <p>Nenhum hidrômetro encontrado</p>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = lista.map(h => {
        const ativo = h.ativo == 1;
        const badge = ativo
            ? '<span class="badge badge-active"><i class="fas fa-check"></i> Ativo</span>'
            : '<span class="badge badge-inactive"><i class="fas fa-times"></i> Inativo</span>';

        const ultimaLeitura = h.ultima_leitura != null
            ? `${parseFloat(h.ultima_leitura).toFixed(2)} m³`
            : '<span style="color:#94a3b8;">Sem leitura</span>';

        return `
            <tr>
                <td><strong>#${h.id}</strong></td>
                <td>${_esc(h.unidade)}</td>
                <td>${_esc(h.morador_nome)}</td>
                <td><strong>${_esc(h.numero_hidrometro)}</strong></td>
                <td>${_esc(h.numero_lacre) || '<span style="color:#94a3b8;">N/A</span>'}</td>
                <td>${_esc(h.data_instalacao_formatada)}</td>
                <td>${ultimaLeitura}</td>
                <td>${badge}</td>
                <td>
                    <button class="action-btn edit" title="Editar"
                        onclick="window.HidrometroPage.editar(${h.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn history" title="Histórico"
                        onclick="window.HidrometroPage.verHistorico(${h.id})">
                        <i class="fas fa-history"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
}

// ============================================================
// KPIs
// ============================================================

function _atualizarKPIs(lista) {
    const total      = lista.length;
    const ativos     = lista.filter(h => h.ativo == 1).length;
    const inativos   = total - ativos;
    const comLeitura = lista.filter(h => h.ultima_leitura != null).length;

    _setEl('kpi_total',      total);
    _setEl('kpi_ativos',     ativos);
    _setEl('kpi_inativos',   inativos);
    _setEl('kpi_com_leitura', comLeitura);
}

// ============================================================
// CADASTRO
// ============================================================

async function _salvarHidrometro() {
    const moradorId = document.getElementById('cad_morador')?.value;
    const unidade   = document.getElementById('cad_unidade')?.value;
    const numero    = document.getElementById('cad_numero')?.value?.trim();
    const lacre     = document.getElementById('cad_lacre')?.value?.trim();
    const data      = document.getElementById('cad_data')?.value;

    if (!moradorId || !unidade || !numero || !data) {
        _toast('Preencha todos os campos obrigatórios.', 'warning');
        return;
    }

    const payload = {
        morador_id          : parseInt(moradorId),
        unidade             : unidade,
        numero_hidrometro   : numero,
        numero_lacre        : lacre || '',
        data_instalacao     : data,
    };

    console.log('[Hidrometro] Salvando:', payload);

    try {
        const data_resp = await _apiCall(API_HIDROMETROS, {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json' },
            body    : JSON.stringify(payload),
        });

        if (!data_resp.sucesso) throw new Error(data_resp.mensagem);

        _toast('Hidrômetro cadastrado com sucesso!', 'success');
        limparCadastro();
        _carregarHidrometros();
        _switchTab('lista');
    } catch (err) {
        console.error('[Hidrometro] Erro ao salvar:', err);
        _toast('Erro ao cadastrar: ' + err.message, 'error');
    }
}

function limparCadastro() {
    document.getElementById('formCadastro')?.reset();
    const selMorador = document.getElementById('cad_morador');
    if (selMorador) {
        selMorador.innerHTML = '<option value="">Primeiro selecione a unidade</option>';
        selMorador.disabled = true;
    }
    _setDataAtual();
}

// ============================================================
// BUSCA
// ============================================================

function buscar() {
    const termo = document.getElementById('busca')?.value?.trim() || '';
    _carregarHidrometros(termo);
}

function buscarDebounce() {
    if (_state.buscarTimer) clearTimeout(_state.buscarTimer);
    _state.buscarTimer = setTimeout(buscar, 400);
}

function limparBusca() {
    const campo = document.getElementById('busca');
    if (campo) campo.value = '';
    _carregarHidrometros();
}

// ============================================================
// MODAL EDITAR
// ============================================================

async function abrirModalEditar(id) {
    console.log('[Hidrometro] Abrindo edição do ID:', id);

    const hidrometro = _state.hidrometros.find(h => h.id == id);
    if (!hidrometro) {
        _toast('Hidrômetro não encontrado na lista. Recarregue a página.', 'error');
        return;
    }

    // Preencher campos
    _setEl('edit_id',                 hidrometro.id,                  'value');
    _setEl('edit_numero_hidrometro',  hidrometro.numero_hidrometro,   'value');
    _setEl('edit_numero_lacre',       hidrometro.numero_lacre || '',  'value');
    _setEl('edit_ativo',              hidrometro.ativo,               'value');
    _setEl('edit_observacao',         '',                             'value');

    // Data instalação: converter para datetime-local
    const dataRaw = hidrometro.data_instalacao_formatada || '';
    if (dataRaw) {
        // Formato vindo da API: dd/mm/yyyy HH:ii → converter para yyyy-mm-ddTHH:ii
        const partes = dataRaw.split(' ');
        if (partes.length === 2) {
            const [d, m, y] = partes[0].split('/');
            const hora = partes[1].slice(0, 5);
            _setEl('edit_data_instalacao', `${y}-${m}-${d}T${hora}`, 'value');
        }
    }

    // Popular select de unidades e aguardar
    _popularSelectUnidades('edit_unidade');
    const selUnidade = document.getElementById('edit_unidade');
    if (selUnidade) selUnidade.value = hidrometro.unidade;

    // Carregar moradores da unidade e selecionar o correto
    await _carregarMoradoresPorUnidade('edit');
    const selMorador = document.getElementById('edit_morador');
    if (selMorador) selMorador.value = hidrometro.morador_id;

    abrirModal('modalEditar');
}

async function salvarEdicao() {
    const id       = document.getElementById('edit_id')?.value;
    const moradorId= document.getElementById('edit_morador')?.value;
    const unidade  = document.getElementById('edit_unidade')?.value;
    const numero   = document.getElementById('edit_numero_hidrometro')?.value?.trim();
    const lacre    = document.getElementById('edit_numero_lacre')?.value?.trim();
    const dataInst = document.getElementById('edit_data_instalacao')?.value;
    const ativo    = document.getElementById('edit_ativo')?.value;
    const obs      = document.getElementById('edit_observacao')?.value?.trim();

    if (!id || !moradorId || !unidade || !numero || !dataInst || !obs) {
        _toast('Preencha todos os campos obrigatórios, incluindo o motivo da alteração.', 'warning');
        return;
    }

    const payload = {
        id                  : parseInt(id),
        morador_id          : parseInt(moradorId),
        unidade             : unidade,
        numero_hidrometro   : numero,
        numero_lacre        : lacre || '',
        data_instalacao     : dataInst,
        ativo               : parseInt(ativo),
        observacao          : obs,
    };

    console.log('[Hidrometro] Atualizando:', payload);

    try {
        const data = await _apiCall(API_HIDROMETROS, {
            method  : 'PUT',
            headers : { 'Content-Type': 'application/json' },
            body    : JSON.stringify(payload),
        });

        if (!data.sucesso) throw new Error(data.mensagem);

        _toast('Hidrômetro atualizado com sucesso!', 'success');
        fecharModal('modalEditar');
        _carregarHidrometros();
    } catch (err) {
        console.error('[Hidrometro] Erro ao atualizar:', err);
        _toast('Erro ao atualizar: ' + err.message, 'error');
    }
}

// ============================================================
// MODAL HISTÓRICO
// ============================================================

async function abrirModalHistorico(id) {
    console.log('[Hidrometro] Carregando histórico do ID:', id);

    const container = document.getElementById('historicoContent');
    if (container) {
        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Carregando histórico...</p>
            </div>`;
    }

    abrirModal('modalHistorico');

    try {
        const data = await _apiCall(`${API_HIDROMETROS}?historico=${id}`);
        if (!data.sucesso) throw new Error(data.mensagem);

        const historico = data.dados || [];

        if (historico.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <span>Nenhuma alteração registrada para este hidrômetro.</span>
                </div>`;
            return;
        }

        const camposLabel = {
            morador_id          : 'Morador',
            numero_hidrometro   : 'Nº Hidrômetro',
            numero_lacre        : 'Nº Lacre',
            ativo               : 'Status',
        };

        container.innerHTML = `
            <div class="historico-list">
                ${historico.map(h => `
                    <div class="historico-item">
                        <div class="hist-meta">
                            <span class="hist-campo">
                                <i class="fas fa-tag"></i>
                                ${camposLabel[h.campo_alterado] || h.campo_alterado}
                            </span>
                            <span class="hist-data">
                                <i class="fas fa-clock"></i> ${_esc(h.data_formatada)}
                            </span>
                        </div>
                        <div class="hist-valores">
                            <span class="hist-anterior">
                                <i class="fas fa-arrow-right"></i> Antes: ${_esc(h.valor_anterior)}
                            </span>
                            <span class="hist-novo">
                                <i class="fas fa-check"></i> Depois: ${_esc(h.valor_novo)}
                            </span>
                        </div>
                        <div class="hist-obs">
                            <i class="fas fa-comment"></i> ${_esc(h.observacao)}
                        </div>
                    </div>
                `).join('')}
            </div>`;
    } catch (err) {
        console.error('[Hidrometro] Erro ao carregar histórico:', err);
        if (container) {
            container.innerHTML = `
                <div class="alert alert-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>Erro ao carregar histórico: ${err.message}</span>
                </div>`;
        }
    }
}

// ============================================================
// MODAL HELPERS
// ============================================================

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Listener de click fora do modal movido para init() — ver acima

// ============================================================
// API HELPER
// ============================================================

/**
 * Wrapper defensivo para fetch — garante que erros de rede e
 * respostas não-JSON sejam tratados de forma consistente.
 */
async function _apiCall(url, options = {}) {
    const defaultOptions = {
        credentials : 'include',
        headers     : { 'Accept': 'application/json', ...(options.headers || {}) },
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error('[Hidrometro] Resposta não-JSON:', text.slice(0, 200));
        throw new Error(`Servidor retornou resposta inválida (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (!response.ok && data.mensagem) {
        throw new Error(data.mensagem);
    }

    return data;
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function _toast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success : 'fa-check-circle',
        error   : 'fa-exclamation-circle',
        warning : 'fa-exclamation-triangle',
        info    : 'fa-info-circle',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `
        <i class="fas ${icons[tipo] || icons.info}"></i>
        <span>${_esc(mensagem)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function _esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _setEl(id, valor, prop = 'textContent') {
    const el = document.getElementById(id);
    if (el) el[prop] = valor ?? '';
}

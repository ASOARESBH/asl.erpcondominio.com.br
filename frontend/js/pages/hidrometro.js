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
    hidrometros    : [],   // lista completa (após ordenação)
    unidades       : [],
    moradores      : [],
    buscarTimer    : null,
    currentTab     : 'cadastro',
    // Paginação
    currentPage    : 1,
    perPage        : 20,
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
        // Fechar dropdown de patrimônio ao clicar fora
        const dropdown = document.getElementById('patrimonioDropdown');
        const inputBusca = document.getElementById('cad_patrimonio_busca');
        if (dropdown && !dropdown.contains(e.target) && e.target !== inputBusca) {
            dropdown.style.display = 'none';
        }
    };
    document.addEventListener('click', _state._modalClickRef);

    // Expõe API pública para onclick inline
    window.HidrometroPage = {
        buscar              : buscar,
        buscarDebounce      : buscarDebounce,
        limparBusca         : limparBusca,
        limparCadastro      : limparCadastro,
        editar              : abrirModalEditar,
        verHistorico        : abrirModalHistorico,
        fecharModal         : fecharModal,
        salvarEdicao        : salvarEdicao,
        buscarPatrimonio    : buscarPatrimonio,
        limparPatrimonio    : limparPatrimonio,
        selecionarPatrimonio: selecionarPatrimonio,
        irParaPagina        : irParaPagina,
        alterarPerPage      : alterarPerPage,
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
    _state = { hidrometros: [], unidades: [], moradores: [], buscarTimer: null, currentTab: 'cadastro', currentPage: 1, perPage: 20, _modalClickRef: null };
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

    // Ordena: ADMINISTRATIVO primeiro, depois numericamente (Gleba 1, 2, 3...)
    const isAdm      = str => /adm/i.test(str || '');
    const numericKey = str => { const m = (str || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : Infinity; };

    const ordenadas = [..._state.unidades].sort((a, b) => {
        const nomeA = a.unidade || a.nome || a;
        const nomeB = b.unidade || b.nome || b;
        const admA  = isAdm(nomeA);
        const admB  = isAdm(nomeB);
        if (admA && !admB) return -1;
        if (!admA && admB) return  1;
        const nA = numericKey(nomeA);
        const nB = numericKey(nomeB);
        if (nA !== nB) return nA - nB;
        return nomeA.localeCompare(nomeB, 'pt-BR', { numeric: true });
    });

    ordenadas.forEach(u => {
        const nome = u.unidade || u.nome || u;
        const opt  = new Option(nome, nome);
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

        _state.hidrometros = _ordenarHidrometros(data.dados || []);
        _state.currentPage = 1;  // reset página ao recarregar
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
// ORDENAÇÃO
// ============================================================

/**
 * Ordena a lista de hidrômetros:
 *  1º Unidades que contêm "adm" ou "administrativo" (case-insensitive)
 *  2º Demais unidades, ordenadas numericamente (extraí o primeiro número encontrado)
 *     e alfabética como desempate.
 */
function _ordenarHidrometros(lista) {
    const isAdm = str => /adm/i.test(str || '');

    // Extrai o primeiro número de uma string para ordenação numérica
    const numericKey = str => {
        const m = (str || '').match(/(\d+)/);
        return m ? parseInt(m[1], 10) : Infinity;
    };

    return [...lista].sort((a, b) => {
        const admA = isAdm(a.unidade);
        const admB = isAdm(b.unidade);

        // Administrativos sempre primeiro
        if (admA && !admB) return -1;
        if (!admA && admB) return  1;

        // Ambos administrativos ou ambos normais: ordenação numérica
        const nA = numericKey(a.unidade);
        const nB = numericKey(b.unidade);
        if (nA !== nB) return nA - nB;

        // Desempate alfabético
        return (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR', { numeric: true });
    });
}

// ============================================================
// RENDER TABELA (com paginação)
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
        _renderPaginacao(0);
        return;
    }

    const total      = lista.length;
    const perPage    = _state.perPage;
    const totalPages = Math.ceil(total / perPage);

    // Garante que currentPage está dentro dos limites
    if (_state.currentPage < 1)           _state.currentPage = 1;
    if (_state.currentPage > totalPages)  _state.currentPage = totalPages;

    const start  = (_state.currentPage - 1) * perPage;
    const end    = Math.min(start + perPage, total);
    const pagina = lista.slice(start, end);

    tbody.innerHTML = pagina.map(h => {
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

    _renderPaginacao(total);
}

// ============================================================
// PAGINAÇÃO
// ============================================================

function _renderPaginacao(total) {
    // Garante que o container de paginação existe; cria se necessário
    let container = document.getElementById('paginacaoHidrometros');
    if (!container) {
        const tableCard = document.querySelector('.page-hidrometro .table-container')?.closest('.page-card');
        if (tableCard) {
            container = document.createElement('div');
            container.id = 'paginacaoHidrometros';
            container.className = 'hidrometro-pagination';
            tableCard.appendChild(container);
        }
    }
    if (!container) return;

    const perPage    = _state.perPage;
    const totalPages = Math.ceil(total / perPage);
    const current    = _state.currentPage;

    if (totalPages <= 1) {
        container.innerHTML = total > 0
            ? `<div class="pagination-info">Exibindo <strong>${total}</strong> hidrômetro${total !== 1 ? 's' : ''}</div>`
            : '';
        return;
    }

    // Gera os botões de página com janela deslizante
    const pages = [];
    const delta = 2;
    const left  = Math.max(1, current - delta);
    const right = Math.min(totalPages, current + delta);

    if (left > 1) {
        pages.push(1);
        if (left > 2) pages.push('...');
    }
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages) {
        if (right < totalPages - 1) pages.push('...');
        pages.push(totalPages);
    }

    const inicio = (current - 1) * perPage + 1;
    const fim    = Math.min(current * perPage, total);

    container.innerHTML = `
        <div class="pagination-info">
            Exibindo <strong>${inicio}–${fim}</strong> de <strong>${total}</strong> hidrômetros
        </div>
        <div class="pagination-controls">
            <button class="page-btn" ${current === 1 ? 'disabled' : ''}
                onclick="window.HidrometroPage.irParaPagina(${current - 1})" title="Página anterior">
                <i class="fas fa-chevron-left"></i>
            </button>
            ${pages.map(p => p === '...'
                ? '<span class="page-ellipsis">…</span>'
                : `<button class="page-btn ${p === current ? 'active' : ''}"
                    onclick="window.HidrometroPage.irParaPagina(${p})">${p}</button>`
            ).join('')}
            <button class="page-btn" ${current === totalPages ? 'disabled' : ''}
                onclick="window.HidrometroPage.irParaPagina(${current + 1})" title="Próxima página">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="pagination-perpage">
            <label>Por página:
                <select onchange="window.HidrometroPage.alterarPerPage(this.value)">
                    ${[10, 20, 50, 100].map(n =>
                        `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`
                    ).join('')}
                </select>
            </label>
        </div>`;
}

function irParaPagina(pagina) {
    const total      = _state.hidrometros.length;
    const totalPages = Math.ceil(total / _state.perPage);
    const p          = parseInt(pagina, 10);
    if (isNaN(p) || p < 1 || p > totalPages) return;
    _state.currentPage = p;
    _renderTabela(_state.hidrometros);
    // Scroll suave até o topo da tabela
    document.getElementById('listaHidrometros')
        ?.closest('.page-card')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function alterarPerPage(valor) {
    _state.perPage     = parseInt(valor, 10) || 20;
    _state.currentPage = 1;
    _renderTabela(_state.hidrometros);
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

    const inventarioId = document.getElementById('cad_inventario_id')?.value;

    const payload = {
        morador_id          : parseInt(moradorId),
        unidade             : unidade,
        numero_hidrometro   : numero,
        numero_lacre        : lacre || '',
        data_instalacao     : data,
        inventario_id       : inventarioId ? parseInt(inventarioId) : null,
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
    // Limpar campo de patrimônio
    limparPatrimonio();
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
// BUSCA DE PATRIMÔNIO (INVENTÁRIO)
// ============================================================

const API_INVENTARIO = window.location.origin + '/api/api_inventario.php';
let _patrimonioTimer = null;

/**
 * Busca patrimônios no inventário filtrados por:
 * - status = ativo
 * - situacao = circulante
 * - grupo = Hidrômetros
 */
async function buscarPatrimonio(termo) {
    if (_patrimonioTimer) clearTimeout(_patrimonioTimer);

    const dropdown = document.getElementById('patrimonioDropdown');
    if (!dropdown) return;

    if (!termo || termo.length < 1) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    _patrimonioTimer = setTimeout(async () => {
        dropdown.style.display = 'block';
        dropdown.innerHTML = '<div style="padding:0.75rem 1rem;color:#64748b;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';

        try {
            const url = `${API_INVENTARIO}?busca=${encodeURIComponent(termo)}&status=ativo&situacao=circulante&grupo_nome=Hidr%C3%B4metros`;
            const data = await _apiCall(url);

            const itens = data.dados || data.itens || [];

            if (itens.length === 0) {
                dropdown.innerHTML = '<div style="padding:0.75rem 1rem;color:#94a3b8;font-size:13px;">Nenhum item encontrado</div>';
                return;
            }

            dropdown.innerHTML = itens.map(item => `
                <div onclick="window.HidrometroPage.selecionarPatrimonio(${item.id}, '${_esc(item.numero_patrimonio)}', '${_esc(item.nome_item)}')" style="
                    padding:0.65rem 1rem;
                    cursor:pointer;
                    border-bottom:1px solid #f1f5f9;
                    font-size:13px;
                    transition:background 0.15s;
                " onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background=''">
                    <strong style="color:#1e293b;">${_esc(item.numero_patrimonio)}</strong>
                    <span style="color:#64748b;"> — ${_esc(item.nome_item)}</span>
                    ${item.modelo ? `<span style="color:#94a3b8;font-size:11px;"> (${_esc(item.modelo)})</span>` : ''}
                </div>
            `).join('');

        } catch (err) {
            console.error('[Hidrometro] Erro ao buscar patrimônio:', err);
            dropdown.innerHTML = '<div style="padding:0.75rem 1rem;color:#ef4444;font-size:13px;">Erro ao buscar</div>';
        }
    }, 350);
}

function selecionarPatrimonio(id, numero, nome) {
    const inputBusca = document.getElementById('cad_patrimonio_busca');
    const inputId    = document.getElementById('cad_inventario_id');
    const dropdown   = document.getElementById('patrimonioDropdown');

    if (inputBusca) inputBusca.value = `${numero} — ${nome}`;
    if (inputId)    inputId.value    = id;
    if (dropdown)   dropdown.style.display = 'none';

    console.log(`[Hidrometro] Patrimônio selecionado: ID=${id}, Nº=${numero}`);
}

function limparPatrimonio() {
    const inputBusca = document.getElementById('cad_patrimonio_busca');
    const inputId    = document.getElementById('cad_inventario_id');
    const dropdown   = document.getElementById('patrimonioDropdown');

    if (inputBusca) inputBusca.value = '';
    if (inputId)    inputId.value    = '';
    if (dropdown)   dropdown.style.display = 'none';
}

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

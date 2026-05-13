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
const API_HIDROMETROS    = window.location.origin + '/api/api_hidrometros.php';
const API_UNIDADES       = window.location.origin + '/api/api_unidades.php';
const API_MORADORES      = window.location.origin + '/api/api_moradores.php';
const API_LEITURAS       = window.location.origin + '/api/api_leituras.php';
const API_CONFIG_PERIODO = window.location.origin + '/api/api_config_periodo_leitura.php';

// Tarifas de água
const VALOR_M3       = 6.16;
const VALOR_MINIMO   = 61.60;
const CONSUMO_MINIMO = 10;
const ITENS_POR_PAG  = 20;
// ============================================================
// ESTADO DO MÓDULO
// ============================================================

let _state = {
    hidrometros      : [],   // lista completa (após ordenação)
    unidades         : [],
    moradores        : [],
    buscarTimer      : null,
    currentTab       : 'cadastro',
    currentSubTab    : 'individual',
    // Paginação hidrômetros
    currentPage      : 1,
    perPage          : 20,
    // Leituras coletivas
    hidrometrosAtivos: [],
    paginaAtual      : 1,
    totalPaginas     : 1,
    // Referência ao handler para remoção no destroy()
    _modalClickRef   : null,
};

// ============================================================
// LIFECYCLE
// ============================================================

export function init() {
    console.log('[Hidrometro] Inicializando módulo v2.0...');

    _setupTabs();
    _setupSubTabs();
    _setupForms();
    _setupFormsLeitura();
    _setDataAtual();
    _setDataAtual('ind_data_leitura');
    _setDataAtual('col_data_leitura');
    _carregarUnidades();
    _carregarHidrometros();
    leituraCarregarConfigPeriodo();

    // Listener para fechar modal ao clicar fora — registrado aqui para
    // poder ser removido no destroy() e evitar acúmulo de listeners
    _state._modalClickRef = e => {
        if (e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('show');
            document.body.style.overflow = '';
        }
        // Fechar dropdown de patrimônio (cadastro) ao clicar fora
        const dropdown = document.getElementById('patrimonioDropdown');
        const inputBusca = document.getElementById('cad_patrimonio_busca');
        if (dropdown && !dropdown.contains(e.target) && e.target !== inputBusca) {
            dropdown.style.display = 'none';
        }
        // Fechar dropdown de patrimônio (edição) ao clicar fora
        const dropdownEdit = document.getElementById('editPatrimonioDropdown');
        const inputBuscaEdit = document.getElementById('edit_patrimonio_busca');
        if (dropdownEdit && !dropdownEdit.contains(e.target) && e.target !== inputBuscaEdit) {
            dropdownEdit.style.display = 'none';
        }
    };
    document.addEventListener('click', _state._modalClickRef);

    // Expõe API pública para onclick inline
    window.HidrometroPage = {
        // Hidrômetros
        buscar              : buscar,
        buscarDebounce      : buscarDebounce,
        limparBusca         : limparBusca,
        limparCadastro      : limparCadastro,
        editar              : abrirModalEditar,
        verHistorico        : abrirModalHistorico,
        fecharModal         : fecharModal,
        salvarEdicao        : salvarEdicao,
        buscarPatrimonio        : buscarPatrimonio,
        limparPatrimonio        : limparPatrimonio,
        selecionarPatrimonio    : selecionarPatrimonio,
        buscarPatrimonioEdit    : buscarPatrimonioEdit,
        limparPatrimonioEdit    : limparPatrimonioEdit,
        selecionarPatrimonioEdit: selecionarPatrimonioEdit,
        irParaPagina        : irParaPagina,
        alterarPerPage      : alterarPerPage,
        // Leituras
        calcularPreview         : leituraCalcularPreview,
        limparIndividual        : leituraLimparIndividual,
        carregarColetiva        : leituraCarregarHidrometrosAtivos,
        selecionarTodos         : leituraSelecionarTodos,
        lancarSelecionados      : leituraLancarSelecionados,
        limparSelecao           : leituraLimparSelecao,
        mudarPagina             : leituraMudarPagina,
        buscarHistorico         : leituraBuscarHistorico,
        carregarConfigPeriodo   : leituraCarregarConfigPeriodo,
        // Relatórios
        gerarRelatorio          : relatorioGerar,
        exportarRelatorioCSV    : relatorioExportarCSV,
        // Demonstrativo de água
        gerarDemonstrativo      : gerarDemonstrativo,
    };

    console.log('[Hidrometro] Módulo pronto.');
}

export function destroy() {
    console.log('[Hidrometro] Destruindo módulo...');
    if (_state.buscarTimer) clearTimeout(_state.buscarTimer);
    if (_state._modalClickRef) {
        document.removeEventListener('click', _state._modalClickRef);
    }
    document.body.style.overflow = '';
    delete window.HidrometroPage;
    _state = {
        hidrometros: [], unidades: [], moradores: [], buscarTimer: null,
        currentTab: 'cadastro', currentSubTab: 'individual',
        currentPage: 1, perPage: 20,
        hidrometrosAtivos: [], paginaAtual: 1, totalPaginas: 1,
        _modalClickRef: null
    };
}

// ============================================================
// TABS
// ============================================================

function _setupTabs() {
    // Tabs principais (data-tab) — seletor amplo para funcionar com layout-base
    document.querySelectorAll('.page-hidrometro .tabs .tab-button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
    });
}

function _setupSubTabs() {
    // Sub-tabs de leituras (data-subtab)
    document.querySelectorAll('.page-hidrometro .tab-button[data-subtab]').forEach(btn => {
        btn.addEventListener('click', () => _switchSubTab(btn.dataset.subtab));
    });
}

function _switchTab(tabName) {
    // Atualiza botões das tabs principais
    document.querySelectorAll('.page-hidrometro .tabs .tab-button[data-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // Alterna painéis de conteúdo de primeiro nível (não sub-tabs)
    document.querySelectorAll('.page-hidrometro .tab-content[id^="tab-"]').forEach(content => {
        if (!content.closest('.subtabs-content')) {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        }
    });
    _state.currentTab = tabName;

    if (tabName === 'lista') {
        _carregarHidrometros();
    }
    if (tabName === 'leituras') {
        _carregarUnidadesLeitura();
        if (_state.currentSubTab === 'configuracoes') {
            leituraCarregarConfigPeriodo();
        }
    }
    if (tabName === 'relatorios') {
        relatorioGerar();
    }
}

function _switchSubTab(subTabName) {
    document.querySelectorAll('.page-hidrometro .tab-button[data-subtab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subTabName);
    });
    document.querySelectorAll('.page-hidrometro .subtab-content').forEach(content => {
        content.classList.toggle('active', content.id === `subtab-${subTabName}`);
    });
    _state.currentSubTab = subTabName;

    if (subTabName === 'coletiva' && _state.hidrometrosAtivos.length === 0) {
        leituraCarregarHidrometrosAtivos();
    }
    if (subTabName === 'configuracoes') {
        leituraCarregarConfigPeriodo();
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
// FORMULÁRIOS DE LEITURA
// ============================================================

function _setupFormsLeitura() {
    // Form leitura individual
    const formInd = document.getElementById('formIndividual');
    if (formInd) {
        formInd.addEventListener('submit', e => { e.preventDefault(); _leituraSalvarIndividual(); });
    }

    // Form configuração de período
    const formConfig = document.getElementById('formConfigPeriodo');
    if (formConfig) {
        formConfig.addEventListener('submit', e => { e.preventDefault(); _leituraSalvarConfigPeriodo(); });
    }

    // Cascata: unidade → morador (leitura individual)
    const selUnidadeLeit = document.getElementById('ind_unidade');
    if (selUnidadeLeit) {
        selUnidadeLeit.addEventListener('change', _leituraCarregarMoradores);
    }

    // Cascata: morador → hidrômetro
    const selMoradorLeit = document.getElementById('ind_morador');
    if (selMoradorLeit) {
        selMoradorLeit.addEventListener('change', _leituraCarregarHidrometrosMorador);
    }

    // Hidrômetro → última leitura
    const selHidroLeit = document.getElementById('ind_hidrometro');
    if (selHidroLeit) {
        selHidroLeit.addEventListener('change', _leituraCarregarUltimaLeitura);
    }
}

async function _carregarUnidadesLeitura() {
    // Popula os selects de unidade da aba Leituras com ordenação numérica
    const isAdm = str => /adm/i.test(str || '');
    const numKey = str => { const m = String(str).match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; };

    const ordenadas = [..._state.unidades].sort((a, b) => {
        const nA = String(a.unidade || a.nome || a).trim();
        const nB = String(b.unidade || b.nome || b).trim();
        if (isAdm(nA) && !isAdm(nB)) return -1;
        if (!isAdm(nA) && isAdm(nB)) return  1;
        return numKey(nA) - numKey(nB);
    });

    ['ind_unidade', 'hist_unidade'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const placeholder = id === 'hist_unidade' ? 'Todas as unidades' : 'Selecione uma unidade...';
        sel.innerHTML = `<option value="">${placeholder}</option>`;
        ordenadas.forEach(u => {
            const val = u.unidade || u.nome || u;
            sel.add(new Option(val, val));
        });
    });
}

// ============================================================
// DATA ATUAL
// ============================================================

function _setDataAtual(campoId = 'cad_data') {
    const campo = document.getElementById(campoId);
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
        const data = await _apiCall(`${API_MORADORES}?unidade=${encodeURIComponent(unidade)}&ativo=1&por_pagina=0`);
        selMorador.innerHTML = '<option value="">Selecione um morador...</option>';
        // api_moradores retorna dados paginados: { itens: [...], total, ... }
        const moradores = data.dados?.itens || (Array.isArray(data.dados) ? data.dados : []);
        if (data.sucesso && moradores.length > 0) {
            moradores.forEach(m => {
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
                    <button class="action-btn btn-gerar-demo" title="Gerar Demonstrativo de Água"
                        onclick="window.HidrometroPage.gerarDemonstrativo(${h.id})"
                        style="background:linear-gradient(135deg,#16a34a,#166534);color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;">
                        <i class="fas fa-file-invoice"></i> Gerar
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
    // Proteção contra duplo submit
    const btnSalvar = document.querySelector('#formCadastro button[type="submit"]');
    if (btnSalvar?.disabled) return;
    if (btnSalvar) btnSalvar.disabled = true;

    const moradorId = document.getElementById('cad_morador')?.value;
    const unidade   = document.getElementById('cad_unidade')?.value;
    const numero    = document.getElementById('cad_numero')?.value?.trim();
    const lacre     = document.getElementById('cad_lacre')?.value?.trim();
    const data      = document.getElementById('cad_data')?.value;
    if (!moradorId || !unidade || !numero || !data) {
        _toast('Preencha todos os campos obrigatórios.', 'warning');
        if (btnSalvar) btnSalvar.disabled = false;
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
        if (btnSalvar) btnSalvar.disabled = false;
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

    // Preencher campo de patrimônio se existir
    const editPatrimonioBusca = document.getElementById('edit_patrimonio_busca');
    const editInventarioId    = document.getElementById('edit_inventario_id');
    const editDropdown        = document.getElementById('editPatrimonioDropdown');
    if (editPatrimonioBusca) editPatrimonioBusca.value = '';
    if (editInventarioId)    editInventarioId.value    = '';
    if (editDropdown)        editDropdown.style.display = 'none';

    // Se o hidrômetro já tem inventario_id, buscar o número do patrimônio para exibir
    if (hidrometro.inventario_id) {
        if (editInventarioId) editInventarioId.value = hidrometro.inventario_id;
        if (editPatrimonioBusca) {
            // Exibir o numero_patrimonio se vier no objeto, senão buscar na API
            if (hidrometro.numero_patrimonio) {
                editPatrimonioBusca.value = hidrometro.numero_patrimonio +
                    (hidrometro.nome_patrimonio ? ' — ' + hidrometro.nome_patrimonio : '');
            } else {
                // Buscar na API de inventário pelo ID
                try {
                    const inv = await _apiCall(`${API_INVENTARIO}?id=${hidrometro.inventario_id}`);
                    const item = (inv.dados || [])[0] || inv.dados;
                    if (item && item.numero_patrimonio) {
                        editPatrimonioBusca.value = item.numero_patrimonio +
                            (item.nome_item ? ' — ' + item.nome_item : '');
                    }
                } catch (e) {
                    console.warn('[Hidrometro] Não foi possível carregar patrimônio:', e);
                }
            }
        }
    }

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

    const inventarioId = document.getElementById('edit_inventario_id')?.value;

    const payload = {
        id                  : parseInt(id),
        morador_id          : parseInt(moradorId),
        unidade             : unidade,
        numero_hidrometro   : numero,
        numero_lacre        : lacre || '',
        data_instalacao     : dataInst,
        ativo               : parseInt(ativo),
        observacao          : obs,
        inventario_id       : inventarioId ? parseInt(inventarioId) : null,
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
// PATRIMÔNIO — EDIÇÃO
// ============================================================
let _patrimonioEditTimer = null;
async function buscarPatrimonioEdit(termo) {
    if (_patrimonioEditTimer) clearTimeout(_patrimonioEditTimer);
    const dropdown = document.getElementById('editPatrimonioDropdown');
    if (!dropdown) return;
    if (!termo || termo.length < 1) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }
    _patrimonioEditTimer = setTimeout(async () => {
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
                <div onclick="window.HidrometroPage.selecionarPatrimonioEdit(${item.id}, '${_esc(item.numero_patrimonio)}', '${_esc(item.nome_item)}')" style="
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
            console.error('[Hidrometro] Erro ao buscar patrimônio (edição):', err);
            dropdown.innerHTML = '<div style="padding:0.75rem 1rem;color:#ef4444;font-size:13px;">Erro ao buscar</div>';
        }
    }, 350);
}

function selecionarPatrimonioEdit(id, numero, nome) {
    const inputBusca = document.getElementById('edit_patrimonio_busca');
    const inputId    = document.getElementById('edit_inventario_id');
    const dropdown   = document.getElementById('editPatrimonioDropdown');
    if (inputBusca) inputBusca.value = `${numero} — ${nome}`;
    if (inputId)    inputId.value    = id;
    if (dropdown)   dropdown.style.display = 'none';
    console.log(`[Hidrometro] Patrimônio edição selecionado: ID=${id}, Nº=${numero}`);
}

function limparPatrimonioEdit() {
    const inputBusca = document.getElementById('edit_patrimonio_busca');
    const inputId    = document.getElementById('edit_inventario_id');
    const dropdown   = document.getElementById('editPatrimonioDropdown');
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

// ============================================================
// LEITURAS — INDIVIDUAL
// ============================================================

async function _leituraCarregarMoradores() {
    const unidade = document.getElementById('ind_unidade')?.value;
    const selMorador = document.getElementById('ind_morador');
    const selHidro   = document.getElementById('ind_hidrometro');
    if (!selMorador) return;

    selMorador.innerHTML = '<option value="">Carregando...</option>';
    if (selHidro) selHidro.innerHTML = '<option value="">Selecione o morador primeiro</option>';
    _leituraLimparPreview();

    if (!unidade) {
        selMorador.innerHTML = '<option value="">Selecione a unidade primeiro</option>';
        return;
    }

    try {
        const data = await _apiCall(`${API_MORADORES}?unidade=${encodeURIComponent(unidade)}&ativo=1&por_pagina=0`);
        // api_moradores retorna dados paginados: { itens: [...], total, ... }
        const moradores = data.dados?.itens || (Array.isArray(data.dados) ? data.dados : []);
        selMorador.innerHTML = '<option value="">Selecione o morador...</option>';
        moradores.forEach(m => selMorador.add(new Option(m.nome, m.id)));
    } catch (err) {
        selMorador.innerHTML = '<option value="">Erro ao carregar</option>';
        console.error('[Leitura] Erro ao carregar moradores:', err);
    }
}

async function _leituraCarregarHidrometrosMorador() {
    const moradorId = document.getElementById('ind_morador')?.value;
    const selHidro  = document.getElementById('ind_hidrometro');
    if (!selHidro) return;

    selHidro.innerHTML = '<option value="">Carregando...</option>';
    _leituraLimparPreview();

    if (!moradorId) {
        selHidro.innerHTML = '<option value="">Selecione o morador primeiro</option>';
        return;
    }

    try {
        const data = await _apiCall(`${API_HIDROMETROS}?morador_id=${moradorId}&ativos=1`);
        const hidros = data.dados || data.hidrometros || [];
        selHidro.innerHTML = '<option value="">Selecione o hidrômetro...</option>';
        hidros.forEach(h => selHidro.add(new Option(`Nº ${h.numero_hidrometro}`, h.id)));
        if (hidros.length === 1) {
            selHidro.value = hidros[0].id;
            _leituraCarregarUltimaLeitura();
        }
    } catch (err) {
        selHidro.innerHTML = '<option value="">Erro ao carregar</option>';
        console.error('[Leitura] Erro ao carregar hidrômetros:', err);
    }
}

async function _leituraCarregarUltimaLeitura() {
    const hidroId = document.getElementById('ind_hidrometro')?.value;
    _leituraLimparPreview();
    if (!hidroId) return;

    try {
        const data = await _apiCall(`${API_LEITURAS}?ultima_leitura=${hidroId}`);
        const ultima = data.dados || data.leitura || null;
        const elUltima = document.getElementById('ind_ultima_leitura');
        if (elUltima) {
            elUltima.textContent = ultima
                ? `Última leitura: ${ultima.leitura_atual} m³ em ${ultima.data_leitura_formatada || ultima.data_leitura}`
                : 'Nenhuma leitura anterior registrada';
        }
    } catch (err) {
        console.error('[Leitura] Erro ao carregar última leitura:', err);
    }
}

function leituraCalcularPreview() {
    const leituraAnterior = parseFloat(document.getElementById('ind_leitura_anterior')?.value || 0);
    const leituraAtual    = parseFloat(document.getElementById('ind_leitura_atual')?.value    || 0);

    const consumo = Math.max(0, leituraAtual - leituraAnterior);
    const valor   = consumo <= CONSUMO_MINIMO ? VALOR_MINIMO : VALOR_MINIMO + (consumo - CONSUMO_MINIMO) * VALOR_M3;

    const elConsumo = document.getElementById('ind_preview_consumo');
    const elValor   = document.getElementById('ind_preview_valor');
    const elBox     = document.getElementById('ind_preview_box');

    if (elConsumo) elConsumo.textContent = `${consumo.toFixed(2)} m³`;
    if (elValor)   elValor.textContent   = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (elBox)     elBox.style.display   = 'block';
}

function _leituraLimparPreview() {
    const elBox = document.getElementById('ind_preview_box');
    if (elBox) elBox.style.display = 'none';
    const elUltima = document.getElementById('ind_ultima_leitura');
    if (elUltima) elUltima.textContent = '';
}

async function _leituraSalvarIndividual() {
    const hidroId         = document.getElementById('ind_hidrometro')?.value;
    const leituraAnterior = document.getElementById('ind_leitura_anterior')?.value;
    const leituraAtual    = document.getElementById('ind_leitura_atual')?.value;
    const dataLeitura     = document.getElementById('ind_data_leitura')?.value;
    const observacao      = document.getElementById('ind_observacao')?.value || '';

    if (!hidroId || !leituraAtual || !dataLeitura) {
        _toast('Preencha todos os campos obrigatórios.', 'warning');
        return;
    }
    if (parseFloat(leituraAtual) < parseFloat(leituraAnterior || 0)) {
        _toast('A leitura atual não pode ser menor que a anterior.', 'error');
        return;
    }

    const consumo = Math.max(0, parseFloat(leituraAtual) - parseFloat(leituraAnterior || 0));
    const valor   = consumo <= CONSUMO_MINIMO ? VALOR_MINIMO : VALOR_MINIMO + (consumo - CONSUMO_MINIMO) * VALOR_M3;

    const btn = document.getElementById('btnSalvarLeitura');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    try {
        const data = await _apiCall(API_LEITURAS, {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json' },
            body    : JSON.stringify({
                hidrometro_id    : parseInt(hidroId),
                leitura_anterior : parseFloat(leituraAnterior || 0),
                leitura_atual    : parseFloat(leituraAtual),
                consumo          : consumo,
                valor_cobrado    : valor,
                data_leitura     : dataLeitura,
                observacao       : observacao,
            }),
        });

        if (data.sucesso) {
            _toast('Leitura registrada com sucesso!', 'success');
            leituraLimparIndividual();
            leituraBuscarHistorico();
        } else {
            _toast(data.mensagem || 'Erro ao salvar leitura.', 'error');
        }
    } catch (err) {
        _toast(`Erro: ${err.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Registrar Leitura'; }
    }
}

function leituraLimparIndividual() {
    ['ind_unidade','ind_morador','ind_hidrometro','ind_leitura_anterior','ind_leitura_atual','ind_observacao'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    _setDataAtual('ind_data_leitura');
    _leituraLimparPreview();
    const selMorador = document.getElementById('ind_morador');
    if (selMorador) selMorador.innerHTML = '<option value="">Selecione a unidade primeiro</option>';
    const selHidro = document.getElementById('ind_hidrometro');
    if (selHidro) selHidro.innerHTML = '<option value="">Selecione o morador primeiro</option>';
}

// ============================================================
// LEITURAS — COLETIVA
// ============================================================

async function leituraCarregarHidrometrosAtivos(pagina = 1) {
    // O tbody da tabela estática do HTML usa id="listaColetiva"
    const tbody = document.getElementById('listaColetiva');
    if (!tbody) {
        console.error('[Hidrometro] Container listaColetiva não encontrado');
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Carregando hidrômetros ativos...</td></tr>';

    try {
        // Endpoint correto: api_leituras.php?hidrometros_ativos=1&pagina=N
        // Retorna: { dados: { hidrometros: [], pagina_atual, total_paginas, total_registros } }
        const data = await _apiCall(`${API_LEITURAS}?hidrometros_ativos=1&pagina=${pagina}`);
        const payload = data.dados || {};
        _state.hidrometrosAtivos = payload.hidrometros || [];
        _state.paginaAtual       = payload.pagina_atual   || pagina;
        _state.totalPaginas      = payload.total_paginas  || 1;

        console.log(`[Hidrometro] Leitura coletiva carregada: ${_state.hidrometrosAtivos.length} registros (pág ${_state.paginaAtual}/${_state.totalPaginas})`);
        _leituraRenderizarColetiva();
    } catch (err) {
        console.error('[Hidrometro] Erro ao carregar leitura coletiva:', err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#dc2626;"><i class="fas fa-exclamation-circle"></i> Erro ao carregar: ${err.message}</td></tr>`;
    }
}

function _leituraRenderizarColetiva() {
    // Usa os elementos estáticos do HTML: tbody#listaColetiva, div#paginacaoColetiva, span#infoPagina
    const tbody = document.getElementById('listaColetiva');
    if (!tbody) return;

    const lista = _state.hidrometrosAtivos;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><i class="fas fa-tint-slash"></i><p>Nenhum hidrômetro ativo encontrado.</p></td></tr>';
        // Esconder paginação
        const pag = document.getElementById('paginacaoColetiva');
        if (pag) pag.style.display = 'none';
        return;
    }

    // Renderizar linhas no tbody existente
    tbody.innerHTML = lista.map(h => `
        <tr>
            <td><input type="checkbox" class="col-check" data-id="${h.id}" data-ultima="${h.leitura_anterior != null ? h.leitura_anterior : 0}"></td>
            <td>${_esc(h.unidade)}</td>
            <td>${_esc(h.morador_nome)}</td>
            <td>${_esc(h.numero_hidrometro)}</td>
            <td>${h.leitura_anterior != null && parseFloat(h.leitura_anterior) > 0
                ? parseFloat(h.leitura_anterior).toFixed(2) + ' m³'
                : '<span style="color:#94a3b8">Sem leitura</span>'}</td>
            <td><input type="number" step="0.01" min="0" class="col-leitura-input" data-id="${h.id}" placeholder="0.00" style="width:100px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;"></td>
        </tr>
    `).join('');

    // Atualizar paginação (elementos estáticos do HTML)
    const pag       = document.getElementById('paginacaoColetiva');
    const infoPag   = document.getElementById('infoPagina');
    const btnAnt    = document.getElementById('btnAnterior');
    const btnProx   = document.getElementById('btnProximo');
    const selectAll = document.getElementById('selectAll');

    if (selectAll) selectAll.checked = false;

    if (pag) {
        pag.style.display = _state.totalPaginas > 1 ? 'flex' : 'none';
    }
    if (infoPag) {
        infoPag.textContent = `Página ${_state.paginaAtual} de ${_state.totalPaginas}`;
    }
    if (btnAnt) btnAnt.disabled = _state.paginaAtual <= 1;
    if (btnProx) btnProx.disabled = _state.paginaAtual >= _state.totalPaginas;
}

function leituraSelecionarTodos(checked) {
    document.querySelectorAll('.col-check').forEach(cb => { cb.checked = checked; });
}

function leituraLimparSelecao() {
    document.querySelectorAll('.col-check').forEach(cb => { cb.checked = false; });
    // HTML usa id="selectAll" (não col_check_todos)
    const checkTodos = document.getElementById('selectAll') || document.getElementById('col_check_todos');
    if (checkTodos) checkTodos.checked = false;
}

function leituraMudarPagina(delta) {
    // O HTML passa delta relativo: -1 (anterior) ou +1 (próximo)
    const novaPagina = (_state.paginaAtual || 1) + delta;
    if (novaPagina < 1 || novaPagina > _state.totalPaginas) return;
    // Paginação server-side: buscar nova página no servidor
    leituraCarregarHidrometrosAtivos(novaPagina);
}

async function leituraLancarSelecionados() {
    const dataLeitura = document.getElementById('col_data_leitura')?.value;
    if (!dataLeitura) { _toast('Informe a data de leitura.', 'warning'); return; }

    const selecionados = [];
    document.querySelectorAll('.col-check:checked').forEach(cb => {
        const id      = parseInt(cb.dataset.id);
        const ultima  = parseFloat(cb.dataset.ultima || 0);
        const input   = document.querySelector(`.col-leitura-input[data-id="${id}"]`);
        const atual   = parseFloat(input?.value || 0);
        if (atual > 0) {
            const consumo = Math.max(0, atual - ultima);
            const valor   = consumo <= CONSUMO_MINIMO ? VALOR_MINIMO : VALOR_MINIMO + (consumo - CONSUMO_MINIMO) * VALOR_M3;
            selecionados.push({ hidrometro_id: id, leitura_anterior: ultima, leitura_atual: atual, consumo, valor_cobrado: valor, data_leitura: dataLeitura });
        }
    });

    if (selecionados.length === 0) { _toast('Selecione ao menos um hidrômetro com leitura preenchida.', 'warning'); return; }

    const btn = document.getElementById('btnLancarColetiva');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Lançando ${selecionados.length}...`; }

    let sucesso = 0, erros = 0;
    for (const item of selecionados) {
        try {
            const res = await _apiCall(API_LEITURAS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item),
            });
            if (res.sucesso) sucesso++; else erros++;
        } catch { erros++; }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Lançar Selecionados'; }
    _toast(`${sucesso} leitura(s) lançada(s) com sucesso${erros > 0 ? `, ${erros} erro(s)` : ''}.`, sucesso > 0 ? 'success' : 'error');
    leituraLimparSelecao();
    leituraCarregarHidrometrosAtivos();
    leituraBuscarHistorico();
}

// ============================================================
// LEITURAS — HISTÓRICO
// ============================================================

async function leituraBuscarHistorico() {
    const unidade = document.getElementById('hist_unidade')?.value || '';
    const de      = document.getElementById('hist_data_de')?.value || '';
    const ate     = document.getElementById('hist_data_ate')?.value || '';
    const container = document.getElementById('hist_tabela_body');
    if (!container) return;

    container.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        let url = `${API_LEITURAS}?historico=1`;
        if (unidade) url += `&unidade=${encodeURIComponent(unidade)}`;
        if (de)      url += `&data_de=${encodeURIComponent(de)}`;
        if (ate)     url += `&data_ate=${encodeURIComponent(ate)}`;

        const data = await _apiCall(url);
        const lista = data.dados || data.leituras || [];

        if (lista.length === 0) {
            container.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#94a3b8;"><i class="fas fa-inbox"></i> Nenhuma leitura encontrada.</td></tr>';
            return;
        }

        container.innerHTML = lista.map(l => `
            <tr>
                <td>${_esc(l.data_leitura_formatada || l.data_leitura)}</td>
                <td>${_esc(l.unidade)}</td>
                <td>${_esc(l.morador_nome)}</td>
                <td>${_esc(l.numero_hidrometro)}</td>
                <td>${_esc(l.leitura_anterior)} m³</td>
                <td>${_esc(l.leitura_atual)} m³</td>
                <td><strong>${_esc(l.consumo)} m³</strong></td>
                <td><strong style="color:#16a34a;">${parseFloat(l.valor_cobrado || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></td>
            </tr>
        `).join('');
    } catch (err) {
        container.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Erro: ${_esc(err.message)}</td></tr>`;
    }
}

// ============================================================
// LEITURAS — CONFIGURAÇÃO DE PERÍODO
// ============================================================

async function leituraCarregarConfigPeriodo() {
    try {
        const data = await _apiCall(API_CONFIG_PERIODO);
        const config = data.dados || data.config || {};
        const campos = {
            'config_periodo_inicio' : config.periodo_inicio || '',
            'config_periodo_fim'    : config.periodo_fim    || '',
            'config_valor_m3'       : config.valor_m3       || VALOR_M3,
            'config_valor_minimo'   : config.valor_minimo   || VALOR_MINIMO,
            'config_consumo_minimo' : config.consumo_minimo || CONSUMO_MINIMO,
        };
        Object.entries(campos).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });
    } catch (err) {
        console.warn('[Leitura] Config período não disponível:', err.message);
    }
}

async function _leituraSalvarConfigPeriodo() {
    const btn = document.getElementById('btnSalvarConfig');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    const payload = {
        periodo_inicio  : document.getElementById('config_periodo_inicio')?.value,
        periodo_fim     : document.getElementById('config_periodo_fim')?.value,
        valor_m3        : parseFloat(document.getElementById('config_valor_m3')?.value || VALOR_M3),
        valor_minimo    : parseFloat(document.getElementById('config_valor_minimo')?.value || VALOR_MINIMO),
        consumo_minimo  : parseFloat(document.getElementById('config_consumo_minimo')?.value || CONSUMO_MINIMO),
    };

    try {
        const data = await _apiCall(API_CONFIG_PERIODO, {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json' },
            body    : JSON.stringify(payload),
        });
        _toast(data.sucesso ? 'Configuração salva com sucesso!' : (data.mensagem || 'Erro ao salvar.'), data.sucesso ? 'success' : 'error');
    } catch (err) {
        _toast(`Erro: ${err.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Configuração'; }
    }
}

// ============================================================
// RELATÓRIOS
// ============================================================

let _relatorioCache = [];

async function relatorioGerar() {
    // IDs alinhados com o HTML da aba Relatórios
    const de      = document.getElementById('rel_data_inicial')?.value  || '';
    const ate     = document.getElementById('rel_data_final')?.value    || '';
    const unidade = document.getElementById('rel_unidade')?.value       || '';
    const container  = document.getElementById('listaRelatorio');
    const kpiGrid    = document.getElementById('kpiRelatorio');
    const cardWrap   = document.getElementById('relatorioCard');
    const loading    = document.getElementById('loadingRelatorio');
    if (!container) return;

    // Mostrar loading
    if (cardWrap)  cardWrap.style.display  = 'block';
    if (loading)   loading.style.display   = 'flex';
    if (kpiGrid)   kpiGrid.style.display   = 'none';
    container.innerHTML = '';

    try {
        let url = `${API_LEITURAS}?relatorio=1`;
        if (de)      url += `&data_de=${encodeURIComponent(de)}`;
        if (ate)     url += `&data_ate=${encodeURIComponent(ate)}`;
        if (unidade) url += `&unidade=${encodeURIComponent(unidade)}`;

        const data = await _apiCall(url);
        _relatorioCache = data.dados || data.leituras || [];

        if (loading) loading.style.display = 'none';

        if (_relatorioCache.length === 0) {
            container.innerHTML = `<tr class="empty-row"><td colspan="8"><i class="fas fa-inbox"></i><p>Nenhum dado encontrado para o período selecionado.</p></td></tr>`;
            return;
        }

        // Totais para KPIs
        const totalConsumo = _relatorioCache.reduce((s, l) => s + parseFloat(l.consumo || 0), 0);
        const totalValor   = _relatorioCache.reduce((s, l) => s + parseFloat(l.valor_cobrado || 0), 0);
        const mediaConsumo = totalConsumo / _relatorioCache.length;

        if (kpiGrid) {
            kpiGrid.style.display = 'grid';
            _setEl('rel_kpi_total',   _relatorioCache.length);
            _setEl('rel_kpi_consumo', `${totalConsumo.toFixed(2)} m³`);
            _setEl('rel_kpi_valor',   totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
            _setEl('rel_kpi_media',   `${mediaConsumo.toFixed(2)} m³`);
        }

        // Agrupar por hidrômetro para a tabela resumida
        const porHidro = {};
        _relatorioCache.forEach(l => {
            const key = l.numero_hidrometro || l.hidrometro_id;
            if (!porHidro[key]) {
                porHidro[key] = {
                    unidade:          l.unidade,
                    morador:          l.morador_nome,
                    numero_hidrometro: l.numero_hidrometro,
                    leituras:         0,
                    consumo_total:    0,
                    valor_total:      0,
                    ultima_leitura:   '',
                };
            }
            porHidro[key].leituras++;
            porHidro[key].consumo_total += parseFloat(l.consumo || 0);
            porHidro[key].valor_total   += parseFloat(l.valor_cobrado || 0);
            // Guarda a data mais recente
            const dataL = l.data_leitura_formatada || l.data_leitura || '';
            if (dataL > porHidro[key].ultima_leitura) porHidro[key].ultima_leitura = dataL;
        });

        container.innerHTML = Object.values(porHidro).map(h => `
            <tr>
                <td>${_esc(h.unidade)}</td>
                <td>${_esc(h.morador)}</td>
                <td>${_esc(h.numero_hidrometro)}</td>
                <td style="text-align:center;">${h.leituras}</td>
                <td><strong>${h.consumo_total.toFixed(2)} m³</strong></td>
                <td><strong style="color:#16a34a;">${h.valor_total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></td>
                <td>${(h.consumo_total / h.leituras).toFixed(2)} m³</td>
                <td>${_esc(h.ultima_leitura)}</td>
            </tr>
        `).join('');

    } catch (err) {
        if (loading) loading.style.display = 'none';
        container.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Erro: ${_esc(err.message)}</td></tr>`;
    }
}

function relatorioExportarCSV() {
    if (_relatorioCache.length === 0) {
        _toast('Gere o relatório antes de exportar.', 'warning');
        return;
    }

    const cabecalho = ['Data','Unidade','Morador','Nº Hidrômetro','Leitura Anterior (m³)','Leitura Atual (m³)','Consumo (m³)','Valor (R$)'];
    const linhas = _relatorioCache.map(l => [
        l.data_leitura_formatada || l.data_leitura,
        l.unidade,
        l.morador_nome,
        l.numero_hidrometro,
        parseFloat(l.leitura_anterior || 0).toFixed(2).replace('.', ','),
        parseFloat(l.leitura_atual    || 0).toFixed(2).replace('.', ','),
        parseFloat(l.consumo          || 0).toFixed(2).replace('.', ','),
        parseFloat(l.valor_cobrado    || 0).toFixed(2).replace('.', ','),
    ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(';'));

    const csv  = [cabecalho.join(';'), ...linhas].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `relatorio_leituras_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    _toast('Relatório exportado com sucesso!', 'success');
}


// ============================================================
// DEMONSTRATIVO DE CONSUMO DE ÁGUA
// ============================================================
/**
 * Abre o demonstrativo de água (estilo fatura) em nova aba.
 * Exibe um mini-modal para o operador selecionar o mês de referência
 * antes de abrir o relatório.
 *
 * @param {number} hidrometroId — ID do hidrômetro
 */
function gerarDemonstrativo(hidrometroId) {
    if (!hidrometroId) return;

    // Criar overlay do mini-modal
    const overlay = document.createElement('div');
    overlay.id = 'modalDemoAgua';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;
        display:flex;align-items:center;justify-content:center;
        animation:fadeIn .15s ease;
    `;

    // Mês atual como padrão
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

    overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:28px 32px;width:380px;max-width:95vw;
                    box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:sans-serif;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
                <div style="background:linear-gradient(135deg,#16a34a,#166534);border-radius:8px;
                            width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-file-invoice" style="color:#fff;font-size:16px;"></i>
                </div>
                <div>
                    <div style="font-size:15px;font-weight:800;color:#0f172a;">Demonstrativo de Água</div>
                    <div style="font-size:11px;color:#64748b;">Selecione o mês de referência</div>
                </div>
            </div>

            <label style="display:block;font-size:11px;font-weight:700;color:#475569;
                          text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">
                Mês / Ano de Referência
            </label>
            <input type="month" id="inputMesDemoAgua"
                   value="${mesAtual}"
                   style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;
                          font-size:13px;color:#1e293b;outline:none;margin-bottom:20px;
                          transition:border-color .2s;"
                   onfocus="this.style.borderColor='#16a34a'"
                   onblur="this.style.borderColor='#e2e8f0'">

            <div style="font-size:10px;color:#94a3b8;margin-bottom:20px;line-height:1.6;">
                Deixe em branco para usar a última leitura disponível.
                O demonstrativo abrirá em nova aba pronto para impressão ou salvar como PDF.
            </div>

            <div style="display:flex;gap:10px;">
                <button onclick="document.getElementById('modalDemoAgua').remove()"
                        style="flex:1;padding:10px;border:1.5px solid #e2e8f0;background:#f8fafc;
                               border-radius:8px;font-size:13px;font-weight:600;color:#64748b;
                               cursor:pointer;">
                    Cancelar
                </button>
                <button id="btnAbrirDemo"
                        onclick="window.HidrometroPage._abrirDemoAgua(${hidrometroId})"
                        style="flex:2;padding:10px;border:none;
                               background:linear-gradient(135deg,#16a34a,#166534);
                               border-radius:8px;font-size:13px;font-weight:700;color:#fff;
                               cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                    <i class="fas fa-external-link-alt"></i>
                    Gerar Demonstrativo
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Fechar ao clicar fora
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
    });

    // Focar no input
    setTimeout(() => {
        const inp = document.getElementById('inputMesDemoAgua');
        if (inp) inp.focus();
    }, 100);
}

/**
 * Abre a URL do demonstrativo em nova aba (chamado pelo botão do modal).
 */
window.HidrometroPage = window.HidrometroPage || {};
(function() {
    const _abrirDemoAgua = function(hidrometroId) {
        const mesInput = document.getElementById('inputMesDemoAgua');
        const mes = mesInput ? mesInput.value.trim() : '';

        let url = `../api/api_demonstrativo_agua.php?hidrometro_id=${hidrometroId}`;
        if (mes) url += `&mes=${encodeURIComponent(mes)}`;

        window.open(url, '_blank');

        // Fechar o modal
        const modal = document.getElementById('modalDemoAgua');
        if (modal) modal.remove();
    };

    // Aguardar o módulo ser inicializado para adicionar o método
    const tentarRegistrar = function() {
        if (window.HidrometroPage && typeof window.HidrometroPage === 'object') {
            window.HidrometroPage._abrirDemoAgua = _abrirDemoAgua;
        } else {
            setTimeout(tentarRegistrar, 100);
        }
    };
    tentarRegistrar();
})();

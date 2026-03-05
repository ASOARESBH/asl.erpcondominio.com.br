/**
 * inventario.js — Módulo de Inventário de Patrimônio
 *
 * Responsabilidades:
 *  - CRUD completo de itens patrimoniais (POST, PUT, DELETE)
 *  - Listagem com filtros, paginação e exportação CSV
 *  - Relatórios por situação, status, responsável e baixas
 *  - KPIs: total, ativos, inativos, valor total
 *
 * Padrões:
 *  - ES6 Module com export function init() / destroy()
 *  - Listeners gerenciados via _listeners[] para cleanup correto
 *  - URLs absolutas via window.location.origin
 *  - Cache local _state para evitar re-fetches desnecessários
 *  - XSS: função _esc() em todos os dados renderizados
 *
 * @version 2.0.0
 */
'use strict';

// ============================================================
// ESTADO DO MÓDULO
// ============================================================
const _state = {
    itens: [],           // cache de todos os itens
    usuarios: [],        // cache de usuários ativos
    itensFiltrados: [],  // resultado do último filtro
    pagina: 1,
    itensPorPagina: 15,
    itemParaExcluir: null,
    editandoId: null,
};

const _listeners = [];

// ============================================================
// CICLO DE VIDA DO MÓDULO
// ============================================================

export function init() {
    console.log('[Inventario] Inicializando módulo v2.0...');

    _setupTabs();
    _setupForm();
    _setupFiltros();
    _setupModal();
    _setupBotaoVoltar();

    // Carregamento inicial
    _carregarUsuarios().then(() => {
        _carregarInventario();
    });

    console.log('[Inventario] Módulo pronto.');
}

export function destroy() {
    console.log('[Inventario] Destruindo módulo...');
    _listeners.forEach(({ el, event, fn }) => {
        if (el) el.removeEventListener(event, fn);
    });
    _listeners.length = 0;
    _state.itens = [];
    _state.usuarios = [];
    _state.itensFiltrados = [];
    _state.pagina = 1;
    _state.itemParaExcluir = null;
    _state.editandoId = null;
    console.log('[Inventario] Módulo destruído.');
}

// ============================================================
// SETUP DE COMPONENTES
// ============================================================

function _setupTabs() {
    document.querySelectorAll('.page-inventario .tab-btn-inv').forEach(btn => {
        const fn = () => _ativarTab(btn.dataset.tab);
        btn.addEventListener('click', fn);
        _listeners.push({ el: btn, event: 'click', fn });
    });
}

function _ativarTab(tabId) {
    document.querySelectorAll('.page-inventario .tab-btn-inv').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tabId)
    );
    document.querySelectorAll('.page-inventario .tab-content-inv').forEach(c =>
        c.classList.toggle('active', c.id === `tab-${tabId}`)
    );

    // Atualizar KPIs da aba de relatórios ao ativar
    if (tabId === 'relatorios') {
        _atualizarKpisRelatorio();
    }
    // Atualizar KPIs da aba de listagem ao ativar
    if (tabId === 'listagem') {
        _atualizarKpis();
    }
}

function _setupForm() {
    const form = document.getElementById('formInventario');
    if (!form) return;

    const fnSubmit = (e) => { e.preventDefault(); _salvarItem(); };
    form.addEventListener('submit', fnSubmit);
    _listeners.push({ el: form, event: 'submit', fn: fnSubmit });

    const statusSel = document.getElementById('status');
    if (statusSel) {
        const fnStatus = () => _toggleMotivoBaixa();
        statusSel.addEventListener('change', fnStatus);
        _listeners.push({ el: statusSel, event: 'change', fn: fnStatus });
    }

    const btnLimpar = document.getElementById('btnLimparForm');
    if (btnLimpar) {
        const fn = () => _limparFormulario();
        btnLimpar.addEventListener('click', fn);
        _listeners.push({ el: btnLimpar, event: 'click', fn });
    }
}

function _setupFiltros() {
    const btnBuscar = document.getElementById('btnBuscar');
    if (btnBuscar) {
        const fn = () => _aplicarFiltros();
        btnBuscar.addEventListener('click', fn);
        _listeners.push({ el: btnBuscar, event: 'click', fn });
    }

    const btnLimpar = document.getElementById('btnLimparBusca');
    if (btnLimpar) {
        const fn = () => _limparFiltros();
        btnLimpar.addEventListener('click', fn);
        _listeners.push({ el: btnLimpar, event: 'click', fn });
    }

    // Enter nos campos de texto
    ['filtroNumeroPatrimonio', 'filtroNF'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const fn = (e) => { if (e.key === 'Enter') { e.preventDefault(); _aplicarFiltros(); } };
            el.addEventListener('keydown', fn);
            _listeners.push({ el, event: 'keydown', fn });
        }
    });

    // Exportar CSV
    const btnCSV = document.getElementById('btnExportarCSV');
    if (btnCSV) {
        const fn = () => _exportarCSV(_state.itensFiltrados.length ? _state.itensFiltrados : _state.itens);
        btnCSV.addEventListener('click', fn);
        _listeners.push({ el: btnCSV, event: 'click', fn });
    }

    // Relatórios
    const btnGerar = document.getElementById('btnGerarRelatorio');
    if (btnGerar) {
        const fn = () => _gerarRelatorio();
        btnGerar.addEventListener('click', fn);
        _listeners.push({ el: btnGerar, event: 'click', fn });
    }

    const btnRelCSV = document.getElementById('btnExportarRelCSV');
    if (btnRelCSV) {
        const fn = () => _exportarRelatorioCSV();
        btnRelCSV.addEventListener('click', fn);
        _listeners.push({ el: btnRelCSV, event: 'click', fn });
    }
}

function _setupModal() {
    const btnFechar = document.getElementById('btnFecharModalExclusao');
    const btnCancelar = document.getElementById('btnCancelarExclusao');
    const btnConfirmar = document.getElementById('btnConfirmarExclusao');
    const overlay = document.getElementById('modalConfirmarExclusao');

    if (btnFechar) {
        const fn = () => _fecharModal();
        btnFechar.addEventListener('click', fn);
        _listeners.push({ el: btnFechar, event: 'click', fn });
    }
    if (btnCancelar) {
        const fn = () => _fecharModal();
        btnCancelar.addEventListener('click', fn);
        _listeners.push({ el: btnCancelar, event: 'click', fn });
    }
    if (btnConfirmar) {
        const fn = () => _confirmarExclusao();
        btnConfirmar.addEventListener('click', fn);
        _listeners.push({ el: btnConfirmar, event: 'click', fn });
    }
    if (overlay) {
        const fn = (e) => { if (e.target === overlay) _fecharModal(); };
        overlay.addEventListener('click', fn);
        _listeners.push({ el: overlay, event: 'click', fn });
    }
}

function _setupBotaoVoltar() {
    const btn = document.getElementById('btnVoltarAdm');
    if (btn && window.AppRouter) {
        const fn = () => window.AppRouter.navigate('administrativa');
        btn.addEventListener('click', fn);
        _listeners.push({ el: btn, event: 'click', fn });
    }
}

// ============================================================
// CARREGAMENTO DE DADOS
// ============================================================

async function _carregarUsuarios() {
    try {
        const res = await fetch(window.location.origin + '/api/api_usuarios.php', {
            credentials: 'include'
        });
        const data = await res.json();
        if (data.sucesso) {
            _state.usuarios = data.dados.filter(u => u.ativo == 1);
            _popularSelectUsuarios();
            console.log('[Inventario] Usuários carregados:', _state.usuarios.length);
        }
    } catch (err) {
        console.error('[Inventario] Erro ao carregar usuários:', err);
    }
}

function _popularSelectUsuarios() {
    const ids = ['tutelaUsuarioId', 'filtroTutela', 'relFiltroResponsavel'];
    ids.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const defaultOpt = id === 'tutelaUsuarioId' ? 'Sem responsável' : 'Todos';
        sel.innerHTML = `<option value="">${defaultOpt}</option>`;
        _state.usuarios.forEach(u => {
            const funcao = u.funcao ? ` — ${u.funcao}` : '';
            sel.innerHTML += `<option value="${u.id}">${_esc(u.nome)}${funcao}</option>`;
        });
    });
}

async function _carregarInventario() {
    const tbody = document.getElementById('tabelaInventario');
    if (tbody) {
        tbody.innerHTML = '<tr class="empty-row-inv"><td colspan="9"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    }

    try {
        const res = await fetch(window.location.origin + '/api/api_inventario.php', {
            credentials: 'include'
        });
        const data = await res.json();
        if (data.sucesso) {
            _state.itens = data.dados || [];
            _state.itensFiltrados = [..._state.itens];
            _state.pagina = 1;
            _atualizarKpis();
            _renderizarTabela(_state.itensFiltrados);
            console.log('[Inventario] Itens carregados:', _state.itens.length);
        } else {
            _toast('Erro ao carregar inventário: ' + (data.mensagem || ''), 'error');
        }
    } catch (err) {
        console.error('[Inventario] Erro ao carregar inventário:', err);
        _toast('Erro ao conectar com o servidor', 'error');
    }
}

// ============================================================
// KPIs
// ============================================================

function _atualizarKpis() {
    const itens = _state.itens;
    const total = itens.length;
    const ativos = itens.filter(i => i.status === 'ativo').length;
    const inativos = itens.filter(i => i.status === 'inativo').length;
    const valor = itens.reduce((s, i) => s + parseFloat(i.valor || 0), 0);

    _setEl('kpiTotal', total);
    _setEl('kpiAtivos', ativos);
    _setEl('kpiInativos', inativos);
    _setEl('kpiValor', 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
}

function _atualizarKpisRelatorio() {
    const itens = _state.itens;
    const total = itens.length;
    const ativos = itens.filter(i => i.status === 'ativo').length;
    const inativos = itens.filter(i => i.status === 'inativo').length;
    const valor = itens.reduce((s, i) => s + parseFloat(i.valor || 0), 0);

    _setEl('relKpiTotal', total);
    _setEl('relKpiAtivos', ativos);
    _setEl('relKpiInativos', inativos);
    _setEl('relKpiValor', 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
}

// ============================================================
// RENDERIZAÇÃO DA TABELA
// ============================================================

function _renderizarTabela(itens) {
    const tbody = document.getElementById('tabelaInventario');
    if (!tbody) return;

    if (!itens || itens.length === 0) {
        tbody.innerHTML = '<tr class="empty-row-inv"><td colspan="9"><i class="fas fa-inbox"></i> Nenhum item encontrado</td></tr>';
        _renderizarPaginacao(0);
        return;
    }

    const inicio = (_state.pagina - 1) * _state.itensPorPagina;
    const fim = inicio + _state.itensPorPagina;
    const paginaAtual = itens.slice(inicio, fim);

    tbody.innerHTML = paginaAtual.map(item => `
        <tr>
            <td><strong>${_esc(item.numero_patrimonio)}</strong></td>
            <td>${_esc(item.nome_item)}</td>
            <td>
                <div style="font-size:13px;">${_esc(item.fabricante || '—')}</div>
                <div style="font-size:11px;color:#94a3b8;">${_esc(item.modelo || '')}</div>
            </td>
            <td>${_esc(item.nf || '—')}</td>
            <td>
                <span class="badge-inv ${item.situacao === 'imobilizado' ? 'badge-primary-inv' : 'badge-warning-inv'}">
                    ${item.situacao === 'imobilizado' ? 'Imobilizado' : 'Circulante'}
                </span>
            </td>
            <td>R$ ${parseFloat(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>
                <span class="badge-inv ${item.status === 'ativo' ? 'badge-success-inv' : 'badge-danger-inv'}">
                    ${item.status === 'ativo' ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td>${_esc(item.tutela_nome || '—')}</td>
            <td>
                <div class="table-actions-inv">
                    <button class="btn-edit-inv" title="Editar" onclick="window._InvPage.editarItem(${item.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-delete-inv" title="Excluir" onclick="window._InvPage.excluirItem(${item.id}, '${_esc(item.numero_patrimonio)}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    _renderizarPaginacao(itens.length);

    // Expor funções para os onclick inline
    window._InvPage = { editarItem: _editarItem, excluirItem: _abrirModalExclusao };
}

function _renderizarPaginacao(total) {
    const container = document.getElementById('paginacaoInventario');
    if (!container) return;

    const totalPaginas = Math.ceil(total / _state.itensPorPagina);
    if (totalPaginas <= 1) {
        container.innerHTML = '';
        return;
    }

    const inicio = (_state.pagina - 1) * _state.itensPorPagina + 1;
    const fim = Math.min(_state.pagina * _state.itensPorPagina, total);

    let html = `<span class="pagination-info-inv">${inicio}–${fim} de ${total}</span>`;
    html += `<button ${_state.pagina === 1 ? 'disabled' : ''} onclick="window._InvPage.irPagina(${_state.pagina - 1})"><i class="fas fa-chevron-left"></i></button>`;

    const maxBotoes = 5;
    let start = Math.max(1, _state.pagina - Math.floor(maxBotoes / 2));
    let end = Math.min(totalPaginas, start + maxBotoes - 1);
    if (end - start < maxBotoes - 1) start = Math.max(1, end - maxBotoes + 1);

    for (let p = start; p <= end; p++) {
        html += `<button class="${p === _state.pagina ? 'active' : ''}" onclick="window._InvPage.irPagina(${p})">${p}</button>`;
    }

    html += `<button ${_state.pagina === totalPaginas ? 'disabled' : ''} onclick="window._InvPage.irPagina(${_state.pagina + 1})"><i class="fas fa-chevron-right"></i></button>`;
    container.innerHTML = html;

    if (window._InvPage) {
        window._InvPage.irPagina = (p) => {
            _state.pagina = p;
            _renderizarTabela(_state.itensFiltrados.length ? _state.itensFiltrados : _state.itens);
        };
    }
}

// ============================================================
// FILTROS
// ============================================================

function _aplicarFiltros() {
    const numPat = (document.getElementById('filtroNumeroPatrimonio')?.value || '').toLowerCase().trim();
    const nf = (document.getElementById('filtroNF')?.value || '').toLowerCase().trim();
    const situacao = document.getElementById('filtroSituacao')?.value || '';
    const status = document.getElementById('filtroStatus')?.value || '';
    const tutela = document.getElementById('filtroTutela')?.value || '';

    _state.itensFiltrados = _state.itens.filter(item => {
        if (numPat && !item.numero_patrimonio.toLowerCase().includes(numPat)) return false;
        if (nf && !(item.nf || '').toLowerCase().includes(nf)) return false;
        if (situacao && item.situacao !== situacao) return false;
        if (status && item.status !== status) return false;
        if (tutela && String(item.tutela_usuario_id) !== tutela) return false;
        return true;
    });

    _state.pagina = 1;
    _renderizarTabela(_state.itensFiltrados);

    if (_state.itensFiltrados.length === 0) {
        _toast('Nenhum item encontrado com os filtros aplicados', 'warning');
    }
}

function _limparFiltros() {
    ['filtroNumeroPatrimonio', 'filtroNF', 'filtroSituacao', 'filtroStatus', 'filtroTutela'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    _state.itensFiltrados = [..._state.itens];
    _state.pagina = 1;
    _renderizarTabela(_state.itensFiltrados);
}

// ============================================================
// FORMULÁRIO — CRUD
// ============================================================

function _toggleMotivoBaixa() {
    const status = document.getElementById('status')?.value;
    const campoMotivo = document.getElementById('campoMotivoBaixa');
    const campoData = document.getElementById('campoDataBaixa');
    const motivoInput = document.getElementById('motivoBaixa');

    if (status === 'inativo') {
        campoMotivo?.classList.add('show');
        campoData?.classList.add('show');
        if (motivoInput) motivoInput.required = true;
    } else {
        campoMotivo?.classList.remove('show');
        campoData?.classList.remove('show');
        if (motivoInput) {
            motivoInput.required = false;
            motivoInput.value = '';
        }
        const dataBaixa = document.getElementById('dataBaixa');
        if (dataBaixa) dataBaixa.value = '';
    }
}

async function _salvarItem() {
    const dados = {
        numero_patrimonio: document.getElementById('numeroPatrimonio')?.value?.trim() || '',
        nome_item: document.getElementById('nomeItem')?.value?.trim() || '',
        fabricante: document.getElementById('fabricante')?.value?.trim() || '',
        modelo: document.getElementById('modelo')?.value?.trim() || '',
        numero_serie: document.getElementById('numeroSerie')?.value?.trim() || '',
        nf: document.getElementById('nf')?.value?.trim() || '',
        data_compra: document.getElementById('dataCompra')?.value || '',
        situacao: document.getElementById('situacao')?.value || 'imobilizado',
        valor: document.getElementById('valor')?.value || 0,
        status: document.getElementById('status')?.value || 'ativo',
        motivo_baixa: document.getElementById('motivoBaixa')?.value?.trim() || '',
        data_baixa: document.getElementById('dataBaixa')?.value || '',
        tutela_usuario_id: document.getElementById('tutelaUsuarioId')?.value || '',
        observacoes: document.getElementById('observacoes')?.value?.trim() || '',
    };

    // Validações
    if (!dados.numero_patrimonio) {
        _toast('Número do patrimônio é obrigatório', 'error');
        document.getElementById('numeroPatrimonio')?.focus();
        return;
    }
    if (!dados.nome_item) {
        _toast('Nome do item é obrigatório', 'error');
        document.getElementById('nomeItem')?.focus();
        return;
    }
    if (dados.status === 'inativo' && !dados.motivo_baixa) {
        _toast('Motivo de baixa é obrigatório para itens inativos', 'error');
        document.getElementById('motivoBaixa')?.focus();
        return;
    }

    const metodo = _state.editandoId ? 'PUT' : 'POST';
    if (_state.editandoId) dados.id = _state.editandoId;

    const btnSalvar = document.getElementById('btnSalvar');
    if (btnSalvar) btnSalvar.disabled = true;

    try {
        const res = await fetch(window.location.origin + '/api/api_inventario.php', {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(dados),
        });
        const data = await res.json();

        if (data.sucesso) {
            _toast(data.mensagem || 'Item salvo com sucesso!', 'success');
            _limparFormulario();
            await _carregarInventario();
            // Navegar para listagem após salvar
            _ativarTab('listagem');
        } else {
            _toast(data.mensagem || 'Erro ao salvar item', 'error');
        }
    } catch (err) {
        console.error('[Inventario] Erro ao salvar:', err);
        _toast('Erro ao conectar com o servidor', 'error');
    } finally {
        if (btnSalvar) btnSalvar.disabled = false;
    }
}

function _editarItem(id) {
    const item = _state.itens.find(i => i.id == id);
    if (!item) {
        _toast('Item não encontrado no cache. Recarregando...', 'warning');
        _carregarInventario();
        return;
    }

    _state.editandoId = id;

    // Preencher formulário
    _setVal('itemId', item.id);
    _setVal('numeroPatrimonio', item.numero_patrimonio);
    _setVal('nomeItem', item.nome_item);
    _setVal('fabricante', item.fabricante || '');
    _setVal('modelo', item.modelo || '');
    _setVal('numeroSerie', item.numero_serie || '');
    _setVal('nf', item.nf || '');
    _setVal('dataCompra', item.data_compra || '');
    _setVal('situacao', item.situacao);
    _setVal('valor', item.valor || '');
    _setVal('status', item.status);
    _setVal('motivoBaixa', item.motivo_baixa || '');
    _setVal('dataBaixa', item.data_baixa || '');
    _setVal('tutelaUsuarioId', item.tutela_usuario_id || '');
    _setVal('observacoes', item.observacoes || '');

    _toggleMotivoBaixa();

    _setEl('formTitle', `Editando Patrimônio #${_esc(item.numero_patrimonio)}`);
    _setEl('btnSalvarTexto', 'Atualizar Item');

    // Navegar para aba de cadastro
    _ativarTab('cadastro');

    // Scroll suave ao topo
    window.scrollTo({ top: 0, behavior: 'smooth' });
    console.log('[Inventario] Editando item ID:', id);
}

function _limparFormulario() {
    const form = document.getElementById('formInventario');
    if (form) form.reset();

    _setVal('itemId', '');
    _state.editandoId = null;
    _setEl('formTitle', 'Novo Item de Patrimônio');
    _setEl('btnSalvarTexto', 'Salvar Item');
    _toggleMotivoBaixa();
}

// ============================================================
// EXCLUSÃO
// ============================================================

function _abrirModalExclusao(id, numeroPatrimonio) {
    _state.itemParaExcluir = id;
    _setEl('confirmarPatrimonio', _esc(numeroPatrimonio));
    const modal = document.getElementById('modalConfirmarExclusao');
    if (modal) modal.classList.add('show');
}

function _fecharModal() {
    const modal = document.getElementById('modalConfirmarExclusao');
    if (modal) modal.classList.remove('show');
    _state.itemParaExcluir = null;
}

async function _confirmarExclusao() {
    if (!_state.itemParaExcluir) return;

    const btnConfirmar = document.getElementById('btnConfirmarExclusao');
    if (btnConfirmar) btnConfirmar.disabled = true;

    try {
        const res = await fetch(window.location.origin + '/api/api_inventario.php', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: _state.itemParaExcluir }),
        });
        const data = await res.json();

        if (data.sucesso) {
            _toast(data.mensagem || 'Item excluído com sucesso!', 'success');
            _fecharModal();
            await _carregarInventario();
        } else {
            _toast(data.mensagem || 'Erro ao excluir item', 'error');
        }
    } catch (err) {
        console.error('[Inventario] Erro ao excluir:', err);
        _toast('Erro ao conectar com o servidor', 'error');
    } finally {
        if (btnConfirmar) btnConfirmar.disabled = false;
    }
}

// ============================================================
// RELATÓRIOS
// ============================================================

function _gerarRelatorio() {
    const tipo = document.getElementById('tipoRelatorio')?.value || 'geral';
    const situacao = document.getElementById('relFiltroSituacao')?.value || '';
    const status = document.getElementById('relFiltroStatus')?.value || '';
    const responsavel = document.getElementById('relFiltroResponsavel')?.value || '';

    let itens = _state.itens.filter(item => {
        if (situacao && item.situacao !== situacao) return false;
        if (status && item.status !== status) return false;
        if (responsavel && String(item.tutela_usuario_id) !== responsavel) return false;
        return true;
    });

    // Filtro adicional por tipo
    if (tipo === 'baixas') {
        itens = itens.filter(i => i.status === 'inativo');
    }

    const titulos = {
        geral: 'Relatório Geral',
        situacao: 'Relatório por Situação',
        status: 'Relatório por Status',
        responsavel: 'Relatório por Responsável',
        baixas: 'Relatório de Itens Baixados',
    };
    _setEl('tituloRelatorio', titulos[tipo] || 'Relatório');

    _renderizarTabelaRelatorio(itens);

    // Seção de baixas
    const secaoBaixas = document.getElementById('secaoBaixas');
    if (tipo === 'baixas' && secaoBaixas) {
        secaoBaixas.style.display = 'block';
        _renderizarBaixas(itens);
    } else if (secaoBaixas) {
        secaoBaixas.style.display = 'none';
    }

    // Atualizar KPIs com os itens filtrados
    const valorFiltrado = itens.reduce((s, i) => s + parseFloat(i.valor || 0), 0);
    _setEl('relKpiTotal', itens.length);
    _setEl('relKpiAtivos', itens.filter(i => i.status === 'ativo').length);
    _setEl('relKpiInativos', itens.filter(i => i.status === 'inativo').length);
    _setEl('relKpiValor', 'R$ ' + valorFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

    // Armazenar para exportação
    _state._relatorioAtual = itens;

    console.log('[Inventario] Relatório gerado:', tipo, '—', itens.length, 'itens');
}

function _renderizarTabelaRelatorio(itens) {
    const tbody = document.getElementById('tabelaRelatorio');
    if (!tbody) return;

    if (!itens || itens.length === 0) {
        tbody.innerHTML = '<tr class="empty-row-inv"><td colspan="8">Nenhum item encontrado com os filtros aplicados</td></tr>';
        return;
    }

    tbody.innerHTML = itens.map(item => `
        <tr>
            <td><strong>${_esc(item.numero_patrimonio)}</strong></td>
            <td>${_esc(item.nome_item)}</td>
            <td>${_esc(item.fabricante || '—')}</td>
            <td>
                <span class="badge-inv ${item.situacao === 'imobilizado' ? 'badge-primary-inv' : 'badge-warning-inv'}">
                    ${item.situacao === 'imobilizado' ? 'Imobilizado' : 'Circulante'}
                </span>
            </td>
            <td>
                <span class="badge-inv ${item.status === 'ativo' ? 'badge-success-inv' : 'badge-danger-inv'}">
                    ${item.status === 'ativo' ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td>R$ ${parseFloat(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>${_esc(item.tutela_nome || '—')}</td>
            <td>${item.data_compra_formatada || item.data_compra || '—'}</td>
        </tr>
    `).join('');
}

function _renderizarBaixas(itens) {
    const container = document.getElementById('listaBaixas');
    if (!container) return;

    if (!itens || itens.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:2rem;">Nenhum item baixado encontrado</p>';
        return;
    }

    container.innerHTML = itens.map(item => `
        <div class="baixa-item-inv">
            <h4>${_esc(item.numero_patrimonio)} — ${_esc(item.nome_item)}</h4>
            <p><strong>Data da Baixa:</strong> ${item.data_baixa_formatada || item.data_baixa || 'Não informada'}</p>
            <p><strong>Motivo:</strong> ${_esc(item.motivo_baixa || 'Não informado')}</p>
            ${item.tutela_nome ? `<p><strong>Responsável:</strong> ${_esc(item.tutela_nome)}</p>` : ''}
        </div>
    `).join('');
}

// ============================================================
// EXPORTAÇÃO CSV
// ============================================================

function _exportarCSV(itens) {
    if (!itens || itens.length === 0) {
        _toast('Nenhum dado para exportar', 'warning');
        return;
    }

    const cabecalho = ['Patrimônio', 'Nome do Item', 'Fabricante', 'Modelo', 'Nº Série', 'NF', 'Data Compra', 'Situação', 'Valor (R$)', 'Status', 'Responsável', 'Observações'];
    const linhas = itens.map(i => [
        i.numero_patrimonio,
        i.nome_item,
        i.fabricante || '',
        i.modelo || '',
        i.numero_serie || '',
        i.nf || '',
        i.data_compra || '',
        i.situacao,
        parseFloat(i.valor || 0).toFixed(2),
        i.status,
        i.tutela_nome || '',
        (i.observacoes || '').replace(/\n/g, ' '),
    ]);

    const csv = '\uFEFF' + [cabecalho, ...linhas]
        .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    _toast('CSV exportado com sucesso!', 'success');
}

function _exportarRelatorioCSV() {
    const itens = _state._relatorioAtual || _state.itens;
    _exportarCSV(itens);
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
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _setEl(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function _toast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainerInv');
    if (!container) return;

    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const div = document.createElement('div');
    div.className = `toast-inv ${tipo}`;
    div.innerHTML = `<i class="fas ${icons[tipo] || icons.info}"></i><span>${_esc(mensagem)}</span>`;
    container.appendChild(div);

    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transform = 'translateX(100%)';
        div.style.transition = 'all 0.3s ease';
        setTimeout(() => div.remove(), 300);
    }, 4000);
}

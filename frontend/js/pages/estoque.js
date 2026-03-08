/**
 * estoque.js — Módulo de Gestão de Estoque v2.0
 * Padrão: ES6 Module, init/destroy, listeners gerenciados, URLs absolutas, XSS escape
 */
'use strict';

const _API_EST = window.location.origin + '/api/api_estoque.php';
const _API_MOR = window.location.origin + '/api/api_moradores.php';

let _state = {
    produtos: [], categorias: [], moradores: [],
    produtosFiltrados: [], paginaProdutos: 1, itensPorPagina: 15,
    editandoProdutoId: null, editandoCatId: null,
    entradaProduto: null, saidaProduto: null,
    movimentacoes: [], relMorador: [],
};
let _listeners = [];

// ============================================================
// CICLO DE VIDA
// ============================================================

export function init() {
    console.log('[Estoque] Inicializando módulo v2.0...');
    _setupTabs();
    _setupBotaoVoltar();
    _setupFormProduto();
    _setupFormCategoria();
    _setupFormEntrada();
    _setupFormSaida();
    _setupMovimentacoes();
    window.EstoquePage = { editarProduto, excluirProduto, editarCategoria, excluirCategoria };
    _carregarDashboard();
    _carregarCategorias().then(() => _carregarProdutos());
    _carregarMoradores();
    console.log('[Estoque] Módulo pronto.');
}

export function destroy() {
    console.log('[Estoque] Destruindo módulo...');
    _listeners.forEach(({ el, event, fn }) => { if (el) el.removeEventListener(event, fn); });
    _listeners = [];
    if (window.EstoquePage) delete window.EstoquePage;
    _state = {
        produtos: [], categorias: [], moradores: [],
        produtosFiltrados: [], paginaProdutos: 1, itensPorPagina: 15,
        editandoProdutoId: null, editandoCatId: null,
        entradaProduto: null, saidaProduto: null,
        movimentacoes: [], relMorador: [],
    };
    console.log('[Estoque] Destruído.');
}

// ============================================================
// HELPERS
// ============================================================

function _esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function _on(el, ev, fn) {
    if (!el) return;
    el.addEventListener(ev, fn);
    _listeners.push({ el, event: ev, fn });
}

function _id(id) { return document.getElementById(id); }

function _fmt(n, d = 2) {
    return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function _brl(n) { return 'R$ ' + _fmt(n, 2); }

function _fmtDt(s) {
    if (!s) return '--';
    const d = new Date(s.replace(' ', 'T'));
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function _setText(id, v) { const el = _id(id); if (el) el.textContent = v; }
function _setVal(id, v)  { const el = _id(id); if (el) el.value = v ?? ''; }

function _toast(msg, tipo = 'success') {
    const c = _id('toastEstoque');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast-est ' + tipo;
    const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
    t.innerHTML = '<i class="fas fa-' + (icons[tipo] || 'info-circle') + '"></i> ' + _esc(msg);
    c.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 4000);
}

async function _fetch(url, opts = {}) {
    const res = await fetch(url, { credentials: 'include', ...opts });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}

// ============================================================
// TABS
// ============================================================

function _setupTabs() {
    const btns = document.querySelectorAll('.tab-btn-est');
    btns.forEach(btn => {
        _on(btn, 'click', () => {
            btns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content-est').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tab = _id('tab-' + btn.dataset.tab);
            if (tab) tab.classList.add('active');
            if (btn.dataset.tab === 'entrada')       _carregarHistoricoEntradas();
            if (btn.dataset.tab === 'saida')         _carregarHistoricoSaidas();
            if (btn.dataset.tab === 'movimentacoes') _popularSelectMovProdutos();
        });
    });
}

function _setupBotaoVoltar() {
    const btn = _id('btnVoltarAdmin');
    if (!btn) return;
    _on(btn, 'click', () => {
        if (window.AppRouter) window.AppRouter.navigate('administrativa');
    });
}

// ============================================================
// DASHBOARD
// ============================================================

async function _carregarDashboard() {
    try {
        const data = await _fetch(_API_EST + '?action=dashboard');
        if (!data.sucesso) return;
        const d = data.dados;
        _setText('kpiTotalProdutos', d.total_produtos || 0);
        _setText('kpiValorTotal',    _brl(d.valor_total));
        _setText('kpiEstoqueBaixo',  d.produtos_estoque_baixo || 0);
        _setText('kpiZerados',       d.produtos_zerados || 0);
        _setText('kpiMovMes',        d.movimentacoes_mes || 0);
        _setText('kpiAlertas',       (d.alertas_zerado || 0) + (d.alertas_baixo || 0));
        _setText('dashEntradasMes',  d.entradas_mes || 0);
        _setText('dashSaidasMes',    d.saidas_mes || 0);
        _setText('dashValorEntradas', _brl(d.valor_entradas_mes));
        _setText('dashValorSaidas',   _brl(d.valor_saidas_mes));
        _renderMaisMov(d.mais_movimentados || []);
        _renderAlertas(d.alertas || []);
        console.log('[Estoque] Dashboard carregado.');
    } catch (e) { console.error('[Estoque] Erro dashboard:', e); }
}

function _renderMaisMov(lista) {
    const el = _id('maisMov');
    if (!el) return;
    if (!lista.length) {
        el.innerHTML = '<p style="color:#94a3b8;font-size:.875rem;text-align:center;padding:16px">Sem movimentações no mês</p>';
        return;
    }
    el.innerHTML = lista.map(p =>
        '<div class="mais-mov-item-est">' +
        '<span class="mais-mov-nome-est">' + _esc(p.nome) + '</span>' +
        '<span class="mais-mov-qtd-est">' + _fmt(p.total_movimentado, 0) + ' mov.</span>' +
        '</div>'
    ).join('');
}

function _renderAlertas(alertas) {
    const el = _id('listaAlertas');
    if (!el) return;
    if (!alertas.length) {
        el.innerHTML = '<p style="color:#16a34a;font-size:.875rem;text-align:center;padding:16px"><i class="fas fa-check-circle"></i> Nenhum alerta</p>';
        return;
    }
    el.innerHTML = alertas.map(a => {
        const z = a.tipo === 'zerado';
        return '<div class="alerta-item-est ' + (z ? 'alerta-zerado-est' : 'alerta-baixo-est') + '">' +
            '<i class="fas fa-' + (z ? 'times-circle' : 'exclamation-triangle') + '"></i>' +
            '<div><strong>' + _esc(a.nome) + '</strong>' +
            (z ? ' — Zerado' : ' — Baixo: ' + _fmt(a.quantidade_atual, 0) + ' (mín: ' + _fmt(a.estoque_minimo, 0) + ')') +
            '</div><span>' + _esc(a.categoria || '') + '</span></div>';
    }).join('');
}

// ============================================================
// PRODUTOS
// ============================================================

async function _carregarProdutos() {
    try {
        const data = await _fetch(_API_EST + '?action=listar_produtos');
        if (!data.sucesso) return;
        _state.produtos = data.dados || [];
        _filtrarProdutos();
        _popularSelectMovProdutos();
        console.log('[Estoque] ' + _state.produtos.length + ' produtos carregados.');
    } catch (e) { console.error('[Estoque] Erro produtos:', e); }
}

function _filtrarProdutos() {
    const busca  = (_id('buscaProduto')?.value || '').toLowerCase();
    const catId  = _id('filtroCatProd')?.value || '';
    const status = _id('filtroStatusProd')?.value || '';
    _state.produtosFiltrados = _state.produtos.filter(p => {
        const mb = !busca || p.codigo?.toLowerCase().includes(busca) || p.nome?.toLowerCase().includes(busca);
        const mc = !catId || String(p.categoria_id) === catId;
        const q  = Number(p.quantidade_atual);
        const m  = Number(p.estoque_minimo);
        const ms = !status ||
            (status === 'zerado' && q <= 0) ||
            (status === 'baixo'  && q > 0 && q <= m);
        return mb && mc && ms;
    });
    _state.paginaProdutos = 1;
    _renderProdutos();
}

function _renderProdutos() {
    const tbody = _id('bodyProdutos');
    if (!tbody) return;
    const total = _state.produtosFiltrados.length;
    const ini   = (_state.paginaProdutos - 1) * _state.itensPorPagina;
    const pag   = _state.produtosFiltrados.slice(ini, ini + _state.itensPorPagina);
    if (!pag.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-row-est"><i class="fas fa-box-open"></i> Nenhum produto encontrado</td></tr>';
        const pg = _id('paginacaoProdutos'); if (pg) pg.innerHTML = '';
        return;
    }
    tbody.innerHTML = pag.map(p => {
        const q = Number(p.quantidade_atual || 0);
        const m = Number(p.estoque_minimo || 0);
        let badge = '<span class="badge-est badge-green-est">Normal</span>';
        if (q <= 0)     badge = '<span class="badge-est badge-red-est">Zerado</span>';
        else if (q <= m) badge = '<span class="badge-est badge-orange-est">Baixo</span>';
        const nomeEsc = _esc(p.nome).replace(/'/g, "\\'");
        return '<tr>' +
            '<td><code>' + _esc(p.codigo) + '</code></td>' +
            '<td><strong>' + _esc(p.nome) + '</strong><br><small style="color:#94a3b8">' + _esc(p.localizacao || '') + '</small></td>' +
            '<td>' + _esc(p.categoria_nome || '--') + '</td>' +
            '<td>' + _esc(p.unidade_medida || 'un') + '</td>' +
            '<td>' + _brl(p.preco_unitario) + '</td>' +
            '<td><strong>' + _fmt(q, 2) + '</strong></td>' +
            '<td>' + _fmt(m, 2) + '</td>' +
            '<td>' + _brl(q * Number(p.preco_unitario || 0)) + '</td>' +
            '<td>' + badge + '</td>' +
            '<td><div style="display:flex;gap:6px">' +
            '<button class="btn-sm-est btn-outline-est" onclick="EstoquePage.editarProduto(' + p.id + ')" title="Editar"><i class="fas fa-edit"></i></button>' +
            '<button class="btn-sm-est btn-danger-est" onclick="EstoquePage.excluirProduto(' + p.id + ',\'' + nomeEsc + '\')" title="Excluir"><i class="fas fa-trash"></i></button>' +
            '</div></td></tr>';
    }).join('');
    _renderPaginacao('paginacaoProdutos', _state.paginaProdutos,
        Math.ceil(total / _state.itensPorPagina),
        pg => { _state.paginaProdutos = pg; _renderProdutos(); });
}

function _renderPaginacao(cid, atual, total, onPage) {
    const pag = _id(cid);
    if (!pag || total <= 1) { if (pag) pag.innerHTML = ''; return; }
    let html = '<button class="page-btn-est"' + (atual === 1 ? ' disabled' : '') + ' data-pg="' + (atual - 1) + '">&#8249;</button>';
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || Math.abs(i - atual) <= 2)
            html += '<button class="page-btn-est' + (i === atual ? ' active' : '') + '" data-pg="' + i + '">' + i + '</button>';
        else if (Math.abs(i - atual) === 3)
            html += '<span style="padding:0 4px;color:#94a3b8">...</span>';
    }
    html += '<button class="page-btn-est"' + (atual === total ? ' disabled' : '') + ' data-pg="' + (atual + 1) + '">&#8250;</button>';
    pag.innerHTML = html;
    pag.querySelectorAll('.page-btn-est[data-pg]').forEach(btn => {
        _on(btn, 'click', () => onPage(parseInt(btn.dataset.pg)));
    });
}

function _setupFormProduto() {
    const form = _id('produtoForm');
    if (!form) return;
    _on(form, 'submit', async (e) => {
        e.preventDefault();
        const id = _id('produtoId')?.value;
        const payload = {
            action: id ? 'atualizar_produto' : 'cadastrar_produto',
            id: id || undefined,
            codigo:           _id('produtoCodigo')?.value.trim(),
            nome:             _id('produtoNome')?.value.trim(),
            categoria_id:     _id('produtoCategoria')?.value,
            unidade_medida:   _id('produtoUnidade')?.value,
            preco_unitario:   _id('produtoPreco')?.value || 0,
            estoque_minimo:   _id('produtoEstoqueMin')?.value || 0,
            localizacao:      _id('produtoLocalizacao')?.value.trim(),
            fornecedor_padrao: _id('produtoFornecedorPad')?.value.trim(),
            descricao:        _id('produtoDescricao')?.value.trim(),
        };
        try {
            const data = await _fetch(_API_EST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (data.sucesso) {
                _toast(id ? 'Produto atualizado!' : 'Produto cadastrado!');
                _limparFormProduto();
                await _carregarProdutos();
                _carregarDashboard();
            } else {
                _toast(data.mensagem || 'Erro ao salvar produto', 'error');
            }
        } catch (err) {
            console.error('[Estoque] Erro salvar produto:', err);
            _toast('Erro de comunicação', 'error');
        }
    });
    _on(_id('btnLimparProduto'), 'click', _limparFormProduto);
    _on(_id('btnToggleFormProduto'), 'click', () => {
        const b = _id('bodyFormProduto'), ic = _id('iconToggleForm');
        if (!b) return;
        const h = b.style.display === 'none';
        b.style.display = h ? '' : 'none';
        if (ic) ic.className = h ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    });
    _on(_id('buscaProduto'),     'input',  _filtrarProdutos);
    _on(_id('filtroCatProd'),    'change', _filtrarProdutos);
    _on(_id('filtroStatusProd'), 'change', _filtrarProdutos);
    _on(_id('btnExportarProdutos'), 'click', _exportarProdutosCSV);
}

function _limparFormProduto() {
    const f = _id('produtoForm'); if (f) f.reset();
    _setVal('produtoId', '');
    _state.editandoProdutoId = null;
    const t = _id('tituloProdutoForm');
    if (t) t.innerHTML = '<i class="fas fa-plus-circle"></i> Novo Produto';
}

function editarProduto(id) {
    const p = _state.produtos.find(x => x.id == id);
    if (!p) return;
    _state.editandoProdutoId = id;
    const b = _id('bodyFormProduto'), ic = _id('iconToggleForm');
    if (b) b.style.display = '';
    if (ic) ic.className = 'fas fa-chevron-up';
    _setVal('produtoId',          p.id);
    _setVal('produtoCodigo',      p.codigo);
    _setVal('produtoNome',        p.nome);
    _setVal('produtoCategoria',   p.categoria_id);
    _setVal('produtoUnidade',     p.unidade_medida);
    _setVal('produtoPreco',       p.preco_unitario);
    _setVal('produtoEstoqueMin',  p.estoque_minimo);
    _setVal('produtoLocalizacao', p.localizacao);
    _setVal('produtoFornecedorPad', p.fornecedor_padrao);
    _setVal('produtoDescricao',   p.descricao);
    const t = _id('tituloProdutoForm');
    if (t) t.innerHTML = '<i class="fas fa-edit"></i> Editando Produto #' + id;
    document.querySelector('.tab-btn-est[data-tab="produtos"]')?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function excluirProduto(id, nome) {
    if (!confirm('Excluir "' + nome + '"? Esta ação não pode ser desfeita.')) return;
    try {
        const data = await _fetch(_API_EST, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'excluir_produto', id }),
        });
        if (data.sucesso) {
            _toast('Produto excluído!');
            await _carregarProdutos();
            _carregarDashboard();
        } else {
            _toast(data.mensagem || 'Erro ao excluir', 'error');
        }
    } catch (err) {
        console.error('[Estoque] Erro excluir:', err);
        _toast('Erro de comunicação', 'error');
    }
}

// ============================================================
// CATEGORIAS
// ============================================================

async function _carregarCategorias() {
    try {
        const data = await _fetch(_API_EST + '?action=listar_categorias');
        if (!data.sucesso) return;
        _state.categorias = data.dados || [];
        _popularSelectCategorias();
        _renderCategorias();
        console.log('[Estoque] ' + _state.categorias.length + ' categorias carregadas.');
    } catch (e) { console.error('[Estoque] Erro categorias:', e); }
}

function _popularSelectCategorias() {
    ['produtoCategoria', 'filtroCatProd'].forEach(id => {
        const sel = _id(id);
        if (!sel) return;
        const v = sel.value;
        sel.innerHTML = '<option value="">' + (id === 'filtroCatProd' ? 'Todas as categorias' : 'Selecione...') + '</option>' +
            _state.categorias.map(c => '<option value="' + c.id + '">' + _esc(c.nome) + '</option>').join('');
        sel.value = v;
    });
}

function _renderCategorias() {
    const tbody = _id('bodyCategorias');
    if (!tbody) return;
    if (!_state.categorias.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row-est">Nenhuma categoria cadastrada</td></tr>';
        return;
    }
    tbody.innerHTML = _state.categorias.map(c => {
        const nomeEsc = _esc(c.nome).replace(/'/g, "\\'");
        return '<tr>' +
            '<td><strong>' + _esc(c.nome) + '</strong></td>' +
            '<td>' + _esc(c.descricao || '--') + '</td>' +
            '<td>' + (c.total_produtos || 0) + '</td>' +
            '<td><div style="display:flex;gap:6px">' +
            '<button class="btn-sm-est btn-outline-est" onclick="EstoquePage.editarCategoria(' + c.id + ')" title="Editar"><i class="fas fa-edit"></i></button>' +
            '<button class="btn-sm-est btn-danger-est" onclick="EstoquePage.excluirCategoria(' + c.id + ',\'' + nomeEsc + '\')" title="Excluir"><i class="fas fa-trash"></i></button>' +
            '</div></td></tr>';
    }).join('');
}

function _setupFormCategoria() {
    _on(_id('btnNovaCat'), 'click', () => {
        const w = _id('formCatWrapper');
        if (w) w.style.display = w.style.display === 'none' ? '' : 'none';
        _limparFormCat();
    });
    _on(_id('btnSalvarCat'),   'click', _salvarCategoria);
    _on(_id('btnCancelarCat'), 'click', () => {
        const w = _id('formCatWrapper'); if (w) w.style.display = 'none';
        _limparFormCat();
    });
}

async function _salvarCategoria() {
    const nome = _id('catNome')?.value.trim();
    if (!nome) { _toast('Informe o nome da categoria', 'warning'); return; }
    const id = _state.editandoCatId;
    try {
        const data = await _fetch(_API_EST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: id ? 'atualizar_categoria' : 'cadastrar_categoria',
                id: id || undefined,
                nome,
                descricao: _id('catDescricao')?.value.trim(),
            }),
        });
        if (data.sucesso) {
            _toast(id ? 'Categoria atualizada!' : 'Categoria cadastrada!');
            _limparFormCat();
            const w = _id('formCatWrapper'); if (w) w.style.display = 'none';
            await _carregarCategorias();
        } else {
            _toast(data.mensagem || 'Erro ao salvar categoria', 'error');
        }
    } catch (err) {
        console.error('[Estoque] Erro categoria:', err);
        _toast('Erro de comunicação', 'error');
    }
}

function editarCategoria(id) {
    const c = _state.categorias.find(x => x.id == id);
    if (!c) return;
    _state.editandoCatId = id;
    _setVal('catNome',      c.nome);
    _setVal('catDescricao', c.descricao);
    const w = _id('formCatWrapper'); if (w) w.style.display = '';
}

async function excluirCategoria(id, nome) {
    if (!confirm('Excluir "' + nome + '"? Produtos vinculados ficarão sem categoria.')) return;
    try {
        const data = await _fetch(_API_EST, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'excluir_categoria', id }),
        });
        if (data.sucesso) {
            _toast('Categoria excluída!');
            await _carregarCategorias();
        } else {
            _toast(data.mensagem || 'Erro ao excluir', 'error');
        }
    } catch (err) {
        console.error('[Estoque] Erro excluir cat:', err);
        _toast('Erro de comunicação', 'error');
    }
}

function _limparFormCat() {
    _setVal('catNome', '');
    _setVal('catDescricao', '');
    _state.editandoCatId = null;
}

// ============================================================
// MORADORES
// ============================================================

async function _carregarMoradores() {
    try {
        const data = await _fetch(_API_MOR + '?action=listar');
        if (!data.sucesso) return;
        _state.moradores = data.dados || [];
        _popularSelectMoradores();
        console.log('[Estoque] ' + _state.moradores.length + ' moradores carregados.');
    } catch (e) { console.error('[Estoque] Erro moradores:', e); }
}

function _popularSelectMoradores() {
    ['saidaMorador', 'filtroMovMorador'].forEach(id => {
        const sel = _id(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Todos</option>' +
            _state.moradores.map(m =>
                '<option value="' + m.id + '">' + _esc(m.nome) + ' — ' + _esc(m.unidade || '') + '</option>'
            ).join('');
    });
}

// ============================================================
// AUTOCOMPLETE DE PRODUTO
// ============================================================

function _setupBuscaProduto(inputId, resultsId, onSelect) {
    const input = _id(inputId), results = _id(resultsId);
    if (!input || !results) return;
    _on(input, 'input', () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) { results.classList.remove('show'); return; }
        const found = _state.produtos
            .filter(p => p.codigo?.toLowerCase().includes(q) || p.nome?.toLowerCase().includes(q))
            .slice(0, 10);
        if (!found.length) { results.classList.remove('show'); return; }
        results.innerHTML = found.map(p =>
            '<div class="search-result-item-est" data-id="' + p.id + '">' +
            '<span>' + _esc(p.nome) + '</span>' +
            '<span class="prod-cod-est">' + _esc(p.codigo) + ' | Estoque: ' + _fmt(p.quantidade_atual, 0) + '</span>' +
            '</div>'
        ).join('');
        results.classList.add('show');
        results.querySelectorAll('.search-result-item-est').forEach(item => {
            _on(item, 'click', () => {
                const prod = _state.produtos.find(p => p.id == item.dataset.id);
                if (prod) onSelect(prod);
                results.classList.remove('show');
                input.value = '';
            });
        });
    });
    _on(document, 'click', (e) => {
        if (!input.contains(e.target) && !results.contains(e.target))
            results.classList.remove('show');
    });
}

// ============================================================
// ENTRADA
// ============================================================

function _setupFormEntrada() {
    _setupBuscaProduto('buscaEntradaProduto', 'resultadosBuscaEntrada', (prod) => {
        _state.entradaProduto = prod;
        _setVal('entradaProdutoId', prod.id);
        const info = _id('produtoEntradaInfo');
        if (info) info.style.display = 'flex';
        _setText('entradaProdutoNome',  prod.nome);
        _setText('entradaEstoqueAtual', _fmt(prod.quantidade_atual, 0));
        _setText('entradaPrecoUnit',    _fmt(prod.preco_unitario, 2));
        _setVal('entradaValorUnit', prod.preco_unitario || '');
        _atualizarPreviewEntrada();
    });
    _on(_id('btnLimparEntradaProduto'), 'click', _limparEntrada);
    _on(_id('entradaQtd'),       'input', _atualizarPreviewEntrada);
    _on(_id('entradaValorUnit'), 'input', _atualizarPreviewEntrada);
    _on(_id('entradaForm'), 'submit', async (e) => {
        e.preventDefault();
        if (!_state.entradaProduto) { _toast('Selecione um produto', 'warning'); return; }
        const qtd = parseFloat(_id('entradaQtd')?.value || 0);
        if (qtd <= 0) { _toast('Informe uma quantidade válida', 'warning'); return; }
        const motivo = _id('entradaMotivo')?.value.trim();
        if (!motivo) { _toast('Informe o motivo da entrada', 'warning'); return; }
        const resp = _id('entradaResponsavel')?.value.trim();
        if (!resp) { _toast('Informe o responsável', 'warning'); return; }
        try {
            const data = await _fetch(_API_EST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action:        'registrar_entrada',
                    produto_id:    _state.entradaProduto.id,
                    quantidade:    qtd,
                    valor_unitario: parseFloat(_id('entradaValorUnit')?.value || 0),
                    nota_fiscal:   _id('entradaNF')?.value.trim(),
                    fornecedor:    _id('entradaFornecedor')?.value.trim(),
                    motivo,
                    responsavel:   resp,
                    observacoes:   _id('entradaObs')?.value.trim(),
                }),
            });
            if (data.sucesso) {
                _toast('Entrada registrada com sucesso!');
                _limparEntrada();
                await _carregarProdutos();
                _carregarDashboard();
                _carregarHistoricoEntradas();
            } else {
                _toast(data.mensagem || 'Erro ao registrar entrada', 'error');
            }
        } catch (err) {
            console.error('[Estoque] Erro entrada:', err);
            _toast('Erro de comunicação', 'error');
        }
    });
    _on(_id('btnLimparEntrada'),   'click', _limparEntrada);
    _on(_id('btnRefreshEntradas'), 'click', _carregarHistoricoEntradas);
}

function _atualizarPreviewEntrada() {
    if (!_state.entradaProduto) return;
    const qtd   = parseFloat(_id('entradaQtd')?.value || 0);
    const vu    = parseFloat(_id('entradaValorUnit')?.value || _state.entradaProduto.preco_unitario || 0);
    const atual = Number(_state.entradaProduto.quantidade_atual || 0);
    const prev  = _id('previewEntrada');
    if (!prev) return;
    if (qtd > 0) {
        prev.style.display = '';
        _setText('prevEntradaAtual', _fmt(atual, 0));
        _setText('prevEntradaQtd',   _fmt(qtd, 0));
        _setText('prevEntradaNovo',  _fmt(atual + qtd, 0));
        _setText('prevEntradaValor', _brl(qtd * vu));
    } else {
        prev.style.display = 'none';
    }
}

function _limparEntrada() {
    _state.entradaProduto = null;
    const f = _id('entradaForm'); if (f) f.reset();
    _setVal('entradaProdutoId', '');
    const i = _id('produtoEntradaInfo'); if (i) i.style.display = 'none';
    const p = _id('previewEntrada');    if (p) p.style.display = 'none';
}

async function _carregarHistoricoEntradas() {
    const tbody = _id('bodyHistoricoEntradas');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row-est"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    try {
        const data = await _fetch(_API_EST + '?action=historico_entradas&limit=20');
        if (!data.sucesso || !data.dados?.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-row-est">Nenhuma entrada registrada</td></tr>';
            return;
        }
        tbody.innerHTML = data.dados.map(e =>
            '<tr>' +
            '<td>' + _fmtDt(e.data_hora) + '</td>' +
            '<td>' + _esc(e.produto_nome) + '</td>' +
            '<td>' + _fmt(e.quantidade, 2) + ' ' + _esc(e.unidade || '') + '</td>' +
            '<td>' + _brl(e.valor_unitario) + '</td>' +
            '<td>' + _brl(e.valor_total) + '</td>' +
            '<td>' + _esc(e.nota_fiscal || '--') + '</td>' +
            '<td>' + _esc(e.fornecedor || '--') + '</td>' +
            '<td>' + _esc(e.responsavel) + '</td></tr>'
        ).join('');
    } catch (err) {
        console.error('[Estoque] Erro histórico entradas:', err);
        tbody.innerHTML = '<tr><td colspan="8" class="empty-row-est">Erro ao carregar</td></tr>';
    }
}

// ============================================================
// SAÍDA
// ============================================================

function _setupFormSaida() {
    _setupBuscaProduto('buscaSaidaProduto', 'resultadosBuscaSaida', (prod) => {
        _state.saidaProduto = prod;
        _setVal('saidaProdutoId', prod.id);
        const info = _id('produtoSaidaInfo');
        if (info) info.style.display = 'flex';
        _setText('saidaProdutoNome',  prod.nome);
        _setText('saidaEstoqueAtual', _fmt(prod.quantidade_atual, 0));
        _setText('saidaPrecoUnit',    _fmt(prod.preco_unitario, 2));
        _atualizarPreviewSaida();
    });
    _on(_id('btnLimparSaidaProduto'), 'click', _limparSaida);
    _on(_id('saidaQtd'), 'input', _atualizarPreviewSaida);
    _on(_id('saidaTipoDestino'), 'change', () => {
        const w = _id('moradorWrapper');
        if (w) w.style.display = _id('saidaTipoDestino').value === 'Morador' ? '' : 'none';
    });
    _on(_id('saidaForm'), 'submit', async (e) => {
        e.preventDefault();
        if (!_state.saidaProduto) { _toast('Selecione um produto', 'warning'); return; }
        const qtd = parseFloat(_id('saidaQtd')?.value || 0);
        if (qtd <= 0) { _toast('Informe uma quantidade válida', 'warning'); return; }
        const atual = Number(_state.saidaProduto.quantidade_atual || 0);
        if (qtd > atual) { _toast('Quantidade maior que o estoque disponível!', 'error'); return; }
        const motivo = _id('saidaMotivo')?.value.trim();
        if (!motivo) { _toast('Informe o motivo da saída', 'warning'); return; }
        const resp = _id('saidaResponsavel')?.value.trim();
        if (!resp) { _toast('Informe o responsável', 'warning'); return; }
        try {
            const data = await _fetch(_API_EST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action:       'registrar_saida',
                    produto_id:   _state.saidaProduto.id,
                    quantidade:   qtd,
                    tipo_destino: _id('saidaTipoDestino')?.value,
                    morador_id:   _id('saidaMorador')?.value || null,
                    motivo,
                    responsavel:  resp,
                    observacoes:  _id('saidaObs')?.value.trim(),
                }),
            });
            if (data.sucesso) {
                _toast('Saída registrada com sucesso!');
                _limparSaida();
                await _carregarProdutos();
                _carregarDashboard();
                _carregarHistoricoSaidas();
            } else {
                _toast(data.mensagem || 'Erro ao registrar saída', 'error');
            }
        } catch (err) {
            console.error('[Estoque] Erro saída:', err);
            _toast('Erro de comunicação', 'error');
        }
    });
    _on(_id('btnLimparSaida'),   'click', _limparSaida);
    _on(_id('btnRefreshSaidas'), 'click', _carregarHistoricoSaidas);
}

function _atualizarPreviewSaida() {
    if (!_state.saidaProduto) return;
    const qtd   = parseFloat(_id('saidaQtd')?.value || 0);
    const atual = Number(_state.saidaProduto.quantidade_atual || 0);
    const preco = Number(_state.saidaProduto.preco_unitario || 0);
    const prev  = _id('previewSaida');
    const ai    = _id('alertEstoqueInsuficiente');
    const btn   = _id('btnRegistrarSaida');
    if (!prev) return;
    if (qtd > 0) {
        prev.style.display = '';
        _setText('prevSaidaAtual', _fmt(atual, 0));
        _setText('prevSaidaQtd',   _fmt(qtd, 0));
        _setText('prevSaidaNovo',  _fmt(atual - qtd, 0));
        _setText('prevSaidaValor', _brl(qtd * preco));
        const ins = qtd > atual;
        if (ai)  ai.style.display = ins ? '' : 'none';
        if (btn) btn.disabled = ins;
    } else {
        prev.style.display = 'none';
        if (ai) ai.style.display = 'none';
    }
}

function _limparSaida() {
    _state.saidaProduto = null;
    const f = _id('saidaForm'); if (f) f.reset();
    _setVal('saidaProdutoId', '');
    const i = _id('produtoSaidaInfo');       if (i) i.style.display = 'none';
    const p = _id('previewSaida');           if (p) p.style.display = 'none';
    const w = _id('moradorWrapper');         if (w) w.style.display = 'none';
    const a = _id('alertEstoqueInsuficiente'); if (a) a.style.display = 'none';
}

async function _carregarHistoricoSaidas() {
    const tbody = _id('bodyHistoricoSaidas');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row-est"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    try {
        const data = await _fetch(_API_EST + '?action=historico_saidas&limit=20');
        if (!data.sucesso || !data.dados?.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-row-est">Nenhuma saída registrada</td></tr>';
            return;
        }
        tbody.innerHTML = data.dados.map(s =>
            '<tr>' +
            '<td>' + _fmtDt(s.data_hora) + '</td>' +
            '<td>' + _esc(s.produto_nome) + '</td>' +
            '<td>' + _fmt(s.quantidade, 2) + ' ' + _esc(s.unidade || '') + '</td>' +
            '<td>' + _esc(s.tipo_destino) + '</td>' +
            '<td>' + _esc(s.morador_nome || '--') + '</td>' +
            '<td>' + _brl(s.valor_total) + '</td>' +
            '<td>' + _esc(s.motivo) + '</td>' +
            '<td>' + _esc(s.responsavel) + '</td></tr>'
        ).join('');
    } catch (err) {
        console.error('[Estoque] Erro histórico saídas:', err);
        tbody.innerHTML = '<tr><td colspan="8" class="empty-row-est">Erro ao carregar</td></tr>';
    }
}

// ============================================================
// MOVIMENTAÇÕES
// ============================================================

function _setupMovimentacoes() {
    _on(_id('btnFiltrarMov'),      'click', _filtrarMovimentacoes);
    _on(_id('btnLimparFiltroMov'), 'click', () => {
        ['filtroMovProduto', 'filtroMovTipo', 'filtroMovInicio', 'filtroMovFim', 'filtroMovMorador'].forEach(id => {
            const el = _id(id); if (el) el.value = '';
        });
        const t = _id('bodyMovimentacoes');
        if (t) t.innerHTML = '<tr><td colspan="10" class="empty-row-est">Use os filtros acima para buscar</td></tr>';
        _setText('totalMovLabel', '0 registros');
    });
    _on(_id('btnExportarMov'),        'click', _exportarMovCSV);
    _on(_id('btnRelMorador'),         'click', _gerarRelMorador);
    _on(_id('btnExportarRelMorador'), 'click', _exportarRelMoradorCSV);
}

function _popularSelectMovProdutos() {
    const sel = _id('filtroMovProduto');
    if (!sel) return;
    const v = sel.value;
    sel.innerHTML = '<option value="">Todos os produtos</option>' +
        _state.produtos.map(p => '<option value="' + p.id + '">' + _esc(p.nome) + '</option>').join('');
    sel.value = v;
}

async function _filtrarMovimentacoes() {
    const tbody = _id('bodyMovimentacoes');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" class="empty-row-est"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    const params = new URLSearchParams({
        action:      'historico_movimentacoes',
        produto_id:  _id('filtroMovProduto')?.value  || '',
        tipo:        _id('filtroMovTipo')?.value      || '',
        data_inicio: _id('filtroMovInicio')?.value    || '',
        data_fim:    _id('filtroMovFim')?.value       || '',
        morador_id:  _id('filtroMovMorador')?.value   || '',
        limit:       _id('filtroMovLimit')?.value     || '50',
    });
    try {
        const data = await _fetch(_API_EST + '?' + params.toString());
        if (!data.sucesso || !data.dados?.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-row-est">Nenhuma movimentação encontrada</td></tr>';
            _setText('totalMovLabel', '0 registros');
            return;
        }
        _state.movimentacoes = data.dados;
        _setText('totalMovLabel', data.dados.length + ' registros');
        tbody.innerHTML = data.dados.map(m => {
            const tipo = m.tipo === 'Entrada'
                ? '<span class="badge-est badge-green-est"><i class="fas fa-arrow-down"></i> Entrada</span>'
                : '<span class="badge-est badge-red-est"><i class="fas fa-arrow-up"></i> Saída</span>';
            return '<tr>' +
                '<td>' + _fmtDt(m.data_hora) + '</td>' +
                '<td>' + _esc(m.produto_nome) + '</td>' +
                '<td>' + tipo + '</td>' +
                '<td>' + _fmt(m.quantidade, 2) + '</td>' +
                '<td>' + _fmt(m.quantidade_anterior, 2) + '</td>' +
                '<td>' + _fmt(m.quantidade_nova, 2) + '</td>' +
                '<td>' + _esc(m.tipo_destino || m.fornecedor || '--') + '</td>' +
                '<td>' + _esc(m.morador_nome || '--') + '</td>' +
                '<td>' + _brl(m.valor_total) + '</td>' +
                '<td>' + _esc(m.responsavel) + '</td></tr>';
        }).join('');
    } catch (err) {
        console.error('[Estoque] Erro movimentações:', err);
        tbody.innerHTML = '<tr><td colspan="10" class="empty-row-est">Erro ao buscar movimentações</td></tr>';
    }
}

async function _gerarRelMorador() {
    const tbody   = _id('bodyRelMorador');
    const wrapper = _id('relMoradorWrapper');
    if (!tbody || !wrapper) return;
    const params = new URLSearchParams({
        action:      'relatorio_consumo_morador',
        data_inicio: _id('relMoradorInicio')?.value || '',
        data_fim:    _id('relMoradorFim')?.value    || '',
    });
    try {
        const data = await _fetch(_API_EST + '?' + params.toString());
        wrapper.style.display = '';
        const btnExp = _id('btnExportarRelMorador');
        if (!data.sucesso || !data.dados?.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-row-est">Nenhum dado encontrado para o período</td></tr>';
            if (btnExp) btnExp.style.display = 'none';
            return;
        }
        _state.relMorador = data.dados;
        if (btnExp) btnExp.style.display = '';
        tbody.innerHTML = data.dados.map(r =>
            '<tr>' +
            '<td>' + _esc(r.morador_nome) + '</td>' +
            '<td>' + _esc(r.unidade || '--') + '</td>' +
            '<td>' + (r.total_retiradas || 0) + '</td>' +
            '<td>' + _fmt(r.quantidade_total, 2) + '</td>' +
            '<td>' + _brl(r.valor_total) + '</td></tr>'
        ).join('');
    } catch (err) {
        console.error('[Estoque] Erro rel morador:', err);
        _toast('Erro ao gerar relatório', 'error');
    }
}

// ============================================================
// EXPORTAÇÃO CSV
// ============================================================

function _exportarProdutosCSV() {
    if (!_state.produtosFiltrados.length) { _toast('Nenhum produto para exportar', 'warning'); return; }
    const header = ['Código', 'Nome', 'Categoria', 'Unidade', 'Preço Unit.', 'Qtd. Estoque', 'Est. Mínimo', 'Valor Total', 'Status'];
    const rows = _state.produtosFiltrados.map(p => {
        const q = Number(p.quantidade_atual || 0), m = Number(p.estoque_minimo || 0);
        return [p.codigo, p.nome, p.categoria_nome || '', p.unidade_medida, p.preco_unitario, q, m,
            (q * Number(p.preco_unitario || 0)).toFixed(2),
            q <= 0 ? 'Zerado' : q <= m ? 'Baixo' : 'Normal'];
    });
    _downloadCSV('produtos_estoque.csv', header, rows);
}

function _exportarMovCSV() {
    if (!_state.movimentacoes.length) { _toast('Nenhuma movimentação para exportar', 'warning'); return; }
    const header = ['Data/Hora', 'Produto', 'Tipo', 'Quantidade', 'Qtd. Anterior', 'Qtd. Nova', 'Destino/Origem', 'Morador', 'Valor Total', 'Responsável'];
    const rows = _state.movimentacoes.map(m => [
        _fmtDt(m.data_hora), m.produto_nome, m.tipo, m.quantidade,
        m.quantidade_anterior, m.quantidade_nova,
        m.tipo_destino || m.fornecedor || '', m.morador_nome || '',
        m.valor_total, m.responsavel,
    ]);
    _downloadCSV('movimentacoes_estoque.csv', header, rows);
}

function _exportarRelMoradorCSV() {
    if (!_state.relMorador.length) { _toast('Nenhum dado para exportar', 'warning'); return; }
    const header = ['Morador', 'Unidade', 'Total Retiradas', 'Qtd. Total', 'Valor Total'];
    const rows = _state.relMorador.map(r => [r.morador_nome, r.unidade || '', r.total_retiradas, r.quantidade_total, r.valor_total]);
    _downloadCSV('consumo_moradores.csv', header, rows);
}

function _downloadCSV(filename, header, rows) {
    const sep = ';', bom = '\uFEFF';
    const content = bom + [header, ...rows]
        .map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(sep))
        .join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

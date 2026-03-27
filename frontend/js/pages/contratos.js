/**
 * ═══════════════════════════════════════════════════════════════════
 * MODULO: CONTRATOS — Controller ES6
 * Fluxo: Lista → Detalhe (Dados | Documentos | Orcamentos) + Relatorios
 * Padrao: export { init, destroy }
 * ═══════════════════════════════════════════════════════════════════
 */

const TAG = '[Contratos]';
const API = '../api/api_contratos.php';
const API_FORN = '../api/api_admin_fornecedores.php';
const API_PLANOS = '../api/api_planos_contas.php';

/* ── Estado ──────────────────────────────────────────────────────── */
let _state = {
    lista: [],
    planos: [],
    contratoAtual: null,
    documentos: [],
    orcamentos: [],
    pagina: 1,
    porPagina: 15,
    _listeners: []
};

/* ── Helpers ─────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const log = (...a) => console.log(TAG, ...a);
const warn = (...a) => console.warn(TAG, ...a);
const err = (...a) => console.error(TAG, ...a);

function _on(el, ev, fn) {
    if (!el) return;
    el.addEventListener(ev, fn);
    _state._listeners.push({ el, ev, fn });
}

function _toast(msg, tipo = 'success') {
    const t = $('ctr_toast');
    if (!t) return;
    t.className = `ctr-toast ctr-toast-${tipo}`;
    t.innerHTML = `<i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'times-circle' : 'info-circle'}"></i> ${msg}`;
    t.style.display = 'flex';
    setTimeout(() => { t.style.display = 'none'; }, 4000);
}

function _money(v) {
    return parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function _dateBR(d) {
    if (!d) return '-';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function _parseMoney(s) {
    if (!s) return 0;
    return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
}

function _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function _tipoLabel(t) {
    return t === 'prestacao_servico' ? 'Prestacao de Servico' : t === 'venda' ? 'Venda' : t || '-';
}

function _recLabel(r) {
    const m = { unica: 'Unica', mensal: 'Mensal', anual: 'Anual', diaria: 'Diaria' };
    return m[r] || r || '-';
}

function _statusBadge(s) {
    const m = {
        ativo: ['Ativo', 'ctr-status-green'],
        aguardando: ['Aguardando', 'ctr-status-yellow'],
        encerrado: ['Encerrado', 'ctr-status-red'],
        cancelado: ['Cancelado', 'ctr-status-gray']
    };
    const [label, cls] = m[s] || [s, 'ctr-status-gray'];
    return `<span class="ctr-status ${cls}">${label}</span>`;
}

/* ── API Fetch ───────────────────────────────────────────────────── */
async function _fetch(url, opts = {}) {
    log('FETCH', url, opts.method || 'GET');
    try {
        const r = await fetch(url, { credentials: 'include', ...opts });
        const text = await r.text();
        log('RESPONSE status:', r.status, 'body:', text.substring(0, 300));
        try {
            return JSON.parse(text);
        } catch (e) {
            err('JSON parse error:', e, 'raw:', text.substring(0, 500));
            return { sucesso: false, mensagem: 'Resposta invalida do servidor' };
        }
    } catch (e) {
        err('FETCH error:', e);
        return { sucesso: false, mensagem: 'Erro de conexao: ' + e.message };
    }
}

async function _post(acao, dados = {}) {
    const fd = new FormData();
    fd.append('acao', acao);
    for (const [k, v] of Object.entries(dados)) {
        if (v instanceof File) fd.append(k, v);
        else fd.append(k, v ?? '');
    }
    return _fetch(API, { method: 'POST', body: fd });
}

async function _get(acao, params = {}) {
    const qs = new URLSearchParams({ acao, ...params });
    return _fetch(`${API}?${qs}`);
}

/* ═══════════════════════════════════════════════════════════════════
   INIT / DESTROY
   ═══════════════════════════════════════════════════════════════════ */
export function init() {
    log('Init');
    _bindEvents();
    _carregarPlanos();
    _carregarLista();
}

export function destroy() {
    log('Destroy');
    _state._listeners.forEach(({ el, ev, fn }) => el.removeEventListener(ev, fn));
    _state._listeners = [];
    _state = { lista: [], planos: [], contratoAtual: null, documentos: [], orcamentos: [], pagina: 1, porPagina: 15, _listeners: [] };
}

/* ═══════════════════════════════════════════════════════════════════
   BIND EVENTS
   ═══════════════════════════════════════════════════════════════════ */
function _bindEvents() {
    // Abas globais
    document.querySelectorAll('.ctr-tab-global').forEach(tab => {
        _on(tab, 'click', () => _switchGlobalTab(tab.dataset.tab));
    });

    // Abas detalhe
    document.querySelectorAll('.ctr-tab-detalhe').forEach(tab => {
        _on(tab, 'click', () => _switchDetalheTab(tab.dataset.subtab));
    });

    // Filtros
    _on($('ctr_btnFiltrar'), 'click', () => { _state.pagina = 1; _carregarLista(); });
    _on($('ctr_btnLimpar'), 'click', _limparFiltros);

    // Novo contrato
    _on($('ctr_btnNovo'), 'click', _abrirModalNovo);

    // Modal
    _on($('ctr_modalClose'), 'click', _fecharModal);
    _on($('ctr_btnCancelar'), 'click', _fecharModal);
    _on($('ctr_modalOverlay'), 'click', e => { if (e.target === $('ctr_modalOverlay')) _fecharModal(); });
    _on($('ctr_btnSalvar'), 'click', _salvarContrato);

    // Fornecedor autocomplete
    _on($('ctr_formFornecedorBusca'), 'input', _buscarFornecedor);
    _on($('ctr_fornecedorLimpar'), 'click', _limparFornecedor);

    // Preview parcelas
    _on($('ctr_formRecorrencia'), 'change', _calcularParcelas);
    _on($('ctr_formInicio'), 'change', _calcularParcelas);
    _on($('ctr_formFim'), 'change', _calcularParcelas);
    _on($('ctr_formValor'), 'input', _calcularParcelas);

    // Detalhe: voltar
    _on($('ctr_btnVoltar'), 'click', _voltarParaLista);

    // Detalhe: editar / excluir
    _on($('ctr_btnEditar'), 'click', _editarContrato);
    _on($('ctr_btnExcluir'), 'click', _confirmarExclusao);

    // Modal excluir
    _on($('ctr_modalExcluirClose'), 'click', () => { $('ctr_modalExcluirOverlay').style.display = 'none'; });
    _on($('ctr_btnExcluirCancelar'), 'click', () => { $('ctr_modalExcluirOverlay').style.display = 'none'; });
    _on($('ctr_btnExcluirConfirmar'), 'click', _excluirContrato);

    // Documentos
    _on($('ctr_btnUploadDoc'), 'click', _uploadDocumento);

    // Orcamentos
    _on($('ctr_btnSalvarOrc'), 'click', _salvarOrcamento);
    _on($('ctr_btnCancelarOrc'), 'click', _cancelarEdicaoOrc);
    _on($('ctr_orcValor'), 'input', _verificarValorOrcamento);

    // Relatorios
    _on($('ctr_btnRelAtivos'), 'click', () => _gerarRelatorio('ativos'));
    _on($('ctr_btnRelVenc'), 'click', () => _gerarRelatorio('vencimentos'));
    _on($('ctr_btnRelFornecedor'), 'click', () => _gerarRelatorio('por_fornecedor'));
    _on($('ctr_btnRelFinanceiro'), 'click', () => _gerarRelatorio('financeiro'));
    _on($('ctr_btnExportCSV'), 'click', _exportarCSV);
}

/* ═══════════════════════════════════════════════════════════════════
   NAVEGACAO DE ABAS
   ═══════════════════════════════════════════════════════════════════ */
function _switchGlobalTab(tab) {
    log('switchGlobalTab:', tab);
    document.querySelectorAll('.ctr-tab-global').forEach(t => t.classList.remove('active'));
    document.querySelector(`.ctr-tab-global[data-tab="${tab}"]`)?.classList.add('active');

    $('ctr_secLista').style.display = tab === 'lista' ? '' : 'none';
    $('ctr_secDetalhe').style.display = 'none';
    $('ctr_secRelatorios').style.display = tab === 'relatorios' ? '' : 'none';
}

function _switchDetalheTab(subtab) {
    log('switchDetalheTab:', subtab);
    document.querySelectorAll('.ctr-tab-detalhe').forEach(t => t.classList.remove('active'));
    document.querySelector(`.ctr-tab-detalhe[data-subtab="${subtab}"]`)?.classList.add('active');

    $('ctr_subDados').style.display = subtab === 'dados' ? '' : 'none';
    $('ctr_subDocs').style.display = subtab === 'documentos' ? '' : 'none';
    $('ctr_subOrc').style.display = subtab === 'orcamentos' ? '' : 'none';
}

function _voltarParaLista() {
    log('voltarParaLista');
    _state.contratoAtual = null;
    $('ctr_secDetalhe').style.display = 'none';
    $('ctr_secLista').style.display = '';
    document.querySelectorAll('.ctr-tab-global').forEach(t => t.classList.remove('active'));
    $('ctr_tabLista')?.classList.add('active');
    $('ctr_secRelatorios').style.display = 'none';
    _carregarLista();
}

/* ═══════════════════════════════════════════════════════════════════
   CARREGAR PLANOS DE CONTAS
   ═══════════════════════════════════════════════════════════════════ */
async function _carregarPlanos() {
    log('carregarPlanos');
    try {
        const d = await _fetch(`${API_PLANOS}?acao=listar`);
        const lista = Array.isArray(d) ? d : Array.isArray(d?.dados) ? d.dados : [];
        _state.planos = lista;
        const sel = $('ctr_formPlano');
        if (sel) {
            sel.innerHTML = '<option value="">Selecione o plano de contas...</option>';
            lista.forEach(p => {
                sel.innerHTML += `<option value="${p.id}">${_esc(p.codigo)} - ${_esc(p.nome)}</option>`;
            });
        }
        log('planos carregados:', lista.length);
    } catch (e) {
        err('Erro ao carregar planos:', e);
    }
}

/* ═══════════════════════════════════════════════════════════════════
   CARREGAR LISTA DE CONTRATOS + KPIs
   ═══════════════════════════════════════════════════════════════════ */
async function _carregarLista() {
    log('carregarLista pagina:', _state.pagina);
    const busca = $('ctr_fBusca')?.value || '';
    const status = $('ctr_fStatus')?.value || '';
    const tipo = $('ctr_fTipo')?.value || '';

    const d = await _get('listar', { busca, status, tipo_servico: tipo, pagina: _state.pagina, por_pagina: _state.porPagina });
    const lista = Array.isArray(d?.dados) ? d.dados : Array.isArray(d) ? d : [];
    _state.lista = lista;
    log('lista carregada:', lista.length);

    _renderTabela(lista);
    _calcularKPIs(lista);
}

function _calcularKPIs(lista) {
    let total = lista.length, ativos = 0, aguardando = 0, encerrados = 0, valorAtivo = 0, vencendo30 = 0;
    const hoje = new Date();
    const em30 = new Date(); em30.setDate(em30.getDate() + 30);

    lista.forEach(c => {
        const s = _calcStatus(c);
        if (s === 'ativo') { ativos++; valorAtivo += parseFloat(c.valor_total || 0); }
        if (s === 'aguardando') aguardando++;
        if (s === 'encerrado') encerrados++;
        if (s === 'ativo' && c.data_fim) {
            const fim = new Date(c.data_fim);
            if (fim <= em30) vencendo30++;
        }
    });

    const s = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    s('ctr_kpiTotal', total);
    s('ctr_kpiAtivos', ativos);
    s('ctr_kpiAguardando', aguardando);
    s('ctr_kpiEncerrados', encerrados);
    s('ctr_kpiValor', _money(valorAtivo));

    const alertBar = $('ctr_alertBar');
    if (vencendo30 > 0 && alertBar) {
        alertBar.style.display = 'flex';
        $('ctr_alertText').textContent = `${vencendo30} contrato(s) vencem nos proximos 30 dias!`;
    } else if (alertBar) {
        alertBar.style.display = 'none';
    }
}

function _calcStatus(c) {
    const hoje = new Date().toISOString().split('T')[0];
    if (c.status === 'cancelado') return 'cancelado';
    if (c.data_inicio > hoje) return 'aguardando';
    if (c.data_fim < hoje) return 'encerrado';
    return 'ativo';
}

/* ═══════════════════════════════════════════════════════════════════
   RENDER TABELA
   ═══════════════════════════════════════════════════════════════════ */
function _renderTabela(lista) {
    const tbody = $('ctr_tbody');
    const empty = $('ctr_empty');
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = lista.map(c => {
        const status = _calcStatus(c);
        const docCount = parseInt(c.doc_count || 0);
        const orcCount = parseInt(c.orc_count || 0);
        return `<tr class="ctr-row-clickable" data-id="${c.id}">
            <td><strong>${_esc(c.numero_contrato)}</strong></td>
            <td>${_esc(c.fornecedor_nome || c.nome_estabelecimento || '-')}</td>
            <td>${_tipoLabel(c.tipo_servico)}</td>
            <td>${_esc(c.nome)}</td>
            <td>${_recLabel(c.recorrencia)}</td>
            <td>${_money(c.valor_total)}</td>
            <td>${_dateBR(c.data_inicio)} a ${_dateBR(c.data_fim)}</td>
            <td>${_statusBadge(status)}</td>
            <td><span class="ctr-badge-count">${docCount}/4</span></td>
            <td><span class="ctr-badge-count ${orcCount < 3 ? 'ctr-badge-warn' : 'ctr-badge-ok'}">${orcCount}/3</span></td>
            <td>
                <button class="ctr-btn-icon ctr-btn-view" title="Ver Detalhe" data-id="${c.id}"><i class="fas fa-eye"></i></button>
                <button class="ctr-btn-icon ctr-btn-edit" title="Editar" data-id="${c.id}"><i class="fas fa-edit"></i></button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.ctr-row-clickable').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            _abrirDetalhe(parseInt(row.dataset.id));
        });
    });
    tbody.querySelectorAll('.ctr-btn-view').forEach(btn => {
        btn.addEventListener('click', () => _abrirDetalhe(parseInt(btn.dataset.id)));
    });
    tbody.querySelectorAll('.ctr-btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const c = _state.lista.find(x => x.id == btn.dataset.id);
            if (c) _abrirModalEditar(c);
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════
   DETALHE DO CONTRATO
   ═══════════════════════════════════════════════════════════════════ */
async function _abrirDetalhe(id) {
    log('abrirDetalhe id:', id);
    const d = await _get('buscar', { id });
    if (!d?.sucesso && !d?.dados) {
        _toast(d?.mensagem || 'Erro ao buscar contrato', 'error');
        return;
    }
    const c = d.dados || d;
    _state.contratoAtual = c;

    $('ctr_secLista').style.display = 'none';
    $('ctr_secRelatorios').style.display = 'none';
    $('ctr_secDetalhe').style.display = '';

    const status = _calcStatus(c);
    $('ctr_detalheTitulo').textContent = `${c.numero_contrato} — ${c.nome}`;
    const badgeEl = $('ctr_detalheStatus');
    badgeEl.textContent = status === 'ativo' ? 'Ativo' : status === 'aguardando' ? 'Aguardando' : status === 'encerrado' ? 'Encerrado' : 'Cancelado';
    badgeEl.className = `ctr-badge ${status === 'ativo' ? 'ctr-badge-green' : status === 'aguardando' ? 'ctr-badge-yellow' : 'ctr-badge-red'}`;

    $('ctr_dFornecedor').textContent = c.fornecedor_nome || c.nome_estabelecimento || '-';
    $('ctr_dCnpj').textContent = c.fornecedor_cnpj || c.cpf_cnpj || '-';
    $('ctr_dNumero').textContent = c.numero_contrato;
    $('ctr_dTipo').textContent = _tipoLabel(c.tipo_servico);
    $('ctr_dNome').textContent = c.nome;
    $('ctr_dRecorrencia').textContent = _recLabel(c.recorrencia);
    $('ctr_dInicio').textContent = _dateBR(c.data_inicio);
    $('ctr_dFim').textContent = _dateBR(c.data_fim);
    $('ctr_dVencimento').textContent = _dateBR(c.data_vencimento);
    $('ctr_dPlano').textContent = c.plano_conta_nome || c.plano_conta_id || '-';
    $('ctr_dValor').textContent = _money(c.valor_total);

    if (c.observacoes) {
        $('ctr_cardObs').style.display = '';
        $('ctr_dObs').textContent = c.observacoes;
    } else {
        $('ctr_cardObs').style.display = 'none';
    }

    _switchDetalheTab('dados');
    _carregarDocumentos(c.id);
    _carregarOrcamentos(c.id);
}

/* ═══════════════════════════════════════════════════════════════════
   DOCUMENTOS
   ═══════════════════════════════════════════════════════════════════ */
async function _carregarDocumentos(contratoId) {
    log('carregarDocumentos contratoId:', contratoId);
    const d = await _get('listar_documentos', { contrato_id: contratoId });
    const lista = Array.isArray(d?.dados) ? d.dados : Array.isArray(d) ? d : [];
    _state.documentos = lista;

    const count = lista.length;
    $('ctr_docCount').textContent = count;
    $('ctr_badgeDocs').textContent = count;

    const pct = (count / 4) * 100;
    const bar = $('ctr_docProgressBar');
    if (bar) {
        bar.style.width = pct + '%';
        bar.className = `ctr-doc-progress-bar ${count >= 4 ? 'ctr-progress-full' : count >= 2 ? 'ctr-progress-mid' : ''}`;
    }

    const form = $('ctr_docUploadForm');
    if (form) form.style.display = count >= 4 ? 'none' : '';

    const tbody = $('ctr_docTbody');
    const empty = $('ctr_docEmpty');
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = lista.map((doc, i) => {
        const ext = (doc.arquivo_nome || '').split('.').pop().toUpperCase();
        const icon = ext === 'PDF' ? 'fa-file-pdf' : ext === 'DOC' || ext === 'DOCX' ? 'fa-file-word' : 'fa-file-image';
        const tamanho = doc.tamanho ? (parseFloat(doc.tamanho) / 1024).toFixed(1) + ' KB' : '-';
        return `<tr>
            <td>${i + 1}</td>
            <td>${_esc(doc.nome)}</td>
            <td>${_esc(doc.tipo_documento || '-')}</td>
            <td><i class="fas ${icon}"></i> ${_esc(doc.arquivo_nome || '-')}</td>
            <td>${tamanho}</td>
            <td>${_dateBR(doc.created_at?.split(' ')[0] || doc.data_upload)}</td>
            <td>
                <a href="../uploads/contratos/${doc.arquivo_nome}" target="_blank" class="ctr-btn-icon" title="Baixar"><i class="fas fa-download"></i></a>
                <button class="ctr-btn-icon ctr-btn-danger-icon ctr-doc-del" data-id="${doc.id}" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.ctr-doc-del').forEach(btn => {
        btn.addEventListener('click', () => _excluirDocumento(parseInt(btn.dataset.id)));
    });
}

async function _uploadDocumento() {
    const contratoId = _state.contratoAtual?.id;
    if (!contratoId) { _toast('Selecione um contrato primeiro', 'error'); return; }

    const nome = $('ctr_docNome')?.value?.trim();
    const tipo = $('ctr_docTipo')?.value;
    const fileInput = $('ctr_docArquivo');
    const arquivo = fileInput?.files?.[0];

    if (!nome || !tipo || !arquivo) {
        _toast('Preencha nome, tipo e selecione um arquivo', 'error');
        return;
    }

    if (_state.documentos.length >= 4) {
        _toast('Limite de 4 documentos atingido', 'error');
        return;
    }

    log('uploadDocumento:', nome, tipo, arquivo.name);
    const fd = new FormData();
    fd.append('acao', 'upload_documento');
    fd.append('contrato_id', contratoId);
    fd.append('nome', nome);
    fd.append('tipo_documento', tipo);
    fd.append('arquivo', arquivo);

    const d = await _fetch(API, { method: 'POST', body: fd });
    if (d?.sucesso) {
        _toast('Documento enviado com sucesso');
        $('ctr_docNome').value = '';
        $('ctr_docTipo').value = '';
        fileInput.value = '';
        _carregarDocumentos(contratoId);
    } else {
        _toast(d?.mensagem || 'Erro ao enviar documento', 'error');
    }
}

async function _excluirDocumento(docId) {
    if (!confirm('Excluir este documento?')) return;
    log('excluirDocumento:', docId);
    const d = await _post('excluir_documento', { documento_id: docId });
    if (d?.sucesso) {
        _toast('Documento excluido');
        _carregarDocumentos(_state.contratoAtual?.id);
    } else {
        _toast(d?.mensagem || 'Erro ao excluir', 'error');
    }
}

/* ═══════════════════════════════════════════════════════════════════
   ORCAMENTOS
   ═══════════════════════════════════════════════════════════════════ */
async function _carregarOrcamentos(contratoId) {
    log('carregarOrcamentos contratoId:', contratoId);
    const d = await _get('listar_orcamentos', { contrato_id: contratoId });
    const lista = Array.isArray(d?.dados) ? d.dados : Array.isArray(d) ? d : [];
    _state.orcamentos = lista;

    const count = lista.length;
    $('ctr_orcCount').textContent = count;
    $('ctr_badgeOrc').textContent = count;

    const alert = $('ctr_orcAlert');
    if (alert) {
        if (count < 3) {
            alert.style.display = 'flex';
            $('ctr_orcFaltam').textContent = 3 - count;
        } else {
            alert.style.display = 'none';
        }
    }

    const tbody = $('ctr_orcTbody');
    const empty = $('ctr_orcEmpty');
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    const valorContrato = parseFloat(_state.contratoAtual?.valor_total || 0);

    tbody.innerHTML = lista.map((o, i) => {
        const valor = parseFloat(o.valor || 0);
        const acima = valor > valorContrato;
        return `<tr>
            <td>${i + 1}</td>
            <td>${_esc(o.fornecedor_nome)}</td>
            <td>${_esc(o.descricao)}</td>
            <td class="${acima ? 'ctr-valor-alto' : ''}">${_money(valor)}${acima ? ' <i class="fas fa-exclamation-triangle"></i>' : ''}</td>
            <td>${o.justificativa ? _esc(o.justificativa) : '<span class="ctr-text-muted">-</span>'}</td>
            <td>${_dateBR(o.created_at?.split(' ')[0] || o.data_cadastro)}</td>
            <td>
                <button class="ctr-btn-icon ctr-orc-edit" data-idx="${i}" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="ctr-btn-icon ctr-btn-danger-icon ctr-orc-del" data-id="${o.id}" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.ctr-orc-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const o = _state.orcamentos[parseInt(btn.dataset.idx)];
            if (o) _editarOrcamento(o);
        });
    });
    tbody.querySelectorAll('.ctr-orc-del').forEach(btn => {
        btn.addEventListener('click', () => _excluirOrcamento(parseInt(btn.dataset.id)));
    });
}

function _editarOrcamento(o) {
    $('ctr_orcId').value = o.id;
    $('ctr_orcFornecedor').value = o.fornecedor_nome || '';
    $('ctr_orcDescricao').value = o.descricao || '';
    $('ctr_orcValor').value = parseFloat(o.valor || 0).toFixed(2).replace('.', ',');
    $('ctr_orcJustificativa').value = o.justificativa || '';
    $('ctr_btnCancelarOrc').style.display = '';
    _verificarValorOrcamento();
}

function _cancelarEdicaoOrc() {
    $('ctr_orcId').value = '0';
    $('ctr_orcFornecedor').value = '';
    $('ctr_orcDescricao').value = '';
    $('ctr_orcValor').value = '';
    $('ctr_orcJustificativa').value = '';
    $('ctr_orcJustificativaWrap').style.display = 'none';
    $('ctr_btnCancelarOrc').style.display = 'none';
}

function _verificarValorOrcamento() {
    const valor = _parseMoney($('ctr_orcValor')?.value);
    const valorContrato = parseFloat(_state.contratoAtual?.valor_total || 0);
    const wrap = $('ctr_orcJustificativaWrap');
    if (wrap) {
        wrap.style.display = valor > valorContrato ? '' : 'none';
    }
}

async function _salvarOrcamento() {
    const contratoId = _state.contratoAtual?.id;
    if (!contratoId) { _toast('Selecione um contrato primeiro', 'error'); return; }

    const fornecedor = $('ctr_orcFornecedor')?.value?.trim();
    const descricao = $('ctr_orcDescricao')?.value?.trim();
    const valor = _parseMoney($('ctr_orcValor')?.value);
    const justificativa = $('ctr_orcJustificativa')?.value?.trim();
    const orcId = $('ctr_orcId')?.value || '0';

    if (!fornecedor || !descricao || !valor) {
        _toast('Preencha fornecedor, descricao e valor', 'error');
        return;
    }

    const valorContrato = parseFloat(_state.contratoAtual?.valor_total || 0);
    if (valor > valorContrato && !justificativa) {
        _toast('Justificativa obrigatoria quando valor excede o contrato', 'error');
        return;
    }

    const acao = orcId !== '0' ? 'atualizar_orcamento' : 'cadastrar_orcamento';
    const dados = {
        contrato_id: contratoId,
        fornecedor_nome: fornecedor,
        descricao,
        valor: valor.toFixed(2),
        justificativa: justificativa || ''
    };
    if (orcId !== '0') dados.orcamento_id = orcId;

    log('salvarOrcamento:', acao, dados);
    const d = await _post(acao, dados);
    if (d?.sucesso) {
        _toast(orcId !== '0' ? 'Orcamento atualizado' : 'Orcamento cadastrado');
        _cancelarEdicaoOrc();
        _carregarOrcamentos(contratoId);
    } else {
        _toast(d?.mensagem || 'Erro ao salvar orcamento', 'error');
    }
}

async function _excluirOrcamento(orcId) {
    if (!confirm('Excluir este orcamento?')) return;
    log('excluirOrcamento:', orcId);
    const d = await _post('excluir_orcamento', { orcamento_id: orcId });
    if (d?.sucesso) {
        _toast('Orcamento excluido');
        _carregarOrcamentos(_state.contratoAtual?.id);
    } else {
        _toast(d?.mensagem || 'Erro ao excluir', 'error');
    }
}

/* ═══════════════════════════════════════════════════════════════════
   MODAL NOVO / EDITAR CONTRATO
   ═══════════════════════════════════════════════════════════════════ */
function _abrirModalNovo() {
    log('abrirModalNovo');
    $('ctr_formId').value = '0';
    $('ctr_modalTitulo').innerHTML = '<i class="fas fa-file-contract"></i> Novo Contrato';
    $('ctr_btnSalvar').innerHTML = '<i class="fas fa-save"></i> Gerar Contrato';
    $('ctr_formContrato').reset();
    _limparFornecedor();
    $('ctr_parcelasPreview').style.display = 'none';
    $('ctr_modalOverlay').style.display = 'flex';
}

function _abrirModalEditar(c) {
    log('abrirModalEditar:', c.id);
    $('ctr_formId').value = c.id;
    $('ctr_modalTitulo').innerHTML = '<i class="fas fa-edit"></i> Editar Contrato';
    $('ctr_btnSalvar').innerHTML = '<i class="fas fa-save"></i> Salvar Alteracoes';

    $('ctr_formFornecedorId').value = c.fornecedor_id;
    $('ctr_formFornecedorNome').value = c.fornecedor_nome || c.nome_estabelecimento || '';
    $('ctr_formFornecedorCnpj').value = c.fornecedor_cnpj || c.cpf_cnpj || '';
    $('ctr_formFornecedorBusca').style.display = 'none';
    $('ctr_fornecedorSelecionado').style.display = 'flex';
    $('ctr_fornecedorInfo').textContent = `${c.fornecedor_nome || c.nome_estabelecimento} — ${c.fornecedor_cnpj || c.cpf_cnpj || ''}`;

    $('ctr_formTipo').value = c.tipo_servico || '';
    $('ctr_formRecorrencia').value = c.recorrencia || '';
    $('ctr_formNome').value = c.nome || '';
    $('ctr_formInicio').value = c.data_inicio || '';
    $('ctr_formFim').value = c.data_fim || '';
    $('ctr_formValor').value = parseFloat(c.valor_total || 0).toFixed(2).replace('.', ',');
    $('ctr_formVencimento').value = c.data_vencimento || '';
    $('ctr_formPlano').value = c.plano_conta_id || '';
    $('ctr_formObs').value = c.observacoes || '';

    _calcularParcelas();
    $('ctr_modalOverlay').style.display = 'flex';
}

function _editarContrato() {
    if (_state.contratoAtual) _abrirModalEditar(_state.contratoAtual);
}

function _fecharModal() {
    $('ctr_modalOverlay').style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════════════
   FORNECEDOR AUTOCOMPLETE
   ═══════════════════════════════════════════════════════════════════ */
let _debounce = null;
function _buscarFornecedor() {
    clearTimeout(_debounce);
    _debounce = setTimeout(async () => {
        const q = $('ctr_formFornecedorBusca')?.value?.trim();
        if (!q || q.length < 2) { $('ctr_fornecedorLista').innerHTML = ''; return; }

        log('buscarFornecedor:', q);
        const d = await _fetch(`${API_FORN}?acao=listar&busca=${encodeURIComponent(q)}`);
        const lista = Array.isArray(d?.dados) ? d.dados : Array.isArray(d) ? d : [];

        const el = $('ctr_fornecedorLista');
        if (!el) return;
        if (!lista.length) {
            el.innerHTML = '<div class="ctr-ac-item ctr-ac-empty">Nenhum fornecedor encontrado</div>';
            return;
        }

        el.innerHTML = lista.slice(0, 10).map(f =>
            `<div class="ctr-ac-item" data-id="${f.id}" data-nome="${_esc(f.nome_estabelecimento)}" data-cnpj="${_esc(f.cpf_cnpj || '')}">
                <strong>${_esc(f.nome_estabelecimento)}</strong>
                <small>${_esc(f.cpf_cnpj || '')}</small>
            </div>`
        ).join('');

        el.querySelectorAll('.ctr-ac-item[data-id]').forEach(item => {
            item.addEventListener('click', () => {
                $('ctr_formFornecedorId').value = item.dataset.id;
                $('ctr_formFornecedorNome').value = item.dataset.nome;
                $('ctr_formFornecedorCnpj').value = item.dataset.cnpj;
                $('ctr_formFornecedorBusca').style.display = 'none';
                $('ctr_fornecedorSelecionado').style.display = 'flex';
                $('ctr_fornecedorInfo').textContent = `${item.dataset.nome} — ${item.dataset.cnpj}`;
                el.innerHTML = '';
            });
        });
    }, 300);
}

function _limparFornecedor() {
    $('ctr_formFornecedorId').value = '0';
    $('ctr_formFornecedorNome').value = '';
    $('ctr_formFornecedorCnpj').value = '';
    const busca = $('ctr_formFornecedorBusca');
    if (busca) { busca.value = ''; busca.style.display = ''; }
    const sel = $('ctr_fornecedorSelecionado');
    if (sel) sel.style.display = 'none';
    const lista = $('ctr_fornecedorLista');
    if (lista) lista.innerHTML = '';
}

/* ═══════════════════════════════════════════════════════════════════
   CALCULAR PARCELAS PREVIEW
   ═══════════════════════════════════════════════════════════════════ */
function _calcularParcelas() {
    const rec = $('ctr_formRecorrencia')?.value;
    const ini = $('ctr_formInicio')?.value;
    const fim = $('ctr_formFim')?.value;
    const valor = _parseMoney($('ctr_formValor')?.value);
    const preview = $('ctr_parcelasPreview');
    if (!preview) return;

    if (!rec || !ini || !fim || !valor) { preview.style.display = 'none'; return; }

    let parcelas = 1;
    if (rec === 'mensal') {
        const d1 = new Date(ini), d2 = new Date(fim);
        parcelas = Math.max(1, (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth());
    } else if (rec === 'anual') {
        const d1 = new Date(ini), d2 = new Date(fim);
        parcelas = Math.max(1, d2.getFullYear() - d1.getFullYear());
    } else if (rec === 'diaria') {
        const d1 = new Date(ini), d2 = new Date(fim);
        parcelas = Math.max(1, Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)));
    }

    const valorParcela = valor / parcelas;
    preview.style.display = 'flex';
    $('ctr_parcelasTexto').textContent = `${parcelas} lancamento(s) de ${_money(valorParcela)} serao gerados em Contas a Pagar`;
}

/* ═══════════════════════════════════════════════════════════════════
   SALVAR CONTRATO
   ═══════════════════════════════════════════════════════════════════ */
async function _salvarContrato() {
    const id = $('ctr_formId')?.value || '0';
    const fornecedorId = $('ctr_formFornecedorId')?.value;
    const tipo = $('ctr_formTipo')?.value;
    const recorrencia = $('ctr_formRecorrencia')?.value;
    const nome = $('ctr_formNome')?.value?.trim();
    const dataInicio = $('ctr_formInicio')?.value;
    const dataFim = $('ctr_formFim')?.value;
    const valor = _parseMoney($('ctr_formValor')?.value);
    const dataVencimento = $('ctr_formVencimento')?.value;
    const planoContaId = $('ctr_formPlano')?.value;
    const obs = $('ctr_formObs')?.value?.trim();

    if (!fornecedorId || fornecedorId === '0') { _toast('Selecione um fornecedor', 'error'); return; }
    if (!tipo) { _toast('Selecione o tipo de servico', 'error'); return; }
    if (!recorrencia) { _toast('Selecione a recorrencia', 'error'); return; }
    if (!nome) { _toast('Informe o nome do contrato', 'error'); return; }
    if (!dataInicio) { _toast('Informe a data de inicio', 'error'); return; }
    if (!dataFim) { _toast('Informe a data de fim', 'error'); return; }
    if (dataFim <= dataInicio) { _toast('Data de fim deve ser posterior a data de inicio', 'error'); return; }
    if (!valor || valor <= 0) { _toast('Informe o valor total', 'error'); return; }
    if (!dataVencimento) { _toast('Informe a data de vencimento', 'error'); return; }
    if (!planoContaId) { _toast('Selecione o plano de contas', 'error'); return; }

    const acao = id !== '0' ? 'atualizar' : 'cadastrar';
    const dados = {
        fornecedor_id: fornecedorId,
        fornecedor_nome: $('ctr_formFornecedorNome')?.value || '',
        tipo_servico: tipo,
        recorrencia,
        nome,
        data_inicio: dataInicio,
        data_fim: dataFim,
        valor_total: valor.toFixed(2),
        data_vencimento: dataVencimento,
        plano_conta_id: planoContaId,
        observacoes: obs || ''
    };
    if (id !== '0') dados.id = id;

    log('salvarContrato:', acao, dados);
    const d = await _post(acao, dados);

    if (d?.sucesso) {
        _toast(id !== '0' ? 'Contrato atualizado com sucesso' : `Contrato ${d.numero_contrato || ''} gerado com sucesso!`);
        _fecharModal();
        const novoId = d.id || d.dados?.id;
        if (novoId) {
            await _carregarLista();
            _abrirDetalhe(novoId);
        } else {
            _carregarLista();
        }
    } else {
        _toast(d?.mensagem || 'Erro ao salvar contrato', 'error');
    }
}

/* ═══════════════════════════════════════════════════════════════════
   EXCLUIR CONTRATO
   ═══════════════════════════════════════════════════════════════════ */
function _confirmarExclusao() {
    if (!_state.contratoAtual) return;
    $('ctr_excluirNumero').textContent = _state.contratoAtual.numero_contrato;
    $('ctr_modalExcluirOverlay').style.display = 'flex';
}

async function _excluirContrato() {
    const id = _state.contratoAtual?.id;
    if (!id) return;
    log('excluirContrato:', id);
    const d = await _post('deletar', { id });
    if (d?.sucesso) {
        _toast('Contrato excluido');
        $('ctr_modalExcluirOverlay').style.display = 'none';
        _voltarParaLista();
    } else {
        _toast(d?.mensagem || 'Erro ao excluir', 'error');
    }
}

/* ═══════════════════════════════════════════════════════════════════
   FILTROS
   ═══════════════════════════════════════════════════════════════════ */
function _limparFiltros() {
    if ($('ctr_fBusca')) $('ctr_fBusca').value = '';
    if ($('ctr_fStatus')) $('ctr_fStatus').value = '';
    if ($('ctr_fTipo')) $('ctr_fTipo').value = '';
    _state.pagina = 1;
    _carregarLista();
}

/* ═══════════════════════════════════════════════════════════════════
   RELATORIOS
   ═══════════════════════════════════════════════════════════════════ */
let _relDados = [];
let _relColunas = [];

async function _gerarRelatorio(tipo) {
    log('gerarRelatorio:', tipo);
    let params = { tipo_relatorio: tipo };

    if (tipo === 'ativos') {
        params.tipo_servico = $('ctr_relAtivosTipo')?.value || '';
    } else if (tipo === 'vencimentos') {
        params.dias = $('ctr_relVencDias')?.value || '30';
    } else if (tipo === 'financeiro') {
        params.data_inicio = $('ctr_relFinIni')?.value || '';
        params.data_fim = $('ctr_relFinFim')?.value || '';
    }

    const d = await _get('relatorio', params);
    if (!d?.sucesso && !d?.dados) {
        _toast(d?.mensagem || 'Erro ao gerar relatorio', 'error');
        return;
    }

    const dados = d.dados || [];
    _relDados = dados;

    if (!dados.length) {
        _toast('Nenhum dado encontrado para este relatorio', 'info');
        $('ctr_relResultado').style.display = 'none';
        return;
    }

    _relColunas = Object.keys(dados[0]);

    $('ctr_relThead').innerHTML = '<tr>' + _relColunas.map(c => `<th>${c.toUpperCase().replace(/_/g, ' ')}</th>`).join('') + '</tr>';
    $('ctr_relTbody').innerHTML = dados.map(row =>
        '<tr>' + _relColunas.map(c => `<td>${_esc(String(row[c] ?? '-'))}</td>`).join('') + '</tr>'
    ).join('');

    $('ctr_relResultado').style.display = '';
    _toast(`Relatorio gerado: ${dados.length} registro(s)`);
}

function _exportarCSV() {
    if (!_relDados.length) return;
    const header = _relColunas.join(';');
    const rows = _relDados.map(r => _relColunas.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';'));
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_contratos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

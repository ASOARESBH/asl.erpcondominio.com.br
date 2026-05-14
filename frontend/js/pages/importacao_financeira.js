/**
 * importacao_financeira.js — Módulo de Importação Financeira
 * Padrão SPA — layout-base.html?page=importacao_financeira
 * @version 1.0.0
 */
'use strict';

// ─── Constantes ───────────────────────────────────────────────
const API_IMP = '../api/api_importacao_financeira.php';

// ─── Estado do módulo ─────────────────────────────────────────
const _st = {
    loteAtual: null,
    itensCache: [],
    carregando: false
};

// ─── Ciclo de Vida ────────────────────────────────────────────
export function init() {
    console.log('[ImportacaoFinanceira] Init v1.0');
    _bindUpload();
    _bindDropZone();
    carregarLotes();

    window.ImportacaoFinanceira = {
        carregarLotes,
        confirmarImportacao,
        verConciliacao,
        fecharConciliacao,
        filtrarItens,
        conciliarItem,
        ignorarItem,
        excluirLote,
        limparForm
    };
    console.log('[ImportacaoFinanceira] Módulo pronto.');
}

export function destroy() {
    console.log('[ImportacaoFinanceira] Destroy');
    _st.loteAtual = null;
    _st.itensCache = [];
    delete window.ImportacaoFinanceira;
}

// ─── Bind do formulário de upload ────────────────────────────
function _bindUpload() {
    const form = document.getElementById('imp_formUpload');
    if (!form) return;
    form.addEventListener('submit', e => { e.preventDefault(); _processarArquivo(); });

    // Mostrar nome do arquivo ao selecionar
    const input = document.getElementById('imp_arquivo');
    if (input) {
        input.addEventListener('change', () => {
            const nome = input.files[0]?.name || '';
            const el = document.getElementById('imp_nomeArquivo');
            if (el) el.textContent = nome ? `📎 ${nome}` : '';
        });
    }
}

// ─── Drag & Drop ──────────────────────────────────────────────
function _bindDropZone() {
    const zone = document.getElementById('imp_dropZone');
    const input = document.getElementById('imp_arquivo');
    if (!zone || !input) return;

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            const nome = input.files[0]?.name || '';
            const el = document.getElementById('imp_nomeArquivo');
            if (el) el.textContent = nome ? `📎 ${nome}` : '';
        }
    });
}

// ─── Processar arquivo ────────────────────────────────────────
async function _processarArquivo() {
    const form  = document.getElementById('imp_formUpload');
    const input = document.getElementById('imp_arquivo');
    if (!input?.files?.length) {
        _alerta('error', 'Selecione um arquivo CSV ou PDF para importar.');
        return;
    }

    const btn = document.getElementById('imp_btnImportar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...'; }

    _mostrarProgress(true, 'Enviando arquivo...');

    const fd = new FormData(form);
    fd.set('acao', 'importar');

    try {
        _animarProgress(0, 40, 'Enviando arquivo...');
        const r = await fetch(API_IMP, { method: 'POST', body: fd });
        _animarProgress(40, 80, 'Processando registros...');
        const d = await r.json();
        _animarProgress(80, 100, 'Concluído!');

        setTimeout(() => _mostrarProgress(false), 600);

        if (!d.sucesso) {
            _alerta('error', d.mensagem || 'Erro ao processar arquivo.');
            return;
        }

        _st.loteAtual = d.dados?.lote_id;

        // Atualizar KPIs do resultado
        _setEl('imp_kpiTotal',      d.dados?.total      || 0);
        _setEl('imp_kpiNovos',      d.dados?.pendentes  || 0);
        _setEl('imp_kpiDuplicatas', d.dados?.duplicatas || 0);
        _setEl('imp_kpiErros',      d.dados?.erros      || 0);

        // Mostrar card de resultado
        const cardRes = document.getElementById('imp_cardResultado');
        if (cardRes) cardRes.style.display = 'block';

        // Atualizar botão confirmar
        const btnConf = document.getElementById('imp_btnConfirmar');
        if (btnConf) {
            const novos = d.dados?.pendentes || 0;
            btnConf.disabled = novos === 0;
            btnConf.innerHTML = novos > 0
                ? `<i class="fas fa-check-circle"></i> Confirmar Importação (${novos} registros)`
                : '<i class="fas fa-check-circle"></i> Nenhum registro novo para importar';
        }

        _alerta('success', `Arquivo processado: ${d.dados?.total || 0} registros, ${d.dados?.pendentes || 0} novos, ${d.dados?.duplicatas || 0} duplicatas.`);
        carregarLotes();

    } catch (err) {
        console.error('[ImportacaoFinanceira] Erro:', err);
        _alerta('error', 'Erro de comunicação com o servidor.');
        _mostrarProgress(false);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-import"></i> Processar Arquivo'; }
    }
}

// ─── Confirmar importação ─────────────────────────────────────
async function confirmarImportacao() {
    if (!_st.loteAtual) { _alerta('error', 'Nenhum lote ativo.'); return; }

    const btn = document.getElementById('imp_btnConfirmar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...'; }

    try {
        const r = await fetch(API_IMP, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'confirmar_importar', lote_id: _st.loteAtual })
        });
        const d = await r.json();

        if (d.sucesso) {
            _alerta('success', d.mensagem || 'Importação concluída com sucesso!');
            carregarLotes();
            // Atualizar KPI de novos
            _setEl('imp_kpiNovos', 0);
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-check-circle"></i> Importação Concluída'; }
        } else {
            _alerta('error', d.mensagem || 'Erro ao confirmar importação.');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Importação'; }
        }
    } catch (err) {
        console.error('[ImportacaoFinanceira] Erro confirmar:', err);
        _alerta('error', 'Erro de comunicação.');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Importação'; }
    }
}

// ─── Ver conciliação ──────────────────────────────────────────
async function verConciliacao(lote_id) {
    const id = lote_id || _st.loteAtual;
    if (!id) { _alerta('error', 'Nenhum lote selecionado.'); return; }
    _st.loteAtual = id;

    const card = document.getElementById('imp_cardConciliacao');
    if (card) { card.style.display = 'block'; card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

    await _carregarItens(id);
}

function fecharConciliacao() {
    const card = document.getElementById('imp_cardConciliacao');
    if (card) card.style.display = 'none';
}

// ─── Carregar itens do lote ───────────────────────────────────
async function _carregarItens(lote_id) {
    const status = document.getElementById('imp_filtroStatusConc')?.value || '';
    const tbody  = document.getElementById('imp_corpoConc');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-table"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        const url = `${API_IMP}?acao=listar_itens&lote_id=${lote_id}${status ? '&status=' + encodeURIComponent(status) : ''}`;
        const r = await fetch(url);
        const d = await r.json();
        _st.itensCache = Array.isArray(d.dados) ? d.dados : [];
        _renderItens();
    } catch (err) {
        console.error('[ImportacaoFinanceira] Erro carregar itens:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-table text-danger">Erro ao carregar itens</td></tr>';
    }
}

function filtrarItens() {
    if (_st.loteAtual) _carregarItens(_st.loteAtual);
}

// ─── Renderizar tabela de itens ───────────────────────────────
function _renderItens() {
    const tbody = document.getElementById('imp_corpoConc');
    if (!tbody) return;

    if (!_st.itensCache.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-table">Nenhum item encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = _st.itensCache.map(item => {
        const statusBadge = _badgeStatus(item.status_importacao);
        const dv = _formatarData(item.data_vencimento);
        const dp = _formatarData(item.data_pagamento);
        const val = _formatarMoeda(item.valor);

        let acoes = '';
        if (item.status_importacao === 'DUPLICATA') {
            acoes = `
                <button class="btn btn-sm btn-primary" title="Conciliar com conta existente" onclick="ImportacaoFinanceira.conciliarItem(${item.id}, ${item.duplicata_conta_id || 0})">
                    <i class="fas fa-link"></i> Conciliar
                </button>
                <button class="btn btn-sm btn-secondary" title="Ignorar este item" onclick="ImportacaoFinanceira.ignorarItem(${item.id})" style="margin-top:4px;">
                    <i class="fas fa-ban"></i> Ignorar
                </button>`;
        } else if (item.status_importacao === 'PENDENTE') {
            acoes = `
                <button class="btn btn-sm btn-secondary" title="Ignorar este item" onclick="ImportacaoFinanceira.ignorarItem(${item.id})">
                    <i class="fas fa-ban"></i> Ignorar
                </button>`;
        } else if (item.status_importacao === 'IMPORTADO') {
            acoes = `<span style="color:#16a34a;font-size:11px;"><i class="fas fa-check-circle"></i> Importado</span>`;
        } else if (item.status_importacao === 'CONCILIADO') {
            acoes = `<span style="color:#7c3aed;font-size:11px;"><i class="fas fa-link"></i> Conciliado</span>`;
        }

        const dupInfo = item.status_importacao === 'DUPLICATA' && item.duplicata_conta_id
            ? `<br><small style="color:#d97706;">⚠ Duplicata da conta #${item.duplicata_conta_id}</small>` : '';

        return `<tr>
            <td style="font-size:10px;color:#64748b;">${item.linha_original || item.id}</td>
            <td><strong>${_esc(item.fornecedor_nome || '—')}</strong>${dupInfo}</td>
            <td>${dv || '—'}</td>
            <td>${dp || '—'}</td>
            <td style="text-align:right;font-weight:700;">${val}</td>
            <td style="font-size:10px;">${_esc(item.classificacao_despesa || '—')}</td>
            <td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(item.observacao || '')}">${_esc(item.observacao || '—')}</td>
            <td>${statusBadge}</td>
            <td style="white-space:nowrap;">${acoes}</td>
        </tr>`;
    }).join('');
}

// ─── Conciliar item ───────────────────────────────────────────
async function conciliarItem(item_id, conta_id) {
    try {
        const r = await fetch(API_IMP, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'conciliar_item', item_id, conta_id })
        });
        const d = await r.json();
        if (d.sucesso) {
            _alerta('success', 'Item conciliado com sucesso!');
            if (_st.loteAtual) _carregarItens(_st.loteAtual);
        } else {
            _alerta('error', d.mensagem || 'Erro ao conciliar.');
        }
    } catch (err) {
        _alerta('error', 'Erro de comunicação.');
    }
}

// ─── Ignorar item ─────────────────────────────────────────────
async function ignorarItem(item_id) {
    try {
        const r = await fetch(API_IMP, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'ignorar_item', item_id })
        });
        const d = await r.json();
        if (d.sucesso) {
            _alerta('success', 'Item ignorado.');
            if (_st.loteAtual) _carregarItens(_st.loteAtual);
        } else {
            _alerta('error', d.mensagem || 'Erro ao ignorar.');
        }
    } catch (err) {
        _alerta('error', 'Erro de comunicação.');
    }
}

// ─── Carregar lotes ───────────────────────────────────────────
async function carregarLotes() {
    const tbody = document.getElementById('imp_corpoLotes');
    if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="empty-table"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        const r = await fetch(`${API_IMP}?acao=listar_lotes`);
        const d = await r.json();
        const lotes = Array.isArray(d.dados) ? d.dados : [];

        if (!tbody) return;
        if (!lotes.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="empty-table">Nenhuma importação realizada</td></tr>';
            return;
        }

        tbody.innerHTML = lotes.map(l => {
            const di = l.data_inicio ? _formatarData(l.data_inicio) : '—';
            const df = l.data_fim    ? _formatarData(l.data_fim)    : '—';
            const periodo = (di !== '—' || df !== '—') ? `${di} a ${df}` : '—';
            const statusBadge = l.status === 'CONCLUIDO'
                ? '<span class="badge-imp badge-importado">Concluído</span>'
                : l.status === 'ERRO'
                ? '<span class="badge-imp badge-erro">Erro</span>'
                : '<span class="badge-imp badge-pendente">Processando</span>';
            const tipoBadge = `<span class="badge-imp badge-${l.tipo_arquivo.toLowerCase()}">${l.tipo_arquivo}</span>`;
            const contaBadge = l.tipo_conta === 'PAGAR'
                ? '<span class="badge-imp badge-pagar">A Pagar</span>'
                : '<span class="badge-imp badge-receber">A Receber</span>';
            const dt = l.data_importacao ? l.data_importacao.substring(0,16).replace('T',' ') : '—';

            return `<tr>
                <td>${l.id}</td>
                <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(l.nome_arquivo)}">${_esc(l.nome_arquivo)}</td>
                <td>${tipoBadge}</td>
                <td>${contaBadge}</td>
                <td style="font-size:11px;">${periodo}</td>
                <td style="text-align:center;">${l.total_registros}</td>
                <td style="text-align:center;color:#16a34a;font-weight:700;">${l.total_importados}</td>
                <td style="text-align:center;color:#d97706;font-weight:700;">${l.total_duplicatas}</td>
                <td style="text-align:center;color:#dc2626;font-weight:700;">${l.total_erros}</td>
                <td>${statusBadge}</td>
                <td style="font-size:11px;">${dt}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-primary" onclick="ImportacaoFinanceira.verConciliacao(${l.id})" title="Abrir conciliação">
                        <i class="fas fa-balance-scale"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="ImportacaoFinanceira.excluirLote(${l.id})" title="Excluir lote" style="margin-left:4px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

    } catch (err) {
        console.error('[ImportacaoFinanceira] Erro lotes:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="empty-table text-danger">Erro ao carregar histórico</td></tr>';
    }
}

// ─── Excluir lote ─────────────────────────────────────────────
async function excluirLote(lote_id) {
    if (!confirm('Deseja excluir este lote de importação? Esta ação não pode ser desfeita.')) return;
    try {
        const r = await fetch(API_IMP, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'excluir_lote', lote_id })
        });
        const d = await r.json();
        if (d.sucesso) {
            _alerta('success', 'Lote excluído.');
            carregarLotes();
            if (_st.loteAtual === lote_id) {
                _st.loteAtual = null;
                fecharConciliacao();
                const cardRes = document.getElementById('imp_cardResultado');
                if (cardRes) cardRes.style.display = 'none';
            }
        } else {
            _alerta('error', d.mensagem || 'Erro ao excluir.');
        }
    } catch (err) {
        _alerta('error', 'Erro de comunicação.');
    }
}

// ─── Limpar formulário ────────────────────────────────────────
function limparForm() {
    const form = document.getElementById('imp_formUpload');
    if (form) form.reset();
    const el = document.getElementById('imp_nomeArquivo');
    if (el) el.textContent = '';
    const cardRes = document.getElementById('imp_cardResultado');
    if (cardRes) cardRes.style.display = 'none';
    _st.loteAtual = null;
}

// ─── Helpers ─────────────────────────────────────────────────
function _badgeStatus(status) {
    const map = {
        'PENDENTE':   ['badge-pendente',   'Pendente'],
        'IMPORTADO':  ['badge-importado',  'Importado'],
        'DUPLICATA':  ['badge-duplicata',  'Duplicata'],
        'CONCILIADO': ['badge-conciliado', 'Conciliado'],
        'IGNORADO':   ['badge-ignorado',   'Ignorado'],
        'ERRO':       ['badge-erro',       'Erro']
    };
    const [cls, txt] = map[status] || ['badge-ignorado', status];
    return `<span class="badge-imp ${cls}">${txt}</span>`;
}

function _formatarMoeda(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function _formatarData(d) {
    if (!d) return null;
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
}

function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function _alerta(tipo, msg) {
    if (typeof mostrarAlerta === 'function') { mostrarAlerta(tipo, msg); return; }
    if (typeof window.mostrarAlerta === 'function') { window.mostrarAlerta(tipo, msg); return; }
    console[tipo === 'error' ? 'error' : 'log']('[ImportacaoFinanceira]', msg);
}

function _mostrarProgress(show, texto) {
    const bar = document.getElementById('imp_progressBar');
    if (!bar) return;
    bar.style.display = show ? 'block' : 'none';
    if (texto) _setEl('imp_progressText', texto);
    if (!show) {
        const fill = document.getElementById('imp_progressFill');
        if (fill) fill.style.width = '0%';
    }
}

function _animarProgress(de, ate, texto) {
    const fill = document.getElementById('imp_progressFill');
    const txt  = document.getElementById('imp_progressText');
    if (!fill) return;
    fill.style.width = de + '%';
    if (txt && texto) txt.textContent = texto;
    setTimeout(() => { fill.style.width = ate + '%'; }, 50);
}

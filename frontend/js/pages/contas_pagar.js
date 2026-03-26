/**
 * contas_pagar.js — Módulo de Contas a Pagar
 * Padrão SPA — layout-base.html?page=contas_pagar
 * @version 1.0.0
 */
'use strict';

// ─── Estado do módulo ────────────────────────────────────────────────────────
const _state = {
    lista: [],
    editandoId: null,
    carregando: false
};

const _listeners = [];

// ─── Constantes ───────────────────────────────────────────────────────────────
const API       = '../api/api_contas_pagar.php';
const API_PLANOS = '../api/api_planos_contas.php';

// ─── Ciclo de Vida ────────────────────────────────────────────────────────────
export function init() {
    console.log('[ContasPagar] Inicializando módulo v1.0...');
    _bindForm();
    _bindPagamento();
    _carregarPlanos();
    _carregar();
    // Expor globalmente para uso nos botões inline do HTML
    window.ContasPagar = { carregar: _carregar, filtrar, editar, excluir, limparForm, abrirModalPagamento, fecharModal };
    console.log('[ContasPagar] Módulo pronto.');
}

export function destroy() {
    console.log('[ContasPagar] Destruindo módulo...');
    _listeners.forEach(({ el, event, fn }) => { if (el) el.removeEventListener(event, fn); });
    _listeners.length = 0;
    Object.assign(_state, { lista: [], editandoId: null, carregando: false });
    delete window.ContasPagar;
    console.log('[ContasPagar] Módulo destruído.');
}

// ─── Bind de eventos ─────────────────────────────────────────────────────────
function _bindForm() {
    const form = document.getElementById('cp_formCadastro');
    if (!form) return;
    const fn = e => { e.preventDefault(); _salvar(); };
    form.addEventListener('submit', fn);
    _listeners.push({ el: form, event: 'submit', fn });
}

function _bindPagamento() {
    const form = document.getElementById('cp_formPagamento');
    if (!form) return;
    const fn = e => { e.preventDefault(); _registrarPagamento(); };
    form.addEventListener('submit', fn);
    _listeners.push({ el: form, event: 'submit', fn });
}

// ─── Carregar Planos de Contas ────────────────────────────────────────────────
async function _carregarPlanos() {
    try {
        const r = await fetch(API_PLANOS);
        const d = await r.json();
        const sel = document.getElementById('cp_selectPlano');
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecione um plano...</option>';
        const lista = d.dados || d.data || d || [];
        lista.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nome || p.descricao || p.name;
            sel.appendChild(opt);
        });
    } catch (err) {
        console.error('[ContasPagar] Erro ao carregar planos:', err);
    }
}

// ─── Carregar Contas ──────────────────────────────────────────────────────────
async function _carregar() {
    if (_state.carregando) return;
    _state.carregando = true;

    const tbody = document.getElementById('cp_corpoTabela');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-table"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        const filtro = document.getElementById('cp_filtroStatus');
        const status = filtro ? filtro.value : '';
        const url = status ? `${API}?status=${encodeURIComponent(status)}` : API;
        const r = await fetch(url);
        const d = await r.json();

        _state.lista = d.dados || d.data || d || [];
        _renderTabela();
        _calcularKPIs();
    } catch (err) {
        console.error('[ContasPagar] Erro ao carregar:', err);
        _mostrarAlerta('Erro ao carregar contas a pagar.', 'danger');
    } finally {
        _state.carregando = false;
    }
}

function filtrar() { _carregar(); }

// ─── Renderizar Tabela ────────────────────────────────────────────────────────
function _renderTabela() {
    const tbody = document.getElementById('cp_corpoTabela');
    if (!tbody) return;

    if (!_state.lista.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-table"><i class="fas fa-inbox"></i> Nenhuma conta encontrada</td></tr>';
        return;
    }

    tbody.innerHTML = _state.lista.map(c => {
        const badge = _badgeStatus(c.status);
        const venc  = _formatarData(c.data_vencimento);
        const atrasada = c.status === 'PENDENTE' && new Date(c.data_vencimento) < new Date()
            ? ' style="color:#dc2626;font-weight:600;"' : '';
        return `
        <tr>
            <td>${_esc(c.numero_documento || '-')}</td>
            <td>${_esc(c.fornecedor || c.descricao || '-')}</td>
            <td>${_esc(c.plano_nome || '-')}</td>
            <td${atrasada}>${_formatarMoeda(c.valor_original)}</td>
            <td${atrasada}>${venc}</td>
            <td>${badge}</td>
            <td class="acoes-cell">
                ${c.status === 'PENDENTE' || c.status === 'PARCIAL' ? `
                <button class="btn btn-xs btn-success" title="Registrar Pagamento" onclick="ContasPagar.abrirModalPagamento(${c.id})">
                    <i class="fas fa-money-bill-wave"></i>
                </button>` : ''}
                <button class="btn btn-xs btn-outline" title="Editar" onclick="ContasPagar.editar(${c.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-xs btn-danger" title="Excluir" onclick="ContasPagar.excluir(${c.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ─── Calcular KPIs ────────────────────────────────────────────────────────────
function _calcularKPIs() {
    let pendente = 0, pago = 0, atrasadas = 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    _state.lista.forEach(c => {
        const val = parseFloat(c.valor_original) || 0;
        if (c.status === 'PAGO') {
            pago += val;
        } else if (c.status === 'PENDENTE' || c.status === 'PARCIAL') {
            pendente += val;
            if (new Date(c.data_vencimento) < hoje) atrasadas++;
        }
    });

    _setEl('cp_totalPendente',  _formatarMoeda(pendente));
    _setEl('cp_totalPago',      _formatarMoeda(pago));
    _setEl('cp_contasAtrasadas', atrasadas);
}

// ─── Salvar Conta ─────────────────────────────────────────────────────────────
async function _salvar() {
    const form = document.getElementById('cp_formCadastro');
    if (!form) return;

    const btn = document.getElementById('cp_btnSalvar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    const dados = Object.fromEntries(new FormData(form));

    try {
        const metodo = _state.editandoId ? 'PUT' : 'POST';
        const url    = _state.editandoId ? `${API}?id=${_state.editandoId}` : API;

        const r = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const d = await r.json();

        if (d.sucesso || d.success) {
            _mostrarAlerta(_state.editandoId ? 'Conta atualizada com sucesso!' : 'Conta cadastrada com sucesso!', 'success');
            limparForm();
            _carregar();
        } else {
            _mostrarAlerta(d.mensagem || d.message || 'Erro ao salvar conta.', 'danger');
        }
    } catch (err) {
        console.error('[ContasPagar] Erro ao salvar:', err);
        _mostrarAlerta('Erro de conexão ao salvar.', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Cadastrar Conta'; }
    }
}

// ─── Editar ───────────────────────────────────────────────────────────────────
function editar(id) {
    const conta = _state.lista.find(c => c.id == id);
    if (!conta) return;

    _state.editandoId = id;
    const form = document.getElementById('cp_formCadastro');
    if (!form) return;

    Object.keys(conta).forEach(k => {
        const el = form.elements[k];
        if (el) el.value = conta[k] || '';
    });

    const btn = document.getElementById('cp_btnSalvar');
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Atualizar Conta';

    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Excluir ──────────────────────────────────────────────────────────────────
async function excluir(id) {
    if (!confirm('Deseja realmente excluir esta conta?')) return;

    try {
        const r = await fetch(`${API}?id=${id}`, { method: 'DELETE' });
        const d = await r.json();

        if (d.sucesso || d.success) {
            _mostrarAlerta('Conta excluída com sucesso!', 'success');
            _carregar();
        } else {
            _mostrarAlerta(d.mensagem || d.message || 'Erro ao excluir.', 'danger');
        }
    } catch (err) {
        console.error('[ContasPagar] Erro ao excluir:', err);
        _mostrarAlerta('Erro de conexão ao excluir.', 'danger');
    }
}

// ─── Modal de Pagamento ───────────────────────────────────────────────────────
function abrirModalPagamento(id) {
    const modal = document.getElementById('cp_modalPagamento');
    if (!modal) return;

    const hoje = new Date().toISOString().split('T')[0];
    const formPag = document.getElementById('cp_formPagamento');
    if (formPag) {
        formPag.reset();
        const dataPag = formPag.elements['data_pagamento'];
        if (dataPag) dataPag.value = hoje;
    }
    document.getElementById('cp_pagarId').value = id;
    modal.style.display = 'flex';
}

function fecharModal() {
    const modal = document.getElementById('cp_modalPagamento');
    if (modal) modal.style.display = 'none';
}

async function _registrarPagamento() {
    const form = document.getElementById('cp_formPagamento');
    if (!form) return;

    const dados = Object.fromEntries(new FormData(form));
    const id    = dados.id || document.getElementById('cp_pagarId').value;

    try {
        const r = await fetch(`${API}?id=${id}&acao=pagar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const d = await r.json();

        if (d.sucesso || d.success) {
            fecharModal();
            _mostrarAlerta('Pagamento registrado com sucesso!', 'success');
            _carregar();
        } else {
            _mostrarAlerta(d.mensagem || d.message || 'Erro ao registrar pagamento.', 'danger');
        }
    } catch (err) {
        console.error('[ContasPagar] Erro ao registrar pagamento:', err);
        _mostrarAlerta('Erro de conexão ao registrar pagamento.', 'danger');
    }
}

// ─── Limpar Formulário ────────────────────────────────────────────────────────
function limparForm() {
    const form = document.getElementById('cp_formCadastro');
    if (form) form.reset();
    _state.editandoId = null;
    const btn = document.getElementById('cp_btnSalvar');
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Cadastrar Conta';
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
function _badgeStatus(status) {
    const mapa = {
        'PENDENTE':  ['badge-pendente',  'Pendente'],
        'PAGO':      ['badge-pago',      'Pago'],
        'PARCIAL':   ['badge-parcial',   'Parcial'],
        'CANCELADO': ['badge-cancelado', 'Cancelado']
    };
    const [cls, label] = mapa[status] || ['badge-pendente', status || '-'];
    return `<span class="status-badge ${cls}">${label}</span>`;
}

function _formatarMoeda(v) {
    const n = parseFloat(v) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function _formatarData(d) {
    if (!d) return '-';
    const [y, m, dia] = d.split('T')[0].split('-');
    return `${dia}/${m}/${y}`;
}

function _esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function _mostrarAlerta(msg, tipo) {
    const c = document.getElementById('cp_alertContainer');
    if (!c) return;
    c.innerHTML = `<div class="alert alert-${tipo}" style="margin-bottom:1rem;">${_esc(msg)}</div>`;
    setTimeout(() => { if (c) c.innerHTML = ''; }, 5000);
}

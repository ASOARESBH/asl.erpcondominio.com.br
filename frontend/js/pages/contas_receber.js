/**
 * Módulo: Contas a Receber
 * Padrão SPA — layout-base.html?page=contas_receber
 */
'use strict';

const API = '../api/api_contas_receber.php';
const API_PLANOS = '../api/api_planos_contas.php';

let _state = {
    lista: [],
    editandoId: null,
    carregando: false
};

// ─── Inicialização ───────────────────────────────────────────────────────
export function init() {
    console.log('[ContasReceber] Init');
    _bindForm();
    _bindRecebimento();
    carregarPlanos();
    carregar();
}

export function destroy() {
    console.log('[ContasReceber] Destroy');
    _state = { lista: [], editandoId: null, carregando: false };
}

// ─── Bind de eventos ─────────────────────────────────────────────────────
function _bindForm() {
    const form = document.getElementById('cr_formCadastro');
    if (!form) return;
    form.addEventListener('submit', e => {
        e.preventDefault();
        _salvar();
    });
}

function _bindRecebimento() {
    const form = document.getElementById('cr_formRecebimento');
    if (!form) return;
    form.addEventListener('submit', e => {
        e.preventDefault();
        _registrarRecebimento();
    });
}

// ─── Carregar Planos de Contas ────────────────────────────────────────────
async function carregarPlanos() {
    try {
        const r = await fetch(API_PLANOS);
        const d = await r.json();
        const sel = document.getElementById('cr_selectPlano');
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
        console.error('[ContasReceber] Erro ao carregar planos:', err);
    }
}

// ─── Carregar Contas ──────────────────────────────────────────────────────
async function carregar() {
    if (_state.carregando) return;
    _state.carregando = true;

    const tbody = document.getElementById('cr_corpoTabela');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-table"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        const filtro = document.getElementById('cr_filtroStatus');
        const status = filtro ? filtro.value : '';
        const url = status ? `${API}?status=${encodeURIComponent(status)}` : API;
        const r = await fetch(url);
        const d = await r.json();

        _state.lista = d.dados || d.data || d || [];
        _renderTabela();
        _calcularKPIs();
    } catch (err) {
        console.error('[ContasReceber] Erro ao carregar:', err);
        _mostrarAlerta('Erro ao carregar contas a receber.', 'danger');
    } finally {
        _state.carregando = false;
    }
}

function filtrar() {
    carregar();
}

// ─── Renderizar Tabela ────────────────────────────────────────────────────
function _renderTabela() {
    const tbody = document.getElementById('cr_corpoTabela');
    if (!tbody) return;

    if (!_state.lista.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-table"><i class="fas fa-inbox"></i> Nenhuma conta encontrada</td></tr>';
        return;
    }

    tbody.innerHTML = _state.lista.map(c => {
        const badge = _badgeStatus(c.status);
        const venc = _formatarData(c.data_vencimento);
        const atrasada = c.status === 'PENDENTE' && new Date(c.data_vencimento) < new Date() ? ' style="color:#dc2626;font-weight:600;"' : '';
        return `
        <tr>
            <td>${_esc(c.numero_documento || '-')}</td>
            <td>${_esc(c.morador_nome || '-')}</td>
            <td>${_esc(c.unidade_numero || '-')}</td>
            <td${atrasada}>${_formatarMoeda(c.valor_original)}</td>
            <td${atrasada}>${venc}</td>
            <td>${badge}</td>
            <td class="acoes-cell">
                ${c.status === 'PENDENTE' || c.status === 'PARCIAL' ? `
                <button class="btn btn-xs btn-success" title="Registrar Recebimento" onclick="ContasReceber.abrirModalRecebimento(${c.id})">
                    <i class="fas fa-hand-holding-usd"></i>
                </button>` : ''}
                <button class="btn btn-xs btn-outline" title="Editar" onclick="ContasReceber.editar(${c.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-xs btn-danger" title="Excluir" onclick="ContasReceber.excluir(${c.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ─── Calcular KPIs ────────────────────────────────────────────────────────
function _calcularKPIs() {
    let aReceber = 0, recebido = 0, atrasadas = 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    _state.lista.forEach(c => {
        const val = parseFloat(c.valor_original) || 0;
        if (c.status === 'RECEBIDO') {
            recebido += val;
        } else if (c.status === 'PENDENTE' || c.status === 'PARCIAL') {
            aReceber += val;
            if (new Date(c.data_vencimento) < hoje) atrasadas++;
        }
    });

    _setEl('cr_totalReceber', _formatarMoeda(aReceber));
    _setEl('cr_totalRecebido', _formatarMoeda(recebido));
    _setEl('cr_contasAtrasadas', atrasadas);
}

// ─── Salvar Conta ─────────────────────────────────────────────────────────
async function _salvar() {
    const form = document.getElementById('cr_formCadastro');
    if (!form) return;

    const btn = document.getElementById('cr_btnSalvar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    const dados = Object.fromEntries(new FormData(form));

    try {
        const metodo = _state.editandoId ? 'PUT' : 'POST';
        const url = _state.editandoId ? `${API}?id=${_state.editandoId}` : API;

        const r = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const d = await r.json();

        if (d.sucesso || d.success) {
            _mostrarAlerta(_state.editandoId ? 'Conta atualizada com sucesso!' : 'Conta cadastrada com sucesso!', 'success');
            limparForm();
            carregar();
        } else {
            _mostrarAlerta(d.mensagem || d.message || 'Erro ao salvar conta.', 'danger');
        }
    } catch (err) {
        console.error('[ContasReceber] Erro ao salvar:', err);
        _mostrarAlerta('Erro de conexão ao salvar.', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Cadastrar Conta'; }
    }
}

// ─── Editar ───────────────────────────────────────────────────────────────
function editar(id) {
    const conta = _state.lista.find(c => c.id == id);
    if (!conta) return;

    _state.editandoId = id;
    const form = document.getElementById('cr_formCadastro');
    if (!form) return;

    Object.keys(conta).forEach(k => {
        const el = form.elements[k];
        if (el) el.value = conta[k] || '';
    });

    const btn = document.getElementById('cr_btnSalvar');
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Atualizar Conta';

    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Excluir ──────────────────────────────────────────────────────────────
async function excluir(id) {
    if (!confirm('Deseja realmente excluir esta conta?')) return;

    try {
        const r = await fetch(`${API}?id=${id}`, { method: 'DELETE' });
        const d = await r.json();

        if (d.sucesso || d.success) {
            _mostrarAlerta('Conta excluída com sucesso!', 'success');
            carregar();
        } else {
            _mostrarAlerta(d.mensagem || d.message || 'Erro ao excluir.', 'danger');
        }
    } catch (err) {
        console.error('[ContasReceber] Erro ao excluir:', err);
        _mostrarAlerta('Erro de conexão ao excluir.', 'danger');
    }
}

// ─── Modal de Recebimento ─────────────────────────────────────────────────
function abrirModalRecebimento(id) {
    const modal = document.getElementById('cr_modalRecebimento');
    if (!modal) return;

    const hoje = new Date().toISOString().split('T')[0];
    const formRec = document.getElementById('cr_formRecebimento');
    if (formRec) {
        formRec.reset();
        const dataPag = formRec.elements['data_pagamento'];
        if (dataPag) dataPag.value = hoje;
    }
    document.getElementById('cr_receberId').value = id;
    modal.style.display = 'flex';
}

function fecharModal() {
    const modal = document.getElementById('cr_modalRecebimento');
    if (modal) modal.style.display = 'none';
}

async function _registrarRecebimento() {
    const form = document.getElementById('cr_formRecebimento');
    if (!form) return;

    const dados = Object.fromEntries(new FormData(form));
    const id = dados.id || document.getElementById('cr_receberId').value;

    try {
        const r = await fetch(`${API}?id=${id}&acao=receber`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const d = await r.json();

        if (d.sucesso || d.success) {
            fecharModal();
            _mostrarAlerta('Recebimento registrado com sucesso!', 'success');
            carregar();
        } else {
            _mostrarAlerta(d.mensagem || d.message || 'Erro ao registrar recebimento.', 'danger');
        }
    } catch (err) {
        console.error('[ContasReceber] Erro ao registrar recebimento:', err);
        _mostrarAlerta('Erro de conexão ao registrar recebimento.', 'danger');
    }
}

// ─── Limpar Formulário ────────────────────────────────────────────────────
function limparForm() {
    const form = document.getElementById('cr_formCadastro');
    if (form) form.reset();
    _state.editandoId = null;
    const btn = document.getElementById('cr_btnSalvar');
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Cadastrar Conta';
}

// ─── Utilitários ──────────────────────────────────────────────────────────
function _badgeStatus(status) {
    const mapa = {
        'PENDENTE':  ['badge-pendente', 'Pendente'],
        'RECEBIDO':  ['badge-recebido', 'Recebido'],
        'PARCIAL':   ['badge-parcial', 'Parcial'],
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
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function _mostrarAlerta(msg, tipo) {
    const c = document.getElementById('cr_alertContainer');
    if (!c) return;
    c.innerHTML = `<div class="alert alert-${tipo}" style="margin-bottom:1rem;">${_esc(msg)}</div>`;
    setTimeout(() => { if (c) c.innerHTML = ''; }, 5000);
}

// ─── Registro Global ─────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
window.ContasReceber = { carregar, filtrar, editar, excluir, limparForm, abrirModalRecebimento, fecharModal };
}

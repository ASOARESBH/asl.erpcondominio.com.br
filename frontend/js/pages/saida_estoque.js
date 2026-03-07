/**
 * Saída de Estoque - Módulo de Página
 */
'use strict';

const _listeners = [];

export function init() {
    console.log('[SaidaEstoque] Inicializando...');
    _carregarProdutos();
    _carregarHistorico();
    
    const form = document.getElementById('saidaEstoqueForm');
    if (form) {
        const fn = (e) => {
            e.preventDefault();
            _salvarSaida();
        };
        form.addEventListener('submit', fn);
        _listeners.push({ el: form, event: 'submit', fn });
    }
}

export function destroy() {
    console.log('[SaidaEstoque] Destruindo...');
    _listeners.forEach(({ el, event, fn }) => {
        if (el) el.removeEventListener(event, fn);
    });
    _listeners.length = 0;
}

async function _carregarProdutos() {
    try {
        const res = await fetch('../api/api_estoque.php?action=produtos');
        const data = await res.json();
        const select = document.getElementById('produto_id_saida');
        if (data.sucesso && select) {
            select.innerHTML = '<option value="">Selecione o produto...</option>';
            data.dados.forEach(p => {
                select.innerHTML += `<option value="${p.id}">${p.nome} (${p.codigo})</option>`;
            });
        }
    } catch (err) {
        console.error('[SaidaEstoque] Erro ao carregar produtos:', err);
    }
}

async function _carregarHistorico() {
    const tbody = document.getElementById('saidasTableBody');
    if (!tbody) return;
    
    try {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Funcionalidade de histórico em desenvolvimento.</td></tr>';
    } catch (err) {
        console.error('[SaidaEstoque] Erro ao carregar histórico:', err);
    }
}

async function _salvarSaida() {
    alert('Funcionalidade de integração com API de Saída em desenvolvimento.');
}

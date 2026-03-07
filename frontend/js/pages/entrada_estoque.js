/**
 * Entrada de Estoque - Módulo de Página
 */
'use strict';

const _listeners = [];

export function init() {
    console.log('[EntradaEstoque] Inicializando...');
    _carregarProdutos();
    _carregarHistorico();
    
    const form = document.getElementById('entradaEstoqueForm');
    if (form) {
        const fn = (e) => {
            e.preventDefault();
            _salvarEntrada();
        };
        form.addEventListener('submit', fn);
        _listeners.push({ el: form, event: 'submit', fn });
    }
}

export function destroy() {
    console.log('[EntradaEstoque] Destruindo...');
    _listeners.forEach(({ el, event, fn }) => {
        if (el) el.removeEventListener(event, fn);
    });
    _listeners.length = 0;
}

async function _carregarProdutos() {
    try {
        const res = await fetch('../api/api_estoque.php?action=produtos');
        const data = await res.json();
        const select = document.getElementById('produto_id');
        if (data.sucesso && select) {
            select.innerHTML = '<option value="">Selecione o produto...</option>';
            data.dados.forEach(p => {
                select.innerHTML += `<option value="${p.id}">${p.nome} (${p.codigo})</option>`;
            });
        }
    } catch (err) {
        console.error('[EntradaEstoque] Erro ao carregar produtos:', err);
    }
}

async function _carregarHistorico() {
    const tbody = document.getElementById('entradasTableBody');
    if (!tbody) return;
    
    try {
        // Implementação futura integrada com API de movimentação
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Funcionalidade de histórico em desenvolvimento.</td></tr>';
    } catch (err) {
        console.error('[EntradaEstoque] Erro ao carregar histórico:', err);
    }
}

async function _salvarEntrada() {
    // Implementação da chamada para salvar entrada via API
    alert('Funcionalidade de integração com API de Entrada em desenvolvimento.');
}

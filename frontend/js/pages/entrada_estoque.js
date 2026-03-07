/**
 * Entrada de Estoque - Módulo de Página
 */
'use strict';

const _listeners = [];

export function init() {
    console.log('[EntradaEstoque] Inicializando...');
    _carregarProdutos();
    _carregarHistorico();
    
    const form = document.getElementById('entradaForm');
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
    const tbody = document.getElementById('historicoEntradasBody');
    if (!tbody) return;
    
    try {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#94a3b8;">Nenhuma entrada recente encontrada.</td></tr>';
    } catch (err) {
        console.error('[EntradaEstoque] Erro ao carregar histórico:', err);
    }
}

async function _salvarEntrada() {
    alert('Funcionalidade de Entrada sendo integrada com o backend.');
}

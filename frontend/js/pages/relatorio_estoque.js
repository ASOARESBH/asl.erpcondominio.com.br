/**
 * Relatórios de Estoque - Módulo de Página
 */
'use strict';

const _listeners = [];

export function init() {
    console.log('[RelatorioEstoque] Inicializando...');
    _carregarCategorias();
    
    const form = document.getElementById('relatorioEstoqueForm');
    if (form) {
        const fn = (e) => {
            e.preventDefault();
            _gerarRelatorio();
        };
        form.addEventListener('submit', fn);
        _listeners.push({ el: form, event: 'submit', fn });
    }
}

export function destroy() {
    console.log('[RelatorioEstoque] Destruindo...');
    _listeners.forEach(({ el, event, fn }) => {
        if (el) el.removeEventListener(event, fn);
    });
    _listeners.length = 0;
}

async function _carregarCategorias() {
    try {
        const res = await fetch('../api/api_estoque.php?action=categorias');
        const data = await res.json();
        const select = document.getElementById('categoria_rel');
        if (data.sucesso && select) {
            select.innerHTML = '<option value="">Todas as categorias</option>';
            data.dados.forEach(cat => {
                select.innerHTML += `<option value="${cat.id}">${cat.nome}</option>`;
            });
        }
    } catch (err) {
        console.error('[RelatorioEstoque] Erro ao carregar categorias:', err);
    }
}

async function _gerarRelatorio() {
    alert('Funcionalidade de geração de relatórios em desenvolvimento.');
}

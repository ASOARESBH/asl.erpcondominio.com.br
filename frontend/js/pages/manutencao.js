/**
 * Manutencao Page Module
 * 
 * Gerencia a página de visão geral de Manutenção:
 *  - Navegação pelos cards interativos para subpáginas
 *  - Delegação de cliques em card-links para subpáginas específicas
 * 
 * @module manutencao
 * @version 2.0.0
 */

'use strict';

// ============================================================
// LIFECYCLE
// ============================================================

export function init() {
    console.log('[Manutencao] Inicializando módulo v2.0...');
    _setupCardNavigation();
    console.log('[Manutencao] Módulo pronto.');
}

export function destroy() {
    console.log('[Manutencao] Destruindo módulo...');
}

// ============================================================
// NAVEGAÇÃO POR CARDS
// ============================================================

/**
 * Configura a navegação pelos cards interativos.
 * 
 * Regra de prioridade:
 *  1. Clique em .card-link → navega para data-page do link (subpágina específica)
 *  2. Clique no .page-card.interactive → navega para data-page do card (página principal)
 */
function _setupCardNavigation() {
    const wrapper = document.querySelector('.page-manutencao');
    if (!wrapper) return;

    wrapper.addEventListener('click', e => {
        // 1. Clique em card-link (subpágina específica)
        const cardLink = e.target.closest('.card-link[data-page]');
        if (cardLink) {
            e.stopPropagation();
            const page = cardLink.dataset.page;
            if (page) {
                console.log(`[Manutencao] Navegando para subpágina: ${page}`);
                _navegarPara(page);
            }
            return;
        }

        // 2. Clique no card principal
        const card = e.target.closest('.page-card.interactive[data-page]');
        if (card) {
            const page = card.dataset.page;
            if (page) {
                console.log(`[Manutencao] Navegando para módulo: ${page}`);
                _navegarPara(page);
            }
        }
    });

    // Acessibilidade: Enter/Space nos cards
    wrapper.querySelectorAll('.page-card.interactive[data-page]').forEach(card => {
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const page = card.dataset.page;
                if (page) _navegarPara(page);
            }
        });
    });
}

/**
 * Navega para uma página usando o AppRouter.
 * Fallback para link direto caso o router não esteja disponível.
 */
function _navegarPara(pageName) {
    if (window.AppRouter && typeof window.AppRouter.loadPage === 'function') {
        window.AppRouter.loadPage(pageName);
    } else {
        console.warn('[Manutencao] AppRouter não disponível. Usando fallback de URL.');
        window.location.href = window.location.origin + `/frontend/layout-base.html?page=${pageName}`;
    }
}

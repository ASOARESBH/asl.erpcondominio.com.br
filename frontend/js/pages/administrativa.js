/**
 * Administrativa.js — Hub de Módulos Administrativos
 * Gerencia navegação pelos cards e tabs para subpáginas
 * @version 2.0.0
 */

'use strict';

const _listeners = [];

export function init() {
    console.log('[Administrativa] Inicializando módulo v2.0...');
    _setupCards();
    _setupTabButtons();
    console.log('[Administrativa] Módulo pronto.');
}

export function destroy() {
    console.log('[Administrativa] Destruindo módulo...');
    _listeners.forEach(({ el, event, fn }) => {
        if (el) el.removeEventListener(event, fn);
    });
    _listeners.length = 0;
    console.log('[Administrativa] Módulo destruído.');
}

/** Cards interativos com data-navigate navegam para a subpágina */
function _setupCards() {
    document.querySelectorAll('.page-administrativa .page-card[data-navigate]').forEach(card => {
        const fn = () => {
            const pagina = card.dataset.navigate;
            if (pagina && window.AppRouter) {
                console.log('[Administrativa] Navegando para módulo: ' + pagina);
                window.AppRouter.navigate(pagina);
            }
        };
        card.addEventListener('click', fn);
        _listeners.push({ el: card, event: 'click', fn });
    });
}

/** Tabs com data-page navegam para a subpágina correspondente */
function _setupTabButtons() {
    document.querySelectorAll('.page-administrativa .tab-button[data-page]').forEach(btn => {
        const fn = () => {
            const pagina = btn.dataset.page;
            if (pagina && window.AppRouter) {
                console.log('[Administrativa] Navegando para subpágina: ' + pagina);
                window.AppRouter.navigate(pagina);
            }
        };
        btn.addEventListener('click', fn);
        _listeners.push({ el: btn, event: 'click', fn });
    });
}

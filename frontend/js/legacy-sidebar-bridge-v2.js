/**
 * Legacy Sidebar Bridge v2 - Com Integração ao MenuController
 */

(function () {
    'use strict';

    const config = { logEnabled: true, fallbackEnabled: true, useMenuController: true };

    const pageToHrefFallback = {
        dashboard: 'dashboard.html', moradores: 'moradores.html', veiculos: 'layout-base.html?page=veiculos',
        visitantes: 'layout-base.html?page=visitantes', registro: 'layout-base.html?page=registro',
        acesso: 'layout-base.html?page=acesso', relatorios: 'layout-base.html?page=relatorios',
        financeiro: 'layout-base.html?page=financeiro', configuracao: 'configuracao.html',
        manutencao: 'manutencao.html', administrativa: 'administrativa.html'
    };

    function log(message, data = null) {
        if (!config.logEnabled) return;
        const timestamp = new Date().toLocaleTimeString();
        if (data) console.log(`[LegacySidebarBridge v2] ${timestamp} ${message}`, data);
        else console.log(`[LegacySidebarBridge v2] ${timestamp} ${message}`);
    }

    function getPageToHref() {
        if (config.useMenuController && typeof window.MenuController !== 'undefined') {
            try {
                const mapping = window.MenuController.getPageToHref();
                log('Usando mapeamento do MenuController');
                return mapping;
            } catch (error) {
                log('Erro ao obter mapeamento do MenuController', error);
            }
        }
        if (config.fallbackEnabled) {
            log('Usando mapeamento fallback');
            return { ...pageToHrefFallback };
        }
        return {};
    }

    function marcarAtivo(links) {
        const arquivoAtual = (window.location.pathname.split('/').pop() || '').toLowerCase();
        const paginasFinanceirasLegadas = ['contas_pagar.html', 'contas_receber.html', 'planos_contas.html'];
        links.forEach((link) => { link.classList.remove('active'); });
        if (paginasFinanceirasLegadas.includes(arquivoAtual)) {
            const linkFinanceiro = Array.from(links).find((l) => l.dataset.page === 'financeiro');
            if (linkFinanceiro) linkFinanceiro.classList.add('active');
            return;
        }
        const linkAtual = Array.from(links).find((l) => {
            const href = (l.getAttribute('href') || '').toLowerCase();
            return href === arquivoAtual;
        });
        if (linkAtual) linkAtual.classList.add('active');
    }

    async function carregarSidebarComponente() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            log('Elemento #sidebar não encontrado');
            return;
        }
        try {
            log('Carregando sidebar.html...');
            const response = await fetch('components/sidebar.html');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            sidebar.innerHTML = html;
            log('sidebar.html carregado');
            const linksComDataPage = sidebar.querySelectorAll('a[data-page]');
            const pageToHref = getPageToHref();
            linksComDataPage.forEach((link) => {
                const page = link.dataset.page;
                if (pageToHref[page]) link.setAttribute('href', pageToHref[page]);
            });
            marcarAtivo(sidebar.querySelectorAll('.nav-link'));
            if (typeof window.refazerInterfaceUI === 'function') {
                log('Chamando refazerInterfaceUI()');
                window.refazerInterfaceUI();
            }
            const event = new CustomEvent('sidebarLoaded', { detail: { sidebar: sidebar } });
            document.dispatchEvent(event);
            log('Evento sidebarLoaded disparado');
        } catch (error) {
            log('Erro ao carregar sidebar', error);
            if (config.fallbackEnabled) {
                log('Aplicando fallback seguro');
                sidebar.innerHTML = `<div class="sidebar-header"><h1>Serra da Liberdade</h1></div><ul class="nav-menu"><li class="nav-item"><a href="#" class="nav-link">Menu indisponível</a></li></ul>`;
            }
        }
    }

    function initialize() {
        log('Inicializando LegacySidebarBridge v2');
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', carregarSidebarComponente);
        } else {
            carregarSidebarComponente();
        }
    }

    window.LegacySidebarBridge = {
        initialize: initialize,
        reload: carregarSidebarComponente,
        setLogEnabled: function(enabled) { config.logEnabled = enabled; },
        setUseMenuController: function(enabled) { config.useMenuController = enabled; },
        setFallbackEnabled: function(enabled) { config.fallbackEnabled = enabled; }
    };

    initialize();
})();

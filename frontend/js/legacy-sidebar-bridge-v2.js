/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Legacy Sidebar Bridge v2 - Com Integração ao MenuController
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Versão melhorada que:
 * 1. Usa MenuController como Single Source of Truth
 * 2. Mantém compatibilidade com versão anterior
 * 3. Adiciona fallback seguro
 * 4. Melhor tratamento de erros
 * 
 * Versão: 2.0
 * Data: 19 de Fevereiro de 2026
 */

(function () {
    'use strict';

    const config = {
        logEnabled: true,
        fallbackEnabled: true,
        useMenuController: true // Usar MenuController se disponível
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK - Compatibilidade com versão anterior
    // ═══════════════════════════════════════════════════════════════════════════

    const pageToHrefFallback = {
        dashboard: 'dashboard.html',
        moradores: 'moradores.html',
        veiculos: 'layout-base.html?page=veiculos',
        visitantes: 'layout-base.html?page=visitantes',
        registro: 'layout-base.html?page=registro',
        acesso: 'layout-base.html?page=acesso',
        relatorios: 'layout-base.html?page=relatorios',
        financeiro: 'layout-base.html?page=financeiro',
        configuracao: 'configuracao.html',
        manutencao: 'manutencao.html',
        administrativa: 'administrativa.html'
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FUNÇÕES PRIVADAS
    // ═══════════════════════════════════════════════════════════════════════════

    function log(message, data = null) {
        if (!config.logEnabled) return;

        const timestamp = new Date().toLocaleTimeString();
        const prefix = '[LegacySidebarBridge v2]';

        if (data) {
            console.log(`${prefix} ${timestamp} ${message}`, data);
        } else {
            console.log(`${prefix} ${timestamp} ${message}`);
        }
    }

    /**
     * Obtém mapeamento page -> href
     * Tenta usar MenuController primeiro, depois fallback
     */
    function getPageToHref() {
        // Tentar usar MenuController se disponível
        if (config.useMenuController && typeof window.MenuController !== 'undefined') {
            try {
                const mapping = window.MenuController.getPageToHref();
                log('✅ Usando mapeamento do MenuController', Object.keys(mapping).length + ' itens');
                return mapping;
            } catch (error) {
                log('⚠️ Erro ao obter mapeamento do MenuController', error);
            }
        }

        // Fallback para mapeamento local
        if (config.fallbackEnabled) {
            log('📋 Usando mapeamento fallback');
            return { ...pageToHrefFallback };
        }

        return {};
    }

    /**
     * Marca item ativo baseado na URL
     */
    function marcarAtivo(links) {
        const arquivoAtual = (window.location.pathname.split('/').pop() || '').toLowerCase();
        const paginasFinanceirasLegadas = ['contas_pagar.html', 'contas_receber.html', 'planos_contas.html'];

        log('🔍 Marcando item ativo', { arquivoAtual });

        // Remover classe active de todos
        links.forEach((link) => {
            link.classList.remove('active');
        });

        // Caso especial: páginas financeiras legadas
        if (paginasFinanceirasLegadas.includes(arquivoAtual)) {
            const linkFinanceiro = Array.from(links).find((l) => l.dataset.page === 'financeiro');
            if (linkFinanceiro) {
                linkFinanceiro.classList.add('active');
                log('⭐ Página financeira legada marcada como ativa');
            }
            return;
        }

        // Encontrar link atual
        const linkAtual = Array.from(links).find((l) => {
            const href = (l.getAttribute('href') || '').toLowerCase();
            return href === arquivoAtual;
        });

        if (linkAtual) {
            linkAtual.classList.add('active');
            log('⭐ Item marcado como ativo', linkAtual.dataset.page);
        } else {
            log('⚠️ Nenhum item encontrado para página atual');
        }
    }

    /**
     * Carrega sidebar via fetch
     */
    async function carregarSidebarComponente() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            log('❌ Elemento #sidebar não encontrado');
            return;
        }

        try {
            log('📥 Carregando sidebar.html...');

            const response = await fetch('components/sidebar.html');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();
            sidebar.innerHTML = html;

            log('✅ sidebar.html carregado');

            // Atualizar links com data-page
            const linksComDataPage = sidebar.querySelectorAll('a[data-page]');
            const pageToHref = getPageToHref();

            linksComDataPage.forEach((link) => {
                const page = link.dataset.page;
                if (pageToHref[page]) {
                    link.setAttribute('href', pageToHref[page]);
                    log('🔗 Link atualizado', { page, href: pageToHref[page] });
                }
            });

            // Marcar item ativo
            marcarAtivo(sidebar.querySelectorAll('.nav-link'));

            // Chamar callback se disponível
            if (typeof window.refazerInterfaceUI === 'function') {
                log('🎨 Chamando refazerInterfaceUI()');
                window.refazerInterfaceUI();
            }

            // Disparar evento customizado
            const event = new CustomEvent('sidebarLoaded', {
                detail: { sidebar: sidebar }
            });
            document.dispatchEvent(event);
            log('📢 Evento sidebarLoaded disparado');

        } catch (error) {
            log('❌ Erro ao carregar sidebar', error);

            // Fallback: manter estrutura mínima
            if (config.fallbackEnabled) {
                log('🔄 Aplicando fallback seguro');
                sidebar.innerHTML = `
                    <div class="sidebar-header">
                        <h1>Serra da Liberdade</h1>
                    </div>
                    <ul class="nav-menu">
                        <li class="nav-item"><a href="#" class="nav-link">Menu indisponível</a></li>
                    </ul>
                `;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INICIALIZAÇÃO
    // ═══════════════════════════════════════════════════════════════════════════

    function initialize() {
        log('🚀 Inicializando LegacySidebarBridge v2');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', carregarSidebarComponente);
        } else {
            carregarSidebarComponente();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════════════

    window.LegacySidebarBridge = {
        initialize: initialize,
        reload: carregarSidebarComponente,
        setLogEnabled: function(enabled) {
            config.logEnabled = enabled;
        },
        setUseMenuController: function(enabled) {
            config.useMenuController = enabled;
        },
        setFallbackEnabled: function(enabled) {
            config.fallbackEnabled = enabled;
        }
    };

    // Inicializar automaticamente
    initialize();

})();

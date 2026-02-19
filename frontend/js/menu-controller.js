/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MENU CONTROLLER - Single Source of Truth
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Refatoração Não-Destrutiva do Menu:
 * - Centraliza definição do menu em um único objeto JavaScript
 * - Renderização dinâmica sem quebrar HTML/CSS/scripts existentes
 * - Compatibilidade total com legacy-sidebar-bridge.js
 * - Active state detection automático
 * - Fallback seguro se renderização falhar
 * 
 * Uso:
 *   MenuController.initialize(); // Inicializa automaticamente
 *   MenuController.addItem({...}); // Adiciona novo item
 *   MenuController.removeItem('page-key'); // Remove item
 *   MenuController.updateItem('page-key', {...}); // Atualiza item
 * 
 * Versão: 1.0
 * Data: 19 de Fevereiro de 2026
 */

const MenuController = (function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // SINGLE SOURCE OF TRUTH - Definição Centralizada do Menu
    // ═══════════════════════════════════════════════════════════════════════════
    
    const menuItems = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: 'fas fa-chart-line',
            page: 'dashboard',
            href: 'dashboard.html',
            order: 1
        },
        {
            id: 'moradores',
            label: 'Moradores',
            icon: 'fas fa-users',
            page: 'moradores',
            href: 'moradores.html',
            order: 2
        },
        {
            id: 'veiculos',
            label: 'Veículos',
            icon: 'fas fa-car',
            page: 'veiculos',
            href: 'layout-base.html?page=veiculos',
            order: 3
        },
        {
            id: 'visitantes',
            label: 'Visitantes',
            icon: 'fas fa-user-friends',
            page: 'visitantes',
            href: 'layout-base.html?page=visitantes',
            order: 4
        },
        {
            id: 'registro',
            label: 'Registro Manual',
            icon: 'fas fa-clipboard-list',
            page: 'registro',
            href: 'layout-base.html?page=registro',
            order: 5
        },
        {
            id: 'acesso',
            label: 'Controle de Acesso',
            icon: 'fas fa-door-open',
            page: 'acesso',
            href: 'layout-base.html?page=acesso',
            order: 6
        },
        {
            id: 'relatorios',
            label: 'Relatórios',
            icon: 'fas fa-file-alt',
            page: 'relatorios',
            href: 'layout-base.html?page=relatorios',
            order: 7
        },
        {
            id: 'financeiro',
            label: 'Financeiro',
            icon: 'fas fa-money-bill-wave',
            page: 'financeiro',
            href: 'layout-base.html?page=financeiro',
            order: 8
        },
        {
            id: 'configuracao',
            label: 'Configurações',
            icon: 'fas fa-cog',
            page: 'configuracao',
            href: 'configuracao.html',
            order: 9
        },
        {
            id: 'manutencao',
            label: 'Manutenção',
            icon: 'fas fa-tools',
            page: 'manutencao',
            href: 'manutencao.html',
            order: 10
        },
        {
            id: 'administrativa',
            label: 'Administrativo',
            icon: 'fas fa-briefcase',
            page: 'administrativa',
            href: 'administrativa.html',
            order: 11
        }
    ];

    // Mapeamento para compatibilidade com legacy-sidebar-bridge.js
    const pageToHref = {};
    menuItems.forEach(item => {
        pageToHref[item.page] = item.href;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURAÇÃO
    // ═══════════════════════════════════════════════════════════════════════════

    const config = {
        containerId: 'nav-menu',
        containerSelector: '.nav-menu',
        activeClass: 'active',
        logEnabled: true,
        fallbackEnabled: true,
        renderDelay: 0 // ms para renderização (0 = imediato)
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FUNÇÕES PRIVADAS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Log de debug
     */
    function log(message, data = null) {
        if (!config.logEnabled) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const prefix = '[MenuController]';
        
        if (data) {
            console.log(`${prefix} ${timestamp} ${message}`, data);
        } else {
            console.log(`${prefix} ${timestamp} ${message}`);
        }
    }

    /**
     * Detecta página atual pela URL
     */
    function detectCurrentPage() {
        const pathname = window.location.pathname;
        const filename = pathname.split('/').pop().toLowerCase() || '';
        const searchParams = new URLSearchParams(window.location.search);
        const pageParam = searchParams.get('page');

        log('🔍 Detectando página atual', { pathname, filename, pageParam });

        // Se há parâmetro ?page=, usar isso
        if (pageParam) {
            const item = menuItems.find(m => m.page === pageParam);
            if (item) {
                log('✅ Página detectada por parâmetro', pageParam);
                return item.page;
            }
        }

        // Tentar encontrar por filename
        const item = menuItems.find(m => {
            const itemFilename = m.href.split('?')[0].split('/').pop().toLowerCase();
            return itemFilename === filename;
        });

        if (item) {
            log('✅ Página detectada por filename', filename);
            return item.page;
        }

        log('⚠️ Página não detectada', filename);
        return null;
    }

    /**
     * Renderiza um item do menu
     */
    function renderMenuItem(item) {
        const isActive = item.page === detectCurrentPage() ? 'active' : '';
        
        return `
            <li class="nav-item">
                <a href="#" 
                   data-page="${item.page}" 
                   class="nav-link ${isActive}"
                   title="${item.label}">
                    <i class="${item.icon}"></i>
                    <span>${item.label}</span>
                </a>
            </li>
        `;
    }

    /**
     * Renderiza o botão de logout
     */
    function renderLogoutButton() {
        return `
            <li class="nav-item" style="margin-top: 1rem;">
                <a href="#" 
                   class="nav-link nav-link-logout" 
                   id="btn-logout" 
                   style="color: #fca5a5;">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Sair</span>
                </a>
            </li>
        `;
    }

    /**
     * Renderiza o menu completo
     */
    function renderMenu() {
        try {
            log('🎨 Iniciando renderização do menu');

            // Encontrar container
            const container = document.getElementById(config.containerId) || 
                            document.querySelector(config.containerSelector);

            if (!container) {
                log('❌ Container não encontrado', { containerId: config.containerId });
                return false;
            }

            // Limpar container (preservar estrutura mínima)
            container.innerHTML = '';

            // Renderizar itens do menu
            const sortedItems = [...menuItems].sort((a, b) => a.order - b.order);
            const itemsHtml = sortedItems.map(item => renderMenuItem(item)).join('');

            // Renderizar logout
            const logoutHtml = renderLogoutButton();

            // Injetar HTML
            container.innerHTML = itemsHtml + logoutHtml;

            log('✅ Menu renderizado com sucesso', { itemCount: menuItems.length });

            // Atualizar links com data-page para compatibilidade com legacy-sidebar-bridge
            updateDataPageLinks();

            return true;

        } catch (error) {
            log('❌ Erro ao renderizar menu', error);
            return false;
        }
    }

    /**
     * Atualiza links com data-page para compatibilidade
     */
    function updateDataPageLinks() {
        const container = document.getElementById(config.containerId) || 
                        document.querySelector(config.containerSelector);

        if (!container) return;

        const links = container.querySelectorAll('a[data-page]');
        links.forEach(link => {
            const page = link.dataset.page;
            const item = menuItems.find(m => m.page === page);
            
            if (item) {
                link.setAttribute('href', item.href);
                log('🔗 Link atualizado', { page, href: item.href });
            }
        });
    }

    /**
     * Marca item ativo baseado na URL
     */
    function markActiveItem() {
        try {
            const container = document.getElementById(config.containerId) || 
                            document.querySelector(config.containerSelector);

            if (!container) return;

            const currentPage = detectCurrentPage();
            const links = container.querySelectorAll('.nav-link');

            links.forEach(link => {
                link.classList.remove(config.activeClass);
                
                if (link.dataset.page === currentPage) {
                    link.classList.add(config.activeClass);
                    log('⭐ Item marcado como ativo', currentPage);
                }
            });

        } catch (error) {
            log('❌ Erro ao marcar item ativo', error);
        }
    }

    /**
     * Inicializa o menu
     */
    function initialize() {
        try {
            log('🚀 Inicializando MenuController');

            // Aguardar DOM estar pronto
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        const success = renderMenu();
                        if (success) {
                            markActiveItem();
                            log('✅ MenuController inicializado com sucesso');
                        }
                    }, config.renderDelay);
                });
            } else {
                setTimeout(() => {
                    const success = renderMenu();
                    if (success) {
                        markActiveItem();
                        log('✅ MenuController inicializado com sucesso');
                    }
                }, config.renderDelay);
            }

        } catch (error) {
            log('❌ Erro ao inicializar MenuController', error);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        /**
         * Inicializa o menu
         */
        initialize: function() {
            initialize();
        },

        /**
         * Renderiza o menu
         */
        render: function() {
            return renderMenu();
        },

        /**
         * Marca item ativo
         */
        markActive: function() {
            markActiveItem();
        },

        /**
         * Adiciona novo item ao menu
         */
        addItem: function(item) {
            if (!item.id || !item.label || !item.page) {
                log('❌ Item inválido', item);
                return false;
            }

            // Verificar se já existe
            if (menuItems.find(m => m.id === item.id)) {
                log('⚠️ Item já existe', item.id);
                return false;
            }

            // Definir ordem padrão
            if (!item.order) {
                item.order = Math.max(...menuItems.map(m => m.order), 0) + 1;
            }

            menuItems.push(item);
            pageToHref[item.page] = item.href;

            log('✅ Item adicionado', item);

            // Re-renderizar
            renderMenu();
            markActiveItem();

            return true;
        },

        /**
         * Remove item do menu
         */
        removeItem: function(itemId) {
            const index = menuItems.findIndex(m => m.id === itemId);
            
            if (index === -1) {
                log('❌ Item não encontrado', itemId);
                return false;
            }

            const item = menuItems[index];
            menuItems.splice(index, 1);
            delete pageToHref[item.page];

            log('✅ Item removido', itemId);

            // Re-renderizar
            renderMenu();
            markActiveItem();

            return true;
        },

        /**
         * Atualiza item do menu
         */
        updateItem: function(itemId, updates) {
            const item = menuItems.find(m => m.id === itemId);
            
            if (!item) {
                log('❌ Item não encontrado', itemId);
                return false;
            }

            // Atualizar propriedades
            Object.assign(item, updates);

            // Atualizar pageToHref se página mudou
            if (updates.page) {
                delete pageToHref[item.page];
                pageToHref[updates.page] = item.href;
            }

            log('✅ Item atualizado', { itemId, updates });

            // Re-renderizar
            renderMenu();
            markActiveItem();

            return true;
        },

        /**
         * Retorna todos os itens do menu
         */
        getItems: function() {
            return [...menuItems];
        },

        /**
         * Retorna item específico
         */
        getItem: function(itemId) {
            return menuItems.find(m => m.id === itemId);
        },

        /**
         * Retorna mapeamento page -> href
         */
        getPageToHref: function() {
            return { ...pageToHref };
        },

        /**
         * Retorna página atual detectada
         */
        getCurrentPage: function() {
            return detectCurrentPage();
        },

        /**
         * Configura opções
         */
        configure: function(options) {
            Object.assign(config, options);
            log('⚙️ Configuração atualizada', config);
        },

        /**
         * Retorna configuração atual
         */
        getConfig: function() {
            return { ...config };
        },

        /**
         * Ativa/desativa logging
         */
        setLogEnabled: function(enabled) {
            config.logEnabled = enabled;
        }
    };

})();

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

// Inicializar automaticamente quando página carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        MenuController.initialize();
    });
} else {
    MenuController.initialize();
}

// Exportar para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MenuController;
}

/**
 * MENU CONTROLLER - Single Source of Truth
 * Refatoração Não-Destrutiva do Menu
 */

const MenuController = (function() {
    'use strict';

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-chart-line', page: 'dashboard', href: 'dashboard.html', order: 1 },
        { id: 'moradores', label: 'Moradores', icon: 'fas fa-users', page: 'moradores', href: 'moradores.html', order: 2 },
        { id: 'veiculos', label: 'Veículos', icon: 'fas fa-car', page: 'veiculos', href: 'layout-base.html?page=veiculos', order: 3 },
        { id: 'visitantes', label: 'Visitantes', icon: 'fas fa-user-friends', page: 'visitantes', href: 'layout-base.html?page=visitantes', order: 4 },
        { id: 'registro', label: 'Registro Manual', icon: 'fas fa-clipboard-list', page: 'registro', href: 'layout-base.html?page=registro', order: 5 },
        { id: 'acesso', label: 'Controle de Acesso', icon: 'fas fa-door-open', page: 'acesso', href: 'layout-base.html?page=acesso', order: 6 },
        { id: 'relatorios', label: 'Relatórios', icon: 'fas fa-file-alt', page: 'relatorios', href: 'layout-base.html?page=relatorios', order: 7 },
        { id: 'financeiro', label: 'Financeiro', icon: 'fas fa-money-bill-wave', page: 'financeiro', href: 'layout-base.html?page=financeiro', order: 8 },
        { id: 'configuracao', label: 'Configurações', icon: 'fas fa-cog', page: 'configuracao', href: 'configuracao.html', order: 9 },
        { id: 'manutencao', label: 'Manutenção', icon: 'fas fa-tools', page: 'manutencao', href: 'manutencao.html', order: 10 },
        { id: 'administrativa', label: 'Administrativo', icon: 'fas fa-briefcase', page: 'administrativa', href: 'administrativa.html', order: 11 }
    ];

    const pageToHref = {};
    menuItems.forEach(item => { pageToHref[item.page] = item.href; });

    const config = { containerId: 'nav-menu', containerSelector: '.nav-menu', activeClass: 'active', logEnabled: true };

    function log(message, data = null) {
        if (!config.logEnabled) return;
        const timestamp = new Date().toLocaleTimeString();
        if (data) console.log(`[MenuController] ${timestamp} ${message}`, data);
        else console.log(`[MenuController] ${timestamp} ${message}`);
    }

    function detectCurrentPage() {
        const pathname = window.location.pathname;
        const filename = pathname.split('/').pop().toLowerCase() || '';
        const searchParams = new URLSearchParams(window.location.search);
        const pageParam = searchParams.get('page');
        if (pageParam) {
            const item = menuItems.find(m => m.page === pageParam);
            if (item) return item.page;
        }
        const item = menuItems.find(m => {
            const itemFilename = m.href.split('?')[0].split('/').pop().toLowerCase();
            return itemFilename === filename;
        });
        return item ? item.page : null;
    }

    function renderMenuItem(item) {
        const isActive = item.page === detectCurrentPage() ? 'active' : '';
        return `<li class="nav-item"><a href="#" data-page="${item.page}" class="nav-link ${isActive}" title="${item.label}"><i class="${item.icon}"></i><span>${item.label}</span></a></li>`;
    }

    function renderLogoutButton() {
        return `<li class="nav-item" style="margin-top: 1rem;"><a href="#" class="nav-link nav-link-logout" id="btn-logout" style="color: #fca5a5;"><i class="fas fa-sign-out-alt"></i><span>Sair</span></a></li>`;
    }

    function renderMenu() {
        try {
            const container = document.getElementById(config.containerId) || document.querySelector(config.containerSelector);
            if (!container) return false;
            container.innerHTML = '';
            const sortedItems = [...menuItems].sort((a, b) => a.order - b.order);
            const itemsHtml = sortedItems.map(item => renderMenuItem(item)).join('');
            const logoutHtml = renderLogoutButton();
            container.innerHTML = itemsHtml + logoutHtml;
            updateDataPageLinks();
            return true;
        } catch (error) {
            log('Erro ao renderizar menu', error);
            return false;
        }
    }

    function updateDataPageLinks() {
        const container = document.getElementById(config.containerId) || document.querySelector(config.containerSelector);
        if (!container) return;
        const links = container.querySelectorAll('a[data-page]');
        links.forEach(link => {
            const page = link.dataset.page;
            const item = menuItems.find(m => m.page === page);
            if (item) link.setAttribute('href', item.href);
        });
    }

    function markActiveItem() {
        try {
            const container = document.getElementById(config.containerId) || document.querySelector(config.containerSelector);
            if (!container) return;
            const currentPage = detectCurrentPage();
            const links = container.querySelectorAll('.nav-link');
            links.forEach(link => {
                link.classList.remove(config.activeClass);
                if (link.dataset.page === currentPage) link.classList.add(config.activeClass);
            });
        } catch (error) {
            log('Erro ao marcar item ativo', error);
        }
    }

    function initialize() {
        try {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    const success = renderMenu();
                    if (success) markActiveItem();
                });
            } else {
                const success = renderMenu();
                if (success) markActiveItem();
            }
        } catch (error) {
            log('Erro ao inicializar', error);
        }
    }

    return {
        initialize: function() { initialize(); },
        render: function() { return renderMenu(); },
        markActive: function() { markActiveItem(); },
        addItem: function(item) {
            if (!item.id || !item.label || !item.page) return false;
            if (menuItems.find(m => m.id === item.id)) return false;
            if (!item.order) item.order = Math.max(...menuItems.map(m => m.order), 0) + 1;
            menuItems.push(item);
            pageToHref[item.page] = item.href;
            renderMenu();
            markActiveItem();
            return true;
        },
        removeItem: function(itemId) {
            const index = menuItems.findIndex(m => m.id === itemId);
            if (index === -1) return false;
            const item = menuItems[index];
            menuItems.splice(index, 1);
            delete pageToHref[item.page];
            renderMenu();
            markActiveItem();
            return true;
        },
        updateItem: function(itemId, updates) {
            const item = menuItems.find(m => m.id === itemId);
            if (!item) return false;
            Object.assign(item, updates);
            if (updates.page) {
                delete pageToHref[item.page];
                pageToHref[updates.page] = item.href;
            }
            renderMenu();
            markActiveItem();
            return true;
        },
        getItems: function() { return [...menuItems]; },
        getItem: function(itemId) { return menuItems.find(m => m.id === itemId); },
        getPageToHref: function() { return { ...pageToHref }; },
        getCurrentPage: function() { return detectCurrentPage(); },
        configure: function(options) { Object.assign(config, options); },
        getConfig: function() { return { ...config }; },
        setLogEnabled: function(enabled) { config.logEnabled = enabled; }
    };
})();

window.SessionManagerCore = MenuController;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { MenuController.initialize(); });
} else {
    MenuController.initialize();
}
if (typeof module !== 'undefined' && module.exports) { module.exports = MenuController; }

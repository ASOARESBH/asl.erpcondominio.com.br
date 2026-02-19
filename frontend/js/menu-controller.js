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

(function (global) {
    'use strict';

    const MENU_ITEMS = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-chart-line', page: 'dashboard', href: 'dashboard.html', order: 1 },
        { id: 'moradores', label: 'Moradores', icon: 'fas fa-users', page: 'moradores', href: 'moradores.html', order: 2 },
        { id: 'veiculos', label: 'Veiculos', icon: 'fas fa-car', page: 'veiculos', href: 'layout-base.html?page=veiculos', order: 3 },
        { id: 'visitantes', label: 'Visitantes', icon: 'fas fa-user-friends', page: 'visitantes', href: 'layout-base.html?page=visitantes', order: 4 },
        { id: 'registro', label: 'Registro Manual', icon: 'fas fa-clipboard-list', page: 'registro', href: 'layout-base.html?page=registro', order: 5 },
        { id: 'acesso', label: 'Controle de Acesso', icon: 'fas fa-door-open', page: 'acesso', href: 'layout-base.html?page=acesso', order: 6 },
        { id: 'relatorios', label: 'Relatorios', icon: 'fas fa-file-alt', page: 'relatorios', href: 'layout-base.html?page=relatorios', order: 7 },
        { id: 'financeiro', label: 'Financeiro', icon: 'fas fa-money-bill-wave', page: 'financeiro', href: 'layout-base.html?page=financeiro', order: 8 },
        { id: 'configuracao', label: 'Configuracoes', icon: 'fas fa-cog', page: 'configuracao', href: 'configuracao.html', order: 9 },
        { id: 'manutencao', label: 'Manutencao', icon: 'fas fa-tools', page: 'manutencao', href: 'manutencao.html', order: 10 },
        { id: 'administrativa', label: 'Administrativo', icon: 'fas fa-briefcase', page: 'administrativa', href: 'administrativa.html', order: 11 }
    ];

    const LEGACY_GROUP_BY_PAGE = {
        contas_pagar: 'financeiro',
        contas_receber: 'financeiro',
        planos_contas: 'financeiro'
    };

    const state = {
        logEnabled: false,
        initialized: false,
        items: MENU_ITEMS.map((item) => ({ ...item }))
    };

    function log(message, data) {
        if (!state.logEnabled) return;
        if (typeof data !== 'undefined') {
            console.log('[MenuController]', message, data);
        } else {
            console.log('[MenuController]', message);
        }
    }

    function getContainer(options = {}) {
        if (options.container && options.container.nodeType === 1) {
            return options.container;
        }

        if (options.containerSelector) {
            const scoped = options.scope && options.scope.querySelector
                ? options.scope.querySelector(options.containerSelector)
                : document.querySelector(options.containerSelector);
            if (scoped) return scoped;
        }

        const byId = document.getElementById('nav-menu');
        if (byId) return byId;

        if (options.scope && options.scope.querySelector) {
            return options.scope.querySelector('.nav-menu');
        }

        return document.querySelector('#sidebar .nav-menu') || document.querySelector('.nav-menu');
    }

    function normalizePathname() {
        const raw = (window.location.pathname.split('/').pop() || '').toLowerCase();
        return raw;
    }

    function detectCurrentPage() {
        const params = new URLSearchParams(window.location.search);
        const pageParam = params.get('page');
        if (pageParam && state.items.some((item) => item.page === pageParam)) {
            return pageParam;
        }

        const file = normalizePathname();
        const withoutExt = file.replace(/\.html$/i, '');
        if (LEGACY_GROUP_BY_PAGE[withoutExt]) {
            return LEGACY_GROUP_BY_PAGE[withoutExt];
        }

        const match = state.items.find((item) => {
            const hrefFile = (item.href.split('?')[0].split('/').pop() || '').toLowerCase();
            return hrefFile === file;
        });

        return match ? match.page : null;
    }

    function renderItem(item, activePage) {
        const activeClass = item.page === activePage ? ' active' : '';
        return [
            '<li class="nav-item">',
            `<a href="${item.href}" data-page="${item.page}" class="nav-link${activeClass}" title="${item.label}">`,
            `<i class="${item.icon}"></i>`,
            `<span>${item.label}</span>`,
            '</a>',
            '</li>'
        ].join('');
    }

    function renderLogout() {
        return [
            '<li class="nav-item" style="margin-top: 1rem;">',
            '<a href="#" class="nav-link nav-link-logout" id="btn-logout" style="color: #fca5a5;">',
            '<i class="fas fa-sign-out-alt"></i>',
            '<span>Sair</span>',
            '</a>',
            '</li>'
        ].join('');
    }

    function renderFallback(container) {
        if (!container) return false;
        container.innerHTML = [
            '<li class="nav-item">',
            '<a href="dashboard.html" data-page="dashboard" class="nav-link">',
            '<i class="fas fa-chart-line"></i>',
            '<span>Dashboard</span>',
            '</a>',
            '</li>'
        ].join('');
        return true;
    }

    function sortItems() {
        return [...state.items].sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function renderMenu(options = {}) {
        const container = getContainer(options);
        if (!container) {
            log('Container .nav-menu nao encontrado para renderizacao');
            return false;
        }

        try {
            const activePage = detectCurrentPage();
            const menuHtml = sortItems().map((item) => renderItem(item, activePage)).join('') + renderLogout();
            container.innerHTML = menuHtml;
            return true;
        } catch (error) {
            log('Erro ao renderizar menu, aplicando fallback', error);
            return renderFallback(container);
        }
    }

    function markActive(options = {}) {
        const container = getContainer(options);
        if (!container) return false;

        const currentPage = detectCurrentPage();
        const links = container.querySelectorAll('.nav-link[data-page]');
        links.forEach((link) => {
            link.classList.remove('active');
            if (link.dataset.page === currentPage) {
                link.classList.add('active');
            }
        });

        return true;
    }

    function getPageToHref() {
        const mapping = {};
        state.items.forEach((item) => {
            mapping[item.page] = item.href;
        });
        return mapping;
    }

    function validateItem(item) {
        return item && item.id && item.label && item.page && item.href;
    }

    function addItem(item) {
        if (!validateItem(item)) return false;
        if (state.items.some((current) => current.id === item.id || current.page === item.page)) {
            return false;
        }

        const nextOrder = state.items.reduce((acc, current) => Math.max(acc, current.order || 0), 0) + 1;
        state.items.push({ ...item, order: item.order || nextOrder });
        renderMenu();
        markActive();
        return true;
    }

    function removeItem(itemId) {
        const index = state.items.findIndex((item) => item.id === itemId);
        if (index === -1) return false;

        state.items.splice(index, 1);
        renderMenu();
        markActive();
        return true;
    }

    function updateItem(itemId, updates) {
        const index = state.items.findIndex((item) => item.id === itemId);
        if (index === -1) return false;

        const nextItem = { ...state.items[index], ...updates };
        if (!validateItem(nextItem)) return false;

        const duplicate = state.items.some((item, i) => {
            if (i === index) return false;
            return item.id === nextItem.id || item.page === nextItem.page;
        });

        if (duplicate) return false;

        state.items[index] = nextItem;
        renderMenu();
        markActive();
        return true;
    }

    function initialize() {
        if (state.initialized) return;
        state.initialized = true;

        renderMenu();
        markActive();

        document.addEventListener('sidebarLoaded', function (event) {
            const sidebar = event && event.detail ? event.detail.sidebar : null;
            const scope = sidebar && sidebar.querySelector ? sidebar : document;
            renderMenu({ scope: scope });
            markActive({ scope: scope });
        });
    }

    const api = {
        initialize,
        renderMenu,
        render: renderMenu,
        markActive,
        getPageToHref,
        getCurrentPage: detectCurrentPage,
        getItems: function () { return state.items.map((item) => ({ ...item })); },
        getItem: function (id) { return state.items.find((item) => item.id === id) || null; },
        addItem,
        removeItem,
        updateItem,
        setLogEnabled: function (enabled) { state.logEnabled = !!enabled; }
    };

    global.MenuController = api;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(window);

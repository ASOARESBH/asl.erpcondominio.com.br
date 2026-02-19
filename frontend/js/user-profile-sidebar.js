/**
 * UI REFACTOR - Global Sidebar & Top Header Controller
 * Adere ao novo design (Janeiro/2026) com login superior e sidebar limpa.
 */
(function () {
    'use strict';

    function initUI() {
        const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
        if (!sidebar) return;

        // 1. Garantir que o CSS do Refactor está carregado
        if (!document.getElementById('cssSidebarRefactor')) {
            const link = document.createElement('link');
            link.id = 'cssSidebarRefactor';
            link.rel = 'stylesheet';
            link.href = '../assets/css/sidebar-refactor.css';
            document.head.appendChild(link);
        }

        // 1.1 Injetar Reset Global para anular CSS legado (Head-to-Head Cleanup)
        if (!document.getElementById('styleUIGlobalReset')) {
            const style = document.createElement('style');
            style.id = 'styleUIGlobalReset';
            style.innerHTML = `
                /* Reset de Headers e Layouts Legados */
                .header, header.header { 
                    background: white !important; 
                    background-image: none !important;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
                    border: none !important;
                    color: #1e293b !important;
                }
                .main-content { 
                    margin-left: 260px !important; 
                    background-color: var(--color-background-tertiary) !important;
                    min-height: 100vh !important;
                }
                .sidebar {
                    background: #111827 !important;
                    background-image: none !important;
                }
                @media (max-width: 768px) {
                    .main-content { margin-left: 0 !important; }
                }
                /* Esconder elementos legados que podem reaparecer */
                .user-mini-profile:not(#userMiniProfile) { display: none !important; }
            `;
            document.head.appendChild(style);
        }

        // 2. Refatorar Sidebar Header (Logo)
        const sidebarHeader = sidebar.querySelector('.sidebar-header');
        if (sidebarHeader) {
            // Limpar e aplicar estrutura de logo em box branco
            sidebarHeader.innerHTML = `
                <div class="sidebar-logo-container">
                    <img src="../uploads/logo/logo_1769740112.jpeg" alt="Logo" class="sidebar-logo" id="dynamicSidebarLogo" onerror="this.src='../assets/img/logos/logo_padrao.png';">
                </div>
            `;
        }
        // ... [lines 31-48 remain roughly same, but I'll update them in a chunk if needed] ...
        // 3. Remover seções legadas do sidebar (perfil e sessão)
        const legacySections = sidebar.querySelectorAll('.user-profile-section, .profile-section, .user-session, .sidebar-footer');
        legacySections.forEach(el => el.remove());

        // 4. Garantir Top Header (Login Superior)
        ensureTopHeader();

        // 5. Ajustar Botão de Logout para o novo estilo
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.classList.add('nav-link-logout');
        }

        // 6. Marcar item ativo baseado na URL
        const currentPath = window.location.pathname.split('/').pop();
        const links = sidebar.querySelectorAll('.nav-link, .sidebar-nav a');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes(currentPath) && currentPath !== '') {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    function ensureTopHeader() {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;

        let header = document.querySelector('.header');

        // Se o header existente for antigo ou não tiver a estrutura nova, forçamos o padrão
        if (!header || !header.querySelector('#userMiniProfile')) {
            if (!header) {
                header = document.createElement('header');
                header.className = 'header';
                mainContent.prepend(header);
            }
        }

        // Título da Página (pega do document.title ou do próprio header se já tinha algo)
        const pageTitle = document.title.split('-')[0].trim() || 'Sistema';
        const iconClass = getPageIcon(pageTitle);

        header.innerHTML = `
            <h1><i class="${iconClass}"></i> ${pageTitle}</h1>
            <div class="user-mini-profile" id="userMiniProfile">
                <div class="user-info-mini">
                    <span class="header-user-name" id="topUserName">Carregando...</span>
                </div>
                <div class="top-user-avatar" id="topUserAvatar">U</div>
            </div>
        `;
    }

    function getPageIcon(title) {
        // ... [getPageIcon icon mappings remain same] ...
        const lower = title.toLowerCase();
        if (lower.includes('dashboard')) return 'fas fa-chart-line';
        if (lower.includes('morador')) return 'fas fa-users';
        if (lower.includes('veículo')) return 'fas fa-car';
        if (lower.includes('visitante')) return 'fas fa-user-clock';
        if (lower.includes('registro')) return 'fas fa-clipboard-list';
        if (lower.includes('controle')) return 'fas fa-door-open';
        if (lower.includes('relatório')) return 'fas fa-file-alt';
        if (lower.includes('finan')) return 'fas fa-money-bill-wave';
        if (lower.includes('config')) return 'fas fa-cog';
        if (lower.includes('manuten')) return 'fas fa-tools';
        if (lower.includes('admin')) return 'fas fa-briefcase';
        return 'fas fa-desktop';
    }

    // Inicialização
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initUI();
        });
    } else {
        initUI();
    }

    window.refazerInterfaceUI = initUI;

})();

/**
 * Sidebar Controller
 * Responsável por carregar o sidebar dinamicamente, gerenciar estado ativo e toggle mobile.
 */
(function () {
    'use strict';

    const SIDEBAR_PATH = 'components/sidebar.html'; // Padrão
    const SIDEBAR_CONTAINER_ID = 'sidebar';

    async function initSidebar() {
        const sidebar = document.getElementById(SIDEBAR_CONTAINER_ID);
        if (!sidebar) return;

        try {
            // Determinar caminho correto (lidar com subpastas se necessário)
            // Assumindo que current script está em js/, então components/ está em ../components/ se relative
            // Mas PROMPT pediu fetch('/components/sidebar.html'), assumindo root.
            // Vamos usar path relativo ao root do frontend

            // Verificação de path para fetch
            // Se estamos em /frontend/index.html -> components/sidebar.html works

            const response = await fetch('components/sidebar.html');
            if (!response.ok) throw new Error('Falha ao carregar sidebar');

            const html = await response.text();
            sidebar.innerHTML = html;

            // Após carregar HTML, inicializar comportamentos
            setActiveLink();

            // Inicializar User Profile e outras dependências de UI
            if (typeof window.refazerInterfaceUI === 'function') {
                window.refazerInterfaceUI();
            }

            // Fallback para toggleMenu se não existir
            window.toggleMenu = function () {
                sidebar.classList.toggle('active');
            };

            // Event listener para fechar menu ao clicar fora (Mobile)
            document.addEventListener('click', function (e) {
                const toggle = document.querySelector('.menu-toggle');
                if (window.innerWidth <= 768 && sidebar.classList.contains('active') && !sidebar.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
                    sidebar.classList.remove('active');
                }
            });

        } catch (error) {
            console.error('Erro ao carregar sidebar:', error);
            sidebar.innerHTML = '<div class="p-4 text-red-500">Erro ao carregar menu.</div>';
        }
    }

    function setActiveLink() {
        const currentPath = window.location.pathname.split('/').pop();
        const links = document.querySelectorAll('.nav-link, .sidebar-nav a');

        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && (href === currentPath || (currentPath === '' && href === 'index.html'))) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LOGOUT HANDLER - Global Event Delegation for SPA
    // ═══════════════════════════════════════════════════════════════════════════
    // This approach works even when sidebar is loaded dynamically
    // No need to wait for DOM or use setTimeout
    console.log('[Sidebar] ✅ Configurando delegação global para logout');

    // Auto-init se DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initSidebar();
            initSubmenus();
        });
    } else {
        initSidebar();
        initSubmenus();
    }

    /**
     * Inicializa comportamento de Submenus (Dropdowns)
     * Utilizado na página de Configurações
     */
    function initSubmenus() {
        // Encontrar todos os toggles de submenu
        // Suporta tanto data-toggle/data-target quanto a classe antiga
        document.addEventListener('click', function (e) {
            // Verificar se o clique foi em um toggle de submenu
            const toggle = e.target.closest('.submenu-toggle') || e.target.closest('[data-toggle="submenu"]');

            if (toggle) {
                e.preventDefault();
                const targetId = toggle.getAttribute('data-target') || toggle.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];

                if (!targetId) return;

                const menu = document.getElementById(targetId);
                if (!menu) return;

                // Fechar outros
                document.querySelectorAll('.submenu-content.show').forEach(m => {
                    if (m.id !== targetId) m.classList.remove('show');
                });

                document.querySelectorAll('.submenu-toggle.active').forEach(b => {
                    if (b !== toggle) b.classList.remove('active');
                });

                // Alternar atual
                toggle.classList.toggle('active');
                menu.classList.toggle('show');
                return;
            }

            // Fechar ao clicar fora
            if (!e.target.closest('.submenu-container')) {
                document.querySelectorAll('.submenu-toggle').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.submenu-content').forEach(m => m.classList.remove('show'));
            }
        });
    }

})();

// ═══════════════════════════════════════════════════════════════════════════
// LOGOUT - Global Event Delegation for Dynamically Loaded Sidebar
// ═══════════════════════════════════════════════════════════════════════════
// This is OUTSIDE the IIFE to ensure it's registered globally and immediately
// Works regardless of when sidebar.html is loaded

document.addEventListener("click", function (e) {

    // ✅ Open logout modal when clicking logout button
    if (e.target.closest("#btn-logout")) {
        e.preventDefault();
        e.stopPropagation();

        const modal = document.getElementById("modalLogout");
        if (modal) {
            modal.classList.add("show");
            console.log('[Logout] Modal aberto');
        } else {
            console.warn('[Logout] ⚠️ Modal não encontrado no DOM');
        }
    }

    // ✅ Cancel logout - close modal
    if (e.target.closest("#cancelLogout")) {
        e.preventDefault();

        const modal = document.getElementById("modalLogout");
        if (modal) {
            modal.classList.remove("show");
            console.log('[Logout] Modal fechado (cancelado)');
        }
    }

    // ✅ Confirm logout - execute SessionManagerCore.logout()
    if (e.target.closest("#confirmLogout")) {
        e.preventDefault();

        const confirmBtn = document.getElementById("confirmLogout");
        if (confirmBtn) {
            confirmBtn.innerText = "Encerrando...";
            confirmBtn.disabled = true;
        }

        console.log('[Logout] 🚪 Executando logout via SessionManagerCore...');

        // Call centralized logout
        const sessionManager = SessionManagerCore.getInstance();
        sessionManager.logout();
    }

    // ✅ Close modal when clicking outside (on overlay)
    if (e.target.id === "modalLogout") {
        const modal = document.getElementById("modalLogout");
        if (modal) {
            modal.classList.remove("show");
            console.log('[Logout] Modal fechado (clique fora)');
        }
    }

});

console.log('[Logout] ✅ Delegação global de eventos configurada para logout');


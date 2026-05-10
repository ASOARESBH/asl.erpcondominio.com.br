/**
 * Componente <app-user-menu>
 * UI 100% Passiva: Reage exclusivamente ao SessionManagerCore v3.0.
 *
 * ATUALIZADO v3.0 (2026-05-10):
 *   • Exibe nome do usuário logado e unidade (portal do morador)
 *   • Countdown em tempo real (via evento countdownTick do SessionManager)
 *   • Aviso visual (vermelho) quando restam ≤ 5 minutos
 *   • Fallback: lê dados do localStorage se SessionManager não estiver pronto
 */

class AppUserMenu extends HTMLElement {
    constructor() {
        super();
        this.unsubscribeFunctions = [];
        this.sessionManager = null;
        this.ui = {
            avatar: null, name: null, subinfo: null,
            countdown: null, dropdown: null,
            toggleBtn: null, perfilBtn: null, logoutBtn: null,
        };
    }

    connectedCallback() {
        this.renderTemplate();
        this.bindUiElements();
        this.setupEventListeners();
        this.initSessionIntegration();
    }

    disconnectedCallback() {
        this.unsubscribeFunctions.forEach(unsub => unsub());
        this.unsubscribeFunctions = [];
    }

    renderTemplate() {
        this.innerHTML = `
            <div class="app-user-menu-container">
                <div class="user-avatar" title="Perfil">?</div>
                <div class="user-info">
                    <span class="user-name">Carregando...</span>
                    <span class="user-subinfo"></span>
                    <span class="session-countdown" title="Tempo restante na sessão"></span>
                </div>
                <div class="user-dropdown">
                    <button class="menu-toggle" aria-label="Abrir menu do usuário" title="Opções">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="dropdown-menu">
                        <button data-action="perfil">
                            <i class="fas fa-user-circle"></i> Meu Perfil
                        </button>
                        <div class="divider"></div>
                        <button data-action="logout" class="logout-btn">
                            <i class="fas fa-sign-out-alt"></i> Sair do Sistema
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    bindUiElements() {
        this.ui.avatar    = this.querySelector('.user-avatar');
        this.ui.name      = this.querySelector('.user-name');
        this.ui.subinfo   = this.querySelector('.user-subinfo');
        this.ui.countdown = this.querySelector('.session-countdown');
        this.ui.dropdown  = this.querySelector('.dropdown-menu');
        this.ui.toggleBtn = this.querySelector('.menu-toggle');
        this.ui.perfilBtn = this.querySelector('[data-action="perfil"]');
        this.ui.logoutBtn = this.querySelector('[data-action="logout"]');
    }

    setupEventListeners() {
        if (this.ui.toggleBtn) {
            this.ui.toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }
        document.addEventListener('click', (e) => {
            if (this.ui.dropdown && this.ui.dropdown.classList.contains('active')) {
                if (!this.contains(e.target)) this.closeDropdown();
            }
        });
        if (this.ui.perfilBtn) {
            this.ui.perfilBtn.addEventListener('click', () => {
                if (window.AppRouter && typeof window.AppRouter.loadPage === 'function') {
                    window.AppRouter.loadPage('configuracao');
                } else {
                    window.location.href = 'layout-base.html?page=configuracao';
                }
                this.closeDropdown();
            });
        }
        if (this.ui.logoutBtn) {
            this.ui.logoutBtn.addEventListener('click', () => {
                if (this.sessionManager) this.sessionManager.logout();
                this.closeDropdown();
            });
        }
    }

    toggleDropdown() {
        if (this.ui.dropdown) {
            this.ui.dropdown.classList.toggle('active');
            const icon = this.ui.toggleBtn ? this.ui.toggleBtn.querySelector('i') : null;
            if (icon) {
                if (this.ui.dropdown.classList.contains('active')) {
                    icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
                } else {
                    icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
                }
            }
        }
    }

    closeDropdown() {
        if (this.ui.dropdown) {
            this.ui.dropdown.classList.remove('active');
            const icon = this.ui.toggleBtn ? this.ui.toggleBtn.querySelector('i') : null;
            if (icon) icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
        }
    }

    async initSessionIntegration() {
        if (typeof window.SessionManagerCore === 'undefined') {
            console.warn('[AppUserMenu] ⚠️ SessionManagerCore não encontrado.');
            this._carregarDadosLocalStorage();
            return;
        }

        this.sessionManager = SessionManagerCore.getInstance();

        try {
            if (this.sessionManager.initializationPromise) {
                await this.sessionManager.initializationPromise;
            }

            if (this.sessionManager.isLoggedIn()) {
                this.updateUI(this.sessionManager.getUser(), this.sessionManager.getSessionExpireTime());
            } else {
                this._carregarDadosLocalStorage();
            }

            // Ouvir mudanças completas (verificação com API)
            const unsubData = this.sessionManager.on('userDataChanged', (dados) => {
                const user   = dados.user || dados.usuario;
                const expire = dados.expireTime || dados.tempo_restante;
                this.updateUI(user, expire);
            });

            // Ouvir tick do countdown (a cada segundo — sem fetch)
            const unsubTick = this.sessionManager.on('countdownTick', (dados) => {
                this.updateCountdown(dados.segundos, dados.aviso);
            });

            // Ouvir renovação
            const unsubRenew = this.sessionManager.on('sessionRenewed', (dados) => {
                const user   = dados.user || dados.usuario || this.sessionManager.getUser();
                const expire = dados.expireTime || dados.tempo_restante;
                this.updateUI(user, expire);
            });

            if (unsubData)  this.unsubscribeFunctions.push(unsubData);
            if (unsubTick)  this.unsubscribeFunctions.push(unsubTick);
            if (unsubRenew) this.unsubscribeFunctions.push(unsubRenew);

        } catch (err) {
            console.error('[AppUserMenu] ❌ Erro ao integrar com SessionManager:', err);
            this._carregarDadosLocalStorage();
        }
    }

    _carregarDadosLocalStorage() {
        try {
            const nome    = localStorage.getItem('morador_nome')    || localStorage.getItem('usuario_nome') || '';
            const unidade = localStorage.getItem('morador_unidade') || '';
            if (nome) this.updateUI({ nome, unidade }, null);
        } catch (e) {}
    }

    updateUI(userData, expireTimeSeconds) {
        if (!userData) return;

        const nomeCompleto = userData.nome || 'Usuário';
        const unidade      = userData.unidade || userData.departamento || userData.funcao || '';

        // Nome
        if (this.ui.name) {
            this.ui.name.textContent = nomeCompleto;
            this.ui.name.title       = nomeCompleto;
        }

        // Subinfo (unidade ou cargo)
        if (this.ui.subinfo) {
            if (unidade) {
                this.ui.subinfo.textContent  = 'Unidade ' + unidade;
                this.ui.subinfo.style.display = 'block';
            } else {
                this.ui.subinfo.textContent  = '';
                this.ui.subinfo.style.display = 'none';
            }
        }

        // Avatar com iniciais
        const partes    = nomeCompleto.trim().split(' ');
        const primeiro  = partes[0] || '';
        const sobrenome = partes.length > 1 ? partes[partes.length - 1] : '';
        const iniciais  = (primeiro.charAt(0) + (sobrenome.charAt(0) || '')).toUpperCase();
        if (this.ui.avatar) this.ui.avatar.textContent = iniciais || 'U';

        // Countdown
        if (expireTimeSeconds !== undefined && expireTimeSeconds !== null) {
            this.updateCountdown(expireTimeSeconds, expireTimeSeconds <= 300);
        }

        // Compatibilidade legada
        const legacyName = document.querySelector('#topUserName');
        if (legacyName) legacyName.textContent = nomeCompleto;

        const legacyCountdown = document.querySelector('#sessionCountdown');
        if (legacyCountdown && expireTimeSeconds) {
            legacyCountdown.textContent = '(' + Math.floor(expireTimeSeconds / 60) + 'm rest)';
        }
    }

    updateCountdown(segundos, isAviso) {
        if (!this.ui.countdown) return;
        if (segundos === null || segundos === undefined) {
            this.ui.countdown.textContent = '';
            return;
        }
        const mm     = Math.floor(segundos / 60);
        const ss     = segundos % 60;
        const fmt    = String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
        this.ui.countdown.textContent = '⏱ ' + fmt;
        this.ui.countdown.title       = 'Sessão expira em ' + fmt;
        if (isAviso || segundos <= 300) {
            this.ui.countdown.classList.add('warning');
        } else {
            this.ui.countdown.classList.remove('warning');
        }
    }
}

customElements.define('app-user-menu', AppUserMenu);

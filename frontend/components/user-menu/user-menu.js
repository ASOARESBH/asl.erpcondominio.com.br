/**
 * Componente <app-user-menu>
 * UI 100% Passiva: Reage exclusivamente ao SessionManagerCore.
 * Nenhuma requisição de API; Nenhum id global atrelado; Sem polling.
 */

class AppUserMenu extends HTMLElement {
    constructor() {
        super();
        this.unsubscribeFunctions = [];
        this.sessionManager = null;

        // Elementos internos da UI
        this.ui = {
            avatar: null,
            name: null,
            countdown: null,
            dropdown: null,
            toggleBtn: null,
            perfilBtn: null,
            logoutBtn: null
        };
    }

    connectedCallback() {
        this.renderTemplate();
        this.bindUiElements();
        this.setupEventListeners();

        // Inicializar com estado estritamente via sessionManager
        this.initSessionIntegration();
    }

    disconnectedCallback() {
        // Limpar listeners do SessionManager
        this.unsubscribeFunctions.forEach(unsub => unsub());
        this.unsubscribeFunctions = [];
    }

    renderTemplate() {
        // Utiliza classes isoladas, sem IDs prementes duplicados.
        this.innerHTML = `
            <div class="app-user-menu-container">
                <div class="user-avatar" title="Perfil">U</div>
                
                <div class="user-info">
                    <span class="user-name">Carregando...</span>
                    <!-- Opcional tooltip/title com session info -->
                    <span class="session-countdown" title="Tempo restante na sessão"></span>
                </div>

                <div class="user-dropdown">
                    <button class="menu-toggle" aria-label="Abrir menu do usuário" title="Opções">
                        <i class="fas fa-chevron-down"></i>
                    </button>

                    <div class="dropdown-menu">
                        <!-- Botões com data-action, listeners controlados no JS -->
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
        this.ui.avatar = this.querySelector('.user-avatar');
        this.ui.name = this.querySelector('.user-name');
        this.ui.countdown = this.querySelector('.session-countdown');
        this.ui.dropdown = this.querySelector('.dropdown-menu');
        this.ui.toggleBtn = this.querySelector('.menu-toggle');
        this.ui.perfilBtn = this.querySelector('[data-action="perfil"]');
        this.ui.logoutBtn = this.querySelector('[data-action="logout"]');
    }

    setupEventListeners() {
        // Dropdown toggle
        if (this.ui.toggleBtn) {
            this.ui.toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (this.ui.dropdown && this.ui.dropdown.classList.contains('active')) {
                if (!this.contains(e.target)) {
                    this.closeDropdown();
                }
            }
        });

        // Ações dos botões
        if (this.ui.perfilBtn) {
            this.ui.perfilBtn.addEventListener('click', () => {
                // Navegar para configurações / perfil (usando o AppRouter global ou loc.href base)
                if (window.AppRouter && typeof window.AppRouter.loadPage === 'function') {
                    // Layout base SPA
                    window.AppRouter.loadPage('configuracao');
                } else {
                    window.location.href = 'layout-base.html?page=configuracao';
                }
                this.closeDropdown();
            });
        }

        if (this.ui.logoutBtn) {
            this.ui.logoutBtn.addEventListener('click', () => {
                if (this.sessionManager) {
                    this.sessionManager.logout(); // Delega a ação para o centralizador
                }
                this.closeDropdown();
            });
        }
    }

    toggleDropdown() {
        if (this.ui.dropdown) {
            this.ui.dropdown.classList.toggle('active');
            const icon = this.ui.toggleBtn.querySelector('i');
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
            const icon = this.ui.toggleBtn.querySelector('i');
            if (icon) {
                icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
            }
        }
    }

    /**
     * INTEGRAÇÃO PASSIVA (SessionManagerCore)
     */
    async initSessionIntegration() {
        if (typeof window.SessionManagerCore === 'undefined') {
            console.warn('[AppUserMenu] ⚠️ SessionManagerCore não encontrado no escopo global.');
            return;
        }

        this.sessionManager = SessionManagerCore.getInstance();

        try {
            // Aguardar manager terminar bootstrap incial sem fazer novo fetch()
            if (this.sessionManager.initializationPromise) {
                await this.sessionManager.initializationPromise;
            }

            // Povoar UI inicialmente (GETS síncronos da memória local mantida pelo Manager)
            if (this.sessionManager.isLoggedIn()) {
                const currentUser = this.sessionManager.getUser();
                const expireTime = this.sessionManager.getSessionExpireTime();
                this.updateUI(currentUser, expireTime);
            }

            // Registrar os observers passivos
            const unsubData = this.sessionManager.on('userDataChanged', (dados) => {
                const user = dados.user || dados.usuario;
                const expire = dados.expireTime || dados.tempo_restante;
                this.updateUI(user, expire);
            });

            const unsubRenew = this.sessionManager.on('sessionRenewed', (dados) => {
                const user = dados.user || dados.usuario || this.sessionManager.getUser();
                const expire = dados.expireTime || dados.tempo_restante;
                this.updateUI(user, expire);
            });

            // Adicionar os unsubs na lista para eventuais desconexões do componente
            if (unsubData) this.unsubscribeFunctions.push(unsubData);
            if (unsubRenew) this.unsubscribeFunctions.push(unsubRenew);

        } catch (err) {
            console.error('[AppUserMenu] ❌ Erro ao integrar com SessionManager:', err);
        }
    }

    /**
     * Renderiza e reage aos dados recebidos em memória.
     * Calcula as iniciais e converte o tempo cru.
     */
    updateUI(userData, expireTimeSeconds) {
        if (!userData) return;

        const nomeCompleto = userData.nome || 'Usuário';

        // 1. Atualizar visuais do nome da UI restrita
        if (this.ui.name) {
            this.ui.name.textContent = nomeCompleto;
            this.ui.name.title = nomeCompleto;
        }

        // 2. Extrair iniciais do Avatar
        const partesNome = nomeCompleto.trim().split(' ');
        const primeiroNome = partesNome[0] || '';
        const sobrenome = partesNome.length > 1 ? partesNome[partesNome.length - 1] : '';
        const iniciais = (primeiroNome.charAt(0) + (sobrenome.charAt(0) || '')).toUpperCase();

        if (this.ui.avatar) {
            this.ui.avatar.textContent = iniciais || 'U';
        }

        // 3. Atualizar o Display Temporal (Passivo: não usa SetInterval)
        // Como a instrução era "eliminar qualquer setInterval do frontend local e reagir ao estado",
        // exibimos o último tempo_restante exato que o backend/Session informou na notificação do event listener.
        if (this.ui.countdown && expireTimeSeconds !== undefined && expireTimeSeconds !== null) {
            const minutos = Math.floor(expireTimeSeconds / 60);
            const segundos = expireTimeSeconds % 60;
            const formato = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;

            this.ui.countdown.textContent = `Sessão ~ ${formato}`;

            // Aviso de tempo crítico (menos de 5 min)
            if (expireTimeSeconds <= 300) {
                this.ui.countdown.classList.add('warning');
            } else {
                this.ui.countdown.classList.remove('warning');
            }
        }

        // 4. CAMADA DE COMPATIBILIDADE (Legado - preenche DOM antigo se existir na tela paralela)
        // "Para evitar quebra de scripts antigos que procurem por #topUserName"
        const legacyName = document.querySelector("#topUserName");
        if (legacyName) {
            legacyName.textContent = nomeCompleto;
        }

        // Embora sessionManager deva lidar com timeouts em background, 
        // caso existam scripts legacy esperando a div "sessionCountdown" e lendo `.innerText`...
        const legacyCountdown = document.querySelector("#sessionCountdown");
        if (legacyCountdown && expireTimeSeconds) {
            // Nota: este DOM ficará travado no último state emitido pelo userDataChanged, 
            // cumprindo a ordem de UI puramente passiva.
            legacyCountdown.textContent = `(${Math.floor(expireTimeSeconds / 60)}m rest)`;
        }
    }
}

// Registro global do Custom Element
customElements.define('app-user-menu', AppUserMenu);

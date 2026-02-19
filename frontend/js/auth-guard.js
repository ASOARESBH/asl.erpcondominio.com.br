/**
 * Auth Guard
 * Protege páginas que requerem autenticação
 */
(function () {
    'use strict';

    // Não verificar na página de login ou recuperação de senha
    const publicPages = ['login.html', 'esqueci_senha.html', 'redefinir_senha.html', 'index.html'];
    const path = window.location.pathname;
    const pageObj = path.split('/').pop();

    // Se for página pública, não fazer nada (exceto se for login e já estiver logado?)
    if (publicPages.includes(pageObj) || pageObj === '') {
        return;
    }

    const API_URL = '../api/verificar_sessao_completa.php';

    // Verificar sessão
    fetch(API_URL, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
    })
        .then(response => response.json())
        .then(data => {
            if (!data.sucesso || !data.sessao_ativa) {
                console.warn('⛔ Acesso negado. Redirecionando para login...');
                localStorage.clear(); // Limpar cache
                sessionStorage.clear(); // Limpar cache
                window.location.replace('login.html'); // Usar replace, não href
            } else {
                console.log('✅ Acesso autorizado');
            }
        })
        .catch(error => {
            console.error('Erro ao verificar autenticação:', error);
            // Em caso de erro de rede, talvez não redirecionar imediatamente? 
            // Mas por segurança, melhor redirecionar ou mostrar erro.
        });
})();

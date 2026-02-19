/**
 * Controle de Acesso Page Module
 */

const API_RFID = '../api/api_rfid.php';

let autoRefreshInterval = null;
let focusInterval = null;
let acessosCache = [];
let termoFiltroLocal = '';
let audioCtx = null;

export function init() {
    console.log('[Acesso] Inicializando...');

    setupForm();
    setupActions();

    verificarStatusRFID();
    carregarUltimosAcessos();
    iniciarAutoRefresh();
    iniciarFocusAssistido();
    prepararAudioContext();
}

export function destroy() {
    console.log('[Acesso] Limpando...');

    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    if (focusInterval) clearInterval(focusInterval);

    autoRefreshInterval = null;
    focusInterval = null;
    acessosCache = [];
}

function setupForm() {
    const form = document.getElementById('acessoForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await verificarAcesso();
    });

    const input = document.getElementById('entradaAcesso');
    if (input) {
        input.addEventListener('input', () => {
            input.value = input.value.toUpperCase().trim();
        });
    }
}

function setupActions() {
    const btnAtualizar = document.getElementById('btnAtualizarAcessos');
    if (btnAtualizar) {
        btnAtualizar.addEventListener('click', carregarUltimosAcessos);
    }

    const autoRefresh = document.getElementById('autoRefreshAcesso');
    if (autoRefresh) {
        autoRefresh.addEventListener('change', () => {
            if (autoRefresh.checked) {
                iniciarAutoRefresh();
            } else if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        });
    }

    const filtroLocal = document.getElementById('filtroAcessosLocal');
    if (filtroLocal) {
        filtroLocal.addEventListener('input', () => {
            termoFiltroLocal = filtroLocal.value || '';
            aplicarFiltroTabela();
        });
    }
}

function iniciarAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);

    const autoRefresh = document.getElementById('autoRefreshAcesso');
    if (!autoRefresh || !autoRefresh.checked) return;

    autoRefreshInterval = setInterval(() => {
        carregarUltimosAcessos();
    }, 5000);
}

function iniciarFocusAssistido() {
    const input = document.getElementById('entradaAcesso');
    if (!input) return;

    if (focusInterval) clearInterval(focusInterval);
    focusInterval = setInterval(() => {
        if (document.activeElement !== input) {
            input.focus();
        }
    }, 2000);
}

async function verificarStatusRFID() {
    const statusDiv = document.getElementById('rfidStatus');
    if (!statusDiv) return;

    try {
        const response = await fetch(`${API_RFID}?acao=testar_conexao`);
        const data = await response.json();

        if (data.sucesso) {
            statusDiv.className = 'rfid-status rfid-online';
            statusDiv.innerHTML = '<i class="fas fa-wifi"></i> RFID Control iD iDUHF: online';
        } else {
            statusDiv.className = 'rfid-status rfid-offline';
            statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> RFID offline ou nao configurado';
        }
    } catch (error) {
        statusDiv.className = 'rfid-status rfid-offline';
        statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro ao verificar RFID';
        console.error('[Acesso] Erro status RFID:', error);
    }
}

async function verificarAcesso() {
    const input = document.getElementById('entradaAcesso');
    const btn = document.getElementById('btnValidarAcesso');
    if (!input || !btn) return;

    const entrada = input.value.trim().toUpperCase();
    if (!entrada) return;

    btn.disabled = true;
    limparFeedback();

    try {
        const response = await fetch(`${API_RFID}?acao=verificar_tag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: entrada })
        });

        const data = await response.json();

        if (data.sucesso && data?.dados?.liberado) {
            mostrarMensagem('success', data.dados.mensagem || 'Acesso liberado');
            mostrarInfoAcesso(data.dados);
            tocarSom('success');

            setTimeout(() => {
                carregarUltimosAcessos();
            }, 800);
        } else {
            const mensagem = data?.dados?.mensagem || data?.mensagem || 'Acesso negado';
            mostrarMensagem('error', mensagem);
            tocarSom('error');
        }

        setTimeout(() => {
            input.value = '';
            input.focus();
        }, 2500);
    } catch (error) {
        console.error('[Acesso] Erro ao verificar acesso:', error);
        mostrarMensagem('error', 'Erro de comunicacao ao verificar acesso');
        tocarSom('error');
    } finally {
        btn.disabled = false;
    }
}

function mostrarMensagem(tipo, mensagem) {
    const box = document.getElementById('mensagemAcesso');
    if (!box) return;

    const classe = tipo === 'success' ? 'mensagem-sucesso' : 'mensagem-erro';
    const icone = tipo === 'success' ? 'fa-check-circle' : 'fa-times-circle';

    box.className = `mensagem-box ${classe}`;
    box.innerHTML = `<i class="fas ${icone}"></i> ${escapeHtml(mensagem)}`;
    box.style.display = 'block';
}

function mostrarInfoAcesso(dados) {
    const box = document.getElementById('infoAcesso');
    if (!box) return;

    const morador = escapeHtml(dados.morador || '-');
    const dependente = escapeHtml(dados.dependente || '');
    const unidade = escapeHtml(dados.unidade || '-');
    const placa = escapeHtml(dados.placa || '-');
    const modelo = escapeHtml(dados.modelo || '-');
    const tipo = escapeHtml(dados.tipo || '-');

    let extra = '';
    if (tipo.toLowerCase() === 'dependente' && dependente) {
        extra = `<p><strong>Dependente:</strong> ${dependente}</p>`;
    }

    box.innerHTML = `
        <p><strong>Tipo:</strong> ${tipo}</p>
        <p><strong>Morador:</strong> ${morador}</p>
        ${extra}
        <p><strong>Unidade:</strong> ${unidade}</p>
        <p><strong>Placa:</strong> ${placa}</p>
        <p><strong>Modelo:</strong> ${modelo}</p>
    `;

    box.style.display = 'block';
}

function limparFeedback() {
    const mensagem = document.getElementById('mensagemAcesso');
    const info = document.getElementById('infoAcesso');

    if (mensagem) {
        mensagem.style.display = 'none';
        mensagem.innerHTML = '';
        mensagem.className = 'mensagem-box';
    }

    if (info) {
        info.style.display = 'none';
        info.innerHTML = '';
    }
}

async function carregarUltimosAcessos() {
    const tbody = document.querySelector('#tabelaAcessos tbody');
    const loading = document.getElementById('loadingAcessos');
    if (!tbody || !loading) return;

    loading.style.display = 'block';

    try {
        const response = await fetch(`${API_RFID}?acao=ultimos_acessos&limite=20`);
        const data = await response.json();

        if (!data.sucesso) {
            renderMensagemTabela('Erro ao carregar acessos recentes.');
            return;
        }

        acessosCache = Array.isArray(data.dados) ? data.dados : [];
        aplicarFiltroTabela();
    } catch (error) {
        console.error('[Acesso] Erro ao carregar ultimos acessos:', error);
        renderMensagemTabela('Erro de conexao ao carregar acessos.');
    } finally {
        loading.style.display = 'none';
    }
}

function aplicarFiltroTabela() {
    const termo = String(termoFiltroLocal || '').toLowerCase().trim();

    if (!termo) {
        renderTabela(acessosCache);
        return;
    }

    const filtrados = acessosCache.filter((a) => {
        const data = String(a.data || '').toLowerCase();
        const hora = String(a.hora || '').toLowerCase();
        const placa = String(a.placa || '').toLowerCase();
        const modelo = String(a.modelo || '').toLowerCase();
        const unidade = String(a.unidade || '').toLowerCase();
        const morador = String(a.morador || '').toLowerCase();
        const status = String(a.status || '').toLowerCase();

        return (
            data.includes(termo) ||
            hora.includes(termo) ||
            placa.includes(termo) ||
            modelo.includes(termo) ||
            unidade.includes(termo) ||
            morador.includes(termo) ||
            status.includes(termo)
        );
    });

    renderTabela(filtrados);
}

function renderTabela(acessos) {
    const tbody = document.querySelector('#tabelaAcessos tbody');
    if (!tbody) return;

    if (!acessos || acessos.length === 0) {
        renderMensagemTabela('Nenhum acesso registrado.');
        return;
    }

    tbody.innerHTML = acessos.map((a) => {
        const data = escapeHtml(a.data || '-');
        const hora = escapeHtml(a.hora || '-');
        const placa = escapeHtml(a.placa || '-');
        const modelo = escapeHtml(a.modelo || '-');
        const unidade = escapeHtml(a.unidade || '-');
        const morador = escapeHtml(a.morador || '-');
        const status = escapeHtml(a.status || '-');
        const statusClass = classificarStatus(a.status, a.liberado);

        return `
            <tr>
                <td>${data}</td>
                <td><strong>${hora}</strong></td>
                <td><span class="plate-badge">${placa}</span></td>
                <td>${modelo}</td>
                <td>${unidade}</td>
                <td>${morador}</td>
                <td><span class="status-pill ${statusClass}">${status}</span></td>
            </tr>
        `;
    }).join('');
}

function renderMensagemTabela(mensagem) {
    const tbody = document.querySelector('#tabelaAcessos tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(mensagem)}</td></tr>`;
}

function classificarStatus(status, liberado) {
    const s = String(status || '').toLowerCase();
    if (liberado === 1 || s.includes('liberado') || s.includes('permitido')) return 'status-ok';
    if (s.includes('negado') || s.includes('erro')) return 'status-deny';
    return 'status-warn';
}

function somHabilitado() {
    const checkbox = document.getElementById('habilitarSomAcesso');
    return !!checkbox && checkbox.checked;
}

function prepararAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ativar = () => {
        if (!audioCtx) {
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        document.removeEventListener('pointerdown', ativar);
        document.removeEventListener('keydown', ativar);
    };

    document.addEventListener('pointerdown', ativar);
    document.addEventListener('keydown', ativar);
}

function tocarSom(tipo) {
    if (!somHabilitado()) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }

    if (tipo === 'success') {
        tocarBeep(820, 0.08, 0);
        tocarBeep(1080, 0.1, 0.1);
    } else {
        tocarBeep(320, 0.12, 0);
        tocarBeep(240, 0.16, 0.14);
    }
}

function tocarBeep(freq, duracao, atraso = 0) {
    if (!audioCtx) return;

    const inicio = audioCtx.currentTime + atraso;
    const fim = inicio + duracao;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, inicio);

    gain.gain.setValueAtTime(0.0001, inicio);
    gain.gain.exponentialRampToValueAtTime(0.1, inicio + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, fim);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(inicio);
    osc.stop(fim);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

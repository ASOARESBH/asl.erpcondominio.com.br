/**
 * Visitantes Page Module v2
 * Suporte: RG/CPF com máscara, foto, documento, unidade/morador, placa
 */

const API_ACESSOS    = '../api/api_acessos_visitantes.php';
const API_VISITANTES = '../api/api_visitantes.php';
const API_MORADORES  = '../api/api_moradores.php';
const API_UNIDADES   = '../api/api_unidades.php';

let acessosCache  = [];
let modoEdicao    = false;
let visitanteIdEdicao = null;
let fotoArquivo   = null;
let docArquivo    = null;
let salvando      = false;

export function init() {
    console.log('[Visitantes] Inicializando v2...');
    _setupMascaras();
    _setupForm();
    _setupBusca();
    _setupActions();
    _setupUploads();
    _setupCascataUnidadeMorador();
    _resetForm();
    _carregarAcessos();

    window.VisitantesPage = {
        buscar:         _buscarVisitantes,
        editar:         _editarAcesso,
        excluir:        _excluirAcesso,
        cancelarEdicao: _resetForm,
        verFoto:        _verFoto,
        verDoc:         _verDoc
    };
    console.log('[Visitantes] Módulo pronto.');
}

export function destroy() {
    console.log('[Visitantes] Limpando...');
    delete window.VisitantesPage;
    acessosCache = [];
    modoEdicao = false;
    visitanteIdEdicao = null;
    fotoArquivo = null;
    docArquivo  = null;
    salvando    = false;
}

// ===== MÁSCARAS =====
function _setupMascaras() {
    const tipoDoc = document.getElementById('tipoDocumento');
    const docInput = document.getElementById('documento');
    if (tipoDoc && docInput) {
        tipoDoc.addEventListener('change', () => {
            docInput.value = '';
            _aplicarMascaraDoc(docInput, tipoDoc.value);
        });
        docInput.addEventListener('input', () => {
            _aplicarMascaraDoc(docInput, tipoDoc?.value || 'CPF');
        });
    }

    // Máscara telefone
    ['telefoneContato', 'celularVisitante'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => _mascaraTelefone(el));
    });

    // Máscara placa
    ['placaVeiculo', 'placaAcessoVisitante'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => _mascaraPlaca(el));
    });
}

function _aplicarMascaraDoc(input, tipo) {
    let v = input.value.replace(/\D/g, '');
    if (tipo === 'CPF') {
        v = v.slice(0, 11);
        if (v.length > 9)      v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    } else {
        // RG: formato XX.XXX.XXX-X (SP) ou livre
        v = v.slice(0, 9);
        if (v.length > 8)      v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1})/, '$1.$2.$3-$4');
        else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
    }
    input.value = v;
}

function _mascaraTelefone(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    else if (v.length > 6) v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    input.value = v;
}

function _mascaraPlaca(input) {
    let v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3);
    input.value = v;
}

// ===== CASCATA UNIDADE → MORADOR =====
function _setupCascataUnidadeMorador() {
    const selUnidade = document.getElementById('unidadeVisitada');
    if (!selUnidade) return;

    // Carregar unidades
    fetch(API_UNIDADES)
        .then(r => r.json())
        .then(data => {
            const unidades = data.dados?.itens || data.dados || [];
            selUnidade.innerHTML = '<option value="">Selecione a unidade...</option>';
            unidades.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.nome || u.unidade || u.id;
                opt.textContent = u.nome || u.unidade || u.id;
                selUnidade.appendChild(opt);
            });
        })
        .catch(() => {
            // Fallback: deixar o select livre para digitação
            console.warn('[Visitantes] Não foi possível carregar unidades');
        });

    selUnidade.addEventListener('change', () => {
        const unidade = selUnidade.value;
        const selMorador = document.getElementById('moradorVisitado');
        if (!selMorador) return;

        if (!unidade) {
            selMorador.innerHTML = '<option value="">Selecione a unidade primeiro</option>';
            selMorador.disabled = true;
            return;
        }

        selMorador.innerHTML = '<option value="">Carregando...</option>';
        selMorador.disabled = true;

        fetch(`${API_MORADORES}?unidade=${encodeURIComponent(unidade)}&ativo=1&por_pagina=0`)
            .then(r => r.json())
            .then(data => {
                const moradores = data.dados?.itens || data.dados || [];
                selMorador.innerHTML = '<option value="">Selecione o morador...</option>';
                moradores.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.nome_completo || m.nome;
                    selMorador.appendChild(opt);
                });
                selMorador.disabled = moradores.length === 0;
                if (moradores.length === 0) {
                    selMorador.innerHTML = '<option value="">Nenhum morador nesta unidade</option>';
                }
            })
            .catch(() => {
                selMorador.innerHTML = '<option value="">Erro ao carregar moradores</option>';
                selMorador.disabled = true;
            });
    });
}

// ===== UPLOADS =====
function _setupUploads() {
    // Foto
    const btnFoto   = document.getElementById('btnSelecionarFoto');
    const fotoInput = document.getElementById('fotoInput');
    const btnRemFoto = document.getElementById('btnRemoverFoto');

    if (btnFoto && fotoInput) {
        btnFoto.addEventListener('click', () => fotoInput.click());
        fotoInput.addEventListener('change', () => {
            const file = fotoInput.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                _mostrarAlerta('error', 'Foto muito grande. Máximo: 5MB');
                fotoInput.value = '';
                return;
            }
            fotoArquivo = file;
            const reader = new FileReader();
            reader.onload = e => {
                const img = document.getElementById('fotoPreview');
                const ph  = document.getElementById('fotoPlaceholder');
                img.src = e.target.result;
                img.style.display = 'block';
                if (ph) ph.style.display = 'none';
                if (btnRemFoto) btnRemFoto.style.display = 'inline-flex';
            };
            reader.readAsDataURL(file);
        });
    }
    if (btnRemFoto) {
        btnRemFoto.addEventListener('click', () => {
            fotoArquivo = null;
            if (fotoInput) { fotoInput.value = ''; }
            const img = document.getElementById('fotoPreview');
            const ph  = document.getElementById('fotoPlaceholder');
            if (img) { img.src = ''; img.style.display = 'none'; }
            if (ph)  ph.style.display = 'flex';
            btnRemFoto.style.display = 'none';
        });
    }

    // Documento
    const btnDoc   = document.getElementById('btnSelecionarDoc');
    const docInput = document.getElementById('docInput');
    const btnRemDoc = document.getElementById('btnRemoverDoc');

    if (btnDoc && docInput) {
        btnDoc.addEventListener('click', () => docInput.click());
        docInput.addEventListener('change', () => {
            const file = docInput.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                _mostrarAlerta('error', 'Documento muito grande. Máximo: 5MB');
                docInput.value = '';
                return;
            }
            docArquivo = file;
            const preview = document.getElementById('docPreview');
            const ph      = document.getElementById('docPlaceholder');
            const nome    = document.getElementById('docNomeArquivo');
            if (preview) preview.style.display = 'block';
            if (ph)      ph.style.display = 'none';
            if (nome)    nome.textContent = file.name;
            if (btnRemDoc) btnRemDoc.style.display = 'inline-flex';
        });
    }
    if (btnRemDoc) {
        btnRemDoc.addEventListener('click', () => {
            docArquivo = null;
            if (docInput) { docInput.value = ''; }
            const preview = document.getElementById('docPreview');
            const ph      = document.getElementById('docPlaceholder');
            if (preview) preview.style.display = 'none';
            if (ph)      ph.style.display = 'flex';
            btnRemDoc.style.display = 'none';
        });
    }
}

// ===== FORM =====
function _setupForm() {
    const form = document.getElementById('visitanteForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await _salvarVisitante();
    });
}

function _setupBusca() {
    const input = document.getElementById('searchVisitante');
    if (!input) return;
    input.addEventListener('input', () => _filtrarVisitantes(input.value));
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _buscarVisitantes(); }
    });
}

function _setupActions() {
    const btnBuscar   = document.getElementById('btnBuscarVisitante');
    const btnCancelar = document.getElementById('btnCancelarEdicaoVisitante');
    if (btnBuscar)   btnBuscar.addEventListener('click', _buscarVisitantes);
    if (btnCancelar) btnCancelar.addEventListener('click', _resetForm);
}

// ===== CARREGAR ACESSOS =====
async function _carregarAcessos() {
    const tbody = document.querySelector('#tabelaVisitantes tbody');
    _setLoading(true);
    try {
        const response = await fetch(API_ACESSOS);
        const data = await response.json();
        if (!data.sucesso) {
            _renderMensagemTabela(tbody, data.mensagem || 'Erro ao carregar acessos.');
            return;
        }
        acessosCache = Array.isArray(data.dados) ? data.dados : [];
        _renderAcessos(acessosCache);
    } catch (error) {
        console.error('[Visitantes] Erro ao carregar acessos:', error);
        _renderMensagemTabela(tbody, 'Erro de conexão ao carregar dados.');
    } finally {
        _setLoading(false);
    }
}

function _buscarVisitantes() {
    const termo = document.getElementById('searchVisitante')?.value || '';
    _filtrarVisitantes(termo);
}

function _filtrarVisitantes(termo) {
    if (!termo?.trim()) { _renderAcessos(acessosCache); return; }
    const q = termo.toLowerCase().trim();
    const filtrados = acessosCache.filter(a => {
        return (a.visitante_nome || '').toLowerCase().includes(q)
            || String(a.documento || a.visitante_documento || '').toLowerCase().includes(q)
            || (a.unidade_destino || '').toLowerCase().includes(q)
            || (a.placa || '').toLowerCase().includes(q);
    });
    _renderAcessos(filtrados);
}

function _renderAcessos(acessos) {
    const tbody = document.querySelector('#tabelaVisitantes tbody');
    if (!tbody) return;
    if (!acessos?.length) {
        _renderMensagemTabela(tbody, 'Nenhum acesso de visitante encontrado.');
        return;
    }
    tbody.innerHTML = acessos.map(a => {
        const id       = a.id || '-';
        const nome     = _esc(a.visitante_nome || '-');
        const doc      = _esc(a.documento || a.visitante_documento || '-');
        const telefone = _esc(a.telefone_contato || a.telefone || '-');
        const placa    = _esc(a.placa || '-');
        const unidade  = _esc(a.unidade_destino || '-');
        const entrada  = _formatDate(a.data_inicial);
        const saida    = _formatDate(a.data_final);
        const fotoUrl  = a.foto || '';
        const docUrl   = a.documento_arquivo || '';

        const fotoHtml = fotoUrl
            ? `<img src="${_esc(fotoUrl)}" class="foto-thumb" alt="Foto" onclick="window.VisitantesPage.verFoto('${_esc(fotoUrl)}')" style="cursor:pointer">`
            : `<span style="color:#ccc;font-size:18px;"><i class="fas fa-user-circle"></i></span>`;

        const docHtml = docUrl
            ? `<a href="#" class="doc-link" onclick="window.VisitantesPage.verDoc('${_esc(docUrl)}');return false;"><i class="fas fa-file-alt"></i> Ver</a>`
            : '-';

        return `
            <tr>
                <td>${id}</td>
                <td style="text-align:center">${fotoHtml}</td>
                <td><strong>${nome}</strong><br><small style="color:#888">${docHtml}</small></td>
                <td>${doc}</td>
                <td>${telefone}</td>
                <td>${placa}</td>
                <td>${unidade}</td>
                <td>${entrada}</td>
                <td>${saida}</td>
                <td>
                    <button class="action-btn edit" type="button" onclick="window.VisitantesPage.editar(${id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" type="button" onclick="window.VisitantesPage.excluir(${id})" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
}

function _renderMensagemTabela(tbody, msg) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="empty-state">${_esc(msg)}</td></tr>`;
}

// ===== SALVAR =====
async function _salvarVisitante() {
    if (salvando) return;
    salvando = true;
    const btn = document.getElementById('btnSalvarVisitante');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    try {
        const nome            = document.getElementById('nomeVisitante')?.value.trim() || '';
        const tipoDoc         = document.getElementById('tipoDocumento')?.value || 'CPF';
        const documento       = document.getElementById('documento')?.value.trim() || '';
        const telefoneContato = document.getElementById('telefoneContato')?.value.trim() || '';
        const celular         = document.getElementById('celularVisitante')?.value.trim() || '';
        const email           = document.getElementById('emailVisitante')?.value.trim() || '';
        const placaVeiculo    = document.getElementById('placaVeiculo')?.value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'') || '';
        const observacao      = document.getElementById('observacaoVisitante')?.value.trim() || '';
        const dataEntrada     = document.getElementById('dataEntrada')?.value || '';
        const dataSaida       = document.getElementById('dataSaida')?.value || '';
        const unidade         = document.getElementById('unidadeVisitada')?.value || '';
        const moradorId       = document.getElementById('moradorVisitado')?.value || '';
        const placaAcesso     = document.getElementById('placaAcessoVisitante')?.value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'') || '';

        // Validações
        if (!nome)            return _mostrarAlerta('error', 'Nome completo é obrigatório.');
        if (!documento)       return _mostrarAlerta('error', 'Documento é obrigatório.');
        if (!telefoneContato) return _mostrarAlerta('error', 'Telefone de contato é obrigatório.');
        if (!dataEntrada)     return _mostrarAlerta('error', 'Data de entrada é obrigatória.');
        if (!dataSaida)       return _mostrarAlerta('error', 'Data de saída é obrigatória.');
        if (!unidade)         return _mostrarAlerta('error', 'Selecione a unidade visitada.');
        if (!moradorId)       return _mostrarAlerta('error', 'Selecione o morador visitado.');

        if (new Date(dataSaida) < new Date(dataEntrada)) {
            return _mostrarAlerta('error', 'A data de saída não pode ser anterior à data de entrada.');
        }

        // Validar CPF
        if (tipoDoc === 'CPF') {
            const cpfLimpo = documento.replace(/\D/g, '');
            if (cpfLimpo.length !== 11) return _mostrarAlerta('error', 'CPF inválido — deve ter 11 dígitos.');
        }

        const payload = {
            nome_completo: nome,
            documento,
            tipo_documento: tipoDoc,
            telefone_contato: telefoneContato,
            celular,
            email,
            placa_veiculo: placaVeiculo,
            observacao
        };

        let visitanteId = visitanteIdEdicao;
        let method = modoEdicao ? 'PUT' : 'POST';
        if (modoEdicao) payload.id = visitanteIdEdicao;

        // Salvar/atualizar visitante
        const resp = await fetch(API_VISITANTES, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();

        // Se duplicado no POST, usar o ID existente
        if (!data.sucesso && data.dados?.duplicado) {
            visitanteId = data.dados.id;
            console.log(`[Visitantes] Visitante já existe (ID ${visitanteId}), usando cadastro existente.`);
        } else if (!data.sucesso) {
            return _mostrarAlerta('error', data.mensagem || 'Erro ao salvar visitante.');
        } else {
            visitanteId = data.dados?.id || visitanteIdEdicao;
        }

        // Upload de foto (se selecionada)
        if (fotoArquivo && visitanteId) {
            const fd = new FormData();
            fd.append('foto', fotoArquivo);
            await fetch(`${API_VISITANTES}?acao=upload&tipo=foto&visitante_id=${visitanteId}`, {
                method: 'POST',
                body: fd
            });
        }

        // Upload de documento (se selecionado)
        if (docArquivo && visitanteId) {
            const fd = new FormData();
            fd.append('documento', docArquivo);
            await fetch(`${API_VISITANTES}?acao=upload&tipo=documento&visitante_id=${visitanteId}`, {
                method: 'POST',
                body: fd
            });
        }

        // Criar acesso
        const acessoPayload = {
            visitante_id:    visitanteId,
            data_inicial:    dataEntrada.replace('T', ' ') + ':00',
            data_final:      dataSaida.replace('T', ' ') + ':00',
            tipo_acesso:     'portaria',
            unidade_destino: unidade,
            morador_id:      moradorId || null,
            placa:           placaAcesso || placaVeiculo,
            tipo_visitante:  'visitante',
            modelo:          '',
            cor:             ''
        };

        const respAcesso = await fetch(API_ACESSOS, {
            method: modoEdicao ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modoEdicao ? { ...acessoPayload, id: visitanteIdEdicao } : acessoPayload)
        });
        const dataAcesso = await respAcesso.json();

        if (!dataAcesso.sucesso) {
            _mostrarAlerta('warning', `Visitante salvo, mas erro no acesso: ${dataAcesso.mensagem}`);
        } else {
            _mostrarAlerta('success', modoEdicao ? 'Acesso atualizado com sucesso!' : 'Visitante e acesso registrados com sucesso!');
        }

        _resetForm();
        await _carregarAcessos();

    } catch (error) {
        console.error('[Visitantes] Erro ao salvar:', error);
        _mostrarAlerta('error', 'Erro interno ao salvar visitante.');
    } finally {
        salvando = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Visitante'; }
    }
}

// ===== EDITAR =====
function _editarAcesso(id) {
    const acesso = acessosCache.find(a => Number(a.id) === Number(id));
    if (!acesso) return;

    modoEdicao = true;
    visitanteIdEdicao = Number(id);

    document.getElementById('visitanteId').value        = String(id);
    document.getElementById('nomeVisitante').value      = acesso.visitante_nome || '';
    document.getElementById('documento').value          = acesso.documento || acesso.visitante_documento || '';
    document.getElementById('telefoneContato').value    = acesso.telefone_contato || acesso.telefone || '';
    document.getElementById('celularVisitante').value   = acesso.celular || '';
    document.getElementById('emailVisitante').value     = acesso.email || '';
    document.getElementById('placaVeiculo').value       = acesso.placa_veiculo || '';
    document.getElementById('placaAcessoVisitante').value = acesso.placa || '';
    document.getElementById('observacaoVisitante').value = acesso.observacao || '';

    // Datas
    if (acesso.data_inicial) {
        const dt = acesso.data_inicial.replace(' ', 'T').slice(0, 16);
        document.getElementById('dataEntrada').value = dt;
    }
    if (acesso.data_final) {
        const dt = acesso.data_final.replace(' ', 'T').slice(0, 16);
        document.getElementById('dataSaida').value = dt;
    }

    // Foto existente
    if (acesso.foto) {
        const img = document.getElementById('fotoPreview');
        const ph  = document.getElementById('fotoPlaceholder');
        const btnRem = document.getElementById('btnRemoverFoto');
        if (img) { img.src = acesso.foto; img.style.display = 'block'; }
        if (ph)  ph.style.display = 'none';
        if (btnRem) btnRem.style.display = 'inline-flex';
    }

    const titulo = document.getElementById('tituloFormVisitante');
    if (titulo) titulo.innerHTML = '<i class="fas fa-user-edit"></i> Editar Visitante';

    const btnSalvar   = document.getElementById('btnSalvarVisitante');
    const btnCancelar = document.getElementById('btnCancelarEdicaoVisitante');
    if (btnSalvar)   btnSalvar.innerHTML = '<i class="fas fa-sync"></i> Atualizar Acesso';
    if (btnCancelar) btnCancelar.style.display = 'inline-flex';

    document.getElementById('visitanteForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== EXCLUIR =====
async function _excluirAcesso(id) {
    if (!confirm('Deseja realmente excluir este acesso?')) return;
    try {
        const response = await fetch(API_ACESSOS, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id) })
        });
        const data = await response.json();
        if (!data.sucesso) {
            _mostrarAlerta('error', data.mensagem || 'Falha ao excluir acesso.');
            return;
        }
        if (modoEdicao && Number(visitanteIdEdicao) === Number(id)) _resetForm();
        await _carregarAcessos();
    } catch (error) {
        console.error('[Visitantes] Erro ao excluir:', error);
        _mostrarAlerta('error', 'Erro de conexão ao excluir acesso.');
    }
}

// ===== VER FOTO / DOCUMENTO =====
function _verFoto(url) {
    window.open(url, '_blank');
}
function _verDoc(url) {
    window.open(url, '_blank');
}

// ===== RESET FORM =====
function _resetForm() {
    const form = document.getElementById('visitanteForm');
    if (form) form.reset();

    document.getElementById('visitanteId').value = '';
    fotoArquivo = null;
    docArquivo  = null;
    modoEdicao  = false;
    visitanteIdEdicao = null;

    // Reset foto preview
    const img = document.getElementById('fotoPreview');
    const fph = document.getElementById('fotoPlaceholder');
    const btnRemFoto = document.getElementById('btnRemoverFoto');
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (fph) fph.style.display = 'flex';
    if (btnRemFoto) btnRemFoto.style.display = 'none';

    // Reset doc preview
    const docPrev = document.getElementById('docPreview');
    const dph = document.getElementById('docPlaceholder');
    const btnRemDoc = document.getElementById('btnRemoverDoc');
    if (docPrev) docPrev.style.display = 'none';
    if (dph) dph.style.display = 'flex';
    if (btnRemDoc) btnRemDoc.style.display = 'none';

    // Reset morador select
    const selMorador = document.getElementById('moradorVisitado');
    if (selMorador) {
        selMorador.innerHTML = '<option value="">Selecione a unidade primeiro</option>';
        selMorador.disabled = true;
    }

    // Datas padrão
    const agora = new Date();
    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
    const isoNow = agora.toISOString().slice(0, 16);
    const dataEntrada = document.getElementById('dataEntrada');
    const dataSaida   = document.getElementById('dataSaida');
    if (dataEntrada) dataEntrada.value = isoNow;
    if (dataSaida)   dataSaida.value   = isoNow;

    const titulo = document.getElementById('tituloFormVisitante');
    if (titulo) titulo.innerHTML = '<i class="fas fa-user-plus"></i> Cadastro de Visitante';

    const btnSalvar   = document.getElementById('btnSalvarVisitante');
    const btnCancelar = document.getElementById('btnCancelarEdicaoVisitante');
    if (btnSalvar)   { btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Visitante'; btnSalvar.disabled = false; }
    if (btnCancelar) btnCancelar.style.display = 'none';
}

// ===== UTILITÁRIOS =====
function _setLoading(ativo) {
    const el = document.getElementById('loadingVisitantes');
    if (el) el.style.display = ativo ? 'block' : 'none';
}

function _mostrarAlerta(tipo, mensagem) {
    const box = document.getElementById('alertBoxVisitante');
    if (!box) { alert(mensagem); return; }
    const classe = tipo === 'success' ? 'alert-success' : tipo === 'warning' ? 'alert-warning' : 'alert-error';
    const icone  = tipo === 'success' ? 'fa-check-circle' : tipo === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle';
    box.innerHTML = `<div class="alert ${classe}"><i class="fas ${icone}"></i> ${_esc(mensagem)}</div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => { box.innerHTML = ''; }, 6000);
}

function _formatDate(dateString) {
    if (!dateString) return '-';
    if (dateString.includes('/')) return dateString;
    const datePart = dateString.includes('T') ? dateString.split('T')[0] : dateString.split(' ')[0];
    const parts = datePart.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateString;
}

function _esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

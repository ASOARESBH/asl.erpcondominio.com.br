<?php
// =====================================================
// API: RH — RELATÓRIO PDF
// =====================================================
// GET ?tipo=totais_horas|espelho_ponto|faltas|horas_extras|atrasos|banco_horas|aniversariantes
//     &mes=N&ano=N  OU  &data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
//     [&departamento=X]  [&colaborador_id=N]

ob_start();
require_once 'config.php';
require_once 'auth_helper.php';
ob_end_clean();

try { verificarAutenticacao(true, 'operador'); }
catch (Exception $e) {
    http_response_code(401);
    echo '<h2>Não autenticado. Faça login novamente.</h2>'; exit;
}

$conn = conectar_banco();
if (!$conn) { echo '<h2>Erro ao conectar ao banco.</h2>'; exit; }

// ── Parâmetros ───────────────────────────────────────────────────────────────
$tipo      = trim($_GET['tipo']            ?? '');
$dept      = trim($_GET['departamento']    ?? '');
$colab_id  = intval($_GET['colaborador_id'] ?? 0);

$data_inicio_raw = trim($_GET['data_inicio'] ?? '');
$data_fim_raw    = trim($_GET['data_fim']    ?? '');
$mes_raw         = intval($_GET['mes']       ?? 0);
$ano_raw         = intval($_GET['ano']       ?? 0);

// Resolve período
if ($data_inicio_raw && $data_fim_raw) {
    $data_inicio = $data_inicio_raw;
    $data_fim    = $data_fim_raw;
    $label_periodo = date('d/m/Y', strtotime($data_inicio)) . ' a ' . date('d/m/Y', strtotime($data_fim));
    $tipo_periodo = 'personalizado';
} elseif ($mes_raw >= 1 && $ano_raw >= 2000) {
    $data_inicio = sprintf('%04d-%02d-01', $ano_raw, $mes_raw);
    $data_fim    = date('Y-m-t', strtotime($data_inicio));
    $meses_nome  = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    $label_periodo = "{$meses_nome[$mes_raw]}/{$ano_raw}";
    $tipo_periodo = 'mes';
} else {
    echo '<h2>Parâmetros de período inválidos.</h2>'; exit;
}

// ── Busca dados conforme tipo ─────────────────────────────────────────────────
$dados    = [];
$titulo   = '';
$subtitulo = '';
$colunas  = [];

function _min_h(?int $m): string {
    if (!$m || $m <= 0) return '00:00';
    return sprintf('%02d:%02d', intdiv($m,60), $m%60);
}

switch ($tipo) {
    // ── Totais de horas ──────────────────────────────────────────────────────
    case 'totais_horas':
        $titulo   = 'Totais de Horas';
        $subtitulo = $label_periodo . ($dept ? " · $dept" : '');
        $colunas  = ['Nome','Cargo','Departamento','Contrato','Trabalhado','Extra','Atraso','Faltas','Folgas','Status'];

        if ($tipo_periodo === 'personalizado') {
            $sql = "SELECT c.nome, c.cargo, c.departamento, c.tipo_contrato,
                           COALESCE(SUM(l.horas_trabalhadas_min),0) as trab,
                           COALESCE(SUM(l.horas_extras_min),0)       as extra,
                           COALESCE(SUM(l.atraso_min),0)             as atraso,
                           COALESCE(SUM(l.tipo_dia='falta'),0)       as faltas,
                           COALESCE(SUM(l.tipo_dia='folga'),0)       as folgas,
                           'personalizado' as status
                    FROM rh_colaboradores c
                    LEFT JOIN rh_ponto_lancamento l ON l.colaborador_id = c.id AND l.data BETWEEN ? AND ?
                    WHERE c.ativo=1";
            $params = [$data_inicio, $data_fim]; $types = 'ss';
        } else {
            $sql = "SELECT c.nome, c.cargo, c.departamento, c.tipo_contrato,
                           COALESCE(p.total_horas_trabalhadas_min,0) as trab,
                           COALESCE(p.total_horas_extras_min,0)       as extra,
                           COALESCE(p.total_atraso_min,0)             as atraso,
                           COALESCE(p.total_faltas,0)                 as faltas,
                           COALESCE(p.total_folgas,0)                 as folgas,
                           COALESCE(p.status,'—')                     as status
                    FROM rh_colaboradores c
                    LEFT JOIN rh_ponto_periodo p ON p.colaborador_id=c.id AND p.mes=? AND p.ano=?
                    WHERE c.ativo=1";
            $params = [$mes_raw, $ano_raw]; $types = 'ii';
        }
        if ($dept) { $sql .= ' AND c.departamento=?'; $params[] = $dept; $types .= 's'; }
        $sql .= ($tipo_periodo === 'personalizado' ? ' GROUP BY c.id' : '') . ' ORDER BY c.departamento,c.nome';
        $st = $conn->prepare($sql); $st->bind_param($types, ...$params); $st->execute();
        $res = $st->get_result();
        while ($r = $res->fetch_assoc()) {
            $dados[] = [
                $r['nome'], $r['cargo']??'—', $r['departamento']??'—', strtoupper($r['tipo_contrato']??'—'),
                _min_h((int)$r['trab']), _min_h((int)$r['extra']), _min_h((int)$r['atraso']),
                $r['faltas'], $r['folgas'],
                '<span class="badge '.($r['status']==='fechado'?'badge-red':($r['status']==='aberto'?'badge-green':'badge-gray')).'">'.$r['status'].'</span>'
            ];
        }
        $st->close();
        break;

    // ── Espelho de ponto ─────────────────────────────────────────────────────
    case 'espelho_ponto':
        if ($colab_id <= 0) { echo '<h2>colaborador_id obrigatório.</h2>'; exit; }
        $titulo   = 'Espelho de Ponto';
        $colunas  = ['Data','Dia','Entrada','Saída Almoço','Retorno','Saída','Trabalhado','Extra','Atraso','Tipo','Obs'];

        $sc = $conn->prepare("SELECT nome,cargo,departamento FROM rh_colaboradores WHERE id=?");
        $sc->bind_param('i', $colab_id); $sc->execute();
        $colab = $sc->get_result()->fetch_assoc(); $sc->close();
        $subtitulo = ($colab['nome']??'') . ' · ' . ($colab['cargo']??'') . ' · ' . $label_periodo;

        $st = $conn->prepare(
            "SELECT DATE_FORMAT(data,'%d/%m/%Y') as d, DAYNAME(data) as dn,
                    TIME_FORMAT(hora_entrada,'%H:%i') as he,
                    TIME_FORMAT(hora_almoco_saida,'%H:%i') as has,
                    TIME_FORMAT(hora_almoco_retorno,'%H:%i') as har,
                    TIME_FORMAT(hora_saida,'%H:%i') as hs,
                    horas_trabalhadas_min, horas_extras_min, atraso_min, tipo_dia, observacoes
             FROM rh_ponto_lancamento WHERE colaborador_id=? AND data BETWEEN ? AND ? ORDER BY data"
        );
        $st->bind_param('iss', $colab_id, $data_inicio, $data_fim); $st->execute();
        $res = $st->get_result();
        while ($r = $res->fetch_assoc()) {
            $dados[] = [
                $r['d'], $r['dn']??'—', $r['he']??'—', $r['has']??'—', $r['har']??'—', $r['hs']??'—',
                _min_h((int)$r['horas_trabalhadas_min']),
                '<span style="color:#16a34a;">'._min_h((int)$r['horas_extras_min']).'</span>',
                '<span style="color:#dc2626;">'._min_h((int)$r['atraso_min']).'</span>',
                $r['tipo_dia']??'—', htmlspecialchars($r['observacoes']??'')
            ];
        }
        $st->close();
        break;

    // ── Faltas e Afastamentos ────────────────────────────────────────────────
    case 'faltas':
        $titulo   = 'Faltas e Afastamentos';
        $subtitulo = $label_periodo . ($dept ? " · $dept" : '');
        $colunas  = ['Nome','Cargo','Departamento','Data','Tipo','Observação'];
        $sql = "SELECT c.nome, c.cargo, c.departamento,
                       DATE_FORMAT(l.data,'%d/%m/%Y') as d, l.tipo_dia, l.observacoes
                FROM rh_ponto_lancamento l
                JOIN rh_colaboradores c ON c.id=l.colaborador_id
                WHERE l.data BETWEEN ? AND ? AND l.tipo_dia IN ('falta','afastamento') AND c.ativo=1";
        $params = [$data_inicio, $data_fim]; $types = 'ss';
        if ($dept) { $sql .= ' AND c.departamento=?'; $params[] = $dept; $types .= 's'; }
        $sql .= ' ORDER BY c.nome,l.data';
        $st = $conn->prepare($sql); $st->bind_param($types, ...$params); $st->execute();
        $res = $st->get_result();
        while ($r = $res->fetch_assoc())
            $dados[] = [$r['nome'],$r['cargo']??'—',$r['departamento']??'—',$r['d'],$r['tipo_dia'],htmlspecialchars($r['observacoes']??'')];
        $st->close();
        break;

    // ── Horas Extras ─────────────────────────────────────────────────────────
    case 'horas_extras':
        $titulo   = 'Horas Extras';
        $subtitulo = $label_periodo . ($dept ? " · $dept" : '');
        $colunas  = ['Nome','Cargo','Departamento','Horas Extras','Horas Trabalhadas'];
        $sql = "SELECT c.nome, c.cargo, c.departamento,
                       SUM(l.horas_extras_min) as extra, SUM(l.horas_trabalhadas_min) as trab
                FROM rh_ponto_lancamento l
                JOIN rh_colaboradores c ON c.id=l.colaborador_id
                WHERE l.data BETWEEN ? AND ? AND l.horas_extras_min>0 AND c.ativo=1";
        $params = [$data_inicio, $data_fim]; $types = 'ss';
        if ($dept) { $sql .= ' AND c.departamento=?'; $params[] = $dept; $types .= 's'; }
        $sql .= ' GROUP BY c.id ORDER BY extra DESC';
        $st = $conn->prepare($sql); $st->bind_param($types, ...$params); $st->execute();
        $res = $st->get_result();
        while ($r = $res->fetch_assoc())
            $dados[] = [$r['nome'],$r['cargo']??'—',$r['departamento']??'—',
                '<span style="color:#16a34a;font-weight:600;">'._min_h((int)$r['extra']).'</span>',
                _min_h((int)$r['trab'])];
        $st->close();
        break;

    // ── Atrasos ───────────────────────────────────────────────────────────────
    case 'atrasos':
        $titulo   = 'Atrasos';
        $subtitulo = $label_periodo . ($dept ? " · $dept" : '');
        $colunas  = ['Nome','Cargo','Departamento','Data','Hora Entrada','Atraso'];
        $sql = "SELECT c.nome, c.cargo, c.departamento,
                       DATE_FORMAT(l.data,'%d/%m/%Y') as d,
                       TIME_FORMAT(l.hora_entrada,'%H:%i') as he, l.atraso_min
                FROM rh_ponto_lancamento l
                JOIN rh_colaboradores c ON c.id=l.colaborador_id
                WHERE l.data BETWEEN ? AND ? AND l.atraso_min>0 AND c.ativo=1";
        $params = [$data_inicio, $data_fim]; $types = 'ss';
        if ($dept) { $sql .= ' AND c.departamento=?'; $params[] = $dept; $types .= 's'; }
        $sql .= ' ORDER BY c.nome,l.data';
        $st = $conn->prepare($sql); $st->bind_param($types, ...$params); $st->execute();
        $res = $st->get_result();
        while ($r = $res->fetch_assoc())
            $dados[] = [$r['nome'],$r['cargo']??'—',$r['departamento']??'—',$r['d'],$r['he']??'—',
                '<span style="color:#dc2626;font-weight:600;">'._min_h((int)$r['atraso_min']).'</span>'];
        $st->close();
        break;

    // ── Banco de Horas ────────────────────────────────────────────────────────
    case 'banco_horas':
        if ($colab_id <= 0) { echo '<h2>colaborador_id obrigatório.</h2>'; exit; }
        $titulo   = 'Banco de Horas';
        $colunas  = ['Mês/Ano','Trabalhado','Extra','Atraso','Saldo Mês','Acumulado'];
        $sc = $conn->prepare("SELECT nome,cargo,departamento FROM rh_colaboradores WHERE id=?");
        $sc->bind_param('i', $colab_id); $sc->execute();
        $colab = $sc->get_result()->fetch_assoc(); $sc->close();
        $subtitulo = ($colab['nome']??'') . ' · ' . $label_periodo;
        $meses_nome = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

        $st = $conn->prepare(
            "SELECT mes, ano, total_horas_trabalhadas_min, total_horas_extras_min, total_atraso_min
             FROM rh_ponto_periodo WHERE colaborador_id=? AND
             (ano > ? OR (ano=? AND mes>=?)) AND (ano < ? OR (ano=? AND mes<=?))
             ORDER BY ano,mes"
        );
        $ano_i = (int)substr($data_inicio,0,4); $mes_i = (int)substr($data_inicio,5,2);
        $ano_f = (int)substr($data_fim,0,4);    $mes_f = (int)substr($data_fim,5,2);
        $st->bind_param('iiiiiii', $colab_id, $ano_i, $ano_i, $mes_i, $ano_f, $ano_f, $mes_f);
        $st->execute();
        $res = $st->get_result(); $total = 0;
        while ($r = $res->fetch_assoc()) {
            $saldo = (int)$r['total_horas_extras_min'] - (int)$r['total_atraso_min'];
            $total += $saldo;
            $dados[] = [
                $meses_nome[$r['mes']].'/'.$r['ano'],
                _min_h((int)$r['total_horas_trabalhadas_min']),
                '<span style="color:#16a34a;">'._min_h((int)$r['total_horas_extras_min']).'</span>',
                '<span style="color:#dc2626;">'._min_h((int)$r['total_atraso_min']).'</span>',
                '<span style="color:'.($saldo>=0?'#16a34a':'#dc2626').';font-weight:600;">'.($saldo<0?'-':'')._min_h(abs($saldo)).'</span>',
                '<strong style="color:'.($total>=0?'#1e3a8a':'#dc2626').';">'.($total<0?'-':'')._min_h(abs($total)).'</strong>'
            ];
        }
        $st->close();
        break;

    // ── Aniversariantes ───────────────────────────────────────────────────────
    case 'aniversariantes':
        $mes_aniv = $mes_raw >= 1 ? $mes_raw : (int)date('m');
        $meses_nome = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        $titulo   = 'Aniversariantes';
        $subtitulo = $meses_nome[$mes_aniv] . '/' . ($ano_raw >= 2000 ? $ano_raw : date('Y'));
        $colunas  = ['Nome','Cargo','Departamento','Data Nasc.','Aniversário'];
        $st = $conn->prepare(
            "SELECT nome,cargo,departamento,DATE_FORMAT(data_nascimento,'%d/%m/%Y') as dn,
                    DATE_FORMAT(data_nascimento,'%d/%m') as aniv
             FROM rh_colaboradores WHERE MONTH(data_nascimento)=? AND ativo=1 ORDER BY DAY(data_nascimento),nome"
        );
        $st->bind_param('i', $mes_aniv); $st->execute();
        $res = $st->get_result();
        while ($r = $res->fetch_assoc())
            $dados[] = [$r['nome'],$r['cargo']??'—',$r['departamento']??'—',$r['dn'],'🎂 '.$r['aniv']];
        $st->close();
        break;

    default:
        echo '<h2>Tipo de relatório inválido.</h2>'; exit;
}

fechar_conexao($conn);

// ── Logo da associação ────────────────────────────────────────────────────────
$logo_path = __DIR__ . '/../frontend/assets/img/logo.png';
$logo_b64  = '';
if (file_exists($logo_path)) {
    $logo_b64 = 'data:image/png;base64,' . base64_encode(file_get_contents($logo_path));
}

$total_registros = count($dados);
$data_geracao    = date('d/m/Y H:i');
$usuario_nome    = $_SESSION['usuario_nome'] ?? 'Sistema';

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= htmlspecialchars($titulo) ?> — <?= htmlspecialchars($subtitulo) ?></title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #f8fafc; }

  /* ── Cabeçalho ── */
  .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff; padding: 24px 32px; display: flex; align-items: center; gap: 20px; }
  .header img { height: 60px; width: auto; border-radius: 8px; background: #fff; padding: 4px; }
  .header-info h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .header-info p  { font-size: 13px; opacity: .85; }
  .header-meta { margin-left: auto; text-align: right; font-size: 11px; opacity: .8; line-height: 1.6; }

  /* ── KPIs ── */
  .kpis { display: flex; gap: 16px; padding: 20px 32px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  .kpi  { flex: 1; background: #f0f4ff; border-radius: 10px; padding: 14px 18px; border-left: 4px solid #2563eb; }
  .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin-bottom: 4px; }
  .kpi-value { font-size: 22px; font-weight: 700; color: #1e3a8a; }

  /* ── Tabela ── */
  .content { padding: 24px 32px; }
  .section-title { font-size: 15px; font-weight: 700; color: #1e3a8a; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid #2563eb; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
  thead tr { background: linear-gradient(90deg, #1e3a8a, #2563eb); color: #fff; }
  thead th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; font-weight: 600; white-space: nowrap; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody tr:hover { background: #eff6ff; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  .empty { text-align: center; padding: 32px; color: #94a3b8; font-style: italic; }

  /* ── Badges ── */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
  .badge-green { background: #dcfce7; color: #16a34a; }
  .badge-red   { background: #fee2e2; color: #dc2626; }
  .badge-gray  { background: #f1f5f9; color: #64748b; }

  /* ── Rodapé ── */
  .footer { background: #1e3a8a; color: rgba(255,255,255,.7); text-align: center; padding: 14px 32px; font-size: 11px; margin-top: 24px; }

  /* ── Botão Imprimir ── */
  .print-bar { background: #fff; padding: 14px 32px; border-bottom: 1px solid #e2e8f0; display: flex; gap: 10px; align-items: center; }
  .btn-print { background: #2563eb; color: #fff; border: none; padding: 9px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
  .btn-print:hover { background: #1d4ed8; }
  .btn-close { background: #f1f5f9; color: #475569; border: none; padding: 9px 18px; border-radius: 8px; font-size: 13px; cursor: pointer; }

  @media print {
    .print-bar { display: none !important; }
    body { background: #fff; }
    .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .kpi { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- Barra de impressão -->
<div class="print-bar">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <button class="btn-close" onclick="window.close()">✕ Fechar</button>
  <span style="margin-left:auto;color:#64748b;font-size:12px;">
    <?= $total_registros ?> registro(s) encontrado(s)
  </span>
</div>

<!-- Cabeçalho -->
<div class="header">
  <?php if ($logo_b64): ?>
    <img src="<?= $logo_b64 ?>" alt="Logo">
  <?php endif; ?>
  <div class="header-info">
    <h1><?= htmlspecialchars($titulo) ?></h1>
    <p><?= htmlspecialchars($subtitulo) ?></p>
  </div>
  <div class="header-meta">
    Gerado em: <?= $data_geracao ?><br>
    Operador: <?= htmlspecialchars($usuario_nome) ?><br>
    Período: <?= htmlspecialchars($label_periodo) ?>
  </div>
</div>

<!-- KPIs -->
<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Total de Registros</div>
    <div class="kpi-value"><?= $total_registros ?></div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Período</div>
    <div class="kpi-value" style="font-size:14px;"><?= htmlspecialchars($label_periodo) ?></div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Tipo de Relatório</div>
    <div class="kpi-value" style="font-size:14px;"><?= htmlspecialchars($titulo) ?></div>
  </div>
  <?php if ($dept): ?>
  <div class="kpi">
    <div class="kpi-label">Departamento</div>
    <div class="kpi-value" style="font-size:14px;"><?= htmlspecialchars($dept) ?></div>
  </div>
  <?php endif; ?>
</div>

<!-- Conteúdo -->
<div class="content">
  <div class="section-title"><?= htmlspecialchars($titulo) ?> — <?= htmlspecialchars($subtitulo) ?></div>

  <?php if (empty($dados)): ?>
    <div class="empty">Nenhum dado encontrado para o período informado.</div>
  <?php else: ?>
  <table>
    <thead>
      <tr>
        <?php foreach ($colunas as $col): ?>
          <th><?= htmlspecialchars($col) ?></th>
        <?php endforeach; ?>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($dados as $linha): ?>
        <tr>
          <?php foreach ($linha as $cel): ?>
            <td><?= $cel ?></td>
          <?php endforeach; ?>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
</div>

<!-- Rodapé -->
<div class="footer">
  Associação Serra da Liberdade &nbsp;|&nbsp; Sistema ERP Condomínios &nbsp;|&nbsp;
  Relatório gerado em <?= $data_geracao ?> por <?= htmlspecialchars($usuario_nome) ?>
</div>

</body>
</html>

/* Geração do orçamento em PDF (jsPDF, funciona offline). */
(function (root) {
  'use strict';
  const C = root.Calc;

  function dataBR(iso) {
    if (!iso) return '';
    const d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString('pt-BR');
  }

  function addDias(iso, dias) {
    const d = new Date((iso || new Date().toISOString()).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + (Number(dias) || 0));
    return d.toISOString().slice(0, 10);
  }

  function gerar(orc, cliente, cfg) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 16;
    const azul = [31, 58, 104], cinza = [107, 115, 133], linha = [227, 230, 238];
    const emp = cfg.empresa || {};
    let y = 18;

    // Cabeçalho
    doc.setFillColor(...azul); doc.rect(0, 0, W, 34, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(emp.nome || 'Calhas e Rufos', M, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const sub = [emp.responsavel, emp.cnpj ? 'CNPJ ' + emp.cnpj : '', C.fmtFone(emp.telefone)].filter(Boolean).join('  ·  ');
    doc.text(sub, M, 20);
    if (emp.endereco) doc.text(emp.endereco, M, 25);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('ORÇAMENTO Nº ' + String(orc.numero || '').padStart(4, '0'), W - M, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Emitido em ' + dataBR(orc.data), W - M, 20, { align: 'right' });
    doc.text('Válido até ' + dataBR(addDias(orc.data, orc.validadeDias)), W - M, 25, { align: 'right' });
    y = 44;

    // Cliente
    doc.setTextColor(...cinza); doc.setFontSize(8); doc.text('CLIENTE', M, y);
    doc.setTextColor(29, 36, 51); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text((cliente && cliente.nome) || 'Cliente', M, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const cli2 = [cliente && C.fmtFone(cliente.telefone), cliente && [cliente.endereco, cliente.bairro, cliente.cidade].filter(Boolean).join(', ')].filter(Boolean).join('  ·  ');
    if (cli2) doc.text(cli2, M, y + 10);
    if (orc.local) doc.text('Local do serviço: ' + orc.local, M, y + 15);
    y += orc.local ? 24 : 19;

    // Tabela de itens
    const cols = [M, M + 92, M + 122, M + 150];
    doc.setFillColor(238, 241, 246); doc.rect(M, y - 5, W - 2 * M, 8, 'F');
    doc.setFontSize(8); doc.setTextColor(...cinza); doc.setFont('helvetica', 'bold');
    doc.text('DESCRIÇÃO', cols[0] + 2, y); doc.text('QTD.', cols[1] + 2, y);
    doc.text('UNIT.', cols[2] + 2, y); doc.text('TOTAL', W - M - 2, y, { align: 'right' });
    y += 8;
    const res = C.calcOrcamento(orc);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(29, 36, 51);
    res.itens.forEach(({ item, calc }) => {
      let desc, qtd, unit;
      if (item.tipo === 'perfil') {
        desc = (item.nome || 'Perfil') + (item.material ? ' — ' + item.material : '');
        const det = 'Desenvolvimento ' + C.fmtNum(calc.desenvolvimento) + ' cm' + (item.modo === 'ml' ? '' : ' · ' + C.fmtNum(calc.areaM2) + ' m2 de chapa');
        qtd = C.fmtNum(calc.metros) + ' m';
        unit = item.mostrarUnit === false ? '' : C.fmtMoeda(calc.preco) + (item.modo === 'ml' ? '/m' : '/m2');
        const lines = doc.splitTextToSize(desc, 88);
        if (y + lines.length * 4.5 + 10 > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(9.5); doc.text(lines, cols[0] + 2, y);
        const yy = y + lines.length * 4.3;
        doc.setFontSize(7.5); doc.setTextColor(...cinza); doc.text(det, cols[0] + 2, yy);
        doc.setTextColor(29, 36, 51); doc.setFontSize(9.5);
        doc.text(qtd, cols[1] + 2, y); doc.text(unit, cols[2] + 2, y);
        doc.text(C.fmtMoeda(calc.total), W - M - 2, y, { align: 'right' });
        y = yy + 4;
      } else {
        desc = item.descricao || 'Item';
        qtd = C.fmtNum(calc.qtd) + ' ' + String(item.unidade || 'un').replace('²', '2');
        unit = C.fmtMoeda(calc.preco);
        const lines = doc.splitTextToSize(desc, 88);
        if (y + lines.length * 4.5 + 6 > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(9.5); doc.text(lines, cols[0] + 2, y);
        doc.text(qtd, cols[1] + 2, y); doc.text(unit, cols[2] + 2, y);
        doc.text(C.fmtMoeda(calc.total), W - M - 2, y, { align: 'right' });
        y += lines.length * 4.3 + 2;
      }
      doc.setDrawColor(...linha); doc.line(M, y - 1, W - M, y - 1);
      y += 4;
    });

    // Totais
    if (y > 240) { doc.addPage(); y = 20; }
    y += 2;
    doc.setFontSize(9.5);
    if (res.desconto > 0) {
      doc.text('Subtotal', W - M - 50, y); doc.text(C.fmtMoeda(res.subtotal), W - M - 2, y, { align: 'right' }); y += 5;
      doc.text('Desconto', W - M - 50, y); doc.text('- ' + C.fmtMoeda(res.desconto), W - M - 2, y, { align: 'right' }); y += 6;
    }
    doc.setFillColor(...azul); doc.rect(W - M - 62, y - 5, 62, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('TOTAL', W - M - 58, y + 1); doc.text(C.fmtMoeda(res.total), W - M - 3, y + 1, { align: 'right' });
    y += 16;

    // Condições
    doc.setTextColor(29, 36, 51); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('CONDIÇÕES', M, y); y += 5;
    doc.setFont('helvetica', 'normal');
    const cond = orc.condicoes || {};
    [['Prazo de execução', cond.prazo], ['Forma de pagamento', cond.pagamento], ['Garantia', cond.garantia]].forEach(([k, v]) => {
      if (!v) return;
      const l = doc.splitTextToSize(k + ': ' + v, W - 2 * M);
      doc.text(l, M, y); y += l.length * 4.3 + 1;
    });
    if (orc.observacoes) {
      y += 2;
      const l = doc.splitTextToSize('Observações: ' + orc.observacoes, W - 2 * M);
      doc.text(l, M, y); y += l.length * 4.3;
    }

    // Rodapé
    doc.setFontSize(8); doc.setTextColor(...cinza);
    doc.text('Orçamento válido por ' + (orc.validadeDias || 15) + ' dias. Valores sujeitos a confirmação após visita técnica.', M, 287);
    return doc;
  }

  function nomeArquivo(orc, cliente) {
    const n = String(orc.numero || '').padStart(4, '0');
    const c = ((cliente && cliente.nome) || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 30);
    return 'Orcamento_' + n + '_' + c + '.pdf';
  }

  /** Compartilha (Android/iOS → WhatsApp) ou baixa o PDF. */
  async function compartilhar(orc, cliente, cfg) {
    const doc = gerar(orc, cliente, cfg);
    const nome = nomeArquivo(orc, cliente);
    const blob = doc.output('blob');
    const file = new File([blob], nome, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Orçamento', text: 'Segue o orçamento nº ' + String(orc.numero).padStart(4, '0') + '.' });
        return 'compartilhado';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelado';
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'baixado';
  }

  root.PDF = { gerar, compartilhar, nomeArquivo, addDias, dataBR };
})(self);

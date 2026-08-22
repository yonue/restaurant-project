function escapeCsvValue(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(rows, columns) {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(',');
  const body = rows
    .map((row) => columns.map((column) => escapeCsvValue(column.value(row))).join(','))
    .join('\n');
  return `\uFEFF${header}\n${body}\n`;
}

function escapePdfText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildPdf(lines, title = 'Export') {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const leftMargin = 40;
  const topMargin = 40;
  const bottomMargin = 40;
  const fontSize = 11;
  const lineHeight = 14;
  const usableHeight = pageHeight - topMargin - bottomMargin;
  const linesPerPage = Math.max(Math.floor(usableHeight / lineHeight), 1);

  const chunkedLines = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    chunkedLines.push(lines.slice(i, i + linesPerPage));
  }

  const objectCount = 2 + (chunkedLines.length * 2) + 1;
  const objects = new Array(objectCount);

  const fontObjectNumber = 1;
  const pagesObjectNumber = 2;
  const pageObjectStartNumber = 3;
  const contentObjectStartNumber = 3 + chunkedLines.length;
  const catalogObjectNumber = objectCount;

  objects[0] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[1] = `<< /Type /Pages /Kids [${chunkedLines
    .map((_, index) => `${pageObjectStartNumber + index} 0 R`)
    .join(' ')}] /Count ${chunkedLines.length} >>`;

  chunkedLines.forEach((pageLines, index) => {
    const contentObjectNumber = contentObjectStartNumber + index;
    const content = [
      'BT',
      `/F1 ${fontSize} Tf`,
      `1 0 0 1 ${leftMargin} ${pageHeight - topMargin - fontSize} Tm`,
      `(${escapePdfText(title)}) Tj`,
      `T*`,
      ...pageLines.map((line) => `(${escapePdfText(line)}) Tj T*`),
      'ET',
    ].join('\n');

    objects[2 + index] = `<< /Type /Page /Parent ${pagesObjectNumber} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[2 + chunkedLines.length + index] = `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`;
  });

  objects[objectCount - 1] = `<< /Type /Catalog /Pages ${pagesObjectNumber} 0 R >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

module.exports = {
  toCsv,
  buildPdf,
};

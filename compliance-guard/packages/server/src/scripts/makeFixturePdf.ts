// Builds a minimal, byte-valid single-page PDF (no external deps) so ingest.ts
// has a real PDF to send through the pdf-service, instead of a stubbed markdown string.
function escapePdfText(line: string): string {
  return line.replace(/[\\()]/g, (c) => `\\${c}`);
}

export function buildMinimalPdf(lines: string[]): Buffer {
  const contentLines = lines.map((line, i) => {
    const td = i === 0 ? "72 720 Td" : "0 -18 Td";
    return `${td} (${escapePdfText(line)}) Tj`;
  });
  const content = `BT /F1 12 Tf\n${contentLines.join("\n")}\nET`;
  const contentBytes = Buffer.byteLength(content, "latin1");

  const objects = [
    "", // 1-indexed
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    `5 0 obj\n<< /Length ${contentBytes} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += objects[i];
  }

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    pdf += `${offsets[i].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

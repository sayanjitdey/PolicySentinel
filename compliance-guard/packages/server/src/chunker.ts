export interface Chunk {
  chunkType: "text" | "table";
  content: string;
  tableJson: Record<string, string>[] | null;
  sectionPath: string;
}

const ESCAPED_PIPE_PLACEHOLDER = "\u0000";

function parseRowCells(line: string): string[] {
  return line
    .replaceAll("\\|", ESCAPED_PIPE_PLACEHOLDER) // protect escaped pipes
    .split("|")
    .map((cell) => cell.trim().replaceAll(ESCAPED_PIPE_PLACEHOLDER, "|")) // restore
    .filter((_, index, arr) => index !== 0 && index !== arr.length - 1);
}

function buildTableRecord(
  headerCells: string[],
  rowCells: string[]
): Record<string, string> {
  const record: Record<string, string> = {};
  headerCells.forEach((header, i) => {
    record[header] = rowCells[i] ?? "";
  });
  return record;
}

function buildTableSummaryText(
  headerCells: string[],
  records: Record<string, string>[]
): string {
  const summaryLine = `Table: ${headerCells.join(", ")}`;
  const rowLines = records.map((r) =>
    headerCells.map((h) => `${h}: ${r[h]}`).join(", ")
  );
  return [summaryLine, ...rowLines].join("\n");
}

// Embedding models have a finite context window; a whole multi-page section
// (or multi-page table) as one chunk can exceed it. Split text on paragraph
// boundaries, tables on row boundaries, to stay under this.
// ponytail: boundary split only — a single paragraph, or single row, longer
// than this still passes through whole; hard word-wrap split if that shows up.
const MAX_CHUNK_CHARS = 2000;

function splitLargeTextBlock(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const parts: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > MAX_CHUNK_CHARS) {
      parts.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function splitLargeTableRecords(
  headerCells: string[],
  records: Record<string, string>[]
): Record<string, string>[][] {
  const baseLen = `Table: ${headerCells.join(", ")}`.length;
  const batches: Record<string, string>[][] = [];
  let current: Record<string, string>[] = [];
  let currentLen = baseLen;

  for (const record of records) {
    const rowLen = headerCells.map((h) => `${h}: ${record[h]}`).join(", ").length;
    if (current.length > 0 && currentLen + rowLen + 1 > MAX_CHUNK_CHARS) {
      batches.push(current);
      current = [];
      currentLen = baseLen;
    }
    current.push(record);
    currentLen += rowLen + 1;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function chunkMarkdown(markdown: string, sectionPath: string): Chunk[] {
  const lines = markdown.split("\n");
  const chunks: Chunk[] = [];
  let currentTextBlock: string[] = [];
  let i = 0;

  function flushTextBlock() {
    const text = currentTextBlock.join("\n").trim();
    if (text.length > 0) {
      for (const part of splitLargeTextBlock(text)) {
        chunks.push({ chunkType: "text", content: part, tableJson: null, sectionPath });
      }
    }
    currentTextBlock = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    const isTableHeader =
      line.trim().startsWith("|") && lines[i + 1]?.trim().startsWith("|---");

    if (isTableHeader) {
      flushTextBlock();

      const headerCells = parseRowCells(line);
      i += 2;

      const records: Record<string, string>[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const rowCells = parseRowCells(lines[i]);
        records.push(buildTableRecord(headerCells, rowCells));
        i++;
      }

      for (const batch of splitLargeTableRecords(headerCells, records)) {
        chunks.push({
          chunkType: "table",
          content: buildTableSummaryText(headerCells, batch),
          tableJson: batch,
          sectionPath,
        });
      }
    } else {
      currentTextBlock.push(line);
      i++;
    }
  }

  flushTextBlock();
  return chunks;
}
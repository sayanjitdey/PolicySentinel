// End-to-end smoke test: real PDF -> pdf-service -> chunkMarkdown -> real Ollama
// embeddings -> Postgres (via db.ts) -> vectorSearch. Run with `npm run ingest`.
import fs from "fs";
import path from "path";
import { chunkMarkdown } from "../chunker";
import { embedText } from "../embed";
import { pool, insertPolicy, insertPolicyVersion, insertChunk, vectorSearch } from "../db";
import { buildMinimalPdf } from "./makeFixturePdf";

const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL ?? "http://localhost:8001";
const FIXTURE_PATH = path.join(__dirname, "..", "..", "fixtures", "sample-policy.pdf");

function ensureFixturePdf(): string {
  if (!fs.existsSync(FIXTURE_PATH)) {
    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(
      FIXTURE_PATH,
      buildMinimalPdf([
        "Data Retention Policy",
        "Section 1: Purpose",
        "This policy defines how long customer records are retained.",
        "All customer records must be retained for a minimum of seven years.",
        "Records containing financial data require encryption at rest.",
      ])
    );
  }
  return FIXTURE_PATH;
}

async function parsePdf(pdfPath: string): Promise<{ filename: string; markdown: string }> {
  const bytes = fs.readFileSync(pdfPath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), path.basename(pdfPath));

  const response = await fetch(`${PDF_SERVICE_URL}/parse`, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`pdf-service /parse failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<{ filename: string; markdown: string }>;
}

async function main() {
  const pdfPath = process.argv[2] ? path.resolve(process.argv[2]) : ensureFixturePdf();
  console.log(`Parsing ${pdfPath} via ${PDF_SERVICE_URL}/parse ...`);
  const { filename, markdown } = await parsePdf(pdfPath);
  console.log(`Got markdown (${markdown.length} chars)`);

  const chunks = chunkMarkdown(markdown, "root");
  console.log(`Chunked into ${chunks.length} chunk(s)`);

  const title = markdown.match(/^#+\s*(.+)$/m)?.[1]?.trim() ?? path.basename(filename, ".pdf");
  const policyId = await insertPolicy(title, filename);
  const versionId = await insertPolicyVersion(policyId, 1, "2026-01-01", markdown);
  console.log(`Inserted policy ${policyId}, version ${versionId}`);

  for (const chunk of chunks) {
    const embedding = await embedText(chunk.content);
    await insertChunk(versionId, chunk, embedding);
  }
  console.log(`Embedded and inserted ${chunks.length} chunk(s)`);

  const query = process.argv[3] ?? "How long must financial records be retained?";
  const queryEmbedding = await embedText(query);
  const results = await vectorSearch(queryEmbedding, 3);
  console.log(`Query: ${JSON.stringify(query)}`);
  console.log("Vector search results:");
  for (const r of results) {
    console.log(`  distance=${r.distance.toFixed(4)} content=${JSON.stringify(r.content.slice(0, 80))}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

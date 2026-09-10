import { Pool } from "pg";
import { Chunk } from "./chunker";

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://cguser:devpassword@localhost:5432/compliance_guard",
});

export async function insertPolicy(title: string, sourceFile: string): Promise<string> {
  const result = await pool.query(
    "INSERT INTO policies (title, source_file) VALUES ($1, $2) RETURNING id",
    [title, sourceFile]
  );
  return result.rows[0].id;
}

export async function insertPolicyVersion(
  policyId: string,
  versionNumber: number,
  effectiveDate: string,
  rawMarkdown: string
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO policy_versions (policy_id, version_number, effective_date, raw_markdown)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [policyId, versionNumber, effectiveDate, rawMarkdown]
  );
  return result.rows[0].id;
}

export async function insertChunk(
  policyVersionId: string,
  chunk: Chunk,
  embedding: number[]
): Promise<void> {
  const vectorLiteral = `[${embedding.join(",")}]`;
  await pool.query(
    `INSERT INTO policy_chunks
       (policy_version_id, chunk_type, content, table_json, embedding, section_path)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      policyVersionId,
      chunk.chunkType,
      chunk.content,
      chunk.tableJson ? JSON.stringify(chunk.tableJson) : null,
      vectorLiteral,
      chunk.sectionPath,
    ]
  );
}

export async function vectorSearch(
  queryEmbedding: number[],
  limit = 5
): Promise<{ id: string; content: string; tableJson: unknown; distance: number }[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;
  const result = await pool.query(
    `SELECT id, content, table_json, embedding <=> $1 AS distance
     FROM policy_chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vectorLiteral, limit]
  );
  return result.rows.map((r) => ({
    id: r.id,
    content: r.content,
    tableJson: r.table_json,
    distance: r.distance,
  }));
}
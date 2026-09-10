import tempfile
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
import pymupdf4llm

app = FastAPI(title="pdf-to-markdown-service")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        markdown = pymupdf4llm.to_markdown(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF parsing failed: {str(e)}")
    finally:
        os.unlink(tmp_path)

    return {
        "filename": file.filename,
        "markdown": markdown,
        # Count separator LINES, not raw substring occurrences — counting
        # "|---" as a substring gives once-per-COLUMN, not once-per-table.
        "table_count": sum(1 for line in markdown.splitlines() if line.strip().startswith("|---")),
    }
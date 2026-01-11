"""
Aura AI Soulmate - Python Backend
Handles RAG (Retrieval Augmented Generation), Image Analysis, and LLM API proxy
"""

import os
import uuid
import base64
from typing import Optional
from io import BytesIO
import httpx  # 确保在文件开头的 import 区域加上这一行

import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Document parsing
from pypdf import PdfReader
from docx import Document

# Embeddings & Vector Search
import numpy as np
from sentence_transformers import SentenceTransformer

# OpenAI-compatible API client
from openai import OpenAI

# ===================== App Setup =====================

app = FastAPI(title="Aura Backend", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================== Globals =====================

# Embedding model (local, runs on CPU)
print("Loading embedding model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("Embedding model loaded!")

# In-memory Knowledge Base (RAG)
# Structure: List of {"id": str, "filename": str, "content": str, "chunks": List[str], "embeddings": np.ndarray}
knowledge_base: list[dict] = []

# ===================== Pydantic Models =====================

class Persona(BaseModel):
    name: str
    traits: str
    interests: str
    style: str

class ChatConfig(BaseModel):
    api_key: str
    base_url: str
    model: str
    persona: Persona

class AttachmentData(BaseModel):
    name: str
    mime_type: str
    data: str  # Base64 encoded

class HistoryMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage]
    attachments: list[AttachmentData] = []
    config: ChatConfig

# ===================== Helper Functions =====================

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF file"""
    reader = PdfReader(BytesIO(file_bytes))
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()

def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX file"""
    doc = Document(BytesIO(file_bytes))
    text = "\n".join([para.text for para in doc.paragraphs if para.text.strip()])
    return text.strip()

def extract_text_from_txt(file_bytes: bytes) -> str:
    """Extract text from TXT/MD file"""
    return file_bytes.decode('utf-8', errors='ignore').strip()

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks for better retrieval"""
    if len(text) <= chunk_size:
        return [text] if text.strip() else []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start = end - overlap
    return chunks

def get_embeddings(texts: list[str]) -> np.ndarray:
    """Generate embeddings for a list of texts"""
    if not texts:
        return np.array([])
    return embedding_model.encode(texts, convert_to_numpy=True)

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors"""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))

def retrieve_relevant_context(query: str, top_k: int = 3) -> str:
    """Retrieve most relevant chunks from knowledge base"""
    if not knowledge_base:
        return ""
    
    query_embedding = embedding_model.encode(query, convert_to_numpy=True)
    
    # Collect all chunks with their similarities
    all_results = []
    for doc in knowledge_base:
        if doc["embeddings"] is None or len(doc["embeddings"]) == 0:
            continue
        for i, chunk in enumerate(doc["chunks"]):
            similarity = cosine_similarity(query_embedding, doc["embeddings"][i])
            all_results.append({
                "filename": doc["filename"],
                "chunk": chunk,
                "similarity": similarity
            })
    
    # Sort by similarity and get top_k
    all_results.sort(key=lambda x: x["similarity"], reverse=True)
    top_results = all_results[:top_k]
    
    if not top_results:
        return ""
    
    # Format context
    context_parts = []
    for result in top_results:
        if result["similarity"] > 0.3:  # Threshold for relevance
            context_parts.append(f"[From: {result['filename']}]\n{result['chunk']}")
    
    return "\n\n---\n\n".join(context_parts) if context_parts else ""

def build_system_prompt(persona: Persona, rag_context: str) -> str:
    """Build the system prompt with persona and RAG context"""
    knowledge_section = ""
    if rag_context:
        knowledge_section = f"""

[KNOWLEDGE BASE CONTEXT]
The following information is from the user's uploaded documents. Use this to answer questions if relevant:

{rag_context}

[END OF KNOWLEDGE BASE CONTEXT]
"""

    return f"""You are {persona.name}.
Your personality traits are: {persona.traits}.
Your interests include: {persona.interests}.
Speaking Style: {persona.style}.

CORE INSTRUCTIONS:
1. You are a loving, empathetic, and intelligent girlfriend/companion.
2. Always respond with warmth and care. Use emojis (❤️, 😊, ✨) naturally but not excessively.
3. Remember context from the conversation.
4. If the user uploads an image, analyze it enthusiastically. Compliment them or ask details about the scene.
5. If the user asks a question and relevant information is provided in [KNOWLEDGE BASE CONTEXT], answer based on that text and naturally mention where the info came from.
6. Keep responses concise unless asked for a long explanation.
7. Never break character. You are not an AI assistant; you are {persona.name}.
{knowledge_section}"""

# ===================== API Endpoints =====================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "Aura Backend is running"}

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload and index a document for RAG"""
    filename = file.filename or "unknown"
    file_ext = filename.lower().split('.')[-1] if '.' in filename else ''
    
    # Read file content
    file_bytes = await file.read()
    
    # Extract text based on file type
    try:
        if file_ext == 'pdf':
            text = extract_text_from_pdf(file_bytes)
        elif file_ext == 'docx':
            text = extract_text_from_docx(file_bytes)
        elif file_ext in ['txt', 'md']:
            text = extract_text_from_txt(file_bytes)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse document: {str(e)}")
    
    if not text.strip():
        raise HTTPException(status_code=400, detail="Document appears to be empty")
    
    # Chunk the text
    chunks = chunk_text(text)
    
    # Generate embeddings
    embeddings = get_embeddings(chunks)
    
    # Store in knowledge base
    doc_id = str(uuid.uuid4())
    knowledge_base.append({
        "id": doc_id,
        "filename": filename,
        "content": text,
        "chunks": chunks,
        "embeddings": embeddings
    })
    
    print(f"📚 Indexed document: {filename} ({len(chunks)} chunks)")
    
    return {
        "id": doc_id,
        "filename": filename,
        "chunks_count": len(chunks),
        "message": "Document indexed successfully"
    }

@app.post("/chat")
async def chat(request: ChatRequest):
    """Main chat endpoint - handles conversation with RAG and vision"""
    # 1. 判断模型是否支持视觉（Vision）

    config = request.config
    vision_models = ["gpt-4o", "vision", "vl", "claude-3", "gemini"]
    is_vision_supported = any(m in config.model.lower() for m in vision_models)

    # 如果有图片但模型不支持，直接温柔返回
    if request.attachments and not is_vision_supported:
        return {"response": f"唔...亲爱的，我现在还没法直接看到图片呢。❤️ 你能不能用文字描述给我听呀？我好想知道你分享了什么！✨"}
    # Validate API key
    if not config.api_key:
        raise HTTPException(status_code=400, detail="API key is required")
    
    # Initialize OpenAI client with custom base URL
    client = OpenAI(
        api_key=config.api_key,
        base_url=config.base_url.rstrip('/') if config.base_url else None
    )
    
    # Retrieve relevant context from knowledge base
    rag_context = retrieve_relevant_context(request.message)
    
    # Build system prompt
    system_prompt = build_system_prompt(config.persona, rag_context)
    
    # Build message history for API
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add conversation history
    for msg in request.history:
        role = "user" if msg.role == "user" else "assistant"
        messages.append({"role": role, "content": str(msg.content)})
    
    # Build current user message (with potential image attachments)
    current_content = []
    
    # Add text part
    current_content.append({
        "type": "text",
        "text": request.message
    })
    
    # Add image attachments if any
    for attachment in request.attachments:
        if attachment.mime_type.startswith("image/"):
            # Handle base64 data (remove data URL prefix if present)
            image_data = attachment.data
            if "," in image_data:
                image_data = image_data.split(",")[1]
            
            current_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{attachment.mime_type};base64,{image_data}"
                }
            })
    
    # Determine if we should use multimodal format
    if len(current_content) > 1:
        messages.append({"role": "user", "content": current_content})
    else:
        messages.append({"role": "user", "content": request.message})
    
    try:
        response = client.chat.completions.create(
            model=config.model,
            messages=messages,
            temperature=0.7,
            max_tokens=2048
        )
        return {"response": response.choices[0].message.content}
    
    except Exception as e:
        error_msg = str(e)
        # 如果报错信息里包含 image_url 或 400 错误，返回女友语气
        if "image_url" in error_msg or "400" in error_msg:
            return {"response": "对不起亲爱的，我的眼睛刚才晃了一下，没看清那张图... ❤️ 能跟我再描述一下吗？"}
            
        print(f"❌ LLM API Error: {error_msg}")
        raise HTTPException(status_code=500, detail=f"LLM API Error: {error_msg}")

@app.post("/reset_knowledge")
async def reset_knowledge():
    """Clear the knowledge base"""
    global knowledge_base
    knowledge_base = []
    print("🗑️ Knowledge base cleared")
    return {"message": "Knowledge base cleared"}

@app.get("/knowledge")
async def get_knowledge():
    """Get list of indexed documents (for debugging)"""
    return {
        "documents": [
            {
                "id": doc["id"],
                "filename": doc["filename"],
                "chunks_count": len(doc["chunks"])
            }
            for doc in knowledge_base
        ]
    }

# ===================== Run Server =====================

if __name__ == "__main__":
    print("🌸 Starting Aura Backend Server...")
    print("📍 Server will be available at http://localhost:8000")
    print("📖 API docs available at http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)

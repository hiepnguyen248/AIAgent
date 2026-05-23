"""
RAG Service - Retrieval-Augmented Generation with ChromaDB
Supports Ollama (qwen3-embedding) and sentence-transformers for embeddings.
Handles multi-format documents: MD, TXT, PDF, HTML, JSON, Robot Framework, Python.
"""
import ast
import asyncio
import hashlib
import io
import json
import os
import re
import time
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
import math

import httpx


@dataclass
class DocumentChunk:
    """A chunk of a document for indexing"""
    doc_id: str
    chunk_id: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchResult:
    """A search result from the vector store"""
    content: str
    metadata: Dict[str, Any]
    score: float  # distance (lower = more relevant)


# ========================
# Ollama Embedding Function
# ========================

class OllamaEmbeddingFunction:
    """
    ChromaDB-compatible embedding function using Ollama's /api/embed endpoint.
    Works with models like qwen3-embedding.
    """

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen3-embedding"):
        self.base_url = base_url.rstrip('/')
        self.model = model
        self._name = f"ollama-{model}"

    def name(self):
        return self._name

    def __call__(self, input: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts (synchronous, for ChromaDB)"""
        embeddings = []
        # Process in batches to avoid overloading
        batch_size = 32
        for i in range(0, len(input), batch_size):
            batch = input[i:i + batch_size]
            for text in batch:
                try:
                    response = httpx.post(
                        f"{self.base_url}/api/embed",
                        json={"model": self.model, "input": text},
                        timeout=60.0
                    )
                    response.raise_for_status()
                    data = response.json()
                    # Ollama /api/embed returns {"embeddings": [[...]]}
                    if "embeddings" in data and len(data["embeddings"]) > 0:
                        embeddings.append(data["embeddings"][0])
                    else:
                        raise ValueError(f"Unexpected response format: {data}")
                except Exception as e:
                    print(f"[RAG] Ollama embedding error for text chunk: {e}")
                    raise
        return embeddings


class RAGService:
    """
    RAG Service using ChromaDB for vector storage.
    Supports Ollama or sentence-transformers for embeddings.
    Handles multi-format documents: MD, TXT, PDF, HTML, JSON.
    """

    SUPPORTED_EXTENSIONS = {'.md', '.txt', '.pdf', '.html', '.htm', '.json', '.robot', '.resource', '.py'}

    def __init__(
        self,
        persist_dir: str = "./rag_data",
        collection_name: str = "ai_automation_hub",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        embedding_provider: str = "ollama",
        embedding_model: str = "qwen3-embedding",
        ollama_base_url: str = "http://localhost:11434"
    ):
        self.persist_dir = persist_dir
        self.collection_name = collection_name
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.embedding_provider = embedding_provider
        self.embedding_model_name = embedding_model
        self.ollama_base_url = ollama_base_url

        self._chroma_client = None
        self._collection = None
        self._embedding_fn = None
        self._initialized = False

    def _ensure_initialized(self):
        """Lazy initialization of ChromaDB and embedding model"""
        if self._initialized:
            return

        try:
            import chromadb
            from chromadb.config import Settings as ChromaSettings

            # Create persist directory
            os.makedirs(self.persist_dir, exist_ok=True)

            # Initialize ChromaDB with persistent storage
            self._chroma_client = chromadb.PersistentClient(
                path=self.persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False)
            )

            # Initialize embedding function based on provider
            if self.embedding_provider == "ollama":
                self._embedding_fn = OllamaEmbeddingFunction(
                    base_url=self.ollama_base_url,
                    model=self.embedding_model_name
                )
                print(f"[RAG] Using Ollama embeddings: {self.embedding_model_name} @ {self.ollama_base_url}")
            else:
                from chromadb.utils import embedding_functions
                self._embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name=self.embedding_model_name
                )
                print(f"[RAG] Using SentenceTransformers: {self.embedding_model_name}")

            # Handle collection migration: check if embedding model changed
            self._handle_collection_migration()

            # Get or create collection
            self._collection = self._chroma_client.get_or_create_collection(
                name=self.collection_name,
                embedding_function=self._embedding_fn,
                metadata={"hnsw:space": "cosine", "embedding_model": self.embedding_model_name}
            )

            self._initialized = True
            print(f"[RAG] Initialized: {self._collection.count()} chunks in store")

        except ImportError as e:
            print(f"[RAG] Dependencies not installed: {e}")
            print("[RAG] Run: pip install chromadb sentence-transformers")
            raise
        except Exception as e:
            print(f"[RAG] Initialization error: {e}")
            raise

    def _handle_collection_migration(self):
        """Delete collection if embedding model has changed (dimensions will be incompatible)"""
        try:
            existing = self._chroma_client.get_collection(name=self.collection_name)
            existing_model = existing.metadata.get("embedding_model", "")
            if existing_model and existing_model != self.embedding_model_name:
                print(f"[RAG] Embedding model changed: {existing_model} -> {self.embedding_model_name}")
                print("[RAG] Clearing old collection (incompatible dimensions)...")
                self._chroma_client.delete_collection(self.collection_name)
        except Exception:
            # Collection doesn't exist yet, that's fine
            pass

    # ========================
    # Document Chunking
    # ========================

    def _chunk_markdown(self, content: str, source_name: str) -> List[DocumentChunk]:
        """Split markdown content into chunks by sections (headers)"""
        chunks = []
        doc_id = self._generate_doc_id(source_name)

        # Split by headers (##, ###)
        sections = re.split(r'\n(?=#{1,3}\s)', content)

        for i, section in enumerate(sections):
            section = section.strip()
            if not section:
                continue

            # Extract header if present
            header_match = re.match(r'^(#{1,3})\s+(.+)', section)
            header = header_match.group(2).strip() if header_match else f"Section {i+1}"

            # If section is too long, split further by paragraphs
            if len(section) > self.chunk_size:
                sub_chunks = self._split_by_size(section, self.chunk_size, self.chunk_overlap)
                for j, sub_chunk in enumerate(sub_chunks):
                    chunk_id = f"{doc_id}_s{i}_p{j}"
                    chunks.append(DocumentChunk(
                        doc_id=doc_id,
                        chunk_id=chunk_id,
                        content=sub_chunk,
                        metadata={
                            "source": source_name,
                            "type": "markdown",
                            "section": header,
                            "chunk_index": len(chunks),
                        }
                    ))
            else:
                chunk_id = f"{doc_id}_s{i}"
                chunks.append(DocumentChunk(
                    doc_id=doc_id,
                    chunk_id=chunk_id,
                    content=section,
                    metadata={
                        "source": source_name,
                        "type": "markdown",
                        "section": header,
                        "chunk_index": len(chunks),
                    }
                ))

        return chunks

    def _chunk_text(self, content: str, source_name: str) -> List[DocumentChunk]:
        """Split plain text content into chunks"""
        chunks = []
        doc_id = self._generate_doc_id(source_name)

        sub_chunks = self._split_by_size(content, self.chunk_size, self.chunk_overlap)
        for j, sub_chunk in enumerate(sub_chunks):
            chunks.append(DocumentChunk(
                doc_id=doc_id,
                chunk_id=f"{doc_id}_t{j}",
                content=sub_chunk,
                metadata={
                    "source": source_name,
                    "type": "text",
                    "chunk_index": j,
                }
            ))

        return chunks

    def _chunk_pdf(self, file_bytes: bytes, source_name: str) -> List[DocumentChunk]:
        """Extract text from PDF and split into chunks"""
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ImportError("pypdf is required for PDF support. Run: pip install pypdf")

        chunks = []
        doc_id = self._generate_doc_id(source_name)

        reader = PdfReader(io.BytesIO(file_bytes))
        all_text_parts = []
        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                all_text_parts.append(f"[Page {page_num + 1}]\n{text.strip()}")

        full_text = "\n\n".join(all_text_parts)
        if not full_text.strip():
            return []

        sub_chunks = self._split_by_size(full_text, self.chunk_size, self.chunk_overlap)
        for j, sub_chunk in enumerate(sub_chunks):
            chunks.append(DocumentChunk(
                doc_id=doc_id,
                chunk_id=f"{doc_id}_pdf{j}",
                content=sub_chunk,
                metadata={
                    "source": source_name,
                    "type": "pdf",
                    "chunk_index": j,
                }
            ))

        return chunks

    def _chunk_html(self, content: str, source_name: str) -> List[DocumentChunk]:
        """Extract text from HTML and split into chunks"""
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            raise ImportError("beautifulsoup4 is required for HTML support. Run: pip install beautifulsoup4")

        chunks = []
        doc_id = self._generate_doc_id(source_name)

        soup = BeautifulSoup(content, 'html.parser')

        # Remove script and style elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header']):
            element.decompose()

        text = soup.get_text(separator='\n', strip=True)
        if not text.strip():
            return []

        sub_chunks = self._split_by_size(text, self.chunk_size, self.chunk_overlap)
        for j, sub_chunk in enumerate(sub_chunks):
            chunks.append(DocumentChunk(
                doc_id=doc_id,
                chunk_id=f"{doc_id}_html{j}",
                content=sub_chunk,
                metadata={
                    "source": source_name,
                    "type": "html",
                    "chunk_index": j,
                }
            ))

        return chunks

    def _chunk_json(self, content: str, source_name: str) -> List[DocumentChunk]:
        """Flatten JSON content into readable text and split into chunks"""
        chunks = []
        doc_id = self._generate_doc_id(source_name)

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # Treat as plain text if JSON parsing fails
            return self._chunk_text(content, source_name)

        # Recursively flatten JSON to readable text
        text_parts = self._flatten_json(data)
        full_text = "\n".join(text_parts)

        if not full_text.strip():
            return []

        sub_chunks = self._split_by_size(full_text, self.chunk_size, self.chunk_overlap)
        for j, sub_chunk in enumerate(sub_chunks):
            chunks.append(DocumentChunk(
                doc_id=doc_id,
                chunk_id=f"{doc_id}_json{j}",
                content=sub_chunk,
                metadata={
                    "source": source_name,
                    "type": "json",
                    "chunk_index": j,
                }
            ))

        return chunks

    @staticmethod
    def _flatten_json(data, prefix: str = "") -> List[str]:
        """Recursively flatten JSON into readable key-value lines"""
        lines = []
        if isinstance(data, dict):
            for key, value in data.items():
                full_key = f"{prefix}.{key}" if prefix else key
                if isinstance(value, (dict, list)):
                    lines.extend(RAGService._flatten_json(value, full_key))
                else:
                    lines.append(f"{full_key}: {value}")
        elif isinstance(data, list):
            for i, item in enumerate(data):
                full_key = f"{prefix}[{i}]"
                if isinstance(item, (dict, list)):
                    lines.extend(RAGService._flatten_json(item, full_key))
                else:
                    lines.append(f"{full_key}: {item}")
        else:
            lines.append(f"{prefix}: {data}" if prefix else str(data))
        return lines

    def _chunk_test_case(self, tc_id: str, tc_data: Dict[str, Any]) -> List[DocumentChunk]:
        """Convert a CodeBeamer test case into indexable chunks"""
        doc_id = self._generate_doc_id(f"tc_{tc_id}")
        chunks = []

        # Build a single rich text representation of the test case
        parts = [f"Test Case {tc_id}: {tc_data.get('name', '')}"]

        if tc_data.get('description'):
            desc = re.sub(r'<[^>]+>', '', str(tc_data['description']))
            parts.append(f"Description: {desc.strip()}")

        if tc_data.get('precondition') or tc_data.get('preAction'):
            pre = tc_data.get('precondition') or tc_data.get('preAction', '')
            if isinstance(pre, str):
                pre = re.sub(r'<[^>]+>', '', pre).strip()
            parts.append(f"Precondition: {pre}")

        # Test steps
        steps = tc_data.get('testSteps', tc_data.get('steps', []))
        if isinstance(steps, list):
            for idx, step in enumerate(steps, 1):
                if isinstance(step, dict):
                    action = step.get('action', step.get('description', ''))
                    expected = step.get('expectedResult', '')
                    if action:
                        action = re.sub(r'<[^>]+>', '', str(action)).strip()
                    if expected:
                        expected = re.sub(r'<[^>]+>', '', str(expected)).strip()
                    step_text = f"Step {idx}: {action}"
                    if expected:
                        step_text += f" -> Expected: {expected}"
                    parts.append(step_text)
                else:
                    parts.append(f"Step {idx}: {step}")
        elif isinstance(steps, str):
            steps_clean = re.sub(r'<[^>]+>', '', steps).strip()
            parts.append(f"Test Steps: {steps_clean}")

        if tc_data.get('expectedResult'):
            exp = re.sub(r'<[^>]+>', '', str(tc_data['expectedResult'])).strip()
            parts.append(f"Expected Result: {exp}")

        # Status, priority
        status = tc_data.get('status', {})
        if isinstance(status, dict):
            parts.append(f"Status: {status.get('name', '')}")
        priority = tc_data.get('priority', {})
        if isinstance(priority, dict):
            parts.append(f"Priority: {priority.get('name', '')}")

        full_text = "\n".join(parts)

        # Split if too long
        if len(full_text) > self.chunk_size:
            sub_chunks = self._split_by_size(full_text, self.chunk_size, self.chunk_overlap)
            for j, sub_chunk in enumerate(sub_chunks):
                chunks.append(DocumentChunk(
                    doc_id=doc_id,
                    chunk_id=f"{doc_id}_p{j}",
                    content=sub_chunk,
                    metadata={
                        "source": f"codebeamer_tc_{tc_id}",
                        "type": "test_case",
                        "tc_id": tc_id,
                        "tc_name": tc_data.get('name', ''),
                        "chunk_index": j,
                    }
                ))
        else:
            chunks.append(DocumentChunk(
                doc_id=doc_id,
                chunk_id=f"{doc_id}_0",
                content=full_text,
                metadata={
                    "source": f"codebeamer_tc_{tc_id}",
                    "type": "test_case",
                    "tc_id": tc_id,
                    "tc_name": tc_data.get('name', ''),
                    "chunk_index": 0,
                }
            ))

        return chunks

    def _chunk_robot(self, content: str, source_name: str) -> List[DocumentChunk]:
        """Split Robot Framework (.robot/.resource) content into chunks by sections and test cases/keywords"""
        chunks = []
        doc_id = self._generate_doc_id(source_name)

        # Split by Robot Framework section headers: *** Settings ***, *** Test Cases ***, *** Keywords ***, *** Variables ***
        section_pattern = re.compile(r'^(\*{3}\s+(?:Settings|Test Cases|Keywords|Variables|Comments)\s+\*{3})', re.MULTILINE)
        parts = section_pattern.split(content)

        # parts = [preamble, section_header1, section_body1, section_header2, section_body2, ...]
        current_section_header = ""
        for i, part in enumerate(parts):
            part_stripped = part.strip()
            if not part_stripped:
                continue

            if section_pattern.match(part_stripped):
                current_section_header = part_stripped
                continue

            # For Settings and Variables sections, keep as single chunk
            if current_section_header in ('*** Settings ***', '*** Variables ***'):
                full_text = f"{current_section_header}\n{part_stripped}"
                if full_text.strip():
                    chunks.append(DocumentChunk(
                        doc_id=doc_id,
                        chunk_id=f"{doc_id}_sec{len(chunks)}",
                        content=full_text,
                        metadata={
                            "source": source_name,
                            "type": "robot",
                            "section": current_section_header.strip('* '),
                            "chunk_index": len(chunks),
                        }
                    ))
                continue

            # For Test Cases and Keywords, split by individual items
            # Each test case or keyword starts at column 0 (no leading whitespace)
            lines = part_stripped.split('\n')
            current_item_name = ""
            current_item_lines = []
            current_tags = []

            for line in lines:
                # A line starting without whitespace (and not empty, not a comment) is a new test case/keyword name
                if line and not line[0].isspace() and not line.startswith('#'):
                    # Save previous item
                    if current_item_name and current_item_lines:
                        item_text = f"{current_section_header}\n{current_item_name}\n" + "\n".join(current_item_lines)
                        chunks.append(DocumentChunk(
                            doc_id=doc_id,
                            chunk_id=f"{doc_id}_item{len(chunks)}",
                            content=item_text,
                            metadata={
                                "source": source_name,
                                "type": "robot",
                                "section": current_section_header.strip('* '),
                                "item_name": current_item_name.strip(),
                                "tags": ", ".join(current_tags) if current_tags else "",
                                "chunk_index": len(chunks),
                            }
                        ))
                    current_item_name = line
                    current_item_lines = []
                    current_tags = []
                else:
                    current_item_lines.append(line)
                    # Extract tags
                    tag_match = re.match(r'\s+\[Tags\]\s+(.+)', line)
                    if tag_match:
                        current_tags = [t.strip() for t in tag_match.group(1).split('    ') if t.strip()]

            # Save last item
            if current_item_name and current_item_lines:
                item_text = f"{current_section_header}\n{current_item_name}\n" + "\n".join(current_item_lines)
                chunks.append(DocumentChunk(
                    doc_id=doc_id,
                    chunk_id=f"{doc_id}_item{len(chunks)}",
                    content=item_text,
                    metadata={
                        "source": source_name,
                        "type": "robot",
                        "section": current_section_header.strip('* '),
                        "item_name": current_item_name.strip(),
                        "tags": ", ".join(current_tags) if current_tags else "",
                        "chunk_index": len(chunks),
                    }
                ))
            elif part_stripped and not current_item_name:
                # Section with content but no named items
                full_text = f"{current_section_header}\n{part_stripped}" if current_section_header else part_stripped
                chunks.append(DocumentChunk(
                    doc_id=doc_id,
                    chunk_id=f"{doc_id}_sec{len(chunks)}",
                    content=full_text,
                    metadata={
                        "source": source_name,
                        "type": "robot",
                        "section": current_section_header.strip('* ') if current_section_header else "preamble",
                        "chunk_index": len(chunks),
                    }
                ))

        return chunks

    def _chunk_python_lib(self, content: str, source_name: str) -> List[DocumentChunk]:
        """Extract docstrings + function/class signatures from Python files using AST.
        Only indexes the public API surface (signatures + docstrings), not implementations."""
        chunks = []
        doc_id = self._generate_doc_id(source_name)

        try:
            tree = ast.parse(content)
        except SyntaxError:
            # Fallback: treat as plain text
            return self._chunk_text(content, source_name)

        # Module-level docstring
        module_doc = ast.get_docstring(tree)
        if module_doc:
            chunks.append(DocumentChunk(
                doc_id=doc_id,
                chunk_id=f"{doc_id}_mod",
                content=f"Module: {source_name}\n\n{module_doc}",
                metadata={
                    "source": source_name,
                    "type": "python_lib",
                    "element": "module",
                    "chunk_index": 0,
                }
            ))

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                class_doc = ast.get_docstring(node) or ""
                # Build class signature
                bases = [self._ast_name(b) for b in node.bases]
                bases_str = f"({', '.join(bases)})" if bases else ""
                sig = f"class {node.name}{bases_str}:"

                # Collect method signatures
                methods = []
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        method_sig = self._format_func_signature(item)
                        method_doc = ast.get_docstring(item) or ""
                        methods.append(f"    {method_sig}")
                        if method_doc:
                            # Indent docstring
                            methods.append(f"        \"\"\"{ method_doc}\"\"\"")

                full_text = sig + "\n"
                if class_doc:
                    full_text += f"    \"\"\"{class_doc}\"\"\"\n"
                full_text += "\n".join(methods)

                chunks.append(DocumentChunk(
                    doc_id=doc_id,
                    chunk_id=f"{doc_id}_cls_{node.name}",
                    content=full_text,
                    metadata={
                        "source": source_name,
                        "type": "python_lib",
                        "element": "class",
                        "class_name": node.name,
                        "chunk_index": len(chunks),
                    }
                ))

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Only top-level functions (not class methods, which are handled above)
                if not any(isinstance(parent, ast.ClassDef) for parent in ast.walk(tree)
                           if hasattr(parent, 'body') and node in getattr(parent, 'body', [])):
                    func_sig = self._format_func_signature(node)
                    func_doc = ast.get_docstring(node) or ""
                    full_text = func_sig
                    if func_doc:
                        full_text += f"\n    \"\"\"{func_doc}\"\"\""

                    if func_doc or not node.name.startswith('_'):
                        chunks.append(DocumentChunk(
                            doc_id=doc_id,
                            chunk_id=f"{doc_id}_fn_{node.name}",
                            content=full_text,
                            metadata={
                                "source": source_name,
                                "type": "python_lib",
                                "element": "function",
                                "function_name": node.name,
                                "chunk_index": len(chunks),
                            }
                        ))

        return chunks

    @staticmethod
    def _format_func_signature(node) -> str:
        """Format a function/method AST node into a readable signature"""
        prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
        args = []
        func_args = node.args

        # Positional args
        num_defaults = len(func_args.defaults)
        num_args = len(func_args.args)
        for i, arg in enumerate(func_args.args):
            arg_str = arg.arg
            if arg.annotation:
                try:
                    arg_str += f": {ast.unparse(arg.annotation)}"
                except Exception:
                    pass
            # Check if it has a default
            default_index = i - (num_args - num_defaults)
            if default_index >= 0:
                try:
                    arg_str += f" = {ast.unparse(func_args.defaults[default_index])}"
                except Exception:
                    arg_str += " = ..."
            args.append(arg_str)

        # *args
        if func_args.vararg:
            args.append(f"*{func_args.vararg.arg}")

        # **kwargs
        if func_args.kwarg:
            args.append(f"**{func_args.kwarg.arg}")

        # Return annotation
        ret = ""
        if node.returns:
            try:
                ret = f" -> {ast.unparse(node.returns)}"
            except Exception:
                pass

        return f"{prefix} {node.name}({', '.join(args)}){ret}:"

    @staticmethod
    def _ast_name(node) -> str:
        """Get a readable name from an AST node"""
        try:
            return ast.unparse(node)
        except Exception:
            if isinstance(node, ast.Name):
                return node.id
            elif isinstance(node, ast.Attribute):
                return f"{RAGService._ast_name(node.value)}.{node.attr}"
            return "?"

    @staticmethod
    def _split_by_size(text: str, max_size: int, overlap: int) -> List[str]:
        """Split text into chunks of max_size with overlap"""
        chunks = []
        paragraphs = text.split('\n\n')
        current_chunk = ""

        for para in paragraphs:
            if len(current_chunk) + len(para) + 2 > max_size and current_chunk:
                chunks.append(current_chunk.strip())
                # Keep overlap from end of previous chunk
                if overlap > 0:
                    current_chunk = current_chunk[-overlap:] + "\n\n" + para
                else:
                    current_chunk = para
            else:
                current_chunk = current_chunk + "\n\n" + para if current_chunk else para

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        return chunks if chunks else [text[:max_size]]

    @staticmethod
    def _generate_doc_id(name: str) -> str:
        """Generate a stable document ID from name"""
        return hashlib.md5(name.encode()).hexdigest()[:12]

    @staticmethod
    def _detect_file_type(filename: str) -> str:
        """Detect document type from filename extension"""
        ext = Path(filename).suffix.lower()
        type_map = {
            '.md': 'markdown',
            '.txt': 'text',
            '.pdf': 'pdf',
            '.html': 'html',
            '.htm': 'html',
            '.json': 'json',
            '.robot': 'robot',
            '.resource': 'robot',
            '.py': 'python_lib',
        }
        return type_map.get(ext, 'text')

    # ========================
    # Indexing
    # ========================

    def index_document(self, content_or_bytes, source_name: str, file_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Universal document indexer — detects type and routes to appropriate chunker.
        content_or_bytes: str for text-based formats, bytes for PDF.
        """
        self._ensure_initialized()

        if file_type is None:
            file_type = self._detect_file_type(source_name)

        # Remove old chunks for this document first
        doc_id = self._generate_doc_id(source_name)
        self._delete_by_doc_id(doc_id)

        # Route to appropriate chunker
        if file_type == 'pdf':
            if isinstance(content_or_bytes, str):
                content_or_bytes = content_or_bytes.encode('utf-8')
            chunks = self._chunk_pdf(content_or_bytes, source_name)
        elif file_type == 'html':
            chunks = self._chunk_html(content_or_bytes, source_name)
        elif file_type == 'json':
            chunks = self._chunk_json(content_or_bytes, source_name)
        elif file_type == 'markdown':
            chunks = self._chunk_markdown(content_or_bytes, source_name)
        elif file_type == 'robot':
            chunks = self._chunk_robot(content_or_bytes, source_name)
        elif file_type == 'python_lib':
            chunks = self._chunk_python_lib(content_or_bytes, source_name)
        else:  # text or unknown
            chunks = self._chunk_text(content_or_bytes, source_name)

        if not chunks:
            return {"status": "empty", "chunks": 0, "source": source_name}

        # Add to ChromaDB
        self._collection.add(
            ids=[c.chunk_id for c in chunks],
            documents=[c.content for c in chunks],
            metadatas=[c.metadata for c in chunks]
        )

        print(f"[RAG] Indexed '{source_name}' ({file_type}): {len(chunks)} chunks")
        return {
            "status": "indexed",
            "doc_id": doc_id,
            "source": source_name,
            "file_type": file_type,
            "chunks": len(chunks),
            "total_chars": sum(len(c.content) for c in chunks)
        }

    def index_markdown(self, content: str, source_name: str) -> Dict[str, Any]:
        """Index a markdown document into ChromaDB (backward compatible)"""
        return self.index_document(content, source_name, file_type='markdown')

    def index_test_case(self, tc_id: str, tc_data: Dict[str, Any]) -> Dict[str, Any]:
        """Index a CodeBeamer test case into ChromaDB"""
        self._ensure_initialized()

        doc_id = self._generate_doc_id(f"tc_{tc_id}")
        self._delete_by_doc_id(doc_id)

        chunks = self._chunk_test_case(tc_id, tc_data)
        if not chunks:
            return {"status": "empty", "chunks": 0, "tc_id": tc_id}

        self._collection.add(
            ids=[c.chunk_id for c in chunks],
            documents=[c.content for c in chunks],
            metadatas=[c.metadata for c in chunks]
        )

        print(f"[RAG] Indexed test case '{tc_id}': {len(chunks)} chunks")
        return {
            "status": "indexed",
            "doc_id": doc_id,
            "tc_id": tc_id,
            "chunks": len(chunks)
        }

    # ========================
    # Search / Retrieval
    # ========================

    def search(self, query: str, top_k: int = 5, filter_type: Optional[str] = None) -> List[SearchResult]:
        """Search for relevant chunks using semantic similarity"""
        self._ensure_initialized()

        if self._collection.count() == 0:
            return []

        where_filter = None
        if filter_type:
            where_filter = {"type": filter_type}

        try:
            results = self._collection.query(
                query_texts=[query],
                n_results=min(top_k, self._collection.count()),
                where=where_filter
            )
        except Exception as e:
            print(f"[RAG] Search error: {e}")
            return []

        search_results = []
        if results and results['documents'] and results['documents'][0]:
            for i, doc in enumerate(results['documents'][0]):
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}
                distance = results['distances'][0][i] if results['distances'] else 0.0
                search_results.append(SearchResult(
                    content=doc,
                    metadata=metadata,
                    score=distance
                ))

        return search_results

    def search_formatted(self, query: str, top_k: int = 5) -> str:
        """Search and return formatted context string for LLM injection"""
        results = self.search(query, top_k)
        if not results:
            return ""

        parts = ["--- RAG Knowledge Base Results ---"]
        for i, result in enumerate(results, 1):
            source = result.metadata.get('source', 'unknown')
            section = result.metadata.get('section', '')
            doc_type = result.metadata.get('type', '')
            score = f"{1 - result.score:.2f}" if result.score < 1 else "N/A"

            header = f"[{i}] Source: {source}"
            if section:
                header += f" | Section: {section}"
            header += f" | Type: {doc_type} | Relevance: {score}"

            parts.append(header)
            parts.append(result.content)
            parts.append("")

        return "\n".join(parts)

    # ========================
    # Hybrid Search (BM25 + Vector)
    # ========================

    @staticmethod
    def _bm25_score(
        query_terms: List[str],
        document: str,
        corpus_size: int,
        doc_freq: Dict[str, int],
        k1: float = 1.5,
        b: float = 0.75,
        avg_doc_len: float = 500.0,
    ) -> float:
        """
        Compute BM25 relevance score for a single document.
        corpus_size  – total number of documents in the corpus
        doc_freq     – mapping term → number of docs containing that term
        """
        doc_len = len(document.split())
        score = 0.0
        for term in query_terms:
            tf = document.lower().count(term.lower())
            if tf == 0:
                continue
            df = doc_freq.get(term.lower(), 1)
            idf = math.log((corpus_size - df + 0.5) / (df + 0.5) + 1)
            tf_norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc_len / avg_doc_len))
            score += idf * tf_norm
        return score

    def search_hybrid(
        self,
        query: str,
        top_k: int = 5,
        filter_type: Optional[str] = None,
        alpha: float = 0.7,
    ) -> List[SearchResult]:
        """
        Hybrid search combining:
          - Semantic (vector) similarity via ChromaDB   (weight: alpha)
          - Keyword (BM25) scoring computed in-memory   (weight: 1-alpha)

        alpha=1.0  → pure vector search
        alpha=0.0  → pure BM25 keyword search
        alpha=0.7  → 70% vector + 30% BM25 (default)
        """
        self._ensure_initialized()

        if self._collection.count() == 0:
            return []

        where_filter = {"type": filter_type} if filter_type else None

        # ── Step 1: retrieve a larger candidate pool via ChromaDB vector search ──
        candidate_k = min(top_k * 4, self._collection.count())
        try:
            raw = self._collection.query(
                query_texts=[query],
                n_results=candidate_k,
                where=where_filter,
            )
            vec_results = []
            if raw and raw['documents'] and raw['documents'][0]:
                for i, doc in enumerate(raw['documents'][0]):
                    metadata = raw['metadatas'][0][i] if raw.get('metadatas') else {}
                    distance = raw['distances'][0][i] if raw.get('distances') else 0.5
                    vec_results.append(SearchResult(content=doc, metadata=metadata, score=distance))
        except Exception as e:
            print(f"[RAG] Hybrid vector search error: {e}")
            return self.search(query, top_k, filter_type)  # fallback to pure vector

        if not vec_results:
            return []

        # ── Step 2: BM25 scoring over the candidate pool ──────────────────────
        query_terms = re.findall(r'\w+', query.lower())
        corpus_size = len(vec_results)
        doc_freq: Dict[str, int] = {}
        for term in query_terms:
            for r in vec_results:
                if term in r.content.lower():
                    doc_freq[term] = doc_freq.get(term, 0) + 1

        avg_doc_len = sum(len(r.content.split()) for r in vec_results) / max(corpus_size, 1)

        # ── Step 3: normalise both scores and combine ─────────────────────────
        vec_sims = [max(0.0, 1.0 - r.score) for r in vec_results]
        max_vec = max(vec_sims) if vec_sims else 1.0
        norm_vec = [s / max_vec if max_vec > 0 else s for s in vec_sims]

        bm25_scores = [
            self._bm25_score(query_terms, r.content, corpus_size, doc_freq, avg_doc_len=avg_doc_len)
            for r in vec_results
        ]
        max_bm25 = max(bm25_scores) if bm25_scores else 1.0
        norm_bm25 = [s / max_bm25 if max_bm25 > 0 else s for s in bm25_scores]

        combined = [
            (vec_results[i], alpha * norm_vec[i] + (1 - alpha) * norm_bm25[i])
            for i in range(corpus_size)
        ]
        combined.sort(key=lambda x: x[1], reverse=True)

        final = []
        for result, hybrid_score in combined[:top_k]:
            result.score = max(0.0, 1.0 - hybrid_score)
            result.metadata['hybrid_score'] = round(hybrid_score, 4)
            final.append(result)

        return final

    def search_formatted_hybrid(
        self,
        query: str,
        top_k: int = 5,
        alpha: float = 0.7,
    ) -> str:
        """Hybrid search and return formatted context string for LLM injection"""
        results = self.search_hybrid(query, top_k, alpha=alpha)
        if not results:
            return ""

        parts = ["--- RAG Hybrid Search Results (Semantic + Keyword) ---"]
        for i, result in enumerate(results, 1):
            source = result.metadata.get('source', 'unknown')
            section = result.metadata.get('section', '')
            doc_type = result.metadata.get('type', '')
            hybrid_score = result.metadata.get('hybrid_score', 0.0)

            header = f"[{i}] Source: {source}"
            if section:
                header += f" | Section: {section}"
            header += f" | Type: {doc_type} | Hybrid Score: {hybrid_score:.2f}"

            parts.append(header)
            parts.append(result.content)
            parts.append("")

        return "\n".join(parts)

    async def search_hybrid_async(
        self,
        query: str,
        top_k: int = 5,
        filter_type: Optional[str] = None,
        alpha: float = 0.7,
    ) -> List[SearchResult]:
        """Async wrapper for search_hybrid"""
        return await asyncio.to_thread(self.search_hybrid, query, top_k, filter_type, alpha)

    async def search_formatted_hybrid_async(
        self,
        query: str,
        top_k: int = 5,
        alpha: float = 0.7,
    ) -> str:
        """Async wrapper for search_formatted_hybrid"""
        return await asyncio.to_thread(self.search_formatted_hybrid, query, top_k, alpha)


    def get_documents(self) -> List[Dict[str, Any]]:
        """List all indexed documents (grouped by source)"""
        self._ensure_initialized()

        if self._collection.count() == 0:
            return []

        # Get all items to group by source
        all_items = self._collection.get(include=["metadatas"])
        if not all_items or not all_items['metadatas']:
            return []

        docs = {}
        for i, metadata in enumerate(all_items['metadatas']):
            source = metadata.get('source', 'unknown')
            if source not in docs:
                docs[source] = {
                    "source": source,
                    "type": metadata.get('type', 'unknown'),
                    "chunks": 0,
                    "doc_id": self._generate_doc_id(source),
                }
            docs[source]["chunks"] += 1

        return list(docs.values())

    def delete_document(self, source_name: str) -> Dict[str, Any]:
        """Delete all chunks for a document by source name"""
        self._ensure_initialized()

        doc_id = self._generate_doc_id(source_name)
        count_before = self._collection.count()
        self._delete_by_doc_id(doc_id)
        count_after = self._collection.count()

        deleted = count_before - count_after
        if deleted == 0:
            # Try deleting by source metadata directly
            try:
                results = self._collection.get(where={"source": source_name})
                if results['ids']:
                    self._collection.delete(ids=results['ids'])
                    deleted = len(results['ids'])
            except Exception:
                pass

        print(f"[RAG] Deleted '{source_name}': {deleted} chunks removed")
        return {"deleted_chunks": deleted, "source": source_name}

    def _delete_by_doc_id(self, doc_id: str):
        """Delete chunks by doc_id prefix in their IDs"""
        try:
            all_items = self._collection.get()
            ids_to_delete = [
                item_id for item_id in all_items['ids']
                if item_id.startswith(doc_id)
            ]
            if ids_to_delete:
                self._collection.delete(ids=ids_to_delete)
        except Exception as e:
            print(f"[RAG] Delete error: {e}")

    def clear_all(self):
        """Clear all indexed data"""
        self._ensure_initialized()
        # Delete and recreate collection
        self._chroma_client.delete_collection(self.collection_name)
        self._collection = self._chroma_client.get_or_create_collection(
            name=self.collection_name,
            embedding_function=self._embedding_fn,
            metadata={"hnsw:space": "cosine", "embedding_model": self.embedding_model_name}
        )
        print("[RAG] Cleared all indexed data")

    def get_stats(self) -> Dict[str, Any]:
        """Get RAG service statistics"""
        self._ensure_initialized()
        docs = self.get_documents()
        return {
            "total_chunks": self._collection.count(),
            "total_documents": len(docs),
            "documents": docs,
            "persist_dir": self.persist_dir,
            "embedding_provider": self.embedding_provider,
            "embedding_model": self.embedding_model_name,
            "chunk_size": self.chunk_size,
            "supported_formats": list(self.SUPPORTED_EXTENSIONS),
        }

    # ========================
    # Async Wrappers
    # ========================

    async def search_async(self, query: str, top_k: int = 5) -> List[SearchResult]:
        """Async wrapper for search"""
        return await asyncio.to_thread(self.search, query, top_k)

    async def search_formatted_async(self, query: str, top_k: int = 5) -> str:
        """Async wrapper for search_formatted"""
        return await asyncio.to_thread(self.search_formatted, query, top_k)

    async def index_document_async(self, content_or_bytes, source_name: str, file_type: Optional[str] = None) -> Dict[str, Any]:
        """Async wrapper for index_document"""
        return await asyncio.to_thread(self.index_document, content_or_bytes, source_name, file_type)

    async def index_markdown_async(self, content: str, source_name: str) -> Dict[str, Any]:
        """Async wrapper for index_markdown"""
        return await asyncio.to_thread(self.index_markdown, content, source_name)

    async def index_test_case_async(self, tc_id: str, tc_data: Dict[str, Any]) -> Dict[str, Any]:
        """Async wrapper for index_test_case"""
        return await asyncio.to_thread(self.index_test_case, tc_id, tc_data)

    # ========================
    # Folder Indexing
    # ========================

    def index_folder(
        self,
        folder_path: str,
        extensions: Optional[List[str]] = None,
        recursive: bool = True
    ) -> Dict[str, Any]:
        """Scan a folder and index all supported files into ChromaDB.
        
        Args:
            folder_path: Absolute path to the folder to scan
            extensions: Optional list of extensions to filter (e.g., ['.robot', '.py'])
            recursive: Whether to scan subdirectories
        
        Returns:
            Summary with files_found, files_indexed, total_chunks, errors
        """
        self._ensure_initialized()

        folder = Path(folder_path)
        if not folder.exists():
            return {"error": f"Folder not found: {folder_path}", "files_indexed": 0}
        if not folder.is_dir():
            return {"error": f"Not a directory: {folder_path}", "files_indexed": 0}

        # Determine which extensions to scan
        allowed_ext = set(extensions) if extensions else self.SUPPORTED_EXTENSIONS
        # Ensure all extensions start with a dot
        allowed_ext = {ext if ext.startswith('.') else f'.{ext}' for ext in allowed_ext}

        # Find all matching files
        if recursive:
            files = [f for f in folder.rglob('*') if f.is_file() and f.suffix.lower() in allowed_ext]
        else:
            files = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in allowed_ext]

        results = {
            "folder": folder_path,
            "files_found": len(files),
            "files_indexed": 0,
            "total_chunks": 0,
            "errors": [],
            "indexed_files": []
        }

        for file_path in files:
            try:
                file_type = self._detect_file_type(file_path.name)

                if file_type == 'pdf':
                    content = file_path.read_bytes()
                else:
                    content = file_path.read_text(encoding='utf-8', errors='ignore')

                # Use relative path from folder as source name for readability
                try:
                    source_name = str(file_path.relative_to(folder))
                except ValueError:
                    source_name = file_path.name

                result = self.index_document(content, source_name, file_type=file_type)

                if result.get('status') == 'indexed':
                    results['files_indexed'] += 1
                    results['total_chunks'] += result.get('chunks', 0)
                    results['indexed_files'].append({
                        "file": source_name,
                        "type": file_type,
                        "chunks": result.get('chunks', 0)
                    })
                elif result.get('status') == 'empty':
                    results['errors'].append(f"{source_name}: empty content")

            except Exception as e:
                results['errors'].append(f"{file_path.name}: {str(e)}")
                print(f"[RAG] Error indexing {file_path}: {e}")

        print(f"[RAG] Folder indexing complete: {results['files_indexed']}/{results['files_found']} files, {results['total_chunks']} chunks")
        return results

    async def index_folder_async(
        self,
        folder_path: str,
        extensions: Optional[List[str]] = None,
        recursive: bool = True
    ) -> Dict[str, Any]:
        """Async wrapper for index_folder"""
        return await asyncio.to_thread(self.index_folder, folder_path, extensions, recursive)

    def index_paths(
        self,
        paths: List[str],
        extensions: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Index a list of paths - each can be a file or a folder.
        
        Args:
            paths: List of absolute paths (files or folders)
            extensions: Optional filter for folder scanning (e.g., ['.robot', '.py'])
        
        Returns:
            Combined summary of all indexing results
        """
        self._ensure_initialized()

        results: Dict[str, Any] = {
            "paths_processed": len(paths),
            "files_found": 0,
            "files_indexed": 0,
            "total_chunks": 0,
            "errors": [],
            "indexed_files": []
        }

        for path_str in paths:
            path_str = path_str.strip()
            if not path_str:
                continue

            p = Path(path_str)

            if p.is_file():
                # Check extension
                allowed_ext = set(extensions) if extensions else self.SUPPORTED_EXTENSIONS
                allowed_ext = {ext if ext.startswith('.') else f'.{ext}' for ext in allowed_ext}

                if p.suffix.lower() not in allowed_ext:
                    results['errors'].append(f"{p.name}: unsupported file type '{p.suffix}'")
                    continue

                results['files_found'] += 1
                try:
                    file_type = self._detect_file_type(p.name)
                    if file_type == 'pdf':
                        content = p.read_bytes()
                    else:
                        content = p.read_text(encoding='utf-8', errors='ignore')

                    result = self.index_document(content, p.name, file_type=file_type)

                    if result.get('status') == 'indexed':
                        results['files_indexed'] += 1
                        results['total_chunks'] += result.get('chunks', 0)
                        results['indexed_files'].append({
                            "file": p.name,
                            "type": file_type,
                            "chunks": result.get('chunks', 0)
                        })
                    elif result.get('status') == 'empty':
                        results['errors'].append(f"{p.name}: empty content")
                except Exception as e:
                    results['errors'].append(f"{p.name}: {str(e)}")

            elif p.is_dir():
                # Delegate to index_folder
                folder_result = self.index_folder(path_str, extensions, recursive=True)
                if folder_result.get('error'):
                    results['errors'].append(folder_result['error'])
                else:
                    results['files_found'] += folder_result.get('files_found', 0)
                    results['files_indexed'] += folder_result.get('files_indexed', 0)
                    results['total_chunks'] += folder_result.get('total_chunks', 0)
                    results['indexed_files'].extend(folder_result.get('indexed_files', []))
                    results['errors'].extend(folder_result.get('errors', []))
            else:
                results['errors'].append(f"{path_str}: path not found")

        print(f"[RAG] Paths indexing complete: {results['files_indexed']}/{results['files_found']} files, {results['total_chunks']} chunks")
        return results

    async def index_paths_async(
        self,
        paths: List[str],
        extensions: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Async wrapper for index_paths"""
        return await asyncio.to_thread(self.index_paths, paths, extensions)


# ========================
# Global Instance
# ========================
_rag_service: Optional[RAGService] = None


def get_rag_service() -> Optional[RAGService]:
    """Get RAG service instance"""
    return _rag_service


def configure_rag(
    persist_dir: str = "./rag_data",
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    embedding_provider: str = "ollama",
    embedding_model: str = "qwen3-embedding",
    ollama_base_url: str = "http://localhost:11434"
) -> RAGService:
    """Configure and initialize RAG service"""
    global _rag_service
    _rag_service = RAGService(
        persist_dir=persist_dir,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        embedding_provider=embedding_provider,
        embedding_model=embedding_model,
        ollama_base_url=ollama_base_url
    )
    return _rag_service

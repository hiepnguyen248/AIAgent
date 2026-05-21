import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, Upload, Search, Trash2, FolderOpen, FileText,
  Database, HardDrive, Cpu, RefreshCw, X, AlertCircle,
} from 'lucide-react';
import { uploadRagFile, indexPaths, searchRag, getRagDocuments, deleteRagDocument, getRagStats, clearRagData } from '../../utils/api';
import { useToast } from '../../App';

const SUPPORTED_FORMATS = ['.robot', '.py', '.md', '.txt', '.pdf', '.json', '.html'];

export default function RagTab() {
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      const [docs, st] = await Promise.all([getRagDocuments(), getRagStats()]);
      setDocuments(Array.isArray(docs) ? docs : docs.documents || []);
      setStats(st);
    } catch {
      // Backend might not be running
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    let successCount = 0;
    for (const file of files) {
      try {
        await uploadRagFile(file);
        successCount++;
      } catch (err) {
        toast(`Failed to upload ${file.name}: ${err.message}`, 'error');
      }
    }
    if (successCount > 0) {
      toast(`${successCount} file(s) uploaded successfully`, 'success');
      loadData();
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleIndexFolder = async () => {
    if (!folderPath.trim()) return;
    setIndexing(true);
    try {
      await indexPaths({ paths: [folderPath.trim()] });
      toast('Folder indexed successfully!', 'success');
      setFolderPath('');
      loadData();
    } catch (err) {
      toast(`Indexing failed: ${err.message}`, 'error');
    } finally {
      setIndexing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const result = await searchRag({ query: searchQuery.trim(), top_k: 10 });
      setSearchResults(result.results || result.matches || (Array.isArray(result) ? result : []));
    } catch (err) {
      toast(`Search failed: ${err.message}`, 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteDoc = async (name) => {
    try {
      await deleteRagDocument(name);
      toast('Document deleted', 'success');
      loadData();
    } catch (err) {
      toast(`Delete failed: ${err.message}`, 'error');
    }
  };

  const handleClearAll = async () => {
    try {
      await clearRagData();
      toast('All RAG data cleared', 'success');
      setDocuments([]);
      setStats(null);
      setSearchResults([]);
    } catch (err) {
      toast(`Clear failed: ${err.message}`, 'error');
    }
  };

  const getFileIcon = (name) => {
    if (name?.endsWith('.robot')) return '🤖';
    if (name?.endsWith('.py')) return '🐍';
    if (name?.endsWith('.md')) return '📝';
    if (name?.endsWith('.pdf')) return '📕';
    if (name?.endsWith('.json')) return '📋';
    if (name?.endsWith('.html')) return '🌐';
    return '📄';
  };

  return (
    <div className="rag-layout">
      {/* ─── Stats ─────────────────────────────────────────────── */}
      {stats && (
        <div className="rag-full-width">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total_documents ?? stats.document_count ?? 0}</div>
              <div className="stat-label"><FileText size={12} style={{ display: 'inline' }} /> Documents</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.total_chunks ?? stats.chunk_count ?? 0}</div>
              <div className="stat-label"><Database size={12} style={{ display: 'inline' }} /> Chunks</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>
                {stats.embedding_model || stats.model || 'N/A'}
              </div>
              <div className="stat-label"><Cpu size={12} style={{ display: 'inline' }} /> Embedding Model</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Upload Section ────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Upload /> Upload Files</div>
        </div>

        <div
          className={`upload-zone ${dragover ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={SUPPORTED_FORMATS.join(',')}
            onChange={(e) => handleUpload(e.target.files)}
          />
          {uploading ? (
            <>
              <div className="spinner spinner-lg" style={{ margin: '0 auto 12px' }} />
              <h3>Uploading...</h3>
            </>
          ) : (
            <>
              <Upload size={32} />
              <h3>Drop files here or click to upload</h3>
              <p>Upload documents to the knowledge base</p>
            </>
          )}
          <div className="formats-badge">
            {SUPPORTED_FORMATS.map((f) => (
              <span key={f} className="badge badge-accent">{f}</span>
            ))}
          </div>
        </div>

        {/* Index Folder */}
        <div style={{ marginTop: 16 }}>
          <div className="card-title" style={{ marginBottom: 8, fontSize: '0.9rem' }}>
            <FolderOpen size={14} /> Index Folder
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="Enter folder path to index..."
            />
            <button className="btn btn-secondary" onClick={handleIndexFolder} disabled={!folderPath.trim() || indexing}>
              {indexing ? <div className="spinner" /> : <HardDrive size={14} />}
              Index
            </button>
          </div>
        </div>
      </div>

      {/* ─── Search Section ────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Search /> Search Knowledge Base</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={!searchQuery.trim() || searching}>
            {searching ? <div className="spinner" style={{ borderTopColor: 'white' }} /> : <Search size={14} />}
            Search
          </button>
        </div>

        <div className="search-results" style={{ maxHeight: 400, overflowY: 'auto' }}>
          {searchResults.length > 0 ? (
            searchResults.map((r, i) => (
              <div key={i} className="search-result-item">
                <div>{r.content || r.text || r.chunk || ''}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span className="source">{r.source || r.metadata?.source || 'Unknown source'}</span>
                  {r.score !== undefined && (
                    <span className="score">Score: {(r.score * 100).toFixed(1)}%</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: 24 }}>
              <Search size={32} />
              <p>Search results will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Documents List ────────────────────────────────────── */}
      <div className="card rag-full-width">
        <div className="card-header">
          <div className="card-title">
            <BookOpen /> Indexed Documents
            <span className="badge badge-primary">{documents.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={loadData}>
              <RefreshCw size={14} /> Refresh
            </button>
            {documents.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={handleClearAll}>
                <Trash2 size={14} /> Clear All
              </button>
            )}
          </div>
        </div>

        <div className="document-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
          {documents.length > 0 ? (
            documents.map((doc, i) => {
              const name = typeof doc === 'string' ? doc : (doc.source_name || doc.name || doc.source || `Document ${i + 1}`);
              const chunks = typeof doc === 'object' ? (doc.chunk_count || doc.chunks || '') : '';
              const ext = name.split('.').pop();
              return (
                <div key={i} className="document-item">
                  <div className="document-info">
                    <span style={{ fontSize: '1.2rem' }}>{getFileIcon(name)}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.88rem' }}>{name}</span>
                    {ext && <span className="badge badge-accent">.{ext}</span>}
                    {chunks && <span className="badge badge-primary">{chunks} chunks</span>}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteDoc(name)}>
                    <X size={14} />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="empty-state" style={{ padding: 24 }}>
              <BookOpen size={32} />
              <p>No documents indexed yet. Upload files or index a folder to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

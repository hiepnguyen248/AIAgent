import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen,
  Bot,
  Code2,
  Cpu,
  Database,
  FileJson,
  FileText,
  Globe,
  HardDrive,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  clearRagData,
  deleteRagDocument,
  getRagDocuments,
  getRagStats,
  indexPaths,
  searchRag,
  uploadRagFile,
} from '../../utils/api';
import { useToast } from '../../App';

const SUPPORTED_FORMATS = ['.robot', '.py', '.md', '.txt', '.pdf', '.json', '.html'];

function fileIconFor(name) {
  if (name?.endsWith('.robot')) return Bot;
  if (name?.endsWith('.py')) return Code2;
  if (name?.endsWith('.json')) return FileJson;
  if (name?.endsWith('.html')) return Globe;
  return FileText;
}

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
      // Backend may not be running yet.
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
      toast('Folder indexed successfully', 'success');
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

  return (
    <div className="rag-layout">
      {stats && (
        <div className="rag-full-width">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total_documents ?? stats.document_count ?? 0}</div>
              <div className="stat-label"><FileText size={13} /> Documents</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.total_chunks ?? stats.chunk_count ?? 0}</div>
              <div className="stat-label"><Database size={13} /> Chunks</div>
            </div>
            <div className="stat-card">
              <div className="stat-value stat-value-text">{stats.embedding_model || stats.model || 'N/A'}</div>
              <div className="stat-label"><Cpu size={13} /> Embedding model</div>
            </div>
          </div>
        </div>
      )}

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
              <div className="spinner spinner-lg" />
              <h3>Uploading...</h3>
            </>
          ) : (
            <>
              <Upload size={30} />
              <h3>Drop files here or click to upload</h3>
              <p>Upload documents to the knowledge base.</p>
            </>
          )}
          <div className="formats-badge">
            {SUPPORTED_FORMATS.map((format) => (
              <span key={format} className="badge badge-accent">{format}</span>
            ))}
          </div>
        </div>

        <div className="section-block">
          <div className="card-title small"><HardDrive /> Index Folder</div>
          <div className="inline-form">
            <input
              className="input"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="Enter folder path to index..."
            />
            <button className="btn btn-secondary" onClick={handleIndexFolder} disabled={!folderPath.trim() || indexing} type="button">
              {indexing ? <div className="spinner" /> : <HardDrive size={14} />}
              Index
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title"><Search /> Search Knowledge Base</div>
        </div>

        <div className="inline-form search-form">
          <input
            className="input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={!searchQuery.trim() || searching} type="button">
            {searching ? <div className="spinner" /> : <Search size={14} />}
            Search
          </button>
        </div>

        <div className="search-results">
          {searchResults.length > 0 ? (
            searchResults.map((result, i) => (
              <div key={i} className="search-result-item">
                <div>{result.content || result.text || result.chunk || ''}</div>
                <div className="result-meta">
                  <span className="source">{result.source || result.metadata?.source || 'Unknown source'}</span>
                  {result.score !== undefined && (
                    <span className="score">Score: {(result.score * 100).toFixed(1)}%</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state compact">
              <Search size={30} />
              <p>Search results will appear here.</p>
            </div>
          )}
        </div>
      </div>

      <div className="card rag-full-width">
        <div className="card-header">
          <div className="card-title">
            <BookOpen /> Indexed Documents
            <span className="badge badge-primary">{documents.length}</span>
          </div>
          <div className="toolbar">
            <button className="btn btn-ghost btn-sm" onClick={loadData} type="button">
              <RefreshCw size={14} /> Refresh
            </button>
            {documents.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={handleClearAll} type="button">
                <Trash2 size={14} /> Clear All
              </button>
            )}
          </div>
        </div>

        <div className="document-list">
          {documents.length > 0 ? (
            documents.map((doc, i) => {
              const name = typeof doc === 'string' ? doc : (doc.source_name || doc.name || doc.source || `Document ${i + 1}`);
              const chunks = typeof doc === 'object' ? (doc.chunk_count || doc.chunks || '') : '';
              const ext = name.split('.').pop();
              const Icon = fileIconFor(name);
              return (
                <div key={i} className="document-item">
                  <div className="document-info">
                    <Icon size={17} />
                    <span>{name}</span>
                    {ext && <span className="badge badge-accent">.{ext}</span>}
                    {chunks && <span className="badge badge-primary">{chunks} chunks</span>}
                  </div>
                  <button className="icon-btn small" onClick={() => handleDeleteDoc(name)} type="button" title="Delete">
                    <X size={14} />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="empty-state compact">
              <BookOpen size={30} />
              <p>No documents indexed yet. Upload files or index a folder to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

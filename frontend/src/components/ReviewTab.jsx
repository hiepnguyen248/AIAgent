import { useState, useRef } from 'react';
import {
    FileSearch,
    CheckCircle,
    AlertCircle,
    Upload,
    Loader2,
    Sparkles,
    Copy,
    Check,
    Cpu,
    Terminal,
    RefreshCw,
    X,
    File,
    Trash2
} from 'lucide-react';

const MODEL_OPTIONS = [
    { id: 'exacode', name: 'EXACODE', description: 'LGE EXACODE API' },
    { id: 'ollama-llama3', name: 'Llama3:8B', description: 'Local Ollama' },
    { id: 'ollama-qwen3', name: 'Qwen3:8B', description: 'Local Ollama' },
];

function ReviewTab() {
    const [selectedModel, setSelectedModel] = useState('ollama-qwen3');
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [selectedFileIndex, setSelectedFileIndex] = useState(0);
    const [reviewResult, setReviewResult] = useState(null);
    const [dryRunResult, setDryRunResult] = useState(null);
    const [improvementRequest, setImprovementRequest] = useState('');
    const [improvedCode, setImprovedCode] = useState('');
    const [isReviewing, setIsReviewing] = useState(false);
    const [isDryRunning, setIsDryRunning] = useState(false);
    const [isImproving, setIsImproving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState('review');

    const fileInputRef = useRef(null);

    const parseTcIdFromFilename = (filename) => {
        const match = filename.match(/^([A-Za-z0-9-_]+?)_/);
        return match ? match[1] : filename.replace('.robot', '');
    };

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            const filePromises = files.map(file => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        resolve({
                            name: file.name,
                            tcId: parseTcIdFromFilename(file.name),
                            content: event.target.result,
                            size: file.size
                        });
                    };
                    reader.readAsText(file);
                });
            });

            Promise.all(filePromises).then(fileData => {
                setUploadedFiles(prev => [...prev, ...fileData]);
                if (uploadedFiles.length === 0) {
                    setSelectedFileIndex(0);
                }
            });
        }
        e.target.value = '';
    };

    const removeFile = (index) => {
        setUploadedFiles(prev => prev.filter((_, i) => i !== index));
        if (selectedFileIndex >= uploadedFiles.length - 1) {
            setSelectedFileIndex(Math.max(0, uploadedFiles.length - 2));
        }
    };

    const clearAllFiles = () => {
        setUploadedFiles([]);
        setSelectedFileIndex(0);
        setReviewResult(null);
        setDryRunResult(null);
    };

    const getCurrentFile = () => uploadedFiles[selectedFileIndex] || null;

    const handleReview = async () => {
        const file = getCurrentFile();
        if (!file) return;

        setIsReviewing(true);
        setReviewResult(null);

        try {
            const response = await fetch('/api/test/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    test_code: file.content,
                    test_case_id: file.tcId,
                    model: selectedModel,
                    focus_areas: ['syntax', 'best_practices', 'coverage']
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to review test');
            }

            setReviewResult(data);
        } catch (error) {
            setReviewResult({
                feedback: `Error reviewing test: ${error.message}`,
                suggestions: [],
                score: null
            });
        } finally {
            setIsReviewing(false);
        }
    };

    const handleDryRun = async () => {
        const file = getCurrentFile();
        if (!file) return;

        setIsDryRunning(true);
        setDryRunResult(null);

        try {
            const response = await fetch('/api/test/dry-run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test_code: file.content })
            });

            const data = await response.json();
            setDryRunResult(data);
        } catch (error) {
            setDryRunResult({
                success: false,
                output: `Error: ${error.message}`,
                errors: [error.message]
            });
        } finally {
            setIsDryRunning(false);
        }
    };

    const handleImprove = async () => {
        const file = getCurrentFile();
        if (!file || !improvementRequest.trim()) return;

        setIsImproving(true);
        setImprovedCode('');

        try {
            const response = await fetch('/api/test/improve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    test_code: file.content,
                    test_case_id: file.tcId,
                    model: selectedModel,
                    improvement_request: improvementRequest
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to improve test');
            }

            setImprovedCode(data.test_code);
        } catch (error) {
            setImprovedCode(`# Error: ${error.message}`);
        } finally {
            setIsImproving(false);
        }
    };

    const copyImproved = async () => {
        await navigator.clipboard.writeText(improvedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const applyImprovement = () => {
        if (improvedCode && uploadedFiles[selectedFileIndex]) {
            const updated = [...uploadedFiles];
            updated[selectedFileIndex] = {
                ...updated[selectedFileIndex],
                content: improvedCode
            };
            setUploadedFiles(updated);
            setImprovedCode('');
            setReviewResult(null);
            setDryRunResult(null);
        }
    };

    const currentFile = getCurrentFile();

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Review Test</h1>
                <p className="page-subtitle">Review, dry-run, and improve Robot Framework tests</p>
            </div>

            <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                {/* Left Panel - File List */}
                <div className="card" style={{ flex: '1 1 400px', minWidth: '350px' }}>
                    <div className="card-header">
                        <h3 className="card-title">Test Scripts</h3>
                        <div className="flex gap-2">
                            {uploadedFiles.length > 0 && (
                                <button className="btn btn-ghost" onClick={clearAllFiles}>
                                    <Trash2 size={14} />
                                    Clear
                                </button>
                            )}
                            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                                <Upload size={16} />
                                Upload
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".robot,.txt"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={handleFileUpload}
                                />
                            </label>
                        </div>
                    </div>
                    <div className="card-body">
                        {/* Model Selection */}
                        <div className="input-group">
                            <label className="input-label">
                                <Cpu size={14} style={{ display: 'inline', marginRight: '6px' }} />
                                Review Model
                            </label>
                            <select
                                className="input select"
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                            >
                                {MODEL_OPTIONS.map(model => (
                                    <option key={model.id} value={model.id}>
                                        {model.name} - {model.description}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* File List - Scrollable without preview */}
                        {uploadedFiles.length > 0 ? (
                            <div className="input-group">
                                <label className="input-label">
                                    Uploaded Files ({uploadedFiles.length})
                                </label>
                                <div
                                    style={{
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-md)',
                                        maxHeight: '350px',
                                        overflowY: 'auto'
                                    }}
                                >
                                    {uploadedFiles.map((file, index) => (
                                        <div
                                            key={index}
                                            onClick={() => setSelectedFileIndex(index)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '12px 14px',
                                                cursor: 'pointer',
                                                background: selectedFileIndex === index
                                                    ? 'rgba(59, 130, 246, 0.15)'
                                                    : 'transparent',
                                                borderBottom: index < uploadedFiles.length - 1 ? '1px solid var(--border-light)' : 'none',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <div className="flex items-center gap-3" style={{ flex: 1, minWidth: 0 }}>
                                                <File size={18} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{
                                                        fontWeight: 500,
                                                        fontSize: '14px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        color: 'var(--text-primary)'
                                                    }}>
                                                        {file.name}
                                                    </div>
                                                    <div style={{
                                                        fontSize: '12px',
                                                        color: 'var(--text-secondary)',
                                                        marginTop: '2px'
                                                    }}>
                                                        {file.tcId} • {(file.size / 1024).toFixed(1)}KB
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                                className="btn btn-ghost"
                                                style={{ padding: '4px', marginLeft: '8px' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div
                                className="flex flex-col items-center justify-center text-center"
                                style={{
                                    padding: '48px 24px',
                                    color: 'var(--text-tertiary)',
                                    border: '2px dashed var(--border-light)',
                                    borderRadius: 'var(--radius-md)',
                                    marginTop: '8px'
                                }}
                            >
                                <Upload size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                                <p style={{ fontWeight: 500 }}>Upload .robot files</p>
                                <p className="text-sm" style={{ marginTop: '4px' }}>
                                    Format: TCID_TestName.robot
                                </p>
                            </div>
                        )}

                        {/* Action Buttons */}
                        {uploadedFiles.length > 0 && (
                            <div className="flex gap-2" style={{ marginTop: '16px' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleReview}
                                    disabled={isReviewing || !currentFile}
                                    style={{ flex: 1 }}
                                >
                                    {isReviewing ? (
                                        <><Loader2 size={16} className="spinner" /> Reviewing...</>
                                    ) : (
                                        <><FileSearch size={16} /> Review</>
                                    )}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleDryRun}
                                    disabled={isDryRunning || !currentFile}
                                    style={{ flex: 1 }}
                                >
                                    {isDryRunning ? (
                                        <><Loader2 size={16} className="spinner" /> Running...</>
                                    ) : (
                                        <><Terminal size={16} /> Dry Run</>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Results */}
                <div className="card" style={{ flex: '1 1 500px', minWidth: '400px' }}>
                    <div className="card-header">
                        <h3 className="card-title">Results</h3>
                        <div className="flex gap-2">
                            <button
                                className={`btn ${activeTab === 'review' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setActiveTab('review')}
                                style={{ padding: '8px 16px' }}
                            >
                                <FileSearch size={14} /> Review
                            </button>
                            <button
                                className={`btn ${activeTab === 'dryrun' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setActiveTab('dryrun')}
                                style={{ padding: '8px 16px' }}
                            >
                                <Terminal size={14} /> Dry Run
                            </button>
                        </div>
                    </div>
                    <div className="card-body" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        {activeTab === 'review' ? (
                            reviewResult ? (
                                <div className="flex flex-col gap-4">
                                    {reviewResult.score !== undefined && reviewResult.score !== null && (
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`badge ${reviewResult.score >= 7 ? 'badge-success' : reviewResult.score >= 4 ? 'badge-warning' : 'badge-error'}`}
                                                style={{ fontSize: '14px', padding: '8px 14px' }}
                                            >
                                                Score: {reviewResult.score}/10
                                            </span>
                                        </div>
                                    )}

                                    <div>
                                        <h4 className="font-medium" style={{ marginBottom: '8px' }}>AI Feedback</h4>
                                        <div style={{
                                            padding: '16px',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: 'var(--radius-md)',
                                            whiteSpace: 'pre-wrap',
                                            fontSize: '14px',
                                            lineHeight: '1.6'
                                        }}>
                                            {reviewResult.feedback}
                                        </div>
                                    </div>

                                    {reviewResult.suggestions?.length > 0 && (
                                        <div>
                                            <h4 className="font-medium" style={{ marginBottom: '8px' }}>Suggestions</h4>
                                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                                {reviewResult.suggestions.map((suggestion, i) => (
                                                    <li key={i} className="flex items-center gap-2" style={{
                                                        padding: '8px 12px',
                                                        background: 'var(--bg-secondary)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        marginBottom: '4px'
                                                    }}>
                                                        <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                        <span className="text-sm">{suggestion}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                                        <h4 className="font-medium" style={{ marginBottom: '8px' }}>Request Improvement</h4>
                                        <textarea
                                            className="input textarea"
                                            placeholder="Describe improvements..."
                                            value={improvementRequest}
                                            onChange={(e) => setImprovementRequest(e.target.value)}
                                            rows={2}
                                        />
                                        <button
                                            className="btn btn-primary mt-4"
                                            onClick={handleImprove}
                                            disabled={isImproving || !improvementRequest.trim()}
                                            style={{ width: '100%' }}
                                        >
                                            {isImproving ? (
                                                <><Loader2 size={16} className="spinner" /> Improving...</>
                                            ) : (
                                                <><Sparkles size={16} /> Improve</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-center" style={{ padding: '40px 24px', color: 'var(--text-tertiary)' }}>
                                    <FileSearch size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                    <p>Upload files and click Review</p>
                                </div>
                            )
                        ) : (
                            dryRunResult ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-2">
                                        {dryRunResult.success ? (
                                            <span className="badge badge-success" style={{ fontSize: '14px', padding: '8px 14px' }}>
                                                <CheckCircle size={14} style={{ marginRight: '6px' }} /> Syntax Valid
                                            </span>
                                        ) : (
                                            <span className="badge badge-error" style={{ fontSize: '14px', padding: '8px 14px' }}>
                                                <AlertCircle size={14} style={{ marginRight: '6px' }} /> Errors Found
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <h4 className="font-medium" style={{ marginBottom: '8px' }}>Output</h4>
                                        <pre className="code-editor" style={{ margin: 0, maxHeight: '250px', overflowY: 'auto', fontSize: '12px' }}>
                                            {dryRunResult.output || 'No output'}
                                        </pre>
                                    </div>

                                    {dryRunResult.errors?.length > 0 && (
                                        <div>
                                            <h4 className="font-medium" style={{ marginBottom: '8px', color: 'var(--error)' }}>Errors</h4>
                                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                                {dryRunResult.errors.map((error, i) => (
                                                    <li key={i} className="flex items-center gap-2" style={{
                                                        padding: '8px 12px',
                                                        background: 'rgba(239, 68, 68, 0.1)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        marginBottom: '4px',
                                                        color: 'var(--error)'
                                                    }}>
                                                        <AlertCircle size={16} style={{ flexShrink: 0 }} />
                                                        <span className="text-sm">{error}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-center" style={{ padding: '40px 24px', color: 'var(--text-tertiary)' }}>
                                    <Terminal size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                    <p>Click Dry Run to check syntax</p>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Improved Code */}
            {improvedCode && (
                <div className="card mt-4">
                    <div className="card-header">
                        <h3 className="card-title">Improved Code</h3>
                        <div className="flex gap-2">
                            <button className="btn btn-ghost" onClick={copyImproved}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                            <button className="btn btn-primary" onClick={applyImprovement}>
                                <RefreshCw size={16} /> Apply
                            </button>
                        </div>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <pre className="code-editor" style={{ margin: 0, maxHeight: '300px', overflowY: 'auto' }}>
                            {improvedCode}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ReviewTab;

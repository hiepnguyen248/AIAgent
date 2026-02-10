import { useState, useRef } from 'react';
import {
    Wand2,
    Copy,
    Check,
    Upload,
    Loader2,
    FileText,
    FolderOpen,
    CheckCircle,
    AlertCircle,
    Cpu,
    Save
} from 'lucide-react';

const MODEL_OPTIONS = [
    { id: 'exacode', name: 'EXACODE', description: 'LGE EXACODE API' },
    { id: 'ollama-llama3', name: 'Llama3:8B', description: 'Local Ollama' },
    { id: 'ollama-qwen3', name: 'Qwen3:8B', description: 'Local Ollama' },
];

function GenerateTab() {
    const [selectedModel, setSelectedModel] = useState('exacode');
    const [mdFile, setMdFile] = useState(null);
    const [mdContent, setMdContent] = useState('');
    const [testCaseIds, setTestCaseIds] = useState('');
    const [outputFolder, setOutputFolder] = useState('');
    const [generatedTests, setGeneratedTests] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0, tcId: '', status: '' });
    const [copied, setCopied] = useState(false);

    const mdFileRef = useRef(null);

    // Parse Test Case IDs from input (comma, space, newline separated)
    const parseTestCaseIds = (input) => {
        return input
            .split(/[,\s\n]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0);
    };

    const handleMdFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setMdFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                setMdContent(event.target.result);
            };
            reader.readAsText(file);
        }
    };

    const saveTestFile = async (folderPath, tcId, content, testCaseName) => {
        const filename = `${tcId.replace(/\s+/g, '_')}_${testCaseName?.replace(/\s+/g, '_') || 'test'}`;
        try {
            const response = await fetch('/api/test/save-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder_path: folderPath,
                    filename: filename,
                    content: content
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to save file');
            }

            const data = await response.json();
            return { success: true, path: data.file_path };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const handleGenerate = async () => {
        const tcIds = parseTestCaseIds(testCaseIds);
        if (tcIds.length === 0) {
            alert('Please enter at least one Test Case ID');
            return;
        }

        if (!outputFolder.trim()) {
            alert('Please enter Output Folder path to save generated test scripts');
            return;
        }

        setIsLoading(true);
        setGeneratedTests([]);
        setCurrentProgress({ current: 0, total: tcIds.length, tcId: '', status: 'Starting...' });

        const results = [];

        for (let i = 0; i < tcIds.length; i++) {
            const tcId = tcIds[i];
            setCurrentProgress({ current: i + 1, total: tcIds.length, tcId, status: 'Generating...' });

            try {
                // 1. Fetch test case from CodeBeamer MCP
                let testCaseData = null;
                try {
                    const tcResponse = await fetch('/api/codebeamer/testcase/' + tcId);
                    if (tcResponse.ok) {
                        testCaseData = await tcResponse.json();
                    }
                } catch (e) {
                    console.warn('Could not fetch from CodeBeamer:', e);
                }

                // 2. Generate test using AI
                const response = await fetch('/api/test/generate-ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        description: testCaseData
                            ? `Test Case ID: ${tcId}\nName: ${testCaseData.name || ''}\nFeature: ${testCaseData.feature || ''}\nPrecondition: ${testCaseData.precondition || ''}\nTest Steps: ${testCaseData.steps || ''}\nExpected Result: ${testCaseData.expected || ''}`
                            : `Generate Robot Framework test for Test Case ID: ${tcId}`,
                        test_type: 'automotive',
                        model: selectedModel,
                        automation_context: mdContent || null
                    })
                });

                const data = await response.json();
                const testCode = data.test_code || `*** Test Cases ***\n# Generated for ${tcId}\n# Error: No test code returned`;
                const testCaseName = testCaseData?.name || tcId;

                // 3. Auto-save to output folder
                setCurrentProgress({ current: i + 1, total: tcIds.length, tcId, status: 'Saving...' });
                const saveResult = await saveTestFile(outputFolder, tcId, testCode, testCaseName);

                results.push({
                    tcId,
                    status: 'success',
                    testCode,
                    testCaseName,
                    validation: data.validation,
                    saved: saveResult.success,
                    savedPath: saveResult.path,
                    saveError: saveResult.error
                });
            } catch (error) {
                results.push({
                    tcId,
                    status: 'error',
                    error: error.message,
                    testCode: `*** Test Cases ***\n# Error generating test for ${tcId}: ${error.message}`,
                    saved: false
                });
            }

            setGeneratedTests([...results]);
        }

        setIsLoading(false);
        const savedCount = results.filter(r => r.saved).length;
        setCurrentProgress({
            current: tcIds.length,
            total: tcIds.length,
            tcId: 'Complete!',
            status: `${savedCount}/${tcIds.length} files saved to ${outputFolder}`
        });
    };

    const copyAllTests = async () => {
        const allCode = generatedTests.map(t => t.testCode).join('\n\n');
        await navigator.clipboard.writeText(allCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const progressPercent = currentProgress.total > 0
        ? (currentProgress.current / currentProgress.total) * 100
        : 0;

    const canGenerate = parseTestCaseIds(testCaseIds).length > 0 && outputFolder.trim().length > 0;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Generate Test Script</h1>
                <p className="page-subtitle">Generate Robot Framework tests from CodeBeamer test cases</p>
            </div>

            <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                {/* Left Panel - Configuration */}
                <div className="card" style={{ flex: '1 1 450px', minWidth: '400px' }}>
                    <div className="card-header">
                        <h3 className="card-title">Test Configuration</h3>
                    </div>
                    <div className="card-body">
                        {/* Model Selection */}
                        <div className="input-group">
                            <label className="input-label">
                                <Cpu size={14} style={{ display: 'inline', marginRight: '6px' }} />
                                AI Model
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

                        {/* Test Case IDs */}
                        <div className="input-group">
                            <label className="input-label">
                                Test Case ID(s) <span style={{ color: 'var(--error)' }}>*</span>
                            </label>
                            <textarea
                                className="input textarea"
                                placeholder="Enter Test Case IDs (separated by comma, space, or new line)&#10;&#10;Example:&#10;TC-001, TC-002&#10;TC-003&#10;TC-004 TC-005"
                                value={testCaseIds}
                                onChange={(e) => setTestCaseIds(e.target.value)}
                                rows={5}
                                style={{ fontFamily: 'monospace' }}
                            />
                            <p className="text-sm" style={{ marginTop: '4px', color: 'var(--text-tertiary)' }}>
                                {parseTestCaseIds(testCaseIds).length} test case(s) detected
                            </p>
                        </div>

                        {/* Automation Framework MD File */}
                        <div className="input-group">
                            <label className="input-label">
                                <FileText size={14} style={{ display: 'inline', marginRight: '6px' }} />
                                Automation Framework Instructions (.md)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="Optional: Select .md file with keywords..."
                                    value={mdFile?.name || ''}
                                    readOnly
                                    style={{ flex: 1 }}
                                />
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => mdFileRef.current?.click()}
                                >
                                    <Upload size={16} />
                                    Browse
                                </button>
                                <input
                                    ref={mdFileRef}
                                    type="file"
                                    accept=".md,.txt"
                                    style={{ display: 'none' }}
                                    onChange={handleMdFileUpload}
                                />
                            </div>
                            {mdFile && (
                                <p className="text-sm" style={{ marginTop: '8px', color: 'var(--success)' }}>
                                    ✓ Loaded: {mdFile.name} ({Math.round(mdContent.length / 1024)}KB)
                                </p>
                            )}
                        </div>

                        {/* Output Folder - REQUIRED */}
                        <div className="input-group">
                            <label className="input-label">
                                <FolderOpen size={14} style={{ display: 'inline', marginRight: '6px' }} />
                                Output Folder <span style={{ color: 'var(--error)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                placeholder="D:\TestScripts\Generated"
                                value={outputFolder}
                                onChange={(e) => setOutputFolder(e.target.value)}
                            />
                            <p className="text-sm" style={{ marginTop: '4px', color: 'var(--text-tertiary)' }}>
                                Generated .robot files will be auto-saved to this folder
                            </p>
                        </div>

                        {/* Generate Button */}
                        <button
                            className="btn btn-primary"
                            onClick={handleGenerate}
                            disabled={isLoading || !canGenerate}
                            style={{ width: '100%', padding: '14px' }}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={18} className="spinner" />
                                    Generating & Saving...
                                </>
                            ) : (
                                <>
                                    <Wand2 size={18} />
                                    Generate & Save
                                </>
                            )}
                        </button>

                        {/* Progress Bar */}
                        {(isLoading || currentProgress.total > 0) && (
                            <div style={{ marginTop: '20px' }}>
                                <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
                                    <span className="text-sm font-medium">
                                        {isLoading ? `${currentProgress.tcId}: ${currentProgress.status}` : currentProgress.status}
                                    </span>
                                    <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                                        {currentProgress.current} / {currentProgress.total}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        width: '100%',
                                        height: '8px',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-full)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div
                                        style={{
                                            width: `${progressPercent}%`,
                                            height: '100%',
                                            background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                                            borderRadius: 'var(--radius-full)',
                                            transition: 'width 0.3s ease'
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - Results */}
                <div className="card" style={{ flex: '1 1 550px', minWidth: '450px' }}>
                    <div className="card-header">
                        <h3 className="card-title">Generated Tests</h3>
                        {generatedTests.length > 0 && (
                            <button className="btn btn-ghost" onClick={copyAllTests}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Copied!' : 'Copy All'}
                            </button>
                        )}
                    </div>
                    <div className="card-body" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                        {generatedTests.length > 0 ? (
                            <div className="flex flex-col gap-3">
                                {generatedTests.map((test, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            padding: '14px 16px',
                                            border: '1px solid var(--border-light)',
                                            borderRadius: 'var(--radius-md)',
                                            background: test.saved ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-secondary)'
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {test.status === 'success' ? (
                                                    <CheckCircle size={18} style={{ color: 'var(--success)' }} />
                                                ) : (
                                                    <AlertCircle size={18} style={{ color: 'var(--error)' }} />
                                                )}
                                                <div>
                                                    <span className="font-medium">{test.tcId}</span>
                                                    {test.testCaseName && test.testCaseName !== test.tcId && (
                                                        <span className="text-sm" style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                                                            {test.testCaseName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {test.saved && (
                                                <span className="badge badge-success" style={{ fontSize: '11px' }}>
                                                    <Save size={12} style={{ marginRight: '4px' }} />
                                                    Saved
                                                </span>
                                            )}
                                        </div>
                                        {test.savedPath && (
                                            <p className="text-sm" style={{ marginTop: '8px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                                                📁 {test.savedPath}
                                            </p>
                                        )}
                                        {test.saveError && (
                                            <p className="text-sm" style={{ marginTop: '8px', color: 'var(--error)' }}>
                                                ⚠️ Save failed: {test.saveError}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div
                                className="flex flex-col items-center justify-center text-center"
                                style={{ padding: '60px 24px', color: 'var(--text-tertiary)' }}
                            >
                                <FolderOpen size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                                <p>Enter Output Folder and Test Case IDs</p>
                                <p className="text-sm" style={{ marginTop: '8px' }}>
                                    Generated tests will auto-save to your folder
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default GenerateTab;

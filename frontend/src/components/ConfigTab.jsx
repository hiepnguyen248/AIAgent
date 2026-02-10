import { useState, useEffect } from 'react';
import {
    Settings,
    Save,
    TestTube,
    CheckCircle,
    XCircle,
    Loader2,
    Server,
    Database,
    Key,
    RefreshCw,
    AlertTriangle
} from 'lucide-react';

// Fixed Ollama URL - not editable
const OLLAMA_URL = 'http://localhost:11434';

function ConfigTab() {
    const [config, setConfig] = useState({
        llm: {
            provider: 'exacode',
            exacode: {
                api_key: '',
                base_url: 'http://exacode-chat.lge.com/v1',
                model: 'Chat-EXACODE-A'
            },
            ollama: {
                model: 'llama3:8b'
            }
        },
        codebeamer: {
            url: '',
            username: '',
            password: '',
            ssl_verify: false // Default HTTP, not HTTPS
        }
    });

    const [llmStatus, setLlmStatus] = useState(null);
    const [cbStatus, setCbStatus] = useState(null);
    const [isTesting, setIsTesting] = useState({ llm: false, cb: false });
    const [isSaving, setIsSaving] = useState(false);
    const [ollamaModels, setOllamaModels] = useState([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    useEffect(() => {
        // Load current config
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const response = await fetch('/api/config/current');
            if (response.ok) {
                const data = await response.json();
                setConfig(prev => ({
                    ...prev,
                    llm: {
                        ...prev.llm,
                        provider: data.llm?.provider || 'exacode',
                        exacode: {
                            ...prev.llm.exacode,
                            base_url: data.llm?.exacode?.base_url || prev.llm.exacode.base_url,
                            model: data.llm?.exacode?.model || prev.llm.exacode.model
                        },
                        ollama: {
                            ...prev.llm.ollama,
                            model: data.llm?.ollama?.model || prev.llm.ollama.model
                        }
                    },
                    codebeamer: {
                        ...prev.codebeamer,
                        url: data.codebeamer?.url || ''
                    }
                }));
            }
        } catch (error) {
            console.error('Failed to fetch config:', error);
        }
    };

    const fetchOllamaModels = async () => {
        setIsLoadingModels(true);
        try {
            const response = await fetch(`${OLLAMA_URL}/api/tags`);
            if (response.ok) {
                const data = await response.json();
                const models = (data.models || []).map(m => m.name);
                setOllamaModels(models);
                if (models.length > 0 && !models.includes(config.llm.ollama.model)) {
                    updateLLMConfig('ollama', 'model', models[0]);
                }
            } else {
                setOllamaModels([]);
            }
        } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            setOllamaModels([]);
        } finally {
            setIsLoadingModels(false);
        }
    };

    const saveLLMConfig = async () => {
        setIsSaving(true);
        try {
            const llmConfig = config.llm;
            const body = {
                provider: llmConfig.provider,
                ...(llmConfig.provider === 'exacode' ? {
                    api_key: llmConfig.exacode.api_key,
                    base_url: llmConfig.exacode.base_url,
                    model: llmConfig.exacode.model
                } : {
                    base_url: OLLAMA_URL,
                    model: llmConfig.ollama.model
                })
            };

            const response = await fetch('/api/config/llm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                setLlmStatus({ success: true, message: 'LLM configuration saved!' });
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            setLlmStatus({ success: false, message: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const saveCodeBeamerConfig = async () => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/config/codebeamer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config.codebeamer)
            });

            if (response.ok) {
                setCbStatus({ success: true, message: 'CodeBeamer configuration saved!' });
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            setCbStatus({ success: false, message: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const testLLMConnection = async () => {
        // Validate before testing
        if (config.llm.provider === 'exacode') {
            if (!config.llm.exacode.api_key || config.llm.exacode.api_key.trim() === '') {
                setLlmStatus({
                    success: false,
                    message: 'EXACODE API Key is required. Please enter your API key first.'
                });
                return;
            }
        }

        setIsTesting(prev => ({ ...prev, llm: true }));
        setLlmStatus(null);

        try {
            // Build request body with current config for fresh connection test
            const testConfig = {
                provider: config.llm.provider,
                ...(config.llm.provider === 'exacode' ? {
                    api_key: config.llm.exacode.api_key,
                    base_url: config.llm.exacode.base_url,
                    model: config.llm.exacode.model
                } : {
                    base_url: OLLAMA_URL,
                    model: config.llm.ollama.model
                })
            };

            const response = await fetch('/api/config/test-llm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testConfig)
            });
            const data = await response.json();

            setLlmStatus({
                success: data.success,
                message: data.success
                    ? data.message || `Connected! Model ready.`
                    : data.error || 'Connection failed'
            });
        } catch (error) {
            setLlmStatus({ success: false, message: error.message });
        } finally {
            setIsTesting(prev => ({ ...prev, llm: false }));
        }
    };

    const testCodeBeamerConnection = async () => {
        // Validate before testing
        if (!config.codebeamer.url || config.codebeamer.url.trim() === '') {
            setCbStatus({
                success: false,
                message: 'CodeBeamer URL is required.'
            });
            return;
        }
        if (!config.codebeamer.username || config.codebeamer.username.trim() === '') {
            setCbStatus({
                success: false,
                message: 'Username is required.'
            });
            return;
        }
        if (!config.codebeamer.password || config.codebeamer.password.trim() === '') {
            setCbStatus({
                success: false,
                message: 'Password is required.'
            });
            return;
        }

        setIsTesting(prev => ({ ...prev, cb: true }));
        setCbStatus(null);

        try {
            const response = await fetch('/api/config/test-codebeamer', { method: 'POST' });
            const data = await response.json();

            setCbStatus({
                success: data.success,
                message: data.success ? 'Connection successful!' : data.error
            });
        } catch (error) {
            setCbStatus({ success: false, message: error.message });
        } finally {
            setIsTesting(prev => ({ ...prev, cb: false }));
        }
    };

    const updateConfig = (section, field, value) => {
        setConfig(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: value
            }
        }));
    };

    const updateLLMConfig = (provider, field, value) => {
        setConfig(prev => ({
            ...prev,
            llm: {
                ...prev.llm,
                [provider]: {
                    ...prev.llm[provider],
                    [field]: value
                }
            }
        }));
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Configuration</h1>
                <p className="page-subtitle">Configure LLM providers and CodeBeamer connection</p>
            </div>

            <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                {/* LLM Configuration */}
                <div className="card" style={{ flex: '1 1 450px', minWidth: '400px' }}>
                    <div className="card-header">
                        <div className="flex items-center gap-2">
                            <Server size={20} style={{ color: 'var(--primary-500)' }} />
                            <h3 className="card-title">LLM Provider</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        {/* Provider Selection */}
                        <div className="input-group">
                            <label className="input-label">Provider</label>
                            <div className="flex gap-2">
                                <button
                                    className={`btn ${config.llm.provider === 'exacode' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => updateConfig('llm', 'provider', 'exacode')}
                                    style={{ flex: 1 }}
                                >
                                    LGE EXACODE
                                </button>
                                <button
                                    className={`btn ${config.llm.provider === 'ollama' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => {
                                        updateConfig('llm', 'provider', 'ollama');
                                        fetchOllamaModels();
                                    }}
                                    style={{ flex: 1 }}
                                >
                                    Ollama (Local)
                                </button>
                            </div>
                        </div>

                        {/* EXACODE Config */}
                        {config.llm.provider === 'exacode' && (
                            <>
                                <div className="input-group">
                                    <label className="input-label">
                                        <Key size={14} style={{ display: 'inline', marginRight: '6px' }} />
                                        API Key <span style={{ color: 'var(--error)' }}>*</span>
                                    </label>
                                    <input
                                        type="password"
                                        className="input"
                                        placeholder="Enter your EXACODE API key"
                                        value={config.llm.exacode.api_key}
                                        onChange={(e) => updateLLMConfig('exacode', 'api_key', e.target.value)}
                                    />
                                    {!config.llm.exacode.api_key && (
                                        <p className="text-sm" style={{ marginTop: '4px', color: 'var(--warning)' }}>
                                            <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                            API key required for EXACODE
                                        </p>
                                    )}
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Base URL</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={config.llm.exacode.base_url}
                                        onChange={(e) => updateLLMConfig('exacode', 'base_url', e.target.value)}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Available Model</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={config.llm.exacode.model}
                                        onChange={(e) => updateLLMConfig('exacode', 'model', e.target.value)}
                                    />
                                </div>
                            </>
                        )}

                        {/* Ollama Config */}
                        {config.llm.provider === 'ollama' && (
                            <>
                                <div className="input-group">
                                    <label className="input-label">Ollama URL (Fixed)</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={OLLAMA_URL}
                                        disabled
                                        style={{
                                            background: 'var(--bg-tertiary)',
                                            cursor: 'not-allowed',
                                            opacity: 0.7
                                        }}
                                    />
                                    <p className="text-sm" style={{ marginTop: '4px', color: 'var(--text-tertiary)' }}>
                                        Ollama must be running locally on default port
                                    </p>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Available Model</label>
                                    <div className="flex gap-2">
                                        {ollamaModels.length > 0 ? (
                                            <select
                                                className="input select"
                                                value={config.llm.ollama.model}
                                                onChange={(e) => updateLLMConfig('ollama', 'model', e.target.value)}
                                                style={{ flex: 1 }}
                                            >
                                                {ollamaModels.map(model => (
                                                    <option key={model} value={model}>{model}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="e.g., llama3:8b, qwen3:8b"
                                                value={config.llm.ollama.model}
                                                onChange={(e) => updateLLMConfig('ollama', 'model', e.target.value)}
                                                style={{ flex: 1 }}
                                            />
                                        )}
                                        <button
                                            className="btn btn-secondary btn-icon"
                                            onClick={fetchOllamaModels}
                                            disabled={isLoadingModels}
                                            title="Refresh available models"
                                        >
                                            <RefreshCw size={16} className={isLoadingModels ? 'spinner' : ''} />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Status Message */}
                        {llmStatus && (
                            <div
                                className={`flex items-center gap-2 p-3 rounded-md`}
                                style={{
                                    background: llmStatus.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: llmStatus.success ? 'var(--success)' : 'var(--error)',
                                    padding: '12px',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: '16px'
                                }}
                            >
                                {llmStatus.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                <span className="text-sm">{llmStatus.message}</span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                            <button
                                className="btn btn-secondary"
                                onClick={testLLMConnection}
                                disabled={isTesting.llm}
                                style={{ flex: 1 }}
                            >
                                {isTesting.llm ? <Loader2 size={16} className="spinner" /> : <TestTube size={16} />}
                                Test Connection
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={saveLLMConfig}
                                disabled={isSaving}
                                style={{ flex: 1 }}
                            >
                                {isSaving ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>

                {/* CodeBeamer Configuration */}
                <div className="card" style={{ flex: '1 1 450px', minWidth: '400px' }}>
                    <div className="card-header">
                        <div className="flex items-center gap-2">
                            <Database size={20} style={{ color: 'var(--primary-500)' }} />
                            <h3 className="card-title">CodeBeamer</h3>
                        </div>
                    </div>
                    <div className="card-body">
                        <div className="input-group">
                            <label className="input-label">CodeBeamer URL</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="http://codebeamer.com"
                                value={config.codebeamer.url}
                                onChange={(e) => updateConfig('codebeamer', 'url', e.target.value)}
                            />

                        </div>
                        <div className="input-group">
                            <label className="input-label">Username</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Enter your username"
                                value={config.codebeamer.username}
                                onChange={(e) => updateConfig('codebeamer', 'username', e.target.value)}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Password</label>
                            <input
                                type="password"
                                className="input"
                                placeholder="Enter your password"
                                value={config.codebeamer.password}
                                onChange={(e) => updateConfig('codebeamer', 'password', e.target.value)}
                            />
                        </div>

                        {/* Status Message */}
                        {cbStatus && (
                            <div
                                className={`flex items-center gap-2`}
                                style={{
                                    background: cbStatus.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: cbStatus.success ? 'var(--success)' : 'var(--error)',
                                    padding: '12px',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: '16px'
                                }}
                            >
                                {cbStatus.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                <span className="text-sm">{cbStatus.message}</span>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                            <button
                                className="btn btn-secondary"
                                onClick={testCodeBeamerConnection}
                                disabled={isTesting.cb}
                                style={{ flex: 1 }}
                            >
                                {isTesting.cb ? <Loader2 size={16} className="spinner" /> : <TestTube size={16} />}
                                Test Connection
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={saveCodeBeamerConfig}
                                disabled={isSaving}
                                style={{ flex: 1 }}
                            >
                                {isSaving ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ConfigTab;

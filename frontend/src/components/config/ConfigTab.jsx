import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Server, Link2, Eye, EyeOff, Loader2, CheckCircle2,
  XCircle, Save, Zap, Globe,
} from 'lucide-react';
import {
  getConfig, configureLLM, configureCodebeamer,
  testLLMConnection, testCodebeamerConnection, getOllamaModels,
} from '../../utils/api';
import { useToast } from '../../App';

export default function ConfigTab() {
  // LLM state
  const [llmProvider, setLlmProvider] = useState('exacode');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [llmTestStatus, setLlmTestStatus] = useState(null); // 'success' | 'error' | null
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);

  // CodeBeamer state
  const [cbUrl, setCbUrl] = useState('');
  const [cbUsername, setCbUsername] = useState('');
  const [cbPassword, setCbPassword] = useState('');
  const [cbSslVerify, setCbSslVerify] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [cbTestStatus, setCbTestStatus] = useState(null);
  const [cbTesting, setCbTesting] = useState(false);
  const [cbSaving, setCbSaving] = useState(false);

  const toast = useToast();

  const loadConfig = useCallback(async () => {
    try {
      const config = await getConfig();
      if (config) {
        // LLM
        if (config.llm) {
          setLlmProvider(config.llm.provider || 'exacode');
          setLlmApiKey(config.llm.api_key || '');
          setLlmBaseUrl(config.llm.base_url || '');
          setLlmModel(config.llm.model || '');
          if (config.llm.ollama_base_url) setOllamaBaseUrl(config.llm.ollama_base_url);
          if (config.llm.ollama_model) setOllamaModel(config.llm.ollama_model);
        }
        // CodeBeamer
        if (config.codebeamer) {
          setCbUrl(config.codebeamer.url || '');
          setCbUsername(config.codebeamer.username || '');
          setCbPassword(config.codebeamer.password || '');
          setCbSslVerify(config.codebeamer.ssl_verify !== false);
        }
      }
    } catch {
      // Backend not available
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const fetchOllamaModels = async () => {
    try {
      const data = await getOllamaModels();
      setOllamaModels(data.models || data || []);
    } catch {
      setOllamaModels([]);
    }
  };

  useEffect(() => {
    if (llmProvider === 'ollama') fetchOllamaModels();
  }, [llmProvider]);

  const handleLlmTest = async () => {
    setLlmTesting(true);
    setLlmTestStatus(null);
    try {
      await testLLMConnection();
      setLlmTestStatus('success');
      toast('LLM connection successful!', 'success');
    } catch (err) {
      setLlmTestStatus('error');
      toast(`LLM connection failed: ${err.message}`, 'error');
    } finally {
      setLlmTesting(false);
    }
  };

  const handleLlmSave = async () => {
    setLlmSaving(true);
    try {
      const payload = {
        provider: llmProvider,
        ...(llmProvider === 'exacode'
          ? { api_key: llmApiKey, base_url: llmBaseUrl, model: llmModel }
          : { ollama_base_url: ollamaBaseUrl, ollama_model: ollamaModel }),
      };
      await configureLLM(payload);
      toast('LLM configuration saved!', 'success');
    } catch (err) {
      toast(`Save failed: ${err.message}`, 'error');
    } finally {
      setLlmSaving(false);
    }
  };

  const handleCbTest = async () => {
    setCbTesting(true);
    setCbTestStatus(null);
    try {
      await testCodebeamerConnection();
      setCbTestStatus('success');
      toast('CodeBeamer connection successful!', 'success');
    } catch (err) {
      setCbTestStatus('error');
      toast(`CodeBeamer connection failed: ${err.message}`, 'error');
    } finally {
      setCbTesting(false);
    }
  };

  const handleCbSave = async () => {
    setCbSaving(true);
    try {
      await configureCodebeamer({
        url: cbUrl,
        username: cbUsername,
        password: cbPassword,
        ssl_verify: cbSslVerify,
      });
      toast('CodeBeamer configuration saved!', 'success');
    } catch (err) {
      toast(`Save failed: ${err.message}`, 'error');
    } finally {
      setCbSaving(false);
    }
  };

  return (
    <div className="config-layout">
      {/* ─── LLM Configuration ─────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Zap /> LLM Configuration</div>
          {llmTestStatus && (
            llmTestStatus === 'success'
              ? <span className="badge badge-success"><CheckCircle2 size={12} /> Connected</span>
              : <span className="badge badge-error"><XCircle size={12} /> Failed</span>
          )}
        </div>

        <div className="config-form">
          {/* Provider Selection */}
          <div className="input-group">
            <label>Provider</label>
            <div className="radio-group">
              <label
                className={`radio-option ${llmProvider === 'exacode' ? 'selected' : ''}`}
                onClick={() => setLlmProvider('exacode')}
              >
                <input type="radio" name="provider" checked={llmProvider === 'exacode'} readOnly />
                <Zap size={14} /> EXACODE
              </label>
              <label
                className={`radio-option ${llmProvider === 'ollama' ? 'selected' : ''}`}
                onClick={() => setLlmProvider('ollama')}
              >
                <input type="radio" name="provider" checked={llmProvider === 'ollama'} readOnly />
                <Server size={14} /> Ollama
              </label>
            </div>
          </div>

          {/* EXACODE Fields */}
          {llmProvider === 'exacode' && (
            <>
              <div className="input-group">
                <label>API Key</label>
                <input
                  className="input"
                  type="password"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder="Enter API key..."
                />
              </div>
              <div className="input-group">
                <label>Base URL</label>
                <input
                  className="input"
                  value={llmBaseUrl}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="https://api.exacode.ai/v1"
                />
              </div>
              <div className="input-group">
                <label>Model</label>
                <input
                  className="input"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="Model name..."
                />
              </div>
            </>
          )}

          {/* Ollama Fields */}
          {llmProvider === 'ollama' && (
            <>
              <div className="input-group">
                <label>Base URL</label>
                <input
                  className="input"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </div>
              <div className="input-group">
                <label>Model</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ollamaModels.length > 0 ? (
                    <select
                      className="select"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                    >
                      <option value="">Select a model...</option>
                      {ollamaModels.map((m) => {
                        const name = typeof m === 'string' ? m : m.name || m.model;
                        return <option key={name} value={name}>{name}</option>;
                      })}
                    </select>
                  ) : (
                    <input
                      className="input"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="e.g., gemma4, llama3"
                    />
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={fetchOllamaModels} title="Refresh models">
                    <Loader2 size={14} />
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="config-form-actions">
            <button className="btn btn-secondary" onClick={handleLlmTest} disabled={llmTesting}>
              {llmTesting ? <div className="spinner" /> : <Globe size={14} />}
              Test Connection
            </button>
            <button className="btn btn-primary" onClick={handleLlmSave} disabled={llmSaving}>
              {llmSaving ? <div className="spinner" style={{ borderTopColor: 'white' }} /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* ─── CodeBeamer Configuration ──────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Link2 /> CodeBeamer Configuration</div>
          {cbTestStatus && (
            cbTestStatus === 'success'
              ? <span className="badge badge-success"><CheckCircle2 size={12} /> Connected</span>
              : <span className="badge badge-error"><XCircle size={12} /> Failed</span>
          )}
        </div>

        <div className="config-form">
          <div className="input-group">
            <label>URL</label>
            <input
              className="input"
              value={cbUrl}
              onChange={(e) => setCbUrl(e.target.value)}
              placeholder="https://codebeamer.example.com"
            />
          </div>

          <div className="input-group">
            <label>Username</label>
            <input
              className="input"
              value={cbUsername}
              onChange={(e) => setCbUsername(e.target.value)}
              placeholder="Username"
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={cbPassword}
                onChange={(e) => setCbPassword(e.target.value)}
                placeholder="Password"
                style={{ paddingRight: 40 }}
              />
              <button
                className="btn btn-ghost btn-sm"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
                onClick={() => setShowPassword((s) => !s)}
                type="button"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>SSL Verification</label>
            <label className="switch">
              <input
                type="checkbox"
                checked={cbSslVerify}
                onChange={(e) => setCbSslVerify(e.target.checked)}
              />
              <span className="switch-slider" />
            </label>
          </div>

          <div className="config-form-actions">
            <button className="btn btn-secondary" onClick={handleCbTest} disabled={cbTesting}>
              {cbTesting ? <div className="spinner" /> : <Globe size={14} />}
              Test Connection
            </button>
            <button className="btn btn-primary" onClick={handleCbSave} disabled={cbSaving}>
              {cbSaving ? <div className="spinner" style={{ borderTopColor: 'white' }} /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

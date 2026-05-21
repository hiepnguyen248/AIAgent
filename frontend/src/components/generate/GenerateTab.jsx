import { useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  FlaskConical, Download, Copy, Check, RefreshCw, Sparkles,
  ArrowRight, FileCode, Loader2, Wand2, Search,
} from 'lucide-react';
import {
  generateTestAI, generateFromCodebeamer, getCodebeamerTestCase,
  validateTest, improveTest, saveTestFile,
} from '../../utils/api';
import { useToast } from '../../App';

const TEST_TYPES = ['CAN', 'UART', 'DLT', 'HMI', 'Generic'];

export default function GenerateTab({ model }) {
  const [inputMode, setInputMode] = useState('manual');
  const [tcId, setTcId] = useState('');
  const [tcDetails, setTcDetails] = useState(null);
  const [description, setDescription] = useState('');
  const [testType, setTestType] = useState('Generic');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingTc, setFetchingTc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qualityScore, setQualityScore] = useState(null);
  const [validation, setValidation] = useState(null);
  const [savePath, setSavePath] = useState('');
  const toast = useToast();

  const fetchTC = async () => {
    if (!tcId.trim()) return;
    setFetchingTc(true);
    setTcDetails(null);
    try {
      const data = await getCodebeamerTestCase(tcId.trim());
      setTcDetails(data);
      toast('Test case fetched successfully', 'success');
    } catch (err) {
      toast(`Failed to fetch: ${err.message}`, 'error');
    } finally {
      setFetchingTc(false);
    }
  };

  const generate = async () => {
    setLoading(true);
    setValidation(null);
    setQualityScore(null);
    try {
      let result;
      if (inputMode === 'codebeamer' && tcDetails) {
        result = await generateFromCodebeamer({
          test_case_id: tcId.trim(),
          test_type: testType,
          model,
        });
      } else {
        result = await generateTestAI({
          description: description.trim(),
          test_type: testType,
          model,
        });
      }
      const generated = result.code || result.robot_code || result.content || '';
      setCode(generated);
      if (result.quality_score !== undefined) setQualityScore(result.quality_score);
      toast('Test generated successfully!', 'success');
    } catch (err) {
      toast(`Generation failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!code.trim()) return;
    try {
      const result = await validateTest({ code });
      setValidation(result);
      toast(result.valid ? 'Syntax is valid!' : 'Validation found issues', result.valid ? 'success' : 'error');
    } catch (err) {
      toast(`Validation failed: ${err.message}`, 'error');
    }
  };

  const handleImprove = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const result = await improveTest({ code, model });
      const improved = result.code || result.improved_code || result.content || '';
      if (improved) setCode(improved);
      if (result.quality_score !== undefined) setQualityScore(result.quality_score);
      toast('Code improved!', 'success');
    } catch (err) {
      toast(`Improve failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Copied to clipboard', 'success');
  };

  const handleSave = async () => {
    if (!code.trim()) return;
    try {
      await saveTestFile({ code, file_path: savePath || undefined });
      toast('File saved successfully!', 'success');
    } catch (err) {
      toast(`Save failed: ${err.message}`, 'error');
    }
  };

  const canGenerate = inputMode === 'codebeamer' ? !!tcDetails : !!description.trim();

  return (
    <div className="generate-layout">
      {/* ─── Left Panel: Input ─────────────────────────────────── */}
      <div className="generate-panel">
        <div className="card">
          <div className="card-header">
            <div className="card-title"><FlaskConical /> Test Generator</div>
            <span className="badge badge-primary">{model}</span>
          </div>

          {/* Mode Toggle */}
          <div className="toggle-group" style={{ marginBottom: 16 }}>
            <button
              className={`toggle-option ${inputMode === 'codebeamer' ? 'active' : ''}`}
              onClick={() => setInputMode('codebeamer')}
            >
              From CodeBeamer
            </button>
            <button
              className={`toggle-option ${inputMode === 'manual' ? 'active' : ''}`}
              onClick={() => setInputMode('manual')}
            >
              Manual Description
            </button>
          </div>

          {/* CodeBeamer Mode */}
          {inputMode === 'codebeamer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="input-group">
                <label>Test Case ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    value={tcId}
                    onChange={(e) => setTcId(e.target.value)}
                    placeholder="e.g. TCID-12345"
                  />
                  <button className="btn btn-secondary" onClick={fetchTC} disabled={!tcId.trim() || fetchingTc}>
                    {fetchingTc ? <Loader2 size={14} className="spinner" /> : <Search size={14} />}
                    Fetch
                  </button>
                </div>
              </div>
              {tcDetails && (
                <div style={{
                  padding: 12,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
                    {tcDetails.name || tcDetails.title || 'Test Case Details'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {tcDetails.description || tcDetails.summary || JSON.stringify(tcDetails, null, 2).slice(0, 300)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Mode */}
          {inputMode === 'manual' && (
            <div className="input-group">
              <label>Test Description</label>
              <textarea
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the test case you want to generate...&#10;&#10;Example: Create a CAN bus test that validates signal 'EngineRPM' on channel CAN1 with message ID 0x100, checking range 0-8000 RPM with 1 RPM resolution."
                rows={6}
              />
            </div>
          )}

          {/* Test Type */}
          <div className="input-group" style={{ marginTop: 12 }}>
            <label>Test Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TEST_TYPES.map((t) => (
                <button
                  key={t}
                  className={`toggle-option ${testType === t ? 'active' : ''}`}
                  onClick={() => setTestType(t)}
                  style={{ flex: 'none', padding: '6px 14px' }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: 16 }}
            onClick={generate}
            disabled={!canGenerate || loading}
          >
            {loading ? (
              <><div className="spinner" style={{ borderTopColor: 'white' }} /> Generating...</>
            ) : (
              <><Sparkles size={18} /> Generate Test</>
            )}
          </button>
        </div>

        {/* Save to File */}
        {code && (
          <div className="card" style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="card-title" style={{ marginBottom: 12 }}><Download size={16} /> Save to File</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                placeholder="Optional file path (e.g., tests/my_test.robot)"
              />
              <button className="btn btn-secondary" onClick={handleSave}>
                <Download size={14} /> Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Right Panel: Preview ──────────────────────────────── */}
      <div className="generate-panel">
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-header">
            <div className="card-title"><FileCode /> Preview</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {qualityScore !== null && (
                <div className="quality-score">
                  <span className="badge badge-success">Score: {qualityScore}%</span>
                  <div className="quality-bar">
                    <div
                      className="quality-bar-fill"
                      style={{
                        width: `${qualityScore}%`,
                        background: qualityScore >= 80 ? 'var(--success)' : qualityScore >= 50 ? 'var(--warning)' : 'var(--error)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="editor-container" style={{ flex: 1 }}>
            {code ? (
              <Editor
                height="100%"
                defaultLanguage="robot"
                language="robot"
                value={code}
                onChange={(v) => setCode(v || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  padding: { top: 12 },
                  scrollBeyondLastLine: false,
                }}
              />
            ) : (
              <div className="empty-state" style={{ height: '100%' }}>
                <FileCode size={48} />
                <h3>No code generated yet</h3>
                <p>Configure your test parameters and click Generate to create a Robot Framework test case.</p>
              </div>
            )}
          </div>

          {/* Validation */}
          {validation && (
            <div className={`validation-results ${validation.valid ? 'valid' : 'invalid'}`} style={{ marginTop: 12 }}>
              {validation.valid ? <Check size={16} /> : <span>⚠</span>}
              <span>{validation.valid ? 'Syntax is valid' : (validation.errors?.join(', ') || validation.message || 'Validation issues found')}</span>
            </div>
          )}

          {/* Action Buttons */}
          {code && (
            <div className="editor-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleValidate}>
                <Check size={14} /> Validate
              </button>
              <button className="btn btn-secondary btn-sm" onClick={generate} disabled={loading}>
                <RefreshCw size={14} /> Regenerate
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleImprove} disabled={loading}>
                <Wand2 size={14} /> Improve
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

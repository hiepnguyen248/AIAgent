import { useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FlaskConical, SearchCode, Play, Wrench, Download, Copy, Check,
  RefreshCw, Sparkles, FileCode, Loader2, Wand2, Search, Upload,
  ArrowRight, Zap, AlertTriangle, ChevronRight,
} from 'lucide-react';
import {
  generateTestAI, generateFromCodebeamer, getCodebeamerTestCase,
  validateTest, improveTest, reviewTest, saveTestFile,
} from '../../utils/api';
import { useToast } from '../../App';

const TEST_TYPES = ['CAN', 'UART', 'DLT', 'HMI', 'Generic'];

const PIPELINE_STEPS = [
  { id: 'generate', label: 'Generate', icon: FlaskConical, desc: 'Create test script' },
  { id: 'review', label: 'Review', icon: SearchCode, desc: 'AI code review' },
  { id: 'execute', label: 'Execute', icon: Play, desc: 'Run via Jenkins' },
  { id: 'selfheal', label: 'Self-Heal', icon: Wrench, desc: 'Auto-fix failures' },
];

const FOCUS_OPTIONS = ['Correctness', 'Best Practices', 'Error Handling', 'Documentation', 'Coverage'];

export default function TestPipelineTab({ model }) {
  // Pipeline state
  const [activeStep, setActiveStep] = useState('generate');
  const [completedSteps, setCompletedSteps] = useState([]);

  // Generate state
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

  // Review state
  const [focusAreas, setFocusAreas] = useState(['Correctness', 'Best Practices']);
  const [reviewResult, setReviewResult] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Execute state
  const [jenkinsUrl, setJenkinsUrl] = useState('');
  const [jenkinsJob, setJenkinsJob] = useState('');
  const [executionStatus, setExecutionStatus] = useState(null); // null | 'running' | 'success' | 'failure'
  const [executionLog, setExecutionLog] = useState('');

  // Self-heal state
  const [healResult, setHealResult] = useState('');
  const [healing, setHealing] = useState(false);

  const toast = useToast();

  // ─── Generate ──────────────────────────────────────
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
        result = await generateFromCodebeamer({ test_case_id: tcId.trim(), test_type: testType, model });
      } else {
        result = await generateTestAI({ description: description.trim(), test_type: testType, model });
      }
      const generated = result.code || result.robot_code || result.content || '';
      setCode(generated);
      if (result.quality_score !== undefined) setQualityScore(result.quality_score);
      if (!completedSteps.includes('generate')) setCompletedSteps(prev => [...prev, 'generate']);
      toast('Test generated!', 'success');
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
      toast(result.valid ? 'Valid!' : 'Issues found', result.valid ? 'success' : 'error');
    } catch (err) { toast(`Validation failed: ${err.message}`, 'error'); }
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
    } catch (err) { toast(`Improve failed: ${err.message}`, 'error'); }
    finally { setLoading(false); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Copied', 'success');
  };

  const handleSave = async () => {
    if (!code.trim()) return;
    try {
      await saveTestFile({ code, file_path: savePath || undefined });
      toast('Saved!', 'success');
    } catch (err) { toast(`Save failed: ${err.message}`, 'error'); }
  };

  // ─── Review ────────────────────────────────────────
  const handleReview = async () => {
    if (!code.trim()) return;
    setReviewing(true);
    setReviewResult('');
    try {
      const result = await reviewTest({ code: code.trim(), focus_areas: focusAreas, model });
      setReviewResult(result.review || result.feedback || result.content || JSON.stringify(result, null, 2));
      if (!completedSteps.includes('review')) setCompletedSteps(prev => [...prev, 'review']);
      toast('Review completed!', 'success');
    } catch (err) { toast(`Review failed: ${err.message}`, 'error'); }
    finally { setReviewing(false); }
  };

  const handleReviewImprove = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const result = await improveTest({ code: code.trim(), review: reviewResult, model });
      const improved = result.code || result.improved_code || result.content || '';
      if (improved) { setCode(improved); toast('Updated!', 'success'); }
    } catch (err) { toast(`Improve failed: ${err.message}`, 'error'); }
    finally { setLoading(false); }
  };

  // ─── Execute ───────────────────────────────────────
  const handleExecute = async () => {
    setExecutionStatus('running');
    setExecutionLog('Triggering Jenkins job...\n');
    try {
      // TODO: Integrate with Jenkins API or MCP Jenkins
      // For now, simulate
      setExecutionLog(prev => prev + `Jenkins URL: ${jenkinsUrl || 'Not configured'}\n`);
      setExecutionLog(prev => prev + `Job: ${jenkinsJob || 'Not configured'}\n`);
      setExecutionLog(prev => prev + '\n⏳ Waiting for Jenkins... (Integration pending)\n');
      setExecutionLog(prev => prev + '\n💡 To enable: Configure Jenkins URL and job name, or set up MCP Jenkins server.\n');
      setTimeout(() => {
        setExecutionStatus('pending');
        if (!completedSteps.includes('execute')) setCompletedSteps(prev => [...prev, 'execute']);
      }, 1500);
    } catch (err) {
      setExecutionStatus('failure');
      setExecutionLog(prev => prev + `\n❌ Error: ${err.message}\n`);
    }
  };

  // ─── Self-Heal ─────────────────────────────────────
  const handleSelfHeal = async () => {
    if (!executionLog && !code) return;
    setHealing(true);
    setHealResult('');
    try {
      const result = await reviewTest({
        code: code.trim(),
        focus_areas: ['Correctness', 'Error Handling'],
        model,
        context: `Test execution log:\n${executionLog}\n\nAnalyze failures and suggest fixes.`,
      });
      setHealResult(result.review || result.feedback || result.content || '');
      if (!completedSteps.includes('selfheal')) setCompletedSteps(prev => [...prev, 'selfheal']);
      toast('Self-heal analysis complete', 'success');
    } catch (err) { toast(`Self-heal failed: ${err.message}`, 'error'); }
    finally { setHealing(false); }
  };

  const handleApplyFix = async () => {
    if (!healResult || !code) return;
    setLoading(true);
    try {
      const result = await improveTest({ code: code.trim(), review: healResult, model });
      const fixed = result.code || result.improved_code || result.content || '';
      if (fixed) { setCode(fixed); toast('Fix applied!', 'success'); }
    } catch (err) { toast(`Fix failed: ${err.message}`, 'error'); }
    finally { setLoading(false); }
  };

  const canGenerate = inputMode === 'codebeamer' ? !!tcDetails : !!description.trim();

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCode(ev.target.result);
    reader.readAsText(file);
  };

  // ─── Render ────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-height))', overflow: 'hidden' }}>
      {/* Pipeline Stepper */}
      <div className="pipeline-stepper">
        {PIPELINE_STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = activeStep === step.id;
          const isCompleted = completedSteps.includes(step.id);
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                className={`pipeline-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => setActiveStep(step.id)}
              >
                <div className="pipeline-step-icon">
                  {isCompleted && !isActive ? <Check size={16} /> : <Icon size={16} />}
                </div>
                <div className="pipeline-step-info">
                  <span className="pipeline-step-label">{step.label}</span>
                  <span className="pipeline-step-desc">{step.desc}</span>
                </div>
              </button>
              {i < PIPELINE_STEPS.length - 1 && (
                <ChevronRight size={16} style={{ color: 'var(--text-muted)', margin: '0 4px', flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>

        {/* ─── GENERATE STEP ─────────────── */}
        {activeStep === 'generate' && (
          <div className="generate-layout">
            <div className="generate-panel">
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><FlaskConical /> Test Generator</div>
                  <span className="badge badge-primary">{model}</span>
                </div>

                <div className="toggle-group" style={{ marginBottom: 16 }}>
                  <button className={`toggle-option ${inputMode === 'codebeamer' ? 'active' : ''}`} onClick={() => setInputMode('codebeamer')}>From CodeBeamer</button>
                  <button className={`toggle-option ${inputMode === 'manual' ? 'active' : ''}`} onClick={() => setInputMode('manual')}>Manual Description</button>
                </div>

                {inputMode === 'codebeamer' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="input-group">
                      <label>Test Case ID</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input className="input" value={tcId} onChange={(e) => setTcId(e.target.value)} placeholder="e.g. TCID-12345" />
                        <button className="btn btn-secondary" onClick={fetchTC} disabled={!tcId.trim() || fetchingTc}>
                          {fetchingTc ? <Loader2 size={14} className="spinner" /> : <Search size={14} />} Fetch
                        </button>
                      </div>
                    </div>
                    {tcDetails && (
                      <div style={{ padding: 12, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{tcDetails.name || tcDetails.title || 'TC Details'}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{tcDetails.description || tcDetails.summary || JSON.stringify(tcDetails, null, 2).slice(0, 300)}</div>
                      </div>
                    )}
                  </div>
                )}

                {inputMode === 'manual' && (
                  <div className="input-group">
                    <label>Test Description</label>
                    <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the test case to generate..." rows={5} />
                  </div>
                )}

                <div className="input-group" style={{ marginTop: 12 }}>
                  <label>Test Type</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {TEST_TYPES.map((t) => (
                      <button key={t} className={`toggle-option ${testType === t ? 'active' : ''}`} onClick={() => setTestType(t)} style={{ flex: 'none', padding: '6px 14px' }}>{t}</button>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 16 }} onClick={generate} disabled={!canGenerate || loading}>
                  {loading ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Generating...</> : <><Sparkles size={18} /> Generate Test</>}
                </button>
              </div>

              {code && (
                <div className="card" style={{ animation: 'fadeIn 0.3s ease' }}>
                  <div className="card-title" style={{ marginBottom: 12 }}><Download size={16} /> Save to File</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" value={savePath} onChange={(e) => setSavePath(e.target.value)} placeholder="tests/my_test.robot" />
                    <button className="btn btn-secondary" onClick={handleSave}><Download size={14} /> Save</button>
                  </div>
                </div>
              )}
            </div>

            <div className="generate-panel">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div className="card-header">
                  <div className="card-title"><FileCode /> Preview</div>
                  {qualityScore !== null && <span className="badge badge-success">Score: {qualityScore}%</span>}
                </div>
                <div className="editor-container" style={{ flex: 1 }}>
                  {code ? (
                    <Editor height="100%" language="robot" value={code} onChange={(v) => setCode(v || '')} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", wordWrap: 'on', padding: { top: 12 }, scrollBeyondLastLine: false }} />
                  ) : (
                    <div className="empty-state" style={{ height: '100%' }}><FileCode size={48} /><h3>No code yet</h3><p>Configure and click Generate.</p></div>
                  )}
                </div>
                {validation && (
                  <div className={`validation-results ${validation.valid ? 'valid' : 'invalid'}`} style={{ marginTop: 12 }}>
                    {validation.valid ? <Check size={16} /> : <span>⚠</span>}
                    <span>{validation.valid ? 'Valid' : (validation.errors?.join(', ') || 'Issues found')}</span>
                  </div>
                )}
                {code && (
                  <div className="editor-actions" style={{ marginTop: 12 }}>
                    <button className="btn btn-secondary btn-sm" onClick={handleCopy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
                    <button className="btn btn-secondary btn-sm" onClick={handleValidate}><Check size={14} /> Validate</button>
                    <button className="btn btn-secondary btn-sm" onClick={generate} disabled={loading}><RefreshCw size={14} /> Regen</button>
                    <button className="btn btn-primary btn-sm" onClick={handleImprove} disabled={loading}><Wand2 size={14} /> Improve</button>
                    <button className="btn btn-success btn-sm" onClick={() => setActiveStep('review')} disabled={!code}><ArrowRight size={14} /> Review →</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── REVIEW STEP ──────────────── */}
        {activeStep === 'review' && (
          <div className="review-layout">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div className="card-header">
                  <div className="card-title"><FileCode /> Code</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                      <Upload size={14} /> Upload
                      <input type="file" accept=".robot,.py,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
                <div className="editor-container" style={{ flex: 1, minHeight: 300 }}>
                  <Editor height="100%" language="robot" value={code} onChange={(v) => setCode(v || '')} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", wordWrap: 'on', padding: { top: 12 }, scrollBeyondLastLine: false }} />
                </div>
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}><SearchCode size={16} /> Focus Areas</div>
                <div className="focus-areas">
                  {FOCUS_OPTIONS.map((area) => (
                    <label key={area} className={`focus-area-checkbox ${focusAreas.includes(area) ? 'checked' : ''}`} onClick={() => setFocusAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])}>
                      <input type="checkbox" checked={focusAreas.includes(area)} readOnly />
                      {focusAreas.includes(area) ? <Check size={12} /> : null}
                      {area}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={handleReview} disabled={!code.trim() || reviewing} style={{ flex: 1 }}>
                    {reviewing ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Reviewing...</> : <><Play size={16} /> Review Code</>}
                  </button>
                  <button className="btn btn-success btn-sm" onClick={() => setActiveStep('execute')} disabled={!code}>Execute →</button>
                </div>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="card-header">
                <div className="card-title"><SearchCode /> Review Results</div>
                {reviewResult && (
                  <button className="btn btn-primary btn-sm" onClick={handleReviewImprove} disabled={loading}>
                    {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} /></> : <><Wand2 size={14} /> Apply Fixes</>}
                  </button>
                )}
              </div>
              <div className="review-results" style={{ flex: 1, overflow: 'auto' }}>
                {reviewResult ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewResult}</ReactMarkdown>
                ) : (
                  <div className="empty-state" style={{ height: '100%' }}><SearchCode size={48} /><h3>No review yet</h3><p>Click Review to get AI feedback.</p></div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── EXECUTE STEP ─────────────── */}
        {activeStep === 'execute' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}><Play /> Jenkins Execution</div>
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label>Jenkins URL</label>
                <input className="input" value={jenkinsUrl} onChange={(e) => setJenkinsUrl(e.target.value)} placeholder="http://jenkins.lge.com:8080" />
              </div>
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label>Job Name</label>
                <input className="input" value={jenkinsJob} onChange={(e) => setJenkinsJob(e.target.value)} placeholder="HIL_Automation_Test" />
              </div>
              <div style={{ padding: 12, background: 'var(--warning-muted)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 'var(--radius-md)', marginBottom: 16, fontSize: '0.85rem', color: 'var(--warning)' }}>
                <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
                Jenkins integration via MCP server — configure in Settings.
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleExecute} disabled={executionStatus === 'running'}>
                {executionStatus === 'running' ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Running...</> : <><Zap size={18} /> Trigger Build</>}
              </button>
              {code && (
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => setActiveStep('selfheal')}>
                  <Wrench size={14} /> Self-Heal →
                </button>
              )}
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}><FileCode /> Execution Log</div>
              <pre style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16, minHeight: 300, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', overflow: 'auto', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {executionLog || 'No execution log yet.\n\nTrigger a Jenkins build to see logs here.'}
              </pre>
            </div>
          </div>
        )}

        {/* ─── SELF-HEAL STEP ──────────── */}
        {activeStep === 'selfheal' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}><Wrench /> Self-Healing Analysis</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 16, lineHeight: 1.6 }}>
                AI analyzes test failures from execution logs and suggests fixes. It can automatically update your test script to handle changed selectors, timing issues, and environmental differences.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={handleSelfHeal} disabled={healing || !code}>
                  {healing ? <><div className="spinner" style={{ borderTopColor: 'white' }} /> Analyzing...</> : <><Wrench size={18} /> Analyze & Heal</>}
                </button>
              </div>
              {healResult && (
                <button className="btn btn-success" style={{ width: '100%', marginTop: 12 }} onClick={handleApplyFix} disabled={loading}>
                  <Wand2 size={16} /> Apply Fix to Code
                </button>
              )}
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}><SearchCode /> Heal Report</div>
              <div className="review-results" style={{ minHeight: 300, overflow: 'auto' }}>
                {healResult ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{healResult}</ReactMarkdown>
                ) : (
                  <div className="empty-state" style={{ height: '100%' }}><Wrench size={48} /><h3>No analysis yet</h3><p>Click "Analyze & Heal" to scan for issues.</p></div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  SearchCode, Play, Wand2, Upload, Copy, Check, FileCode, Loader2,
} from 'lucide-react';
import { reviewTest, improveTest } from '../../utils/api';
import { useToast } from '../../App';

const FOCUS_OPTIONS = [
  'Correctness',
  'Best Practices',
  'Error Handling',
  'Documentation',
  'Coverage',
];

export default function ReviewTab({ model }) {
  const [code, setCode] = useState('');
  const [focusAreas, setFocusAreas] = useState(['Correctness', 'Best Practices']);
  const [reviewResult, setReviewResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [improving, setImproving] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const toggleFocus = (area) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCode(ev.target.result);
    reader.readAsText(file);
  };

  const handleReview = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setReviewResult('');
    try {
      const result = await reviewTest({
        code: code.trim(),
        focus_areas: focusAreas,
        model,
      });
      setReviewResult(result.review || result.feedback || result.content || JSON.stringify(result, null, 2));
      toast('Review completed!', 'success');
    } catch (err) {
      toast(`Review failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleImprove = async () => {
    if (!code.trim()) return;
    setImproving(true);
    try {
      const result = await improveTest({
        code: code.trim(),
        review: reviewResult,
        model,
      });
      const improved = result.code || result.improved_code || result.content || '';
      if (improved) {
        setCode(improved);
        toast('Code improved and updated in editor!', 'success');
      }
    } catch (err) {
      toast(`Improve failed: ${err.message}`, 'error');
    } finally {
      setImproving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Copied to clipboard', 'success');
  };

  return (
    <div className="review-layout">
      {/* ─── Left: Code Input ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-header">
            <div className="card-title"><FileCode /> Code Input</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> Upload
                <input type="file" accept=".robot,.py,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
              {code && (
                <button className="btn btn-ghost btn-sm" onClick={handleCopy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>

          <div className="editor-container" style={{ flex: 1, minHeight: 300 }}>
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
          </div>
        </div>

        {/* Focus Areas */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            <SearchCode size={16} /> Focus Areas
          </div>
          <div className="focus-areas">
            {FOCUS_OPTIONS.map((area) => (
              <label
                key={area}
                className={`focus-area-checkbox ${focusAreas.includes(area) ? 'checked' : ''}`}
                onClick={() => toggleFocus(area)}
              >
                <input
                  type="checkbox"
                  checked={focusAreas.includes(area)}
                  readOnly
                />
                {focusAreas.includes(area) ? <Check size={12} /> : null}
                {area}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleReview}
              disabled={!code.trim() || loading}
              style={{ flex: 1 }}
            >
              {loading ? (
                <><div className="spinner" style={{ borderTopColor: 'white' }} /> Reviewing...</>
              ) : (
                <><Play size={16} /> Review Code</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Right: Results ────────────────────────────────────── */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="card-header">
          <div className="card-title"><SearchCode /> Review Results</div>
          {reviewResult && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleImprove}
              disabled={improving}
            >
              {improving ? (
                <><div className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} /> Improving...</>
              ) : (
                <><Wand2 size={14} /> Improve</>
              )}
            </button>
          )}
        </div>

        <div className="review-results" style={{ flex: 1, overflow: 'auto' }}>
          {reviewResult ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {reviewResult}
            </ReactMarkdown>
          ) : (
            <div className="empty-state" style={{ height: '100%' }}>
              <SearchCode size={48} />
              <h3>No review results yet</h3>
              <p>Paste or upload your Robot Framework code in the editor, select focus areas, and click Review to get AI-powered feedback.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const BASE_URL = '';

// ─── Error wrapper ───────────────────────────────────────────────
async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (options.body instanceof FormData) delete headers['Content-Type'];

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── SSE streaming helper ────────────────────────────────────────
export async function streamChat(payload, onChunk, onDone, onError) {
  const controller = new AbortController();
  try {
    const res = await fetch(`${BASE_URL}/api/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Stream failed: ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';

    // If backend returned JSON instead of SSE (non-streaming fallback)
    if (contentType.includes('application/json')) {
      const data = await res.json();
      const text = data.response || data.content || data.message || '';
      if (text) onChunk?.({ chunk: text });
      onDone?.();
      return controller;
    }

    // SSE streaming
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            onDone?.();
            return controller;
          }
          try {
            const parsed = JSON.parse(data);
            onChunk?.(parsed);
          } catch {
            // plain text chunk
            onChunk?.({ chunk: data });
          }
        }
      }
    }
    onDone?.();
  } catch (err) {
    if (err.name !== 'AbortError') onError?.(err);
  }
  return controller;
}

// ─── Chat ────────────────────────────────────────────────────────
export const chatSend = (body) => request('/api/chat/send', { method: 'POST', body: JSON.stringify(body) });
export const getChatHistory = (sessionId) => request(`/api/chat/history/${sessionId}`);
export const deleteChatHistory = (sessionId) => request(`/api/chat/history/${sessionId}`, { method: 'DELETE' });

// ─── Test Generate ───────────────────────────────────────────────
export const generateTest = (body) => request('/api/test/generate', { method: 'POST', body: JSON.stringify(body) });
export const generateTestAI = (body) => request('/api/test/generate-ai', { method: 'POST', body: JSON.stringify(body) });
export const generateFromCodebeamer = (body) => request('/api/test/generate-from-codebeamer', { method: 'POST', body: JSON.stringify(body) });
export const reviewTest = (body) => request('/api/test/review', { method: 'POST', body: JSON.stringify(body) });
export const improveTest = (body) => request('/api/test/improve', { method: 'POST', body: JSON.stringify(body) });
export const validateTest = (body) => request('/api/test/validate', { method: 'POST', body: JSON.stringify(body) });
export const dryRunTest = (body) => request('/api/test/dry-run', { method: 'POST', body: JSON.stringify(body) });
export const saveTestFile = (body) => request('/api/test/save-file', { method: 'POST', body: JSON.stringify(body) });
export const getTemplates = () => request('/api/test/templates');
export const getCodebeamerItem = (id) => request(`/api/test/codebeamer/item/${id}`);
export const getCodebeamerTestCase = (tcId) => request(`/api/test/codebeamer/testcase/${tcId}`);

// ─── RAG ─────────────────────────────────────────────────────────
export const uploadRagFile = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return request('/api/rag/upload', { method: 'POST', body: fd });
};
export const indexText = (body) => request('/api/rag/index-text', { method: 'POST', body: JSON.stringify(body) });
export const indexPaths = (body) => request('/api/rag/index-paths', { method: 'POST', body: JSON.stringify(body) });
export const searchRag = (body) => request('/api/rag/search', { method: 'POST', body: JSON.stringify(body) });
export const getRagDocuments = () => request('/api/rag/documents');
export const deleteRagDocument = (name) => request(`/api/rag/documents/${encodeURIComponent(name)}`, { method: 'DELETE' });
export const getRagStats = () => request('/api/rag/stats');
export const clearRagData = () => request('/api/rag/clear', { method: 'DELETE' });

// ─── Config ──────────────────────────────────────────────────────
export const getConfig = () => request('/api/config/current');
export const configureLLM = (body) => request('/api/config/llm', { method: 'POST', body: JSON.stringify(body) });
export const configureCodebeamer = (body) => request('/api/config/codebeamer', { method: 'POST', body: JSON.stringify(body) });
export const testLLMConnection = () => request('/api/config/test-llm', { method: 'POST', body: JSON.stringify({}) });
export const testCodebeamerConnection = () => request('/api/config/test-codebeamer', { method: 'POST', body: JSON.stringify({}) });
export const getOllamaModels = () => request('/api/config/ollama/models');

// ─── CodeBeamer direct ──────────────────────────────────────────
export const getTestCaseDetails = (itemId) => request(`/api/codebeamer/testcase/${itemId}`);

// ─── Dashboard ──────────────────────────────────────────────────
export const getDashboardSummary = (period = '7d') => request(`/api/dashboard/summary?period=${period}`);
export const getDashboardUsers = (period = '7d') => request(`/api/dashboard/users?period=${period}`);
export const getDashboardActions = (period = '7d') => request(`/api/dashboard/actions?period=${period}`);

// ─── Chat History Persistence ───────────────────────────────────
export const saveChatMessage = (sessionId, role, content, userId = 'anonymous') =>
  request(`/api/chat/history/${sessionId}/save`, {
    method: 'POST',
    body: JSON.stringify({ role, content, user_id: userId }),
  });
export const listChatSessions = (userId = 'anonymous') => request(`/api/chat/sessions?user_id=${userId}`);

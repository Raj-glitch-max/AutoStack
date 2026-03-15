import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { Button, Card } from './ui/index';

const SUGGESTED_QUESTIONS = [
  "Why is my pod crashing?",
  "What's my highest AWS cost?",
  "What changed in the last deployment?",
  "Are there any incidents active?",
  "How do I reduce my bill by 20%?"
];

export default function AIChat({ isOpen, onClose, environment }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/functions/v1/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        },
        body: JSON.stringify({
          message: userMessage,
          environment_id: environment?.id
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.response,
        intent: data.intent 
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Sorry, I encountered an error: ${err.message}`,
        error: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = (question) => {
    setInput(question);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-[450px] bg-[var(--bg-card)] border-l border-[var(--border-default)] shadow-2xl z-50 flex flex-col animate-slideInRight">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--blue-primary)] to-[var(--purple)] flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm">AutoStack AI</h3>
            <p className="text-[10px] text-[var(--text-muted)]">
              {environment?.name || 'Ask anything about your infrastructure'}
            </p>
          </div>
        </div>
        <Button size="xs" variant="ghost" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)] text-center py-8">
              Ask me anything about your infrastructure
            </p>
            <div className="space-y-2">
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Suggested Questions
              </p>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickQuestion(q)}
                  className="w-full text-left p-3 rounded-lg border border-[var(--border-default)] hover:border-[var(--blue-primary)] hover:bg-[var(--blue-primary)]/5 transition-all text-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-[var(--blue-primary)] text-white'
                  : msg.error
                  ? 'bg-[var(--red)]/10 border border-[var(--red)]/20'
                  : 'bg-[var(--bg-surface)] border border-[var(--border-default)]'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-[var(--blue-primary)]" />
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    {msg.intent?.replace('_', ' ') || 'AI Response'}
                  </span>
                </div>
              )}
              <div className="text-sm whitespace-pre-wrap prose prose-sm max-w-none">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg p-3">
              <Loader2 size={16} className="animate-spin text-[var(--blue-primary)]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--border-default)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything about your infrastructure..."
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--blue-primary)]"
            disabled={loading}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            icon={loading ? Loader2 : Send}
          >
            Send
          </Button>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-2 text-center">
          AI responses are generated based on your real infrastructure data
        </p>
      </div>
    </div>
  );
}

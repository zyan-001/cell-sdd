import { useState } from 'react';
import type { ModuleName } from '../types';

interface PromptDialogProps {
  module: ModuleName;
  cellId: string;
  onSubmit: (module: ModuleName, prompt: string) => void;
  onClose: () => void;
}

const MODULE_HINTS: Record<ModuleName, string> = {
  intent: 'Describe what you want to change about the purpose/why...',
  plan: 'Describe how you want to adjust the design approach...',
  contract: 'Describe the new contract conditions (when/then)...',
  test: 'Describe the new test scenarios to add...',
  schema: 'Describe the new schema fields...',
  states: 'Describe the new states...',
  invariants: 'Describe the new invariants...',
  requires_state: 'Describe the new state requirements...',
};

export default function PromptDialog({ module, cellId, onSubmit, onClose }: PromptDialogProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    if (prompt.trim()) {
      onSubmit(module, prompt.trim());
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          width: 520,
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 18 }}>
            Fine-tune: <span style={{ color: '#6c63ff' }}>{module.toUpperCase()}</span>
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
            Cell: {cellId} — Your prompt will create a Delta for this module
          </p>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={MODULE_HINTS[module]}
          style={{
            width: '100%',
            height: 160,
            padding: 12,
            borderRadius: 8,
            border: '1px solid #ddd',
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: 'white',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: 'none',
              background: prompt.trim() ? '#6c63ff' : '#ccc',
              color: 'white',
              cursor: prompt.trim() ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Create Delta
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#aaa' }}>
          Ctrl+Enter to submit
        </div>
      </div>
    </div>
  );
}

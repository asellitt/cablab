import React, { useEffect, useRef, useState } from 'react'
import { X, Copy, Check, Save } from 'lucide-react'
import { fetchTopologyYaml, saveTopologyYaml } from '../api/client'
import type { Topology } from '../types/topology'

interface YamlModalProps {
  onClose: () => void
  onSaved: (topology: Topology) => void
}

export default function YamlModal({ onClose, onSaved }: YamlModalProps) {
  const [value, setValue] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchTopologyYaml()
      .then((yaml) => {
        setValue(yaml)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [])

  // Focus textarea once loaded
  useEffect(() => {
    if (value !== null) textareaRef.current?.focus()
  }, [value !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (value === null) return
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const topology = await saveTopologyYaml(value)
      onSaved(topology)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      const msg = extractError(e)
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Ctrl/Cmd+S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
    // Tab inserts two spaces instead of losing focus
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = value!.slice(0, start) + '  ' + value!.slice(end)
      setValue(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-4xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold text-base">topology.yaml</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={value === null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || value === null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors"
            >
              {saved
                ? <><Check size={13} />Saved</>
                : <><Save size={13} />{saving ? 'Saving…' : 'Save'}</>
              }
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors ml-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {saveError && (
          <div className="px-5 py-2 bg-red-900/40 border-b border-red-700 text-red-300 text-xs font-mono whitespace-pre-wrap">
            {saveError}
          </div>
        )}

        {/* Editor body */}
        <div className="flex-1 overflow-hidden flex flex-col px-5 py-4 min-h-0">
          {loadError && (
            <p className="text-red-400 text-sm">{loadError}</p>
          )}
          {value === null && !loadError && (
            <p className="text-gray-500 text-sm">Loading…</p>
          )}
          {value !== null && (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => { setValue(e.target.value); setSaveError(null) }}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="flex-1 w-full bg-gray-900 text-gray-200 text-xs font-mono rounded-lg p-3 border border-gray-700 focus:outline-none focus:border-blue-500 resize-none leading-relaxed min-h-0"
            />
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-2 border-t border-gray-700">
          <p className="text-gray-600 text-xs">Ctrl+S / Cmd+S to save · Tab inserts spaces</p>
        </div>
      </div>
    </div>
  )
}

function extractError(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const resp = (e as { response?: { data?: { error?: string } } }).response
    if (resp?.data?.error) return resp.data.error
  }
  if (e instanceof Error) return e.message
  return 'Unknown error'
}

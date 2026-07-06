'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapImage from '@tiptap/extension-image'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import { Extension } from '@tiptap/core'
import { getBrowserClient } from '@/lib/supabase-browser'
import type { Message, TargetType } from '@/lib/types'

// Resizable image — React NodeView with drag-to-resize handle
function ResizableImageView({ node, updateAttributes, selected }: any) {
  const imgRef = useRef<HTMLImageElement>(null)

  function startResize(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = (node.attrs.width as number) ?? imgRef.current?.offsetWidth ?? 300

    function onMove(ev: MouseEvent) {
      updateAttributes({ width: Math.max(40, Math.round(startWidth + ev.clientX - startX)) })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper style={{ display: 'inline-block', position: 'relative', lineHeight: 0, maxWidth: '100%', verticalAlign: 'bottom' }}>
      <img
        ref={imgRef}
        src={node.attrs.src as string}
        alt={(node.attrs.alt as string) ?? ''}
        draggable={false}
        style={{
          width: node.attrs.width ? `${node.attrs.width}px` : '100%',
          maxWidth: '100%',
          display: 'block',
          outline: selected ? '2px solid #0d9488' : 'none',
          outlineOffset: 1,
        }}
      />
      {/* Resize handle — bottom-right corner, only when image is selected */}
      <div
        onMouseDown={startResize}
        style={{
          display: selected ? 'block' : 'none',
          position: 'absolute',
          right: -5,
          bottom: -5,
          width: 14,
          height: 14,
          background: '#0d9488',
          border: '2px solid white',
          borderRadius: 3,
          cursor: 'se-resize',
          zIndex: 10,
        }}
      />
    </NodeViewWrapper>
  )
}

// Extend TiptapImage to add width attribute + React NodeView
const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => {
          const w = (el as HTMLElement).style.width || (el as HTMLElement).getAttribute('width')
          return w ? parseInt(w as string, 10) || null : null
        },
        renderHTML: attrs => attrs.width ? { style: `width:${attrs.width}px`, width: String(attrs.width) } : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

// Custom FontSize extension
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize?.replace('px', '') || null,
          renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}px` } : {},
        },
      },
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: () => any }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => any }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any
  },
})

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
  { label: 'Times', value: '"Times New Roman", serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
]

const FONT_SIZES = ['10', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48']

type DeliveryMode = 'now' | 'schedule'

interface Props {
  initial?: Partial<Message>
  messageId?: string
  departments?: string[]
  levels?: string[]
  companies?: string[]
}

export default function MessageForm({ initial, messageId, departments = [], levels = [], companies = [] }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [targetType, setTargetType] = useState<TargetType>(initial?.target_type ?? 'all')
  const [targetValue, setTargetValue] = useState(initial?.target_value ?? '')
  const [delivery, setDelivery] = useState<DeliveryMode>('now')
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduled_at?.slice(0, 16) ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      ResizableImage,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
    ],
    immediatelyRender: false,
    content: initial?.content_html ?? '',
    editorProps: {
      attributes: {
        class: 'min-h-[280px] p-4 focus:outline-none',
        style: 'color: #111827; caret-color: #111827; background: white;',
      },
    },
  })

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/messages/upload-image', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      editor.chain().focus().setImage({ src: json.url }).run()
    } catch (err: any) {
      setError(err.message ?? 'Image upload failed')
    }
    e.target.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (targetType !== 'all' && !targetValue.trim()) { setError('Please specify a target value'); return }
    if (delivery === 'schedule' && !scheduledAt) { setError('Please pick a scheduled date and time'); return }
    setError('')
    setSaving(true)

    const supabase = getBrowserClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setSaving(false); return }

    const payload = {
      title: title.trim(),
      content_html: editor?.getHTML() ?? '',
      target_type: targetType,
      target_value: targetType === 'all' ? null : targetValue.trim(),
      scheduled_at: delivery === 'schedule' ? new Date(scheduledAt).toISOString() : null,
      published_at: delivery === 'now' ? new Date().toISOString() : null,
    }

    let dbError
    if (messageId) {
      const { error } = await supabase.from('messages').update(payload).eq('id', messageId)
      dbError = error
    } else {
      const { error } = await supabase.from('messages').insert({ ...payload, created_by: user.id })
      dbError = error
    }

    if (dbError) { setError(dbError.message); setSaving(false); return }
    router.push('/dashboard')
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'white',
  }

  const labelStyle = { color: 'rgba(255,255,255,0.70)' }

  function pillBtn(active: boolean) {
    return {
      background: active ? 'rgba(13,148,136,0.30)' : 'rgba(255,255,255,0.08)',
      color: active ? '#5eead4' : 'rgba(255,255,255,0.55)',
      border: active ? '1px solid rgba(13,148,136,0.40)' : '1px solid rgba(255,255,255,0.12)',
      cursor: 'pointer' as const,
    }
  }

  // selectStyle for right-column dropdowns (dark theme)
  const selectStyle = {
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'white',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='rgba(255,255,255,0.4)'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '14px',
    paddingRight: '28px',
    cursor: 'pointer' as const,
  }

  // selectStyle for toolbar dropdowns (light theme)
  const tbSelectStyle = {
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    color: '#111827',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 5px center',
    backgroundSize: '12px',
    cursor: 'pointer' as const,
  }

  const tbBtn = (active = false) => ({
    padding: '3px 7px',
    borderRadius: 5,
    border: 'none',
    cursor: 'pointer' as const,
    fontSize: 12,
    background: active ? 'rgba(13,148,136,0.15)' : 'transparent',
    color: active ? '#0d9488' : '#374151',
    transition: 'all 0.15s',
  })

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* Title — full width */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={labelStyle}>Title *</label>
        <input
          type="text"
          placeholder="Message title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all placeholder:text-white/30"
          style={inputStyle}
          onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
          onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
        />
      </div>

      {/* Two-column: editor left (70%), controls right (30%) */}
      <div className="grid grid-cols-1 gap-5" data-two-col="true">
        <style>{`@media (min-width: 1024px) { [data-two-col="true"] { grid-template-columns: 70% 1fr !important; } }`}</style>

        {/* LEFT — Rich text editor */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={labelStyle}>Message Body</label>
          <div
            className="rounded-xl overflow-hidden flex flex-col"
            style={{ background: 'white', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '12px' }}
          >
            {/* Toolbar */}
            <div
              className="flex flex-wrap gap-1 px-2 py-2"
              style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb', borderRadius: '12px 12px 0 0' }}
            >
              {/* Font family */}
              <select
                value={editor?.getAttributes('textStyle').fontFamily ?? ''}
                onChange={e => {
                  if (e.target.value) editor?.chain().focus().setFontFamily(e.target.value).run()
                  else editor?.chain().focus().unsetFontFamily().run()
                }}
                title="Font family"
                className="rounded text-xs outline-none"
                style={{ ...tbSelectStyle, padding: '2px 22px 2px 6px', minWidth: 72 }}
              >
                {FONT_FAMILIES.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>

              {/* Font size */}
              <select
                value={editor?.getAttributes('textStyle').fontSize ?? ''}
                onChange={e => {
                  if (e.target.value) (editor?.chain().focus() as any).setFontSize(e.target.value).run()
                  else (editor?.chain().focus() as any).unsetFontSize().run()
                }}
                title="Font size"
                className="rounded text-xs outline-none"
                style={{ ...tbSelectStyle, padding: '2px 20px 2px 6px', width: 64 }}
              >
                <option value="">Size</option>
                {FONT_SIZES.map(s => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>

              <div style={{ width: 1, background: '#e5e7eb', margin: '2px 2px' }} />

              {/* Bold */}
              <button type="button" title="Bold" onClick={() => editor?.chain().focus().toggleBold().run()} style={tbBtn(editor?.isActive('bold'))}>
                <strong>B</strong>
              </button>
              {/* Italic */}
              <button type="button" title="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()} style={tbBtn(editor?.isActive('italic'))}>
                <em>I</em>
              </button>
              {/* Strikethrough */}
              <button type="button" title="Strike" onClick={() => editor?.chain().focus().toggleStrike().run()} style={tbBtn(editor?.isActive('strike'))}>
                <s>S</s>
              </button>

              <div style={{ width: 1, background: '#e5e7eb', margin: '2px 2px' }} />

              {/* Font color */}
              <label title="Font color" style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '2px 4px', borderRadius: 5 }}>
                <span style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>A</span>
                <input
                  type="color"
                  defaultValue="#000000"
                  onChange={e => editor?.chain().focus().setColor(e.target.value).run()}
                  style={{ width: 18, height: 18, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                  title="Font color"
                />
              </label>

              {/* Image upload */}
              <label title="Insert image" style={{ display: 'flex', alignItems: 'center', ...tbBtn(), cursor: 'pointer' }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            {/* Editor area */}
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* RIGHT — Send To + Delivery + Actions */}
        <div className="flex flex-col gap-5">

          {/* Send To */}
          <div>
            <label className="block text-sm font-medium mb-2" style={labelStyle}>Send To</label>
            <div className="flex gap-2 flex-wrap mb-2">
              {(['all', 'dept', 'role', 'company'] as TargetType[]).map(t => (
                <button key={t} type="button"
                  onClick={() => { setTargetType(t); setTargetValue('') }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={pillBtn(targetType === t)}
                >
                  {t === 'all' ? 'All Employees' : t === 'dept' ? 'By Department' : t === 'role' ? 'By Role' : 'By Company'}
                </button>
              ))}
            </div>
            {targetType === 'dept' && (
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={selectStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Department</option>
                {departments.length === 0 && <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No departments — add in Masters</option>}
                {departments.map(d => <option key={d} value={d} style={{ background: '#0b2d3d', color: 'white' }}>{d}</option>)}
              </select>
            )}
            {targetType === 'role' && (
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={selectStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Level</option>
                {levels.length === 0 && <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No levels — add in Masters</option>}
                {levels.map(l => <option key={l} value={l} style={{ background: '#0b2d3d', color: 'white' }}>{l}</option>)}
              </select>
            )}
            {targetType === 'company' && (
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={selectStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              >
                <option value="" style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.5)' }}>Select Company</option>
                {companies.length === 0 && <option disabled style={{ background: '#0b2d3d', color: 'rgba(255,255,255,0.4)' }}>No companies — add in Masters</option>}
                {companies.map(c => <option key={c} value={c} style={{ background: '#0b2d3d', color: 'white' }}>{c}</option>)}
              </select>
            )}
          </div>

          {/* Delivery */}
          <div>
            <label className="block text-sm font-medium mb-2" style={labelStyle}>Delivery</label>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => setDelivery('now')} className="px-3 py-1.5 rounded-full text-xs font-medium transition-all" style={pillBtn(delivery === 'now')}>Send Now</button>
              <button type="button" onClick={() => setDelivery('schedule')} className="px-3 py-1.5 rounded-full text-xs font-medium transition-all" style={pillBtn(delivery === 'schedule')}>Schedule</button>
            </div>
            {delivery === 'schedule' && (
              <input
                type="datetime-local"
                aria-label="Scheduled date and time"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                style={inputStyle}
                onFocus={e => { e.target.style.border = '1px solid rgba(13,148,136,0.60)' }}
                onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.14)' }}
              />
            )}
          </div>

          {/* Spacer to push buttons to bottom */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex flex-col gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
            <button
              type="submit"
              disabled={saving}
              className="w-full text-white py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{
                background: saving ? 'rgba(255,255,255,0.10)' : 'linear-gradient(135deg, #0d9488, #0891b2)',
                boxShadow: saving ? 'none' : '0 4px 14px rgba(13,148,136,0.30)',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
              ) : delivery === 'schedule' ? 'Schedule Message' : 'Publish Now'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

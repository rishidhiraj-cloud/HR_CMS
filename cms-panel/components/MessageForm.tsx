'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapImage from '@tiptap/extension-image'
import TiptapLink from '@tiptap/extension-link'
import { getBrowserClient } from '@/lib/supabase-browser'
import type { Message, TargetType } from '@/lib/types'

type DeliveryMode = 'now' | 'schedule'

interface Props {
  initial?: Partial<Message>
  messageId?: string
}

export default function MessageForm({ initial, messageId }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [targetType, setTargetType] = useState<TargetType>(initial?.target_type ?? 'all')
  const [targetValue, setTargetValue] = useState(initial?.target_value ?? '')
  const [delivery, setDelivery] = useState<DeliveryMode>('now')
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduled_at?.slice(0, 16) ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit, TiptapImage, TiptapLink],
    content: initial?.content_html ?? '',
    editorProps: {
      attributes: { class: 'min-h-[120px] p-3 focus:outline-none prose prose-sm max-w-none' },
    },
  })

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const supabase = getBrowserClient()
    const path = `messages/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('message-images').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('message-images').getPublicUrl(path)
    return data.publicUrl
  }, [])

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const url = await uploadImage(file)
    editor.chain().focus().setImage({ src: url }).run()
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Title</label>
        <input
          type="text"
          placeholder="Message title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Message Body</label>
        <div className="border rounded overflow-hidden">
          <div className="flex gap-2 px-2 py-1.5 border-b bg-gray-50 text-sm">
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className="font-bold px-1">B</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} className="italic px-1">I</button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className="px-1">• List</button>
            <label className="cursor-pointer px-1">
              🖼
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>
          <EditorContent editor={editor} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Send To</label>
        <div className="flex gap-2 mb-2">
          {(['all', 'dept', 'role'] as TargetType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTargetType(t)}
              className={`px-3 py-1.5 rounded-full text-sm ${targetType === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t === 'all' ? 'All Employees' : t === 'dept' ? 'By Department' : 'By Role'}
            </button>
          ))}
        </div>
        {targetType === 'dept' && (
          <input
            placeholder="e.g. Sales"
            value={targetValue}
            onChange={e => setTargetValue(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
        {targetType === 'role' && (
          <input
            placeholder="e.g. Manager"
            value={targetValue}
            onChange={e => setTargetValue(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Delivery</label>
        <div className="flex gap-2 mb-2">
          <button type="button" onClick={() => setDelivery('now')} className={`px-3 py-1.5 rounded-full text-sm ${delivery === 'now' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Send Immediately
          </button>
          <button type="button" onClick={() => setDelivery('schedule')} className={`px-3 py-1.5 rounded-full text-sm ${delivery === 'schedule' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Schedule
          </button>
        </div>
        {delivery === 'schedule' && (
          <input
            type="datetime-local"
            aria-label="Scheduled date and time"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="bg-indigo-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : delivery === 'schedule' ? 'Schedule Message' : 'Publish Now'}
        </button>
        <button type="button" onClick={() => router.push('/dashboard')} className="px-4 py-2 rounded text-sm text-gray-600 bg-gray-100 hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </form>
  )
}

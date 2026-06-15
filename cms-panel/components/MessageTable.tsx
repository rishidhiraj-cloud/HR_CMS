import Link from 'next/link'
import type { Message, MessageStatus } from '@/lib/types'
import { getMessageStatus } from '@/lib/types'

const STATUS_STYLES: Record<MessageStatus, string> = {
  live: 'bg-green-100 text-green-700',
  scheduled: 'bg-yellow-100 text-yellow-700',
  draft: 'bg-gray-100 text-gray-600',
  archived: 'bg-gray-100 text-gray-400',
}

function TargetLabel({ type, value }: { type: string; value: string | null }) {
  if (type === 'all') return <span>All Employees</span>
  return <span>{value ?? '—'}</span>
}

export default function MessageTable({ messages }: { messages: Message[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Audience</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {messages.map(msg => {
            const status = getMessageStatus(msg)
            const date = msg.published_at ?? msg.scheduled_at ?? msg.created_at
            return (
              <tr key={msg.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{msg.title}</td>
                <td className="px-4 py-3 text-gray-600">
                  <TargetLabel type={msg.target_type} value={msg.target_value} />
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>
                    {status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/messages/${msg.id}`} className="text-indigo-600 hover:underline text-xs">
                    Edit
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {messages.length === 0 && (
        <p className="text-center text-gray-400 py-10 text-sm">No messages yet</p>
      )}
    </div>
  )
}

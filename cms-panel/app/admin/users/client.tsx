'use client'
import { useRouter } from 'next/navigation'
import CmsUserForm from '@/components/CmsUserForm'

export default function AdminUsersClient() {
  const router = useRouter()
  return <CmsUserForm onCreated={() => router.refresh()} />
}

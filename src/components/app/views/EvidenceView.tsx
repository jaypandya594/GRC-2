'use client'

import { useEffect, useState, useRef } from 'react'
import { api, formatBytes, formatDate, timeAgo } from '@/lib/api'
import { useAuthStore } from '@/lib/stores'
import { PageHeader, EmptyState } from './shared'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  FolderOpen, Upload, Link2, FileText, FileSpreadsheet, FileImage, File as FileIcon,
  Download, Trash2, MoreHorizontal, ExternalLink, CheckCircle2, Clock, AlertCircle, Paperclip, Filter, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Evidence = {
  id: string
  title: string
  description: string | null
  type: 'file' | 'link'
  fileName: string | null
  filePath: string | null
  fileSize: number | null
  mimeType: string | null
  fileUrl: string | null
  linkTitle: string | null
  tags: string | null
  status: string
  validUntil: string | null
  createdAt: string
  uploadedBy: { id: string; name: string; email: string }
  control: { id: string; ref: string; title: string; framework: { code: string; name: string } } | null
}

const STATUS_ICONS: Record<string, any> = {
  approved: CheckCircle2,
  active: Clock,
  rejected: AlertCircle,
  archived: Clock,
}
const STATUS_COLORS: Record<string, string> = {
  approved: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
  active: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40',
  rejected: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40',
  archived: 'text-slate-500 bg-slate-50 dark:bg-slate-800/40',
}

function fileIcon(mime?: string | null) {
  if (!mime) return FileIcon
  if (mime.startsWith('image/')) return FileImage
  if (mime.includes('spreadsheet') || mime.includes('excel')) return FileSpreadsheet
  if (mime === 'application/pdf') return FileText
  return FileIcon
}

export function EvidenceView() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const [items, setItems] = useState<Evidence[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selectedTenant, setSelectedTenant] = useState<string>('all')

  // For super admin, fetch tenants for filter
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (isSuperAdmin && selectedTenant !== 'all') params.set('tenantId', selectedTenant)
      const data = await api(`/api/evidence?${params}`)
      setItems(data.evidence)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) {
      api('/api/tenants').then((d: any) => setTenants((d?.tenants || []).map((t: any) => ({ id: t.id, name: t.name })))).catch(() => {})
    }
  }, [isSuperAdmin])

  useEffect(() => { load() }, [selectedTenant])

  const filtered = items.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (typeFilter !== 'all' && e.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!e.title.toLowerCase().includes(q) && !e.description?.toLowerCase().includes(q) && !e.control?.ref.toLowerCase().includes(q) && !e.tags?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const stats = {
    total: items.length,
    files: items.filter(i => i.type === 'file').length,
    links: items.filter(i => i.type === 'link').length,
    approved: items.filter(i => i.status === 'approved').length,
  }

  return (
    <div>
      <PageHeader
        title="Evidence Vault"
        description="Upload files and attach links as compliance evidence for controls"
        icon={FolderOpen}
        actions={
          <CreateEvidenceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} tenants={tenants} defaultTenantId={selectedTenant !== 'all' ? selectedTenant : (user?.tenantId || '')} />
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Evidence</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Files</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{stats.files}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Links</div>
          <div className="text-2xl font-bold mt-1 text-sky-600">{stats.links}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Approved</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{stats.approved}</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search evidence…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="file">Files</SelectItem>
            <SelectItem value="link">Links</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        {isSuperAdmin && (
          <Select value={selectedTenant} onValueChange={setSelectedTenant}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All tenants" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <Card key={i} className="animate-pulse h-24" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderOpen}
            title="No evidence found"
            description="Upload compliance documents, screenshots, reports, or attach links to external evidence repositories."
            action={<CreateEvidenceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} tenants={tenants} defaultTenantId={selectedTenant !== 'all' ? selectedTenant : (user?.tenantId || '')} />}
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((e) => {
            const Icon = e.type === 'link' ? Link2 : fileIcon(e.mimeType)
            const StatusIcon = STATUS_ICONS[e.status] || Clock
            return (
              <Card key={e.id} className="hover:shadow-sm transition">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', e.type === 'link' ? 'bg-sky-100 text-sky-600 dark:bg-sky-950/40' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/40')}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate">{e.title}</h3>
                          {e.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{e.description}</p>}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {e.type === 'file' && e.filePath && (
                              <DropdownMenuItem asChild>
                                <a href={e.filePath} download={e.fileName || undefined} className="cursor-pointer">
                                  <Download className="w-4 h-4 mr-2" /> Download
                                </a>
                              </DropdownMenuItem>
                            )}
                            {e.type === 'link' && e.fileUrl && (
                              <DropdownMenuItem asChild>
                                <a href={e.fileUrl} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                                  <ExternalLink className="w-4 h-4 mr-2" /> Open link
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={async () => {
                              try {
                                await api(`/api/evidence?id=${e.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.status === 'approved' ? 'active' : 'approved' }) })
                                toast.success(`Evidence ${e.status === 'approved' ? 'unapproved' : 'approved'}`)
                                load()
                              } catch (err: any) { toast.error(err.message) }
                            }}>
                              <CheckCircle2 className="w-4 h-4 mr-2" /> {e.status === 'approved' ? 'Unapprove' : 'Approve'}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={async () => {
                              if (!confirm('Delete this evidence? File will also be removed.')) return
                              try {
                                await api(`/api/evidence?id=${e.id}`, { method: 'DELETE' })
                                toast.success('Evidence deleted')
                                load()
                              } catch (err: any) { toast.error(err.message) }
                            }}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {e.control && (
                          <Badge variant="secondary" className="text-[10px]">
                            {e.control.framework.code} · {e.control.ref}
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn('text-[10px] capitalize', STATUS_COLORS[e.status])}>
                          <StatusIcon className="w-3 h-3 mr-1" /> {e.status}
                        </Badge>
                        {e.type === 'file' && e.fileName && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{e.fileName}</span>
                        )}
                        {e.type === 'file' && e.fileSize && (
                          <span className="text-[11px] text-muted-foreground">· {formatBytes(e.fileSize)}</span>
                        )}
                        {e.type === 'link' && e.fileUrl && (
                          <a href={e.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-600 hover:underline truncate max-w-[240px] inline-flex items-center gap-0.5">
                            {e.fileUrl} <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {e.tags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {e.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{tag}</span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                        <span>by {e.uploadedBy.name}</span>
                        <span>·</span>
                        <span>{timeAgo(e.createdAt)}</span>
                        {e.validUntil && (
                          <>
                            <span>·</span>
                            <span>valid until {formatDate(e.validUntil)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CreateEvidenceDialog({ open, onOpenChange, onCreated, tenants, defaultTenantId }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
  tenants: { id: string; name: string }[]
  defaultTenantId: string
}) {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [controlId, setControlId] = useState('')
  const [tenantId, setTenantId] = useState(defaultTenantId)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // frameworks + controls for selection
  const [frameworks, setFrameworks] = useState<any[]>([])
  const [controls, setControls] = useState<any[]>([])
  const [selectedFramework, setSelectedFramework] = useState('')

  useEffect(() => {
    api('/api/frameworks').then((d: any) => setFrameworks(d?.frameworks || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedFramework) {
      api(`/api/controls?frameworkId=${selectedFramework}`).then((d: any) => setControls(d?.controls || [])).catch(() => setControls([]))
    } else {
      setControls([])
    }
  }, [selectedFramework])

  useEffect(() => { setTenantId(defaultTenantId) }, [defaultTenantId])

  // For super admin with no tenant selected, default to first tenant once loaded
  useEffect(() => {
    if (isSuperAdmin && !tenantId && tenants.length > 0) {
      setTenantId(tenants[0].id)
    }
  }, [isSuperAdmin, tenantId, tenants])

  function reset() {
    setTitle(''); setDescription(''); setTags(''); setLinkUrl(''); setLinkTitle('')
    setControlId(''); setFile(null); setProgress(0); setMode('file')
  }

  async function handleSubmit() {
    if (!title) { toast.error('Title is required'); return }
    if (mode === 'link' && !linkUrl) { toast.error('URL is required for link evidence'); return }
    if (mode === 'file' && !file) { toast.error('Please select a file'); return }
    setUploading(true)
    try {
      if (mode === 'file') {
        const formData = new FormData()
        formData.append('file', file!)
        formData.append('title', title)
        formData.append('description', description)
        formData.append('tags', tags)
        if (controlId) formData.append('controlId', controlId)
        if (isSuperAdmin && tenantId) formData.append('tenantId', tenantId)

        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        })
        xhr.addEventListener('load', () => {
          let res: any
          try {
            res = JSON.parse(xhr.responseText)
          } catch {
            toast.error(`Server returned an error (${xhr.status}). Please try again.`)
            setUploading(false)
            return
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            toast.success('Evidence uploaded successfully')
            reset()
            onOpenChange(false)
            onCreated()
          } else {
            toast.error(res.error || 'Upload failed')
          }
          setUploading(false)
        })
        xhr.addEventListener('error', () => { toast.error('Network error during upload'); setUploading(false) })
        xhr.open('POST', '/api/evidence')
        xhr.send(formData)
      } else {
        await api('/api/evidence', {
          method: 'POST',
          body: JSON.stringify({ title, description, tags, type: 'link', fileUrl: linkUrl, linkTitle: linkTitle || title, controlId: controlId || undefined, tenantId: isSuperAdmin ? tenantId : undefined }),
        })
        toast.success('Link evidence added')
        reset()
        onOpenChange(false)
        onCreated()
        setUploading(false)
      }
    } catch (e: any) {
      toast.error(e.message)
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!uploading) { onOpenChange(o); if (!o) reset() } }}>
      <DialogTrigger asChild>
        <Button><Upload className="w-4 h-4 mr-2" /> Add Evidence</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Compliance Evidence</DialogTitle>
          <DialogDescription>Upload a file or attach a link as evidence for a control</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="space-y-4">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('file')}
              className={cn('flex items-center gap-2 p-3 rounded-lg border-2 transition', mode === 'file' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}
            >
              <Upload className="w-4 h-4" /> <span className="text-sm font-medium">Upload File</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('link')}
              className={cn('flex items-center gap-2 p-3 rounded-lg border-2 transition', mode === 'link' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}
            >
              <Link2 className="w-4 h-4" /> <span className="text-sm font-medium">Attach Link</span>
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-title">Title *</Label>
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Q4 Vulnerability Scan Report" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-desc">Description</Label>
            <Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what this evidence demonstrates…" rows={2} />
          </div>

          {mode === 'file' ? (
            <div className="space-y-2">
              <Label>File *</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault() }}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]) }}
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition"
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    {(() => { const Icon = fileIcon(file.type); return <Icon className="w-5 h-5 text-amber-600" /> })()}
                    <div className="text-left">
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · {file.type || 'unknown'}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Click to upload or drag &amp; drop</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, Images, Office, CSV, ZIP · max 25MB</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
              </div>
              {uploading && progress > 0 && (
                <div className="space-y-1">
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground text-center">{progress}% uploaded</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="link-url">URL *</Label>
                <Input id="link-url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://wiki.company.com/runbook" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="link-title">Link title</Label>
                <Input id="link-title" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Display name for the link (optional)" />
              </div>
            </>
          )}

          {/* Control mapping */}
          <div className="space-y-2">
            <Label>Map to control (optional)</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={selectedFramework} onValueChange={(v) => { setSelectedFramework(v); setControlId('') }}>
                <SelectTrigger><SelectValue placeholder="Framework" /></SelectTrigger>
                <SelectContent>
                  {frameworks.map((f) => <SelectItem key={f.id} value={f.id}>{f.code}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={controlId} onValueChange={setControlId} disabled={!selectedFramework}>
                <SelectTrigger><SelectValue placeholder="Control" /></SelectTrigger>
                <SelectContent>
                  {controls.map((c) => <SelectItem key={c.id} value={c.id}>{c.ref} — {c.title.slice(0, 30)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isSuperAdmin && (
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ev-tags">Tags (comma separated)</Label>
            <Input id="ev-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="policy, q4, evidence" />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Cancel</Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? (mode === 'file' ? `Uploading ${progress}%` : 'Saving…') : (mode === 'file' ? 'Upload Evidence' : 'Add Link')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, canAccessTenant } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = 'uploads'
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const controlId = searchParams.get('controlId')
  const tenantId = searchParams.get('tenantId')

  const filterTenantId = user.role === 'super_admin' ? (tenantId || undefined) : user.tenantId!

  const where: any = {}
  if (filterTenantId) where.tenantId = filterTenantId
  if (controlId) where.controlId = controlId

  const evidence = await db.evidence.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      control: { select: { id: true, ref: true, title: true, frameworkId: true, framework: { select: { code: true, name: true } } } },
    },
  })
  return NextResponse.json({ evidence })
}

// POST handles BOTH file uploads (multipart) and link evidence (JSON)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const contentType = req.headers.get('content-type') || ''

    // ---- FILE UPLOAD (multipart/form-data) ----
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      const title = formData.get('title') as string | null
      const description = formData.get('description') as string | null
      const tags = formData.get('tags') as string | null
      const controlId = formData.get('controlId') as string | null
      const tenantId = formData.get('tenantId') as string | null

      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
      if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large. Maximum 25MB allowed.' }, { status: 400 })

      const targetTenantId = user.role === 'super_admin' ? (tenantId || user.tenantId) : user.tenantId
      if (!targetTenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 })
      if (!canAccessTenant(user, targetTenantId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      // Read file
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      // Sanitize filename + generate unique path
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_')
      const ext = path.extname(sanitized) || ''
      const baseName = path.basename(sanitized, ext)
      const uniqueName = `${baseName}_${Date.now()}${ext}`
      const relativeDir = `${UPLOAD_DIR}/${targetTenantId}`
      const relativePath = `${relativeDir}/${uniqueName}`

      const fullDir = path.join(process.cwd(), 'public', relativeDir)
      await mkdir(fullDir, { recursive: true })
      await writeFile(path.join(process.cwd(), 'public', relativePath), buffer)

      const evidence = await db.evidence.create({
        data: {
          tenantId: targetTenantId,
          controlId: controlId || null,
          uploadedById: user.id,
          title,
          description: description || null,
          type: 'file',
          fileName: file.name,
          filePath: `/${relativePath}`,
          fileSize: file.size,
          mimeType: file.type || null,
          tags: tags || null,
          status: 'active',
        },
        include: {
          control: { select: { id: true, ref: true, title: true, framework: { select: { code: true, name: true } } } },
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
      })

      await db.auditLog.create({
        data: {
          userId: user.id,
          tenantId: targetTenantId,
          action: 'evidence.upload',
          entity: 'evidence',
          entityId: evidence.id,
          meta: JSON.stringify({ title, fileName: file.name, fileSize: file.size }),
        },
      })

      return NextResponse.json({ evidence })
    }

    // ---- LINK EVIDENCE (JSON) ----
    const body = await req.json()
    const { title, description, type, controlId, fileUrl, linkTitle, fileName, filePath, fileSize, mimeType, tags, status, validUntil, tenantId } = body

    const targetTenantId = user.role === 'super_admin' ? (tenantId || user.tenantId) : user.tenantId
    if (!targetTenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 })
    if (!canAccessTenant(user, targetTenantId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!title || !type) return NextResponse.json({ error: 'Title and type required' }, { status: 400 })
    if (type === 'link' && !fileUrl) return NextResponse.json({ error: 'URL required for link evidence' }, { status: 400 })

    const evidence = await db.evidence.create({
      data: {
        tenantId: targetTenantId,
        controlId: controlId || null,
        uploadedById: user.id,
        title,
        description,
        type,
        fileName,
        filePath,
        fileSize,
        mimeType,
        fileUrl,
        linkTitle,
        tags,
        status: status || 'active',
        validUntil: validUntil ? new Date(validUntil) : null,
      },
      include: {
        control: { select: { id: true, ref: true, title: true, framework: { select: { code: true, name: true } } } },
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.id,
        tenantId: targetTenantId,
        action: 'evidence.create',
        entity: 'evidence',
        entityId: evidence.id,
        meta: JSON.stringify({ title, type }),
      },
    })

    return NextResponse.json({ evidence })
  } catch (error: any) {
    console.error('Evidence POST error:', error)
    return NextResponse.json({ error: error.message || 'Request failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, title, description, status, tags, fileUrl, linkTitle } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await db.evidence.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessTenant(user, existing.tenantId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updated = await db.evidence.update({
    where: { id },
    data: { title, description, status, tags, fileUrl, linkTitle },
  })
  return NextResponse.json({ evidence: updated })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await db.evidence.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessTenant(user, existing.tenantId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Delete file from disk if applicable
  if (existing.filePath) {
    const fs = await import('fs/promises')
    const pathMod = await import('path')
    const fullPath = pathMod.join(process.cwd(), 'public', existing.filePath)
    await fs.unlink(fullPath).catch(() => {})
  }

  await db.evidence.delete({ where: { id } })
  await db.auditLog.create({
    data: {
      userId: user.id,
      tenantId: existing.tenantId,
      action: 'evidence.delete',
      entity: 'evidence',
      entityId: id,
    },
  })
  return NextResponse.json({ ok: true })
}
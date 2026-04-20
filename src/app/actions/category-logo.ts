'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTargetOrg, type TargetOrgOpts } from '@/lib/auth/resolve-org'

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_SIZE_BYTES = 2 * 1024 * 1024

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Uploads (or replaces) the logo of a single category.
 *
 * FormData fields:
 *  - `file` (Blob): the already-cropped image produced client-side
 *  - `categoryId` (string): target category
 *  - `forOrgId` (optional string): present when super_admin operates via /admin drilldown
 *
 * Storage path: `{organization_id}/{category_id}/logo-{timestamp}.{ext}` — the first
 * folder segment matches the RLS pattern from migration 019 so the policies pass even
 * before the service-role client kicks in (defense-in-depth).
 */
export async function uploadCategoryLogo(formData: FormData): Promise<string> {
  const file = formData.get('file')
  const categoryIdRaw = formData.get('categoryId')
  const forOrgIdRaw = formData.get('forOrgId')

  const categoryId = typeof categoryIdRaw === 'string' && categoryIdRaw.length > 0 ? categoryIdRaw : null
  const forOrgId = typeof forOrgIdRaw === 'string' && forOrgIdRaw.length > 0 ? forOrgIdRaw : undefined

  if (!(file instanceof Blob)) {
    throw new Error('Arquivo ausente ou inválido.')
  }
  if (!categoryId) {
    throw new Error('Categoria não informada.')
  }

  const mime = file.type
  if (!ALLOWED_MIMES.has(mime)) {
    throw new Error('Formato de imagem não suportado. Envie PNG, JPEG ou WebP.')
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('Imagem muito grande (máx. 2MB).')
  }

  const { orgId, role } = await resolveTargetOrg(forOrgId)
  if (role !== 'admin' && role !== 'super_admin') {
    throw new Error('Apenas o administrador da organização pode alterar o logo.')
  }

  const admin = createAdminClient()

  // Defense-in-depth: confirm the category belongs to the resolved org before touching storage
  const { data: category, error: lookupError } = await admin
    .from('categories')
    .select('id, organization_id')
    .eq('id', categoryId)
    .single()
  if (lookupError || !category) {
    throw new Error('Categoria não encontrada.')
  }
  if (category.organization_id !== orgId) {
    throw new Error('Categoria não pertence à organização atual.')
  }

  const ext = extensionForMime(mime)
  const folder = `${orgId}/${categoryId}`
  const filename = `${folder}/logo-${Date.now()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('category-logos')
    .upload(filename, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: mime,
    })
  if (uploadError) throw new Error(uploadError.message)

  const { data: publicUrlData } = admin.storage
    .from('category-logos')
    .getPublicUrl(filename)
  const publicUrl = publicUrlData.publicUrl

  // Keep only the newest file inside this category's folder
  const { data: existingFiles } = await admin.storage.from('category-logos').list(folder)
  if (existingFiles && existingFiles.length > 0) {
    const toDelete = existingFiles
      .map((f) => `${folder}/${f.name}`)
      .filter((path) => path !== filename)
    if (toDelete.length > 0) {
      await admin.storage.from('category-logos').remove(toDelete)
    }
  }

  const { error: updateError } = await admin
    .from('categories')
    .update({ logo_url: publicUrl })
    .eq('id', categoryId)
    .eq('organization_id', orgId)
  if (updateError) throw new Error(updateError.message)

  revalidateCategoryLogoSurfaces(orgId, categoryId, forOrgId)
  return publicUrl
}

export async function removeCategoryLogo(
  args: { categoryId: string } & TargetOrgOpts,
): Promise<void> {
  const { categoryId, forOrgId } = args
  if (!categoryId) {
    throw new Error('Categoria não informada.')
  }

  const { orgId, role } = await resolveTargetOrg(forOrgId ?? undefined)
  if (role !== 'admin' && role !== 'super_admin') {
    throw new Error('Apenas o administrador da organização pode remover o logo.')
  }

  const admin = createAdminClient()

  const { data: category, error: lookupError } = await admin
    .from('categories')
    .select('id, organization_id')
    .eq('id', categoryId)
    .single()
  if (lookupError || !category) {
    throw new Error('Categoria não encontrada.')
  }
  if (category.organization_id !== orgId) {
    throw new Error('Categoria não pertence à organização atual.')
  }

  const folder = `${orgId}/${categoryId}`
  const { data: files } = await admin.storage.from('category-logos').list(folder)
  if (files && files.length > 0) {
    await admin.storage
      .from('category-logos')
      .remove(files.map((f) => `${folder}/${f.name}`))
  }

  const { error } = await admin
    .from('categories')
    .update({ logo_url: null })
    .eq('id', categoryId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidateCategoryLogoSurfaces(orgId, categoryId, forOrgId ?? undefined)
}

function revalidateCategoryLogoSurfaces(
  orgId: string,
  categoryId: string,
  forOrgId: string | undefined,
) {
  revalidatePath('/dashboard', 'layout')
  revalidatePath('/settings')
  revalidatePath(`/categories/${categoryId}`)
  if (forOrgId) {
    revalidatePath(`/admin/organizations/${orgId}`, 'layout')
  }
}

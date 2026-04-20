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
 * Uploads a new logo for the organization.
 *
 * The FormData must contain:
 *  - `file` (Blob): the already-cropped image produced client-side
 *  - `forOrgId` (optional string): present when super_admin is operating via drilldown
 *
 * Writes are performed with the service-role client so RLS isn't relied on for
 * authorization — the permission check is done here explicitly.
 */
export async function uploadOrgLogo(formData: FormData): Promise<string> {
  const file = formData.get('file')
  const forOrgIdRaw = formData.get('forOrgId')
  const forOrgId = typeof forOrgIdRaw === 'string' && forOrgIdRaw.length > 0 ? forOrgIdRaw : undefined

  if (!(file instanceof Blob)) {
    throw new Error('Arquivo ausente ou inválido.')
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
  const ext = extensionForMime(mime)
  const filename = `${orgId}/logo-${Date.now()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('org-logos')
    .upload(filename, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: mime,
    })
  if (uploadError) throw new Error(uploadError.message)

  const { data: publicUrlData } = admin.storage
    .from('org-logos')
    .getPublicUrl(filename)
  const publicUrl = publicUrlData.publicUrl

  // Clean up any prior logo files for this org (we only keep the newest)
  const { data: existingFiles } = await admin.storage.from('org-logos').list(orgId)
  if (existingFiles && existingFiles.length > 0) {
    const toDelete = existingFiles
      .map((f) => `${orgId}/${f.name}`)
      .filter((path) => path !== filename)
    if (toDelete.length > 0) {
      await admin.storage.from('org-logos').remove(toDelete)
    }
  }

  const { error: updateError } = await admin
    .from('organizations')
    .update({ logo_url: publicUrl })
    .eq('id', orgId)
  if (updateError) throw new Error(updateError.message)

  revalidateLogoSurfaces(orgId, forOrgId)
  return publicUrl
}

export async function removeOrgLogo(opts?: TargetOrgOpts): Promise<void> {
  const { orgId, role } = await resolveTargetOrg(opts?.forOrgId ?? undefined)
  if (role !== 'admin' && role !== 'super_admin') {
    throw new Error('Apenas o administrador da organização pode remover o logo.')
  }

  const admin = createAdminClient()
  const { data: files } = await admin.storage.from('org-logos').list(orgId)
  if (files && files.length > 0) {
    await admin.storage
      .from('org-logos')
      .remove(files.map((f) => `${orgId}/${f.name}`))
  }

  const { error } = await admin
    .from('organizations')
    .update({ logo_url: null })
    .eq('id', orgId)
  if (error) throw new Error(error.message)

  revalidateLogoSurfaces(orgId, opts?.forOrgId ?? undefined)
}

function revalidateLogoSurfaces(orgId: string, forOrgId: string | undefined) {
  revalidatePath('/settings')
  revalidatePath('/profile')
  revalidatePath('/dashboard', 'layout')
  if (forOrgId) {
    revalidatePath(`/admin/organizations/${orgId}`, 'layout')
  }
}

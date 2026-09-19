'use server';

import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { resolveActiveOrganizationId } from './history';
import { updateMockOrganization } from '@/lib/mockStore';
import { revalidatePath } from 'next/cache';

export async function updateOrganizationSettingsAction(formData: {
  name: string;
  serialPrefix: string;
  logoUrl?: string;
  currency?: string;
}) {
  const orgId = await resolveActiveOrganizationId();

  if (!orgId) {
    throw new Error('Unauthenticated: No active organization session found.');
  }

  const cleanPrefix = formData.serialPrefix.toUpperCase().trim();

  if (isSupabaseConfigured()) {
    const { error } = await supabaseAdmin
      .from('organizations')
      .update({
        name: formData.name.trim(),
        serial_prefix: cleanPrefix,
        logo_url: formData.logoUrl,
        currency: formData.currency,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    if (error) throw new Error(`Failed to update organization settings: ${error.message}`);
  }

  // Update in-memory mock store
  updateMockOrganization(orgId, {
    name: formData.name.trim(),
    serialPrefix: cleanPrefix,
    defaultCurrency: formData.currency,
  });

  revalidatePath('/settings');
  revalidatePath('/assets');
  return { success: true };
}

import { supabase } from '../supabase';
import type { ResumeRecord, ApplicationDocumentRecord, DocumentType } from '../types/documents';

export interface CreateResumeParams {
  workspaceId: string;
  name: string;
  documentType?: DocumentType;
  versionLabel?: string;
  targetRole?: string | null;
  category?: string | null;
  changeSummary?: string | null;
  contentText?: string | null;
  fileStoragePath?: string | null;
  isDefault?: boolean;
  baseResumeId?: string | null;
}

export interface CloneResumeParams {
  resumeId: string;
  newName?: string;
  newVersionLabel?: string;
  changeSummary?: string;
}

/**
 * Fetch all resumes and cover letters for a workspace with computed application usage
 */
export async function fetchResumes(
  workspaceId: string,
  options: { includeArchived?: boolean } = {}
): Promise<ResumeRecord[]> {
  let query = supabase
    .from('resumes')
    .select(
      `
      *,
      application_documents (
        id,
        application_id,
        applications (
          id,
          stage,
          status,
          outcome
        )
      )
    `
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (!options.includeArchived) {
    query = query.is('archived_at', null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch resumes: ${error.message}`);
  }

  interface RawDocRow {
    applications?: {
      stage?: string | null;
      status?: string | null;
      outcome?: string | null;
    } | null;
  }
  interface RawResumeRow extends ResumeRecord {
    application_documents?: RawDocRow[] | null;
  }

  // Calculate usage and performance rates for each resume
  const resumes = ((data || []) as unknown as RawResumeRow[]).map((row) => {
    const docs = row.application_documents || [];
    const usedCount = docs.length;

    let responsesCount = 0;
    let interviewsCount = 0;
    let offersCount = 0;
    let rejectionsCount = 0;

    for (const doc of docs) {
      const app = doc.applications;
      if (!app) continue;

      // Check if application has moved past initial stage / has a positive response
      if (app.stage && !['SAVED', 'PREPARING'].includes(app.stage)) {
        responsesCount++;
      }

      // Check if interview was reached
      if (
        app.stage &&
        ['RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'CLOSED'].includes(app.stage)
      ) {
        interviewsCount++;
      }

      // Outcome checks
      if (app.outcome === 'OFFER' || app.stage === 'OFFER') {
        offersCount++;
      }
      if (app.outcome === 'REJECTED') {
        rejectionsCount++;
      }
    }

    return {
      ...row,
      used_count: usedCount,
      responses_count: responsesCount,
      interviews_count: interviewsCount,
      offers_count: offersCount,
      rejections_count: rejectionsCount,
    } as ResumeRecord;
  });

  return resumes;
}

export async function fetchResumeById(resumeId: string): Promise<ResumeRecord | null> {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', resumeId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch resume: ${error.message}`);
  }

  return data as ResumeRecord;
}

export async function createResume(params: CreateResumeParams): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('rpc_create_resume', {
    p_workspace_id: params.workspaceId,
    p_name: params.name,
    p_document_type: params.documentType || 'RESUME',
    p_version_label: params.versionLabel || 'v1',
    p_target_role: params.targetRole || null,
    p_category: params.category || null,
    p_change_summary: params.changeSummary || null,
    p_content_text: params.contentText || null,
    p_file_storage_path: params.fileStoragePath || null,
    p_is_default: !!params.isDefault,
    p_base_resume_id: params.baseResumeId || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string };
}

export async function cloneResume(params: CloneResumeParams): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('rpc_clone_resume', {
    p_resume_id: params.resumeId,
    p_new_name: params.newName || null,
    p_new_version_label: params.newVersionLabel || null,
    p_change_summary: params.changeSummary || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string };
}

export async function setDefaultResume(resumeId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_set_default_resume', {
    p_resume_id: resumeId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function archiveResume(resumeId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_archive_resume', {
    p_resume_id: resumeId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function restoreResume(resumeId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_restore_resume', {
    p_resume_id: resumeId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteResume(resumeId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_delete_resume', {
    p_resume_id: resumeId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchApplicationDocuments(applicationId: string): Promise<ApplicationDocumentRecord[]> {
  const { data, error } = await supabase
    .from('application_documents')
    .select(
      `
      *,
      resumes (*)
    `
    )
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load application documents: ${error.message}`);
  }

  interface RawAppDocRow extends ApplicationDocumentRecord {
    resumes?: ResumeRecord | null;
  }

  return ((data || []) as unknown as RawAppDocRow[]).map((row) => ({
    ...row,
    resume: row.resumes,
  }));
}

export async function linkApplicationDocument(params: {
  applicationId: string;
  resumeId?: string | null;
  documentType?: string;
  notes?: string | null;
  fileStoragePath?: string | null;
}): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('rpc_link_application_document', {
    p_application_id: params.applicationId,
    p_resume_id: params.resumeId || null,
    p_document_type: params.documentType || 'RESUME',
    p_notes: params.notes || null,
    p_file_storage_path: params.fileStoragePath || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string };
}

export async function unlinkApplicationDocument(documentId: string): Promise<void> {
  const { error } = await supabase.rpc('rpc_unlink_application_document', {
    p_document_id: documentId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

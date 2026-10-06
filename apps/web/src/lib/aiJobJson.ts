import type { Application } from '../types/applications';

export type JobDataInput = Partial<Application> | Record<string, unknown>;

/**
 * Creates an AI-friendly JSON representation of a captured job.
 * Ensures no sensitive/internal metadata is exposed.
 * 
 * @param jobData The normalized capture payload or JobQuest Application record
 * @returns The formatted JSON string
 */
export function generateAIJobJson(jobData: JobDataInput): string {
  const data = jobData as Record<string, unknown>;
  const snapshot = (data.job_snapshot as Record<string, unknown> | undefined) || undefined;

  // Basic properties
  const title = (data.jobTitle as string) || (data.role_title as string) || null;
  const company = (data.company as string) || (data.company_name as string) || null;
  const location = (data.location as string) || null;
  const workArrangement = (data.workArrangement as string) || (data.work_arrangement as string) || null;
  const employmentType = (data.employmentType as string) || (data.employment_type as string) || null;
  
  // Compensation
  const compMin = (data.salaryMin as number) ?? (data.salary_min as number) ?? null;
  const compMax = (data.salaryMax as number) ?? (data.salary_max as number) ?? null;
  const compCurrency = (data.salaryCurrency as string) || (data.salary_currency as string) || null;
  const compRangeText = (data.salaryRange as string) || null;

  // Description
  const description = (data.description as string) || (snapshot?.job_description as string) || (data.job_description as string) || null;
  
  // Raw payload handling
  const rawPayload = (snapshot?.raw_payload || data.raw_payload || data || {}) as Record<string, unknown>;
  
  const responsibilities = Array.isArray(rawPayload.responsibilities) ? rawPayload.responsibilities : [];
  const requirements = Array.isArray(rawPayload.requirements) 
    ? rawPayload.requirements 
    : (typeof snapshot?.requirements === 'string' ? [snapshot.requirements] : (typeof data.requirements === 'string' ? [data.requirements] : []));
  const skills = Array.isArray(rawPayload.skills)
    ? rawPayload.skills
    : (typeof snapshot?.skills === 'string' ? [snapshot.skills] : (typeof data.skills === 'string' ? [data.skills] : []));

  // Source info
  const sourcePlatform = (data.source as string) || null;
  const jobUrl = (data.jobUrl as string) || (data.job_url as string) || null;
  const externalId = (data.externalJobId as string) || (data.external_job_id as string) || null;
  
  // Dates
  const capturedAt = (snapshot?.captured_at as string) || (data.captured_at as string) || new Date().toISOString();
  const confidence = (rawPayload.confidence as unknown) || null;

  const aiJson = {
    schema_version: "1.0",
    job: {
      title,
    },
    company: {
      name: company,
    },
    location: {
      text: location,
      work_arrangement: workArrangement,
    },
    employment: {
      type: employmentType,
    },
    compensation: {
      min: compMin,
      max: compMax,
      currency: compCurrency,
      range_text: compRangeText,
    },
    description: description,
    responsibilities: responsibilities.length > 0 ? responsibilities : null,
    requirements: requirements.length > 0 ? requirements : null,
    skills: skills.length > 0 ? skills : null,
    source: {
      platform: sourcePlatform,
      url: jobUrl,
      external_id: externalId,
    },
    capture_metadata: {
      captured_at: capturedAt,
      extractor_confidence: confidence,
    }
  };

  const finalJson = JSON.parse(JSON.stringify(aiJson, (_key, value) => {
    if (value === "" || value === undefined) return null;
    return value;
  }));

  for (const key of Object.keys(finalJson)) {
    if (finalJson[key] && typeof finalJson[key] === 'object' && !Array.isArray(finalJson[key])) {
      const isAllNull = Object.values(finalJson[key]).every(v => v === null);
      if (isAllNull) finalJson[key] = null;
    }
  }

  return JSON.stringify(finalJson, null, 2);
}

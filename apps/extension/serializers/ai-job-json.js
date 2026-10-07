/**
 * Creates an AI-friendly JSON representation of a captured job.
 * Ensures no sensitive/internal metadata is exposed.
 * 
 * @param {Object} jobData The normalized capture payload or JobQuest Application record
 * @returns {string} The formatted JSON string
 */
export function generateAIJobJson(jobData) {
  // We assume jobData is already ALMOST in the correct master shape 
  // since we will update extractors/index.js to return the master shape.
  // However, we must ensure it strictly matches schema_version: "1.1".
  
  const rawJob = jobData.job || {};
  const rawCompany = jobData.company || {};
  const rawLocation = jobData.location || {};
  const rawEmployment = jobData.employment || {};
  const rawCompensation = jobData.compensation || {};
  const rawWorkAuth = jobData.work_authorization || {};
  const rawRecruiter = jobData.recruiter || {};
  const rawSource = jobData.source || {};
  const rawMetadata = jobData.capture_metadata || {};

  // For fallback if jobData is the old flat format from DB
  const title = rawJob.title ?? jobData.jobTitle ?? jobData.role_title ?? null;
  const companyName = rawCompany.name ?? jobData.company ?? jobData.company_name ?? null;
  const locationText = rawLocation.text ?? jobData.location ?? null;
  const workArrangement = rawLocation.work_arrangement ?? jobData.workArrangement ?? jobData.work_arrangement ?? null;
  const employmentType = rawEmployment.type ?? jobData.employmentType ?? jobData.employment_type ?? null;
  
  const compMin = rawCompensation.min ?? jobData.salaryMin ?? jobData.salary_min ?? null;
  const compMax = rawCompensation.max ?? jobData.salaryMax ?? jobData.salary_max ?? null;
  const compCurrency = rawCompensation.currency ?? jobData.salaryCurrency ?? jobData.salary_currency ?? null;
  const compRangeText = rawCompensation.range_text ?? jobData.salaryRange ?? null;

  const description = jobData.description ?? jobData.job_snapshot?.job_description ?? jobData.job_description ?? "";
  
  const rawPayload = jobData.job_snapshot?.raw_payload || jobData.raw_payload || jobData || {};
  
  const responsibilities = Array.isArray(rawPayload.responsibilities) ? rawPayload.responsibilities : [];
  
  // requirements might be an array in old flat format, or an object in 1.1 format
  let requirements = { must_have: [], preferred: [] };
  if (rawPayload.requirements && !Array.isArray(rawPayload.requirements) && typeof rawPayload.requirements === 'object') {
    requirements.must_have = Array.isArray(rawPayload.requirements.must_have) ? rawPayload.requirements.must_have : [];
    requirements.preferred = Array.isArray(rawPayload.requirements.preferred) ? rawPayload.requirements.preferred : [];
  } else if (Array.isArray(rawPayload.requirements)) {
    requirements.must_have = rawPayload.requirements;
  }

  const skills = Array.isArray(rawPayload.skills) ? rawPayload.skills : [];
  const benefits = Array.isArray(rawPayload.benefits) ? rawPayload.benefits : [];
  const education = Array.isArray(rawPayload.education) ? rawPayload.education : [];
  
  const sourcePlatform = rawSource.platform ?? jobData.source ?? null;
  const jobUrl = rawSource.url ?? jobData.jobUrl ?? jobData.job_url ?? null;
  const externalId = rawSource.external_id ?? jobData.externalJobId ?? jobData.external_job_id ?? null;
  
  const capturedAt = rawMetadata.captured_at ?? jobData.job_snapshot?.captured_at ?? jobData.captured_at ?? new Date().toISOString();

  const aiJson = {
    schema_version: "1.1",
    job: {
      title,
      normalized_title: rawJob.normalized_title ?? null,
      seniority: rawJob.seniority ?? null,
      category: rawJob.category ?? null,
      summary: rawJob.summary ?? null,
      posted_at: rawJob.posted_at ?? null,
      posted_text: rawJob.posted_text ?? null,
      updated_at: rawJob.updated_at ?? null,
      updated_text: rawJob.updated_text ?? null,
      applicants_count: rawJob.applicants_count ?? null,
      views_count: rawJob.views_count ?? null,
      saves_count: rawJob.saves_count ?? null,
      tags: Array.isArray(rawJob.tags) ? rawJob.tags : [],
      is_repost: rawJob.is_repost ?? null,
      years_experience_min: rawJob.years_experience_min ?? null
    },
    company: {
      name: companyName,
      website: rawCompany.website ?? null,
      linkedin_url: rawCompany.linkedin_url ?? null,
      size: rawCompany.size ?? null,
      employees: rawCompany.employees ?? null,
      founded_year: rawCompany.founded_year ?? null,
      headquarters: rawCompany.headquarters ?? null,
      industries: Array.isArray(rawCompany.industries) ? rawCompany.industries : [],
      activities: Array.isArray(rawCompany.activities) ? rawCompany.activities : [],
      description: rawCompany.description ?? null,
      organization_type: rawCompany.organization_type ?? null,
      funding: rawCompany.funding ?? null,
      related_organizations: Array.isArray(rawCompany.related_organizations) ? rawCompany.related_organizations : [],
      is_agency: rawCompany.is_agency ?? null,
      rating: rawCompany.rating ?? null
    },
    location: {
      text: locationText,
      all: Array.isArray(rawLocation.all) ? rawLocation.all : [],
      city: rawLocation.city ?? null,
      region: rawLocation.region ?? null,
      country: rawLocation.country ?? null,
      work_arrangement: workArrangement,
      is_remote: rawLocation.is_remote ?? null
    },
    employment: {
      type: employmentType,
      duration: rawEmployment.duration ?? null,
      travel: rawEmployment.travel ?? null,
      schedule: rawEmployment.schedule ?? null
    },
    compensation: {
      min: compMin,
      max: compMax,
      currency: compCurrency,
      period: rawCompensation.period ?? null,
      range_text: compRangeText
    },
    description: description || "",
    responsibilities: responsibilities,
    requirements: requirements,
    skills: skills,
    education: education,
    benefits: benefits,
    work_authorization: {
      sponsorship: rawWorkAuth.sponsorship ?? null,
      citizen_only: rawWorkAuth.citizen_only ?? null,
      clearance_required: rawWorkAuth.clearance_required ?? null,
      statement: rawWorkAuth.statement ?? null
    },
    recruiter: {
      name: rawRecruiter.name ?? null,
      profile_url: rawRecruiter.profile_url ?? null,
      email: rawRecruiter.email ?? null
    },
    source: {
      platform: sourcePlatform,
      url: jobUrl,
      external_id: externalId,
      secondary_ids: (rawSource.secondary_ids && typeof rawSource.secondary_ids === 'object') ? rawSource.secondary_ids : {},
      apply_url: rawSource.apply_url ?? null,
      original_url: rawSource.original_url ?? null
    },
    extras: (rawPayload.extras && typeof rawPayload.extras === 'object') ? rawPayload.extras : {},
    notes: jobData.notes ?? "",
    capture_metadata: {
      captured_at: capturedAt,
      field_sources: (rawMetadata.field_sources && typeof rawMetadata.field_sources === 'object') ? rawMetadata.field_sources : {},
      contributing_sources: Array.isArray(rawMetadata.contributing_sources) ? rawMetadata.contributing_sources : [],
      edited_fields: Array.isArray(rawMetadata.edited_fields) ? rawMetadata.edited_fields : [],
      warnings: Array.isArray(rawMetadata.warnings) ? rawMetadata.warnings : []
    }
  };

  return JSON.stringify(aiJson, null, 2);
}

/**
 * Creates an AI-friendly JSON representation of a captured job.
 * Ensures no sensitive/internal metadata is exposed.
 * 
 * @param {Object} jobData The normalized capture payload or JobQuest Application record
 * @returns {string} The formatted JSON string
 */
export function generateAIJobJson(jobData) {
  // Basic properties
  const title = jobData.jobTitle || jobData.role_title || null;
  const company = jobData.company || jobData.company_name || null;
  const location = jobData.location || null;
  const workArrangement = jobData.workArrangement || jobData.work_arrangement || null;
  const employmentType = jobData.employmentType || jobData.employment_type || null;
  
  // Compensation
  const compMin = jobData.salaryMin ?? jobData.salary_min ?? null;
  const compMax = jobData.salaryMax ?? jobData.salary_max ?? null;
  const compCurrency = jobData.salaryCurrency || jobData.salary_currency || null;
  const compRangeText = jobData.salaryRange || null;

  // Description
  const description = jobData.description || jobData.job_snapshot?.job_description || jobData.job_description || null;
  
  // Raw payload handling
  const rawPayload = jobData.job_snapshot?.raw_payload || jobData.raw_payload || jobData || {};
  
  const responsibilities = Array.isArray(rawPayload.responsibilities) ? rawPayload.responsibilities : [];
  const requirements = Array.isArray(rawPayload.requirements) 
    ? rawPayload.requirements 
    : (typeof jobData.job_snapshot?.requirements === 'string' ? [jobData.job_snapshot.requirements] : (typeof jobData.requirements === 'string' ? [jobData.requirements] : []));
  const skills = Array.isArray(rawPayload.skills)
    ? rawPayload.skills
    : (typeof jobData.job_snapshot?.skills === 'string' ? [jobData.job_snapshot.skills] : (typeof jobData.skills === 'string' ? [jobData.skills] : []));

  // Source info
  const sourcePlatform = jobData.source || null;
  const jobUrl = jobData.jobUrl || jobData.job_url || null;
  const externalId = jobData.externalJobId || jobData.external_job_id || null;
  
  // Dates
  const capturedAt = jobData.job_snapshot?.captured_at || jobData.captured_at || new Date().toISOString();
  const confidence = rawPayload.confidence || null;

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

  const finalJson = JSON.parse(JSON.stringify(aiJson, (key, value) => {
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

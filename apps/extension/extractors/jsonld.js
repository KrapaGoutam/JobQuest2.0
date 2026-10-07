// JobQuest Capture Extension — schema.org JobPosting JSON-LD Extractor

/**
 * Strips HTML tags from string to produce clean text.
 */
function cleanText(raw) {
  if (!raw) return ""
  return String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Normalizes work arrangement string to JobQuest values:
 * "Remote" | "Hybrid" | "Onsite" | ""
 */
function normalizeWorkArrangement(val, contextText = "") {
  const combined = `${val || ""} ${contextText || ""}`.toLowerCase()
  if (combined.includes("remote") || combined.includes("telecommute")) return "Remote"
  if (combined.includes("hybrid")) return "Hybrid"
  if (combined.includes("on-site") || combined.includes("onsite") || combined.includes("in-office"))
    return "Onsite"
  return ""
}

/**
 * Normalizes employment type to JobQuest values:
 * "Full-time" | "Part-time" | "Contract" | "Internship" | "Temporary" | "Other" | ""
 */
function normalizeEmploymentType(val) {
  if (!val) return ""
  const str = Array.isArray(val) ? val.join(" ") : String(val)
  const upper = str.toUpperCase()
  if (upper.includes("FULL_TIME") || upper.includes("FULL-TIME") || upper.includes("FULL TIME"))
    return "Full-time"
  if (upper.includes("PART_TIME") || upper.includes("PART-TIME") || upper.includes("PART TIME"))
    return "Part-time"
  if (upper.includes("CONTRACT") || upper.includes("FREELANCE")) return "Contract"
  if (upper.includes("INTERN")) return "Internship"
  if (upper.includes("TEMPORARY") || upper.includes("TEMP")) return "Temporary"
  return ""
}

/**
 * Traverses an unknown JSON-LD structure to find schema JobPosting objects.
 */
function findJobPostings(obj, results = []) {
  if (!obj || typeof obj !== "object") return results
  if (Array.isArray(obj)) {
    for (const item of obj) findJobPostings(item, results)
    return results
  }
  const type = obj["@type"]
  if (
    type === "JobPosting" ||
    (Array.isArray(type) && type.includes("JobPosting")) ||
    (typeof type === "string" && type.endsWith("/JobPosting"))
  ) {
    results.push(obj)
  }
  if (obj["@graph"]) {
    findJobPostings(obj["@graph"], results)
  }
  return results
}

/**
 * Extracts job posting details from schema.org JSON-LD scripts in the document.
 */
export function extractJsonLd(doc, pageUrl = "") {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  const postings = []

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || "{}")
      findJobPostings(parsed, postings)
    } catch {
      // Ignore malformed JSON-LD scripts
    }
  }

  if (postings.length === 0) return null;

  // Stale SPA Protection: Look for an exact match if multiple postings, 
  // or verify the single posting isn't from a previous route.
  let job = postings[0];
  for (const p of postings) {
    const pUrl = p.url || "";
    const pId = p.identifier?.value || "";
    if ((pUrl && pageUrl.includes(pUrl)) || (pId && pageUrl.includes(pId))) {
      job = p;
      break;
    }
  }

  // If the job explicitly declares a URL/ID and it's completely missing from our pageUrl, it might be stale.
  const jobUrlStr = String(job.url || "");
  const jobIdStr = String(job.identifier?.value || "");
  
  let hasValidMatch = false;
  let hasStaleData = false;
  
  if (jobUrlStr) {
    if (pageUrl.includes(jobUrlStr) || jobUrlStr.includes(pageUrl)) hasValidMatch = true;
    else hasStaleData = true;
  }
  
  if (jobIdStr) {
    if (pageUrl.includes(jobIdStr)) hasValidMatch = true;
    else hasStaleData = true;
  }
  
  // If we found a mismatch and no valid match rescued it, it's stale
  if (hasStaleData && !hasValidMatch) {
    return null;
  }

  // Job Title
  const jobTitle = cleanText(job.title || job.name || "")

  // Company
  let company = ""
  if (job.hiringOrganization) {
    if (typeof job.hiringOrganization === "string") {
      company = cleanText(job.hiringOrganization)
    } else if (typeof job.hiringOrganization === "object") {
      company = cleanText(
        job.hiringOrganization.name || job.hiringOrganization.legalName || "",
      )
    }
  }

  // Location
  let location = ""
  if (job.jobLocation) {
    const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation
    if (typeof loc === "string") {
      location = cleanText(loc)
    } else if (loc && loc.address) {
      if (typeof loc.address === "string") {
        location = cleanText(loc.address)
      } else if (typeof loc.address === "object") {
        const parts = [
          loc.address.addressLocality,
          loc.address.addressRegion,
          loc.address.addressCountry,
        ].filter(Boolean)
        location = parts.join(", ")
      }
    }
  }
  if (!location && job.applicantLocationRequirements) {
    location = cleanText(
      job.applicantLocationRequirements.name || job.applicantLocationRequirements,
    )
  }

  // Work Arrangement
  let workArrangement = ""
  if (
    job.jobLocationType === "TELECOMMUTE" ||
    String(job.jobLocationType || "").toUpperCase().includes("TELECOMMUTE")
  ) {
    workArrangement = "Remote"
  } else {
    workArrangement = normalizeWorkArrangement(location, `${jobTitle} ${job.description || ""}`)
  }

  // Employment Type
  const employmentType = normalizeEmploymentType(job.employmentType)

  // Salary
  let salaryMin = null
  let salaryMax = null
  let salaryCurrency = ""
  let salaryRange = ""

  const salaryObj = job.baseSalary || job.estimatedSalary
  if (salaryObj && typeof salaryObj === "object") {
    salaryCurrency = String(salaryObj.currency || "").toUpperCase()
    const val = salaryObj.value
    if (typeof val === "number") {
      salaryMin = val
      salaryMax = val
    } else if (val && typeof val === "object") {
      if (val.minValue !== undefined) salaryMin = Number(val.minValue) || null
      if (val.maxValue !== undefined) salaryMax = Number(val.maxValue) || null
      if (val.value !== undefined && salaryMin === null) {
        salaryMin = Number(val.value) || null
        salaryMax = salaryMin
      }
    }
    if (salaryMin !== null || salaryMax !== null) {
      const sym = salaryCurrency ? `${salaryCurrency} ` : "$"
      if (salaryMin !== null && salaryMax !== null && salaryMin !== salaryMax) {
        salaryRange = `${sym}${salaryMin.toLocaleString()} - ${sym}${salaryMax.toLocaleString()}`
      } else {
        salaryRange = `${sym}${(salaryMin || salaryMax).toLocaleString()}`
      }
    }
  }

  // Description
  const description = cleanText(job.description || "")

  return {
    jobTitle,
    company,
    location,
    workArrangement,
    employmentType,
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryRange,
    description,
    jobUrl: pageUrl,
    source: company ? "" : "JobPosting",
    confidence: "jsonld",
  }
}

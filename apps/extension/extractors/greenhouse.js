// JobQuest Capture Extension — Greenhouse ATS Extractor

function cleanText(raw) {
  if (!raw) return ""
  return String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
function parseCompanyFromUrl(url) {
  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/^\/([^/]+)\/jobs/i)
    if (match && match[1]) {
      return match[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    }
  } catch {
    // ignore
  }
  return ""
}

export function matchesGreenhouse(url, doc) {
  if (/greenhouse\.io/i.test(url)) return true
  if (doc.querySelector("#grnhse_app, #app-body, .app-title")) return true
  return false
}

export function extractGreenhouse(doc, pageUrl = "") {
  if (!matchesGreenhouse(pageUrl, doc)) return null

  // Job Title
  const titleEl = doc.querySelector(
    ".app-title, #app-body h1.app-title, h1.job-title, .job-name, h1",
  )
  const jobTitle = cleanText(titleEl?.textContent || "")

  // Company
  const companyEl = doc.querySelector(
    ".company-name, .logo-container img[alt], #header .company-name",
  )
  let company = cleanText(companyEl?.textContent || companyEl?.getAttribute("alt") || "")
  if (!company) {
    company = parseCompanyFromUrl(pageUrl)
  }

  // Location
  const locationEl = doc.querySelector(".location, .body--metadata, .job-location")
  const location = cleanText(locationEl?.textContent || "")

  // Work Arrangement
  let workArrangement = ""
  const fullLoc = location.toLowerCase()
  if (fullLoc.includes("remote")) workArrangement = "Remote"
  else if (fullLoc.includes("hybrid")) workArrangement = "Hybrid"
  else if (fullLoc.includes("on-site") || fullLoc.includes("onsite")) workArrangement = "Onsite"

  // Description
  const descEl = doc.querySelector("#content, #app-body, .job-description")
  const description = cleanText(descEl?.textContent || "")

  return {
    jobTitle,
    company,
    location,
    workArrangement,
    employmentType: "",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "",
    salaryRange: "",
    description,
    jobUrl: pageUrl,
    source: "Greenhouse",
    confidence: "ats_greenhouse",
  }
}

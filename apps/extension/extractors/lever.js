// JobQuest Capture Extension — Lever ATS Extractor

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
    const match = parsed.pathname.match(/^\/([^/]+)/i)
    if (match && match[1]) {
      return match[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    }
  } catch {
    // ignore
  }
  return ""
}

export function matchesLever(url, doc) {
  if (/jobs\.lever\.co/i.test(url)) return true
  if (doc.querySelector(".posting-headline, .posting-categories")) return true
  return false
}

export function extractLever(doc, pageUrl = "") {
  if (!matchesLever(pageUrl, doc)) return null

  // Job Title
  const titleEl = doc.querySelector(
    ".posting-headline h2, .posting-headline h1, h2.posting-headline",
  )
  const jobTitle = cleanText(titleEl?.textContent || "")

  // Company
  const logoEl = doc.querySelector(".main-header-logo img")
  let company = cleanText(logoEl?.getAttribute("alt") || "")
  if (!company) {
    company = parseCompanyFromUrl(pageUrl)
  }

  // Categories / Location / Workplace / Commitment
  const locationEl = doc.querySelector(".posting-categories .location, .location")
  const location = cleanText(locationEl?.textContent || "")

  const workplaceEl = doc.querySelector(".workplaceTypes, .workplace-type")
  const workplaceText = cleanText(workplaceEl?.textContent || "")
  let workArrangement = ""
  const combLoc = `${location} ${workplaceText}`.toLowerCase()
  if (combLoc.includes("remote")) workArrangement = "Remote"
  else if (combLoc.includes("hybrid")) workArrangement = "Hybrid"
  else if (combLoc.includes("on-site") || combLoc.includes("onsite")) workArrangement = "Onsite"

  const commitmentEl = doc.querySelector(".posting-categories .commitment, .commitment")
  const commitmentText = cleanText(commitmentEl?.textContent || "").toLowerCase()
  let employmentType = ""
  if (commitmentText.includes("full-time") || commitmentText.includes("full time"))
    employmentType = "Full-time"
  else if (commitmentText.includes("part-time") || commitmentText.includes("part time"))
    employmentType = "Part-time"
  else if (commitmentText.includes("contract")) employmentType = "Contract"
  else if (commitmentText.includes("intern")) employmentType = "Internship"

  // Description
  const descEl = doc.querySelector(".section.page-centered, .posting-page, #content")
  const description = cleanText(descEl?.textContent || "")

  return {
    jobTitle,
    company,
    location,
    workArrangement,
    employmentType,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "",
    salaryRange: "",
    description,
    jobUrl: pageUrl,
    source: "Lever",
    confidence: "ats_lever",
  }
}

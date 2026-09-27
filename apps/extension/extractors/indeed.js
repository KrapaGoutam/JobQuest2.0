// JobQuest Capture Extension — Indeed Extractor

function cleanText(raw) {
  if (!raw) return ""
  return String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
export function matchesIndeed(url, doc) {
  if (/indeed\.com/i.test(url)) return true
  if (doc.querySelector(".jobsearch-JobInfoHeader-title, #jobDescriptionText")) return true
  return false
}

export function extractIndeed(doc, pageUrl = "") {
  if (!matchesIndeed(pageUrl, doc)) return null

  // Job Title
  const titleEl = doc.querySelector(
    "h1.jobsearch-JobInfoHeader-title, [data-testid='simpler-jobTitle'], .jobsearch-JobInfoHeader-title-container h1, h1",
  )
  const jobTitle = cleanText(titleEl?.textContent || "")

  // Company
  const companyEl = doc.querySelector(
    "[data-testid='inlineHeader-companyName'], .jobsearch-CompanyInfoContainer a, [data-company-name='true']",
  )
  const company = cleanText(companyEl?.textContent || "")

  // Location
  const locationEl = doc.querySelector(
    "[data-testid='inlineHeader-companyLocation'], [data-testid='jobsearch-JobInfoHeader-companyLocation']",
  )
  const location = cleanText(locationEl?.textContent || "")

  // Work Arrangement
  let workArrangement = ""
  const combLoc = location.toLowerCase()
  if (combLoc.includes("remote")) workArrangement = "Remote"
  else if (combLoc.includes("hybrid")) workArrangement = "Hybrid"

  // Salary
  const salaryEl = doc.querySelector(
    "#salaryInfoAndJobType, [data-testid='attribute_snippet_testid']",
  )
  const salaryText = cleanText(salaryEl?.textContent || "")
  let salaryRange = ""
  let salaryMin = null
  let salaryMax = null
  let salaryCurrency = "USD"

  const salaryMatch = salaryText.match(/\$([\d,]+)(?:\s*-\s*\$([\d,]+))?/)
  if (salaryMatch) {
    salaryMin = Number(salaryMatch[1].replace(/,/g, "")) || null
    if (salaryMatch[2]) {
      salaryMax = Number(salaryMatch[2].replace(/,/g, "")) || null
      salaryRange = `$${salaryMin?.toLocaleString()} - $${salaryMax?.toLocaleString()}`
    } else if (salaryMin) {
      salaryMax = salaryMin
      salaryRange = `$${salaryMin.toLocaleString()}`
    }
  }

  // Description
  const descEl = doc.querySelector("#jobDescriptionText, .jobsearch-jobDescriptionText")
  const description = cleanText(descEl?.textContent || "")

  return {
    jobTitle,
    company,
    location,
    workArrangement,
    employmentType: "",
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryRange,
    description,
    jobUrl: pageUrl,
    source: "Indeed",
    confidence: "ats_indeed",
  }
}

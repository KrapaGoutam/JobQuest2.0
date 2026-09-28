// JobQuest Capture Extension — Extractor Orchestrator

import { extractJsonLd } from "./jsonld.js"
import { extractGreenhouse, matchesGreenhouse } from "./greenhouse.js"
import { extractLever, matchesLever } from "./lever.js"
import { extractIndeed, matchesIndeed } from "./indeed.js"
import { extractGeneric } from "./generic.js"

/**
 * Merges extracted fields in priority order.
 * Earlier objects in the cascade take precedence; later objects fill missing fields.
 */
function mergeCaptures(candidates, fallbackUrl = "") {
  const result = {
    jobTitle: "",
    company: "",
    location: "",
    workArrangement: "",
    employmentType: "",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "",
    salaryRange: "",
    description: "",
    jobUrl: fallbackUrl,
    source: "",
    confidence: "none",
  }

  for (const item of candidates) {
    if (!item) continue
    if (result.confidence === "none" && item.confidence) {
      result.confidence = item.confidence
    }
    if (!result.jobTitle && item.jobTitle) result.jobTitle = item.jobTitle
    if (!result.company && item.company) result.company = item.company
    if (!result.location && item.location) result.location = item.location
    if (!result.workArrangement && item.workArrangement)
      result.workArrangement = item.workArrangement
    if (!result.employmentType && item.employmentType)
      result.employmentType = item.employmentType
    if (result.salaryMin === null && item.salaryMin !== null)
      result.salaryMin = item.salaryMin
    if (result.salaryMax === null && item.salaryMax !== null)
      result.salaryMax = item.salaryMax
    if (!result.salaryCurrency && item.salaryCurrency)
      result.salaryCurrency = item.salaryCurrency
    if (!result.salaryRange && item.salaryRange)
      result.salaryRange = item.salaryRange
    if (!result.description && item.description)
      result.description = item.description
    if ((!result.jobUrl || result.jobUrl === fallbackUrl) && item.jobUrl)
      result.jobUrl = item.jobUrl
    if (!result.source && item.source) result.source = item.source
  }

  // If source still empty, infer from URL domain
  if (!result.source && result.jobUrl) {
    try {
      const parsed = new URL(result.jobUrl)
      result.source = parsed.hostname.replace(/^www\./, "")
    } catch {
      // ignore
    }
  }

  return result
}
/**
 * Extracts job posting metadata from a DOM Document object and URL.
 * Follows the 5-tier extraction hierarchy:
 * 1. schema.org JobPosting JSON-LD (highest confidence)
 * 2. Site-specific ATS adapter (Greenhouse, Lever, Indeed)
 * 3. Page meta tags & title heuristics
 * 4. Generic DOM heuristics
 * 5. Blank (never fabricate)
 */
export function extractJobPosting(doc, pageUrl = "") {
  const candidates = []

  // Tier 1: JSON-LD
  try {
    const jsonLdResult = extractJsonLd(doc, pageUrl)
    if (jsonLdResult) candidates.push(jsonLdResult)
  } catch (err) {
    console.error("JSON-LD extractor error:", err)
  }

  // Tier 2: Site-specific ATS adapters
  try {
    if (matchesGreenhouse(pageUrl, doc)) {
      const gh = extractGreenhouse(doc, pageUrl)
      if (gh) candidates.push(gh)
    } else if (matchesLever(pageUrl, doc)) {
      const lever = extractLever(doc, pageUrl)
      if (lever) candidates.push(lever)
    } else if (matchesIndeed(pageUrl, doc)) {
      const indeed = extractIndeed(doc, pageUrl)
      if (indeed) candidates.push(indeed)
    }
  } catch (err) {
    console.error("ATS adapter extractor error:", err)
  }

  // Tier 3 & 4: Generic meta tags and DOM heuristics
  try {
    const generic = extractGeneric(doc, pageUrl)
    if (generic) candidates.push(generic)
  } catch (err) {
    console.error("Generic extractor error:", err)
  }

  return mergeCaptures(candidates, pageUrl)
}

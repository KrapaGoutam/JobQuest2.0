// JobQuest Capture Extension — Extractor Orchestrator

import { extractJsonLd } from "./jsonld.js"
import { extractGreenhouse, matchesGreenhouse } from "./greenhouse.js"
import { extractLever, matchesLever } from "./lever.js"
import { extractIndeed, matchesIndeed } from "./indeed.js"
import { extractGeneric } from "./generic.js"
import { extractHiringCafe, matchesHiringCafe } from "./hiringcafe.js"
import { extractDice, matchesDice } from "./dice.js"
import { extractLinkedIn, matchesLinkedIn } from "./linkedin.js"

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
    responsibilities: [],
    requirements: [],
    skills: [],
    extras: {},
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
    
    // Arrays - merge and deduplicate
    if (item.responsibilities?.length > 0) {
      result.responsibilities = Array.from(new Set([...result.responsibilities, ...item.responsibilities]))
    }
    if (item.requirements?.length > 0) {
      result.requirements = Array.from(new Set([...result.requirements, ...item.requirements]))
    }
    if (item.skills?.length > 0) {
      result.skills = Array.from(new Set([...result.skills, ...item.skills]))
    }
    
    if (item.extras) {
      for (const [k, v] of Object.entries(item.extras)) {
        if (!result.extras[k]) {
          result.extras[k] = [];
        }
        result.extras[k] = Array.from(new Set([...result.extras[k], ...v]));
      }
    }

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

function extractEmbeddedAppState(doc, pageUrl) {
  const nextDataScript = doc.getElementById('__NEXT_DATA__');
  if (!nextDataScript) return null;

  try {
    const data = JSON.parse(nextDataScript.textContent);
    
    // Bounded depth traversal to find job-like objects
    /** @type {Record<string, any> | null} */
    let foundJob = null;
    
    function traverse(obj, depth = 0) {
      if (depth > 8 || !obj || typeof obj !== 'object' || foundJob) return;
      
      if (Array.isArray(obj)) {
        for (const item of obj) traverse(item, depth + 1);
        return;
      }

      // Check if this object looks like a job posting
      const hasTitle = obj.title || obj.jobTitle || obj.role;
      const hasCompany = obj.company || obj.employer || obj.companyName;
      const hasDesc = obj.description || obj.jobDescription;
      
      if (hasTitle && (hasCompany || hasDesc)) {
        // Exclude generic app state objects that aren't the job
        if (typeof hasTitle === 'string' && hasTitle.length > 3) {
          // Check for stale SPA routing
          const id = String(obj.id || obj.slug || obj.jobId || obj.guid || '');
          if (id && pageUrl && !pageUrl.includes(id)) {
            return; // Stale SPA object
          }
          foundJob = obj;
          return;
        }
      }

      for (const key of Object.keys(obj)) {
        // Skip obvious user/auth branches
        if (/user|account|auth|session|profile/i.test(key)) continue;
        traverse(obj[key], depth + 1);
      }
    }

    traverse(data);

    if (foundJob) {
      const result = { confidence: "app-state" };
      result.jobTitle = foundJob.title || foundJob.jobTitle || foundJob.role;
      if (foundJob.company) {
        result.company = typeof foundJob.company === 'object' ? (foundJob.company.name || '') : foundJob.company;
      } else {
        result.company = foundJob.employer || foundJob.companyName;
      }
      result.description = foundJob.description || foundJob.jobDescription;
      result.location = foundJob.location || foundJob.jobLocation;
      return result;
    }
  } catch (e) {
    console.error("Generic __NEXT_DATA__ error:", e);
  }
  return null;
}

/**
 * Extracts job posting metadata from a DOM Document object and URL.
 * Follows the layered extraction hierarchy:
 * 1. Site adapter
 * 2. Embedded app state
 * 3. JSON-LD
 * 4. DOM sections
 * 5. Free-text enrichment
 * 6. Original fallback
 */
export function extractJobPosting(doc, pageUrl = "") {
  const candidates = []

  // Tier 1: Site-specific ATS adapters
  try {
    if (matchesGreenhouse(pageUrl, doc)) {
      candidates.push(extractGreenhouse(doc, pageUrl))
    } else if (matchesLever(pageUrl, doc)) {
      candidates.push(extractLever(doc, pageUrl))
    } else if (matchesIndeed(pageUrl, doc)) {
      candidates.push(extractIndeed(doc, pageUrl))
    } else if (matchesHiringCafe(pageUrl, doc)) {
      candidates.push(extractHiringCafe(doc, pageUrl))
    } else if (matchesDice(pageUrl, doc)) {
      candidates.push(extractDice(doc, pageUrl))
    } else if (matchesLinkedIn(pageUrl, doc)) {
      candidates.push(extractLinkedIn(doc, pageUrl))
    }
  } catch (err) {
    console.error("ATS adapter extractor error:", err)
  }

  // Tier 2: Embedded App State
  // Implemented in generic or site adapters where relevant, but generic could have one.
  const embeddedState = extractEmbeddedAppState(doc, pageUrl);
  if (embeddedState) candidates.push(embeddedState);

  // Tier 3: JSON-LD
  try {
    const jsonLdResult = extractJsonLd(doc, pageUrl)
    if (jsonLdResult) candidates.push(jsonLdResult)
  } catch (err) {
    console.error("JSON-LD extractor error:", err)
  }

  // Tier 4-6: Generic DOM heuristics (Original Fallback + DOM Sections)
  try {
    const generic = extractGeneric(doc, pageUrl)
    if (generic) candidates.push(generic)
  } catch (err) {
    console.error("Generic extractor error:", err)
  }

  return mergeCaptures(candidates, pageUrl)
}

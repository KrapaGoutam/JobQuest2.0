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
 * Merges extracted fields in priority order into a canonical Master Record.
 * Earlier objects in the cascade take precedence; later objects fill missing fields.
 */
function mergeCaptures(candidates, fallbackUrl = "") {
  const result = {
    schema_version: "1.1",
    job: { title: null },
    company: { name: null },
    location: { text: null, work_arrangement: null },
    employment: { type: null },
    compensation: { min: null, max: null, currency: null, range_text: null },
    description: "",
    responsibilities: [],
    requirements: { must_have: [], preferred: [] },
    skills: [],
    education: [],
    benefits: [],
    source: { platform: null, url: fallbackUrl, external_id: null, secondary_ids: {} },
    extras: {},
    notes: "",
    capture_metadata: { captured_at: new Date().toISOString(), extractor_confidence: "none" },
  };

  for (const item of candidates) {
    if (!item) continue;
    
    if (result.capture_metadata.extractor_confidence === "none" && item.confidence) {
      result.capture_metadata.extractor_confidence = item.confidence;
    }
    
    if (!result.job.title && item.jobTitle) result.job.title = item.jobTitle;
    if (!result.job.title && item.job?.title) result.job.title = item.job.title;
    
    if (!result.company.name && item.company) result.company.name = typeof item.company === 'string' ? item.company : item.company.name;
    
    if (!result.location.text && item.location) result.location.text = typeof item.location === 'string' ? item.location : item.location.text;
    
    if (!result.location.work_arrangement && item.workArrangement) {
      result.location.work_arrangement = item.workArrangement;
    }
    if (!result.location.work_arrangement && item.location?.work_arrangement) {
      result.location.work_arrangement = item.location.work_arrangement;
    }
    
    if (!result.employment.type && item.employmentType) result.employment.type = item.employmentType;
    if (!result.employment.type && item.employment?.type) result.employment.type = item.employment.type;
    
    const itemMin = item.salaryMin ?? item.compensation?.min;
    if (result.compensation.min === null && itemMin !== null && itemMin !== undefined) {
      result.compensation.min = itemMin;
    }
    
    const itemMax = item.salaryMax ?? item.compensation?.max;
    if (result.compensation.max === null && itemMax !== null && itemMax !== undefined) {
      result.compensation.max = itemMax;
    }
    
    const itemCur = item.salaryCurrency ?? item.compensation?.currency;
    if (!result.compensation.currency && itemCur) {
      result.compensation.currency = itemCur;
    }
    
    const itemRange = item.salaryRange ?? item.compensation?.range_text;
    if (!result.compensation.range_text && itemRange) {
      result.compensation.range_text = itemRange;
    }
    
    if (!result.description && item.description) {
      result.description = item.description;
    }
    
    // Arrays - merge and deduplicate
    const resp = item.responsibilities || [];
    if (resp.length > 0) {
      result.responsibilities = Array.from(new Set([...result.responsibilities, ...resp]));
    }
    
    if (item.requirements) {
      if (Array.isArray(item.requirements) && item.requirements.length > 0) {
        result.requirements.must_have = Array.from(new Set([...result.requirements.must_have, ...item.requirements]));
      } else if (typeof item.requirements === 'object' && !Array.isArray(item.requirements)) {
        if (item.requirements.must_have?.length > 0) {
          result.requirements.must_have = Array.from(new Set([...result.requirements.must_have, ...item.requirements.must_have]));
        }
        if (item.requirements.preferred?.length > 0) {
          result.requirements.preferred = Array.from(new Set([...result.requirements.preferred, ...item.requirements.preferred]));
        }
      }
    }
    
    const skills = item.skills || [];
    if (skills.length > 0) {
      result.skills = Array.from(new Set([...result.skills, ...skills]));
    }
    
    const benefits = item.benefits || [];
    if (benefits.length > 0) {
      result.benefits = Array.from(new Set([...result.benefits, ...benefits]));
    }
    
    if (item.extras) {
      for (const [k, v] of Object.entries(item.extras)) {
        if (!result.extras[k]) {
          result.extras[k] = typeof v === 'string' ? v : [];
        }
        if (Array.isArray(v)) {
          if (Array.isArray(result.extras[k])) {
            result.extras[k] = Array.from(new Set([...result.extras[k], ...v]));
          }
        } else {
          result.extras[k] = v;
        }
      }
    }

    const itemUrl = item.jobUrl || item.source?.url;
    if ((!result.source.url || result.source.url === fallbackUrl) && itemUrl) {
      result.source.url = itemUrl;
    }
    
    const itemSrc = item.source?.platform || (typeof item.source === 'string' ? item.source : null);
    if (!result.source.platform && itemSrc) {
      result.source.platform = itemSrc;
    }
    
    const itemExtId = item.externalJobId || item.source?.external_id;
    if (itemExtId) {
      result.source.external_id = itemExtId;
    }
    
    if (item.apply_url) {
       result.extras.apply_url = item.apply_url;
    }
  }

  // If source still empty, infer from URL domain
  if (!result.source.platform && result.source.url) {
    try {
      const parsed = new URL(result.source.url);
      result.source.platform = parsed.hostname.replace(/^www\./, "");
    } catch {
      // ignore
    }
  }

  return result;
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

import { preserveHtmlText, extractStructuredLists } from "./generic.js";

export function matchesDice(url, doc) {
  if (url.includes('dice.com')) return true;
  if (doc?.querySelector?.('job-detail-header-card, .job-detail-header-card')) return true;
  return false;
}

export function extractDice(doc, url) {
  const result = { confidence: "high", jobUrl: url, source: "Dice", extras: {} };
  
  const header = doc.querySelector('job-detail-header-card, .job-detail-header-card');
  const root = header || doc;

  const titleEl = root.querySelector('h1.jobTitle, [data-cy="jobTitle"]');
  if (titleEl) result.jobTitle = titleEl.textContent.trim();

  const companyEl = root.querySelector('a[data-cy="companyNameLink"]');
  if (companyEl) result.company = companyEl.textContent.trim();

  const locationEl = root.querySelector('[data-cy="location"]');
  if (locationEl) result.location = locationEl.textContent.trim();

  const badges = Array.from(root.querySelectorAll('[data-cy="workArrangement"], .work-arrangement-badge')).map(el => el.textContent.trim());
  if (badges.length > 0) {
    result.workArrangement = badges.join(' / ');
  }

  const employmentTypeEl = root.querySelector('[data-cy="employmentType"]');
  if (employmentTypeEl) result.employmentType = employmentTypeEl.textContent.trim();
  
  // Compensation
  const compEl = root.querySelector('[data-cy="compensationText"]');
  if (compEl) {
    const compText = compEl.textContent.trim();
    result.salaryRange = compText;
    const match = compText.match(/\$([\d,]+(?:\.\d+)?)\s*[-to]+\s*\$([\d,]+(?:\.\d+)?)/i);
    if (match) {
      result.salaryMin = Number(match[1].replace(/,/g, ""));
      result.salaryMax = Number(match[2].replace(/,/g, ""));
      result.salaryCurrency = "USD";
    } else {
      const single = compText.match(/\$([\d,]+(?:\.\d+)?)/i);
      if (single) {
        result.salaryMin = Number(single[1].replace(/,/g, ""));
        result.salaryMax = result.salaryMin;
        result.salaryCurrency = "USD";
      }
    }
  }

  const descContainer = doc.querySelector('#jobdescSec, [data-cy="jobDescription"]');
  if (descContainer) {
    const clone = descContainer.cloneNode(true);
    // Exclude match metrics or personalized insights
    clone.querySelectorAll('.match-metrics, [data-cy="jobMatch"]').forEach(el => el.remove());
    result.description = preserveHtmlText(clone.innerHTML);
  }

  // Use the generic helper to grab structured lists from the document
  const lists = extractStructuredLists(doc);
  if (lists.responsibilities?.length > 0) result.responsibilities = lists.responsibilities;
  if (lists.requirements?.must_have?.length > 0 || lists.requirements?.preferred?.length > 0) {
    result.requirements = lists.requirements;
  }

  const skillEls = doc.querySelectorAll('.skill-badge, [data-cy="skills"] li, [data-cy="skillsList"] .chip');
  const skillsSet = new Set(Array.from(skillEls).map(el => el.textContent.trim()).filter(Boolean));
  if (skillsSet.size > 0) result.skills = Array.from(skillsSet);

  // Secondary IDs and URL
  result.extras = {};
  const applyButton = doc.querySelector('apply-button-wc, [data-cy="applyButton"]');
  if (applyButton) {
    const applyUrl = applyButton.getAttribute('apply-url') || applyButton.getAttribute('href');
    if (applyUrl) {
      result.extras.apply_url = applyUrl;
      // Also map this to the new standard property for the master record
      result.apply_url = applyUrl; 
    }
  }

  const uuidMatch = url.match(/jobs\/detail\/([^/?]+)\/([^/?]+)/);
  if (uuidMatch) {
    result.externalJobId = uuidMatch[2]; // usually the position ID
    result.extras.dice_company_id = uuidMatch[1];
  }

  return result;
}

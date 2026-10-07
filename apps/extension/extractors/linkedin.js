import { preserveHtmlText, extractStructuredLists } from "./generic.js";

export function matchesLinkedIn(url, doc) {
  if (url.includes('linkedin.com')) return true;
  if (doc?.querySelector?.('[data-sdui-screen="SemanticJobDetails"], .jobs-details__main-content, .job-view-layout')) return true;
  return false;
}

export function extractLinkedIn(doc, url) {
  const result = { confidence: "high", jobUrl: url, source: "LinkedIn", extras: {} };

  // Scope entirely to the detail pane
  const detailPane = doc.querySelector('[data-sdui-screen="SemanticJobDetails"], .jobs-details__main-content, .job-view-layout');
  if (!detailPane) return null;

  // Extract ID
  const matchId = url.match(/view\/(\d+)/);
  if (matchId) result.externalJobId = matchId[1];

  const titleEl = detailPane.querySelector('h2.t-24, .job-details-jobs-unified-top-card__job-title, .top-card-layout__title');
  if (titleEl) result.jobTitle = titleEl.textContent.trim();

  const companyEl = detailPane.querySelector('.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link, a[href*="/company/"]');
  if (companyEl) result.company = companyEl.textContent.trim();

  const locationEl = detailPane.querySelector('.job-details-jobs-unified-top-card__primary-description-container span, .topcard__flavor--bullet');
  if (locationEl) {
    const text = locationEl.textContent.trim();
    const parts = text.split(/·|\u00B7|-|&middot;/);
    if (parts.length > 0) result.location = parts[0].trim();
    if (parts.length > 1) {
      const arrangementText = parts[1].trim();
      if (arrangementText.match(/remote|hybrid|on-site/i)) {
        result.workArrangement = arrangementText;
      }
    }
  }

  const insights = Array.from(detailPane.querySelectorAll('.job-details-jobs-unified-top-card__job-insight'));
  for (const insight of insights) {
    const text = insight.textContent.trim();
    if (text.match(/remote|hybrid|on-site/i)) {
      if (!result.workArrangement) result.workArrangement = text;
    }
    if (text.match(/full-time|part-time|contract/i)) {
      if (!result.employmentType) result.employmentType = text;
    }
    const matchSalary = text.match(/\$([\d,]+(?:\.\d+)?)\s*[-to]+\s*\$([\d,]+(?:\.\d+)?)/i);
    if (matchSalary) {
      result.salaryMin = Number(matchSalary[1].replace(/,/g, ""));
      result.salaryMax = Number(matchSalary[2].replace(/,/g, ""));
      result.salaryCurrency = "USD";
      result.salaryRange = text;
    }
  }

  const descEl = detailPane.querySelector('.jobs-description__content, .jobs-description-content__text, .show-more-less-html__markup');
  if (descEl) {
    const clone = descEl.cloneNode(true);
    clone.querySelectorAll('.job-match-insights, .ext-injected, [data-extension], .job-details-jobs-unified-top-card__connections').forEach(el => el.remove());
    result.description = preserveHtmlText(clone.innerHTML);
    
    // Extract structured lists directly from the description clone
    const lists = extractStructuredLists(clone);
    if (lists.responsibilities?.length > 0) result.responsibilities = lists.responsibilities;
    if (lists.requirements?.must_have?.length > 0 || lists.requirements?.preferred?.length > 0) {
      result.requirements = lists.requirements;
    }
    if (lists.benefits?.length > 0) result.benefits = lists.benefits;
  }

  const skillsContainer = detailPane.querySelector('.job-details-how-you-match__skills-item-wrapper, .job-details-preferences-and-skills');
  if (skillsContainer) {
    const skills = Array.from(skillsContainer.querySelectorAll('.t-bold, li, a')).map(s => s.textContent.trim()).filter(Boolean);
    if (skills.length > 0) {
      result.skills = Array.from(new Set(skills));
    }
  }

  return result;
}

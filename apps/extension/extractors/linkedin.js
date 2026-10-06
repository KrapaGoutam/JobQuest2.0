export function matchesLinkedIn(url, doc) {
  return url.includes('linkedin.com');
}

export function extractLinkedIn(doc, url) {
  const result = { confidence: "high", jobUrl: url, source: "LinkedIn" };

  // Scope entirely to the detail pane
  const detailPane = doc.querySelector('[data-sdui-screen="SemanticJobDetails"], .jobs-details__main-content, .job-view-layout');
  if (!detailPane) return null;

  // Do not use page h1 since it could be the user's name or feed title in SPA
  const titleEl = detailPane.querySelector('h2.t-24, .job-details-jobs-unified-top-card__job-title, .top-card-layout__title');
  if (titleEl) result.jobTitle = titleEl.textContent.trim();

  const companyEl = detailPane.querySelector('.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link');
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

  // Work arrangement (Remote/Hybrid) often found in insights or badges
  const insights = Array.from(detailPane.querySelectorAll('.job-details-jobs-unified-top-card__job-insight'));
  for (const insight of insights) {
    const text = insight.textContent.trim();
    if (text.match(/remote|hybrid|on-site/i)) {
      if (!result.workArrangement) result.workArrangement = text;
    }
    if (text.match(/full-time|part-time|contract/i)) {
      if (!result.employmentType) result.employmentType = text;
    }
  }

  // Clone description to exclude personal / extension injected elements
  const descEl = detailPane.querySelector('.jobs-description__content, .jobs-description-content__text, .show-more-less-html__markup');
  if (descEl) {
    const clone = descEl.cloneNode(true);
    // Remove unwanted elements
    clone.querySelectorAll('.job-match-insights, .ext-injected, [data-extension], .job-details-jobs-unified-top-card__connections').forEach(el => el.remove());
    result.description = clone.textContent.trim();
  }

  // Attempt to extract skills if available in a specific section
  const skillsContainer = detailPane.querySelector('.job-details-how-you-match__skills-item-wrapper, .job-details-preferences-and-skills');
  if (skillsContainer) {
    const skills = Array.from(skillsContainer.querySelectorAll('.t-bold, li')).map(s => s.textContent.trim()).filter(Boolean);
    if (skills.length > 0) {
      result.skills = Array.from(new Set(skills));
    }
  }

  return result;
}

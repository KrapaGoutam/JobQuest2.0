export function matchesDice(url, doc) {
  return url.includes('dice.com');
}

export function extractDice(doc, url) {
  const result = { confidence: "high", jobUrl: url, source: "Dice" };
  
  const header = doc.querySelector('job-detail-header-card, .job-detail-header-card');
  const root = header || doc;

  const titleEl = root.querySelector('h1.jobTitle, [data-cy="jobTitle"]');
  if (titleEl) result.jobTitle = titleEl.textContent.trim();

  const companyEl = root.querySelector('a[data-cy="companyNameLink"]');
  if (companyEl) result.company = companyEl.textContent.trim();

  const locationEl = root.querySelector('[data-cy="location"]');
  if (locationEl) result.location = locationEl.textContent.trim();

  // remote / onsite badges - preserve conflicting ones (e.g. "Remote" and "On-site" side by side)
  const badges = Array.from(root.querySelectorAll('[data-cy="workArrangement"], .work-arrangement-badge')).map(el => el.textContent.trim());
  if (badges.length > 0) {
    result.workArrangement = badges.join(' / ');
  }

  const employmentTypeEl = root.querySelector('[data-cy="employmentType"]');
  if (employmentTypeEl) result.employmentType = employmentTypeEl.textContent.trim();

  const descEl = doc.querySelector('#jobdescSec');
  if (descEl) result.description = descEl.textContent.trim();

  // Deduplicate skills
  const skillEls = doc.querySelectorAll('.skill-badge, [data-cy="skills"] li');
  const skillsSet = new Set(Array.from(skillEls).map(el => el.textContent.trim()).filter(Boolean));
  if (skillsSet.size > 0) {
    result.skills = Array.from(skillsSet);
  }

  return result;
}

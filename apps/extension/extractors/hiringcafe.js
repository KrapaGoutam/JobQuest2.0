import { preserveHtmlText } from "./generic.js";

export function matchesHiringCafe(url, doc) {
  if (url.includes('hiringcafe.com')) return true;
  if (doc?.querySelector?.('#job-info, #job-description, #company-info')) return true;
  return false;
}

export function extractHiringCafe(doc, url) {
  const result = { confidence: "high", jobUrl: url, source: "HiringCafe", extras: {} };
  
  // Extract job ID from URL
  let jobId = "";
  const match = url.match(/job\/([^/?#]+)/);
  if (match) jobId = match[1];

  // Root scope is crucial for HiringCafe's SPA "Quick View"
  let root = doc.querySelector('div[role="dialog"]') || doc;
  
  // Scrape visible DOM first (highest priority)
  const titleEl = root.querySelector('h1, h2');
  if (titleEl) result.jobTitle = titleEl.textContent.trim();
  
  const companyEl = root.querySelector('a[href^="/company/"], [data-testid="company-name"], #company-info');
  if (companyEl) result.company = companyEl.textContent.trim();
  
  const tags = Array.from(root.querySelectorAll('.badge, .chip, [class*="badge"], [class*="chip"]')).map(el => el.textContent.trim());
  if (tags.some(t => t.match(/remote/i))) result.workArrangement = 'Remote';
  else if (tags.some(t => t.match(/hybrid/i))) result.workArrangement = 'Hybrid';
  else if (tags.some(t => t.match(/onsite|on-site/i))) result.workArrangement = 'Onsite';

  const descEl = root.querySelector('#job-description, .job-description, [data-testid="job-description"]');
  if (descEl) result.description = preserveHtmlText(descEl.innerHTML);

  // Try embedded state to backfill missing fields
  const nextDataScript = doc.getElementById('__NEXT_DATA__');
  if (nextDataScript) {
    try {
      const data = JSON.parse(nextDataScript.textContent);
      const props = data?.props?.pageProps;
      
      let jobData = props?.job;
      if (!jobData && props?.jobs) {
        jobData = props.jobs.find(j => j.id === jobId || j.slug === jobId || j.title === result.jobTitle);
      }
      if (!jobData && props?.initialJobs) {
        jobData = props.initialJobs.find(j => j.id === jobId || j.slug === jobId || j.title === result.jobTitle);
      }
      
      if (jobData) {
        if (!result.jobTitle && jobData.title) result.jobTitle = jobData.title;
        if (!result.company && jobData.company?.name) result.company = jobData.company.name;
        if (!result.location && jobData.location) result.location = jobData.location;
        if (!result.workArrangement && jobData.workplaceType) result.workArrangement = jobData.workplaceType;
        if (!result.employmentType && jobData.employmentType) result.employmentType = jobData.employmentType;
        if (!result.description && jobData.description) result.description = preserveHtmlText(jobData.description);
        
        if (jobData.skills?.length > 0) result.skills = jobData.skills;
        if (jobData.benefits?.length > 0) result.benefits = jobData.benefits;
        
        if (jobData.requirements) {
          result.requirements = { must_have: [], preferred: [] };
          if (Array.isArray(jobData.requirements)) {
            result.requirements.must_have = jobData.requirements;
          } else if (typeof jobData.requirements === 'object') {
            if (jobData.requirements.must_have) result.requirements.must_have = jobData.requirements.must_have;
            if (jobData.requirements.preferred) result.requirements.preferred = jobData.requirements.preferred;
          }
        }
      }
    } catch (e) {
      console.error("HiringCafe __NEXT_DATA__ parse error", e);
    }
  }

  return result;
}

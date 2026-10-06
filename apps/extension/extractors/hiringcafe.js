export function matchesHiringCafe(url, doc) {
  if (url.includes('hiringcafe.com')) return true;
  if (doc?.querySelector?.('#job-info, #job-description, #company-info')) return true;
  return false;
}

export function extractHiringCafe(doc, url) {
  const result = { confidence: "high", jobUrl: url, source: "HiringCafe" };
  
  // Extract job ID from URL
  let jobId = "";
  const match = url.match(/job\/([^/?#]+)/);
  if (match) jobId = match[1];

  // Try embedded state first (__NEXT_DATA__)
  const nextDataScript = doc.getElementById('__NEXT_DATA__');
  if (nextDataScript) {
    try {
      const data = JSON.parse(nextDataScript.textContent);
      const props = data?.props?.pageProps;
      
      // Find the job in the state. If it's a full page, it might be in props.job.
      // If it's a dialog/quick view, we need to ensure the ID matches.
      let jobData = props?.job;
      if (!jobData && props?.jobs) {
        jobData = props.jobs.find(j => j.id === jobId || j.slug === jobId);
      }
      
      if (jobData && (jobData.id === jobId || jobData.slug === jobId || !jobId)) {
        if (jobData.title) result.jobTitle = jobData.title;
        if (jobData.company?.name) result.company = jobData.company.name;
        if (jobData.location) result.location = jobData.location;
        if (jobData.workplaceType) result.workArrangement = jobData.workplaceType;
        if (jobData.employmentType) result.employmentType = jobData.employmentType;
        if (jobData.description) result.description = jobData.description;
        if (jobData.skills) result.skills = jobData.skills;
        // Don't extract raw JSON data if not needed, keep it clean
        return result;
      }
    } catch (e) {
      console.error("HiringCafe __NEXT_DATA__ parse error", e);
    }
  }

  // Fallback to DOM (Full view anchors or dialog scoped)
  // Determine root scope
  let root = doc.querySelector('dialog[open]') || doc;
  
  const titleEl = root.querySelector('h1');
  if (titleEl) result.jobTitle = titleEl.textContent.trim();
  
  const companyEl = root.querySelector('#company-info, [data-testid="company-name"]');
  if (companyEl) result.company = companyEl.textContent.trim();
  
  const infoEl = root.querySelector('#job-info');
  if (infoEl) {
    // Attempt to extract location/work arrangement from info blocks
    const text = infoEl.textContent;
    if (text.includes('Remote')) result.workArrangement = 'Remote';
    else if (text.includes('Hybrid')) result.workArrangement = 'Hybrid';
  }
  
  const descEl = root.querySelector('#job-description');
  if (descEl) result.description = descEl.textContent.trim();

  return result;
}

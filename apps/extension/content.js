(() => {
  // extractors/jsonld.js
  function cleanText(raw) {
    if (!raw) return "";
    return String(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  function normalizeWorkArrangement(val, contextText = "") {
    const combined = `${val || ""} ${contextText || ""}`.toLowerCase();
    if (combined.includes("remote") || combined.includes("telecommute")) return "Remote";
    if (combined.includes("hybrid")) return "Hybrid";
    if (combined.includes("on-site") || combined.includes("onsite") || combined.includes("in-office"))
      return "Onsite";
    return "";
  }
  function normalizeEmploymentType(val) {
    if (!val) return "";
    const str = Array.isArray(val) ? val.join(" ") : String(val);
    const upper = str.toUpperCase();
    if (upper.includes("FULL_TIME") || upper.includes("FULL-TIME") || upper.includes("FULL TIME"))
      return "Full-time";
    if (upper.includes("PART_TIME") || upper.includes("PART-TIME") || upper.includes("PART TIME"))
      return "Part-time";
    if (upper.includes("CONTRACT") || upper.includes("FREELANCE")) return "Contract";
    if (upper.includes("INTERN")) return "Internship";
    if (upper.includes("TEMPORARY") || upper.includes("TEMP")) return "Temporary";
    return "";
  }
  function findJobPostings(obj, results = []) {
    if (!obj || typeof obj !== "object") return results;
    if (Array.isArray(obj)) {
      for (const item of obj) findJobPostings(item, results);
      return results;
    }
    const type = obj["@type"];
    if (type === "JobPosting" || Array.isArray(type) && type.includes("JobPosting") || typeof type === "string" && type.endsWith("/JobPosting")) {
      results.push(obj);
    }
    if (obj["@graph"]) {
      findJobPostings(obj["@graph"], results);
    }
    return results;
  }
  function extractJsonLd(doc, pageUrl = "") {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    const postings = [];
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || "{}");
        findJobPostings(parsed, postings);
      } catch {
      }
    }
    if (postings.length === 0) return null;
    let job = postings[0];
    for (const p of postings) {
      const pUrl = p.url || "";
      const pId = p.identifier?.value || "";
      if (pUrl && pageUrl.includes(pUrl) || pId && pageUrl.includes(pId)) {
        job = p;
        break;
      }
    }
    const jobUrlStr = String(job.url || "");
    const jobIdStr = String(job.identifier?.value || "");
    let hasValidMatch = false;
    let hasStaleData = false;
    if (jobUrlStr) {
      if (pageUrl.includes(jobUrlStr) || jobUrlStr.includes(pageUrl)) hasValidMatch = true;
      else hasStaleData = true;
    }
    if (jobIdStr) {
      if (pageUrl.includes(jobIdStr)) hasValidMatch = true;
      else hasStaleData = true;
    }
    if (hasStaleData && !hasValidMatch) {
      return null;
    }
    const jobTitle = cleanText(job.title || job.name || "");
    let company = "";
    if (job.hiringOrganization) {
      if (typeof job.hiringOrganization === "string") {
        company = cleanText(job.hiringOrganization);
      } else if (typeof job.hiringOrganization === "object") {
        company = cleanText(
          job.hiringOrganization.name || job.hiringOrganization.legalName || ""
        );
      }
    }
    let location = "";
    if (job.jobLocation) {
      const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
      if (typeof loc === "string") {
        location = cleanText(loc);
      } else if (loc && loc.address) {
        if (typeof loc.address === "string") {
          location = cleanText(loc.address);
        } else if (typeof loc.address === "object") {
          const parts = [
            loc.address.addressLocality,
            loc.address.addressRegion,
            loc.address.addressCountry
          ].filter(Boolean);
          location = parts.join(", ");
        }
      }
    }
    if (!location && job.applicantLocationRequirements) {
      location = cleanText(
        job.applicantLocationRequirements.name || job.applicantLocationRequirements
      );
    }
    let workArrangement = "";
    if (job.jobLocationType === "TELECOMMUTE" || String(job.jobLocationType || "").toUpperCase().includes("TELECOMMUTE")) {
      workArrangement = "Remote";
    } else {
      workArrangement = normalizeWorkArrangement(location, `${jobTitle} ${job.description || ""}`);
    }
    const employmentType = normalizeEmploymentType(job.employmentType);
    let salaryMin = null;
    let salaryMax = null;
    let salaryCurrency = "";
    let salaryRange = "";
    const salaryObj = job.baseSalary || job.estimatedSalary;
    if (salaryObj && typeof salaryObj === "object") {
      salaryCurrency = String(salaryObj.currency || "").toUpperCase();
      const val = salaryObj.value;
      if (typeof val === "number") {
        salaryMin = val;
        salaryMax = val;
      } else if (val && typeof val === "object") {
        if (val.minValue !== void 0) salaryMin = Number(val.minValue) || null;
        if (val.maxValue !== void 0) salaryMax = Number(val.maxValue) || null;
        if (val.value !== void 0 && salaryMin === null) {
          salaryMin = Number(val.value) || null;
          salaryMax = salaryMin;
        }
      }
      if (salaryMin !== null || salaryMax !== null) {
        const sym = salaryCurrency ? `${salaryCurrency} ` : "$";
        if (salaryMin !== null && salaryMax !== null && salaryMin !== salaryMax) {
          salaryRange = `${sym}${salaryMin.toLocaleString()} - ${sym}${salaryMax.toLocaleString()}`;
        } else {
          salaryRange = `${sym}${(salaryMin || salaryMax).toLocaleString()}`;
        }
      }
    }
    const description = cleanText(job.description || "");
    return {
      jobTitle,
      company,
      location,
      workArrangement,
      employmentType,
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryRange,
      description,
      jobUrl: pageUrl,
      source: company ? "" : "JobPosting",
      confidence: "jsonld"
    };
  }

  // extractors/greenhouse.js
  function cleanText2(raw) {
    if (!raw) return "";
    return String(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  function parseCompanyFromUrl(url) {
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/^\/([^/]+)\/jobs/i);
      if (match && match[1]) {
        return match[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }
    } catch {
    }
    return "";
  }
  function matchesGreenhouse(url, doc) {
    if (/greenhouse\.io/i.test(url)) return true;
    if (doc.querySelector("#grnhse_app, #app-body, .app-title")) return true;
    return false;
  }
  function extractGreenhouse(doc, pageUrl = "") {
    if (!matchesGreenhouse(pageUrl, doc)) return null;
    const titleEl = doc.querySelector(
      ".app-title, #app-body h1.app-title, h1.job-title, .job-name, h1"
    );
    const jobTitle = cleanText2(titleEl?.textContent || "");
    const companyEl = doc.querySelector(
      ".company-name, .logo-container img[alt], #header .company-name"
    );
    let company = cleanText2(companyEl?.textContent || companyEl?.getAttribute("alt") || "");
    if (!company) {
      company = parseCompanyFromUrl(pageUrl);
    }
    const locationEl = doc.querySelector(".location, .body--metadata, .job-location");
    const location = cleanText2(locationEl?.textContent || "");
    let workArrangement = "";
    const fullLoc = location.toLowerCase();
    if (fullLoc.includes("remote")) workArrangement = "Remote";
    else if (fullLoc.includes("hybrid")) workArrangement = "Hybrid";
    else if (fullLoc.includes("on-site") || fullLoc.includes("onsite")) workArrangement = "Onsite";
    const descEl = doc.querySelector("#content, #app-body, .job-description");
    const description = cleanText2(descEl?.textContent || "");
    return {
      jobTitle,
      company,
      location,
      workArrangement,
      employmentType: "",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "",
      salaryRange: "",
      description,
      jobUrl: pageUrl,
      source: "Greenhouse",
      confidence: "ats_greenhouse"
    };
  }

  // extractors/lever.js
  function cleanText3(raw) {
    if (!raw) return "";
    return String(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  function parseCompanyFromUrl2(url) {
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/^\/([^/]+)/i);
      if (match && match[1]) {
        return match[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }
    } catch {
    }
    return "";
  }
  function matchesLever(url, doc) {
    if (/jobs\.lever\.co/i.test(url)) return true;
    if (doc.querySelector(".posting-headline, .posting-categories")) return true;
    return false;
  }
  function extractLever(doc, pageUrl = "") {
    if (!matchesLever(pageUrl, doc)) return null;
    const titleEl = doc.querySelector(
      ".posting-headline h2, .posting-headline h1, h2.posting-headline"
    );
    const jobTitle = cleanText3(titleEl?.textContent || "");
    const logoEl = doc.querySelector(".main-header-logo img");
    let company = cleanText3(logoEl?.getAttribute("alt") || "");
    if (!company) {
      company = parseCompanyFromUrl2(pageUrl);
    }
    const locationEl = doc.querySelector(".posting-categories .location, .location");
    const location = cleanText3(locationEl?.textContent || "");
    const workplaceEl = doc.querySelector(".workplaceTypes, .workplace-type");
    const workplaceText = cleanText3(workplaceEl?.textContent || "");
    let workArrangement = "";
    const combLoc = `${location} ${workplaceText}`.toLowerCase();
    if (combLoc.includes("remote")) workArrangement = "Remote";
    else if (combLoc.includes("hybrid")) workArrangement = "Hybrid";
    else if (combLoc.includes("on-site") || combLoc.includes("onsite")) workArrangement = "Onsite";
    const commitmentEl = doc.querySelector(".posting-categories .commitment, .commitment");
    const commitmentText = cleanText3(commitmentEl?.textContent || "").toLowerCase();
    let employmentType = "";
    if (commitmentText.includes("full-time") || commitmentText.includes("full time"))
      employmentType = "Full-time";
    else if (commitmentText.includes("part-time") || commitmentText.includes("part time"))
      employmentType = "Part-time";
    else if (commitmentText.includes("contract")) employmentType = "Contract";
    else if (commitmentText.includes("intern")) employmentType = "Internship";
    const descEl = doc.querySelector(".section.page-centered, .posting-page, #content");
    const description = cleanText3(descEl?.textContent || "");
    return {
      jobTitle,
      company,
      location,
      workArrangement,
      employmentType,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "",
      salaryRange: "",
      description,
      jobUrl: pageUrl,
      source: "Lever",
      confidence: "ats_lever"
    };
  }

  // extractors/indeed.js
  function cleanText4(raw) {
    if (!raw) return "";
    return String(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  function matchesIndeed(url, doc) {
    if (/indeed\.com/i.test(url)) return true;
    if (doc.querySelector(".jobsearch-JobInfoHeader-title, #jobDescriptionText")) return true;
    return false;
  }
  function extractIndeed(doc, pageUrl = "") {
    if (!matchesIndeed(pageUrl, doc)) return null;
    const titleEl = doc.querySelector(
      "h1.jobsearch-JobInfoHeader-title, [data-testid='simpler-jobTitle'], .jobsearch-JobInfoHeader-title-container h1, h1"
    );
    const jobTitle = cleanText4(titleEl?.textContent || "");
    const companyEl = doc.querySelector(
      "[data-testid='inlineHeader-companyName'], .jobsearch-CompanyInfoContainer a, [data-company-name='true']"
    );
    const company = cleanText4(companyEl?.textContent || "");
    const locationEl = doc.querySelector(
      "[data-testid='inlineHeader-companyLocation'], [data-testid='jobsearch-JobInfoHeader-companyLocation']"
    );
    const location = cleanText4(locationEl?.textContent || "");
    let workArrangement = "";
    const combLoc = location.toLowerCase();
    if (combLoc.includes("remote")) workArrangement = "Remote";
    else if (combLoc.includes("hybrid")) workArrangement = "Hybrid";
    const salaryEl = doc.querySelector(
      "#salaryInfoAndJobType, [data-testid='attribute_snippet_testid']"
    );
    const salaryText = cleanText4(salaryEl?.textContent || "");
    let salaryRange = "";
    let salaryMin = null;
    let salaryMax = null;
    let salaryCurrency = "USD";
    const salaryMatch = salaryText.match(/\$([\d,]+)(?:\s*-\s*\$([\d,]+))?/);
    if (salaryMatch) {
      salaryMin = Number(salaryMatch[1].replace(/,/g, "")) || null;
      if (salaryMatch[2]) {
        salaryMax = Number(salaryMatch[2].replace(/,/g, "")) || null;
        salaryRange = `$${salaryMin?.toLocaleString()} - $${salaryMax?.toLocaleString()}`;
      } else if (salaryMin) {
        salaryMax = salaryMin;
        salaryRange = `$${salaryMin.toLocaleString()}`;
      }
    }
    const descEl = doc.querySelector("#jobDescriptionText, .jobsearch-jobDescriptionText");
    const description = cleanText4(descEl?.textContent || "");
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
      confidence: "ats_indeed"
    };
  }

  // extractors/generic.js
  var AGGREGATOR_AND_BOARD_DOMAINS = [
    "jobright.ai",
    "greenhouse.io",
    "lever.co",
    "indeed.com",
    "linkedin.com",
    "dice.com",
    "ziprecruiter.com",
    "glassdoor.com",
    "workday.com",
    "smartrecruiters.com",
    "ashbyhq.com",
    "monster.com",
    "careerbuilder.com",
    "simplyhired.com",
    "handshake.com",
    "builtin.com",
    "wellfound.com",
    "angel.co"
  ];
  var GENERIC_TITLE_PATTERNS = [
    /^jobs?$/i,
    /^careers?$/i,
    /^open roles?$/i,
    /^open positions?$/i,
    /^job openings?$/i,
    /^home$/i,
    /^about(?: us)?$/i,
    /^search jobs?$/i,
    /^explore careers?$/i,
    /^join (?:our team|us)$/i,
    /^work with us$/i,
    /^we(?:'re| are) hiring$/i,
    /^cookie policy$/i,
    /^privacy policy$/i,
    /^terms of (?:service|use)$/i,
    /^sign in$/i,
    /^log in$/i,
    /^welcome$/i,
    /copilot/i,
    /ai job search/i,
    /your ai/i,
    /job search copilot/i,
    /career opportunities/i
  ];
  function cleanText5(raw) {
    if (!raw) return "";
    return String(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  function isJobAggregatorOrBoard(domain = "") {
    const norm = String(domain || "").toLowerCase().replace(/^www\./, "");
    return AGGREGATOR_AND_BOARD_DOMAINS.some(
      (b) => norm === b || norm.endsWith(`.${b}`)
    );
  }
  function isGenericTitle(title, siteBrand = "", domain = "") {
    if (!title) return true;
    const clean = cleanText5(title);
    if (clean.length < 3) return true;
    for (const pat of GENERIC_TITLE_PATTERNS) {
      if (pat.test(clean)) return true;
    }
    if (siteBrand && clean.toLowerCase() === siteBrand.trim().toLowerCase()) {
      return true;
    }
    if (domain) {
      const cleanDomain = domain.toLowerCase().replace(/^www\./, "").split(".")[0];
      if (cleanDomain && clean.toLowerCase() === cleanDomain) {
        return true;
      }
    }
    return false;
  }
  function parseTitleString(titleStr) {
    if (!titleStr) return { title: "", company: "" };
    const clean = cleanText5(titleStr);
    const atMatch = clean.match(/^(.+?)\s+(?:at|@)\s+([^-–|•]+)(?:[-–|•].*)?$/i);
    if (atMatch) {
      return { title: atMatch[1].trim(), company: atMatch[2].trim() };
    }
    const splitMatch = clean.split(/\s+[-–|•]\s+/);
    if (splitMatch.length >= 2) {
      return { title: splitMatch[0].trim(), company: splitMatch[1].trim() };
    }
    return { title: clean, company: "" };
  }
  function extractBrandFromHostname(hostname = "") {
    if (!hostname) return "";
    const clean = hostname.replace(/^www\./i, "").split(":")[0];
    if (isJobAggregatorOrBoard(clean)) return "";
    const parts = clean.split(".");
    if (parts.length >= 2) {
      const brand = parts[0];
      if (brand && brand.length >= 2) {
        return brand.charAt(0).toUpperCase() + brand.slice(1);
      }
    }
    return "";
  }
  function extractDomHeading(doc, siteBrand = "", domain = "") {
    const candidateSelectors = [
      "main h1",
      "article h1",
      "[data-testid*='job'] h1",
      "[class*='job'] h1",
      "[class*='posting'] h1",
      "[class*='career'] h1",
      "h1.job-title",
      "h1.posting-title",
      "h1",
      "main h2",
      "article h2",
      "[data-testid*='job'] h2",
      "[class*='job'] h2",
      "[class*='posting'] h2"
    ];
    const scoredCandidates = [];
    for (const selector of candidateSelectors) {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        if (el.closest(
          "nav, header, footer, aside, .modal, [role='dialog'], [aria-hidden='true']"
        )) {
          continue;
        }
        const style = el.getAttribute("style") || "";
        if (style.includes("display: none") || style.includes("visibility: hidden")) {
          continue;
        }
        const text = cleanText5(el.textContent);
        if (!text || text.length < 3 || text.length > 150) continue;
        if (isGenericTitle(text, siteBrand, domain)) continue;
        let score = 0;
        const tag = el.tagName.toLowerCase();
        if (tag === "h1") score += 20;
        else if (tag === "h2") score += 10;
        if (el.closest("main, article, [data-testid*='job'], [class*='job-header']")) {
          score += 20;
        }
        const classAndId = `${el.className || ""} ${el.id || ""} ${el.getAttribute("data-testid") || ""}`.toLowerCase();
        if (/title|role|position|header/i.test(classAndId)) {
          score += 15;
        }
        const container = el.parentElement;
        if (container) {
          const containerText = (container.textContent || "").toLowerCase();
          if (/location|full-time|part-time|salary|\$|remote|hybrid|onsite/i.test(containerText)) {
            score += 15;
          }
        }
        scoredCandidates.push({ text, score });
      }
    }
    if (scoredCandidates.length === 0) return "";
    scoredCandidates.sort((a, b) => b.score - a.score);
    return scoredCandidates[0].text;
  }
  function extractCompany(doc, pageUrl, jobTitle = "", parsedTitleCompany = "") {
    let hostname = "";
    try {
      hostname = new URL(pageUrl).hostname;
    } catch {
    }
    const isAggregator = isJobAggregatorOrBoard(hostname);
    const companySelectors = [
      "[data-testid*='company-name']",
      "[data-testid*='company']",
      "[data-company-name='true']",
      ".company-name",
      ".company_name",
      ".company",
      "[class*='company-name']",
      "[class*='company_name']",
      "[class*='company-title']",
      "[class*='employer-name']",
      "[class*='organization-name']"
    ];
    for (const selector of companySelectors) {
      const el = doc.querySelector(selector);
      if (!el) continue;
      if (el.closest("nav, footer, aside, [role='dialog'], [aria-hidden='true']")) {
        continue;
      }
      const val = cleanText5(el.textContent);
      if (val && val.length >= 2 && val.length <= 100 && val.toLowerCase() !== jobTitle.toLowerCase() && !isGenericTitle(val)) {
        if (isAggregator) {
          const aggBrand = hostname.replace(/^www\./i, "").split(".")[0].toLowerCase();
          if (val.toLowerCase().includes(aggBrand)) {
            continue;
          }
        }
        return val;
      }
    }
    if (parsedTitleCompany && !isGenericTitle(parsedTitleCompany)) {
      if (!isAggregator) {
        return parsedTitleCompany;
      } else {
        const aggBrand = hostname.replace(/^www\./i, "").split(".")[0].toLowerCase();
        if (!parsedTitleCompany.toLowerCase().includes(aggBrand)) {
          return parsedTitleCompany;
        }
      }
    }
    if (!isAggregator) {
      const siteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || "";
      if (siteName && !isGenericTitle(siteName) && siteName.toLowerCase() !== jobTitle.toLowerCase()) {
        return cleanText5(siteName);
      }
      const hostBrand = extractBrandFromHostname(hostname);
      if (hostBrand && hostBrand.toLowerCase() !== jobTitle.toLowerCase()) {
        return hostBrand;
      }
    }
    return "";
  }
  function extractLocations(doc) {
    const listContainer = doc.querySelector(".locations-list, .locations, [class*='locations']");
    if (listContainer) {
      const items = listContainer.querySelectorAll(".location-item, li, span, div");
      const locs = [];
      for (const item of items) {
        const t = cleanText5(item.textContent);
        if (t && t.length >= 2 && t.length < 100 && !locs.includes(t)) {
          if (!/locations?|remote|hybrid|onsite|full-time/i.test(t)) {
            locs.push(t);
          }
        }
      }
      if (locs.length > 0) {
        return locs.join("; ");
      }
    }
    const locSelectors = [
      "[data-testid*='location']",
      ".location-badge",
      ".location",
      ".job-location",
      "[class*='job-location']",
      "[class*='location-text']",
      "[class*='location']"
    ];
    for (const selector of locSelectors) {
      const el = doc.querySelector(selector);
      if (!el) continue;
      if (el.closest("nav, footer, aside, [role='dialog'], [aria-hidden='true']")) {
        continue;
      }
      const val = cleanText5(el.textContent);
      if (val && val.length >= 2 && val.length < 120) {
        if (!/locations?|job title|apply/i.test(val)) {
          return val;
        }
      }
    }
    return "";
  }
  function extractWorkArrangement(doc, location = "") {
    const arrangementSelectors = [
      "[class*='arrangement']",
      "[class*='workplace']",
      "[class*='work-type']",
      "[data-testid*='workplace']",
      "[data-testid*='arrangement']",
      ".workplace-arrangement",
      ".tags-row span",
      ".job-metadata span"
    ];
    for (const selector of arrangementSelectors) {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        const val = cleanText5(el.textContent).toLowerCase();
        if (val === "remote" || val.includes("fully remote") || val.includes("100% remote")) {
          return "Remote";
        }
        if (val === "hybrid" || val.includes("hybrid")) {
          return "Hybrid";
        }
        if (val === "onsite" || val === "on-site" || val.includes("in-office") || val.includes("on site")) {
          return "Onsite";
        }
      }
    }
    if (location) {
      const locLower = location.toLowerCase();
      if (locLower === "remote" || locLower.includes("remote") || locLower.includes("telecommute")) {
        return "Remote";
      }
      if (locLower === "hybrid" || locLower.includes("hybrid")) {
        return "Hybrid";
      }
      if (locLower === "onsite" || locLower.includes("on-site") || locLower.includes("in-office")) {
        return "Onsite";
      }
    }
    return "";
  }
  function extractEmploymentType(doc) {
    const typeSelectors = [
      "[class*='employment']",
      "[class*='job-type']",
      "[class*='commitment']",
      "[data-testid*='employment']",
      ".employment-type",
      ".employment-time",
      ".tags-row span",
      ".job-metadata span"
    ];
    for (const selector of typeSelectors) {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        const val = cleanText5(el.textContent).toLowerCase();
        if (val.includes("full-time") || val.includes("full time")) return "Full-time";
        if (val.includes("part-time") || val.includes("part time")) return "Part-time";
        if (val.includes("contract") || val.includes("freelance")) return "Contract";
        if (val.includes("intern")) return "Internship";
        if (val.includes("temporary") || val.includes("temp")) return "Temporary";
      }
    }
    return "";
  }
  function extractSalary(doc) {
    const salarySelectors = [
      "[class*='salary']",
      "[class*='compensation']",
      "[class*='pay']",
      "[data-testid*='salary']",
      ".salary-comp",
      ".tags-row span"
    ];
    for (const selector of salarySelectors) {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        const val = cleanText5(el.textContent);
        const rangeMatch = val.match(
          /\$([\d,]+(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|\s*per\s*)[a-zA-Z]+)?\s*[-–]\s*\$([\d,]+(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|\s*per\s*)([a-zA-Z]+))?/i
        );
        if (rangeMatch) {
          let min = Number(rangeMatch[1].replace(/,/g, "")) || null;
          if (rangeMatch[2] && min !== null && min < 1e3) min *= 1e3;
          let max = Number(rangeMatch[3].replace(/,/g, "")) || null;
          if (rangeMatch[4] && max !== null && max < 1e3) max *= 1e3;
          return {
            salaryMin: min,
            salaryMax: max,
            salaryCurrency: "USD",
            salaryRange: val
          };
        }
        const singleMatch = val.match(
          /\$([\d,]+(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|\s*per\s*)([a-zA-Z]+))?/i
        );
        if (singleMatch) {
          let min = Number(singleMatch[1].replace(/,/g, "")) || null;
          if (singleMatch[2] && min !== null && min < 1e3) min *= 1e3;
          return {
            salaryMin: min,
            salaryMax: min,
            salaryCurrency: "USD",
            salaryRange: val
          };
        }
      }
    }
    return {
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: "",
      salaryRange: ""
    };
  }
  function preserveHtmlText(htmlStr) {
    if (!htmlStr) return "";
    return String(htmlStr).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|section|article|header|footer)>/gi, "\n\n").replace(/<li[^>]*>/gi, "\u2022 ").replace(/<\/li>/gi, "\n").replace(/<\/?h[1-6][^>]*>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function extractDescription(doc) {
    const descSelectors = [
      "[class*='job-description']",
      "[class*='jobDescription']",
      "[class*='description-body']",
      "[data-testid*='description']",
      "#job-description",
      ".job-description",
      "article.job-description-body",
      "main section.job-description",
      "main article"
    ];
    for (const selector of descSelectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const text = preserveHtmlText(el.innerHTML);
        if (text && text.length > 50) return text;
      }
    }
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    return cleanText5(ogDesc || metaDesc || "");
  }
  function extractStructuredLists(doc) {
    const result = {
      responsibilities: [],
      requirements: { must_have: [], preferred: [] },
      skills: [],
      benefits: [],
      extras: {}
    };
    const containerSelectors = [
      "[class*='job-description']",
      "[class*='jobDescription']",
      "[class*='description-body']",
      "[data-testid*='description']",
      "#job-description",
      ".job-description",
      "article.job-description-body",
      "main section.job-description",
      "main article"
    ];
    let descContainer = null;
    for (const selector of containerSelectors) {
      const el = doc.querySelector(selector);
      if (el) {
        descContainer = el;
        break;
      }
    }
    const targetDoc = descContainer || doc;
    const headings = targetDoc.querySelectorAll("h1, h2, h3, h4, h5, h6, b, strong, p > strong");
    for (const heading of headings) {
      const rawText = cleanText5(heading.textContent);
      const text = rawText.toLowerCase();
      let targetList = null;
      let isExtra = false;
      if (/responsibilit(?:y|ies)|what you'll do|role|duties|what we expect/.test(text)) {
        targetList = result.responsibilities;
      } else if (/preferred|nice to have|bonus|plus/.test(text)) {
        targetList = result.requirements.preferred;
      } else if (/requirement|qualification|what you need|who you are|what we're looking for|experience/.test(text)) {
        targetList = result.requirements.must_have;
      } else if (/skill|tech(?:nolog(?:y|ies))?|tool/.test(text)) {
        targetList = result.skills;
      } else if (/benefit|perk|offer|what we give/.test(text)) {
        targetList = result.benefits;
      } else if (text.length > 3 && text.length < 50 && !/apply|about us|company|salary|location/.test(text)) {
        if (!result.extras[rawText]) {
          result.extras[rawText] = [];
        }
        targetList = result.extras[rawText];
        isExtra = true;
      }
      if (targetList) {
        let next = heading.nextElementSibling;
        while (next && !["ul", "ol"].includes(next.tagName.toLowerCase())) {
          if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(next.tagName.toLowerCase())) {
            break;
          }
          next = next.nextElementSibling;
        }
        if (next && ["ul", "ol"].includes(next.tagName.toLowerCase())) {
          const lis = next.querySelectorAll("li");
          for (const li of lis) {
            const liText = cleanText5(li.textContent);
            if (liText && liText.length > 2) {
              if (!targetList.includes(liText)) {
                targetList.push(liText);
              }
            }
          }
        }
        if (isExtra && targetList.length === 0) {
          delete result.extras[rawText];
        }
      }
    }
    return result;
  }
  function extractGeneric(doc, pageUrl = "") {
    let hostname = "";
    try {
      hostname = new URL(pageUrl).hostname;
    } catch {
    }
    const siteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || "";
    const hostBrand = extractBrandFromHostname(hostname);
    const siteBrand = siteName || hostBrand;
    const domHeading = extractDomHeading(doc, siteBrand, hostname);
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content") || "";
    const docTitle = doc.title || "";
    const rawMetaTitle = ogTitle || twitterTitle || docTitle;
    const parsedMeta = parseTitleString(rawMetaTitle);
    let jobTitle = "";
    if (domHeading) {
      jobTitle = domHeading;
    } else if (!isGenericTitle(parsedMeta.title, siteBrand, hostname)) {
      jobTitle = parsedMeta.title;
    } else if (!isGenericTitle(rawMetaTitle, siteBrand, hostname)) {
      jobTitle = cleanText5(rawMetaTitle);
    }
    let company = extractCompany(doc, pageUrl, jobTitle, parsedMeta.company);
    if (jobTitle && company && jobTitle.toLowerCase() === company.toLowerCase()) {
      if (domHeading && domHeading.toLowerCase() !== company.toLowerCase()) {
        jobTitle = domHeading;
      } else {
        jobTitle = "";
      }
    }
    if (!jobTitle && domHeading) {
      jobTitle = domHeading;
    }
    const location = extractLocations(doc);
    const workArrangement = extractWorkArrangement(doc, location);
    const employmentType = extractEmploymentType(doc);
    const salary = extractSalary(doc);
    const description = extractDescription(doc);
    const structuredLists = extractStructuredLists(doc);
    let source = hostname.replace(/^www\./i, "");
    return {
      jobTitle,
      company,
      location,
      workArrangement,
      employmentType,
      salaryMin: salary.salaryMin,
      salaryMax: salary.salaryMax,
      salaryCurrency: salary.salaryCurrency,
      salaryRange: salary.salaryRange,
      description,
      responsibilities: structuredLists.responsibilities,
      requirements: structuredLists.requirements,
      skills: structuredLists.skills,
      benefits: structuredLists.benefits,
      extras: structuredLists.extras,
      jobUrl: pageUrl,
      source,
      confidence: "generic"
    };
  }

  // extractors/hiringcafe.js
  function matchesHiringCafe(url, doc) {
    if (url.includes("hiringcafe.com")) return true;
    if (doc?.querySelector?.("#job-info, #job-description, #company-info")) return true;
    return false;
  }
  function extractHiringCafe(doc, url) {
    const result = { confidence: "high", jobUrl: url, source: "HiringCafe", extras: {} };
    let jobId = "";
    const match = url.match(/job\/([^/?#]+)/);
    if (match) jobId = match[1];
    let root = doc.querySelector('div[role="dialog"]') || doc;
    const titleEl = root.querySelector("h1, h2");
    if (titleEl) result.jobTitle = titleEl.textContent.trim();
    const companyEl = root.querySelector('a[href^="/company/"], [data-testid="company-name"], #company-info');
    if (companyEl) result.company = companyEl.textContent.trim();
    const tags = Array.from(root.querySelectorAll('.badge, .chip, [class*="badge"], [class*="chip"]')).map((el) => el.textContent.trim());
    if (tags.some((t) => t.match(/remote/i))) result.workArrangement = "Remote";
    else if (tags.some((t) => t.match(/hybrid/i))) result.workArrangement = "Hybrid";
    else if (tags.some((t) => t.match(/onsite|on-site/i))) result.workArrangement = "Onsite";
    const descEl = root.querySelector('#job-description, .job-description, [data-testid="job-description"]');
    if (descEl) result.description = preserveHtmlText(descEl.innerHTML);
    const nextDataScript = doc.getElementById("__NEXT_DATA__");
    if (nextDataScript) {
      try {
        const data = JSON.parse(nextDataScript.textContent);
        const props = data?.props?.pageProps;
        let jobData = props?.job;
        if (!jobData && props?.jobs) {
          jobData = props.jobs.find((j) => j.id === jobId || j.slug === jobId || j.title === result.jobTitle);
        }
        if (!jobData && props?.initialJobs) {
          jobData = props.initialJobs.find((j) => j.id === jobId || j.slug === jobId || j.title === result.jobTitle);
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
            } else if (typeof jobData.requirements === "object") {
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

  // extractors/dice.js
  function matchesDice(url, doc) {
    if (url.includes("dice.com")) return true;
    if (doc?.querySelector?.("job-detail-header-card, .job-detail-header-card")) return true;
    return false;
  }
  function extractDice(doc, url) {
    const result = { confidence: "high", jobUrl: url, source: "Dice", extras: {} };
    const header = doc.querySelector("job-detail-header-card, .job-detail-header-card");
    const root = header || doc;
    const titleEl = root.querySelector('h1.jobTitle, [data-cy="jobTitle"]');
    if (titleEl) result.jobTitle = titleEl.textContent.trim();
    const companyEl = root.querySelector('a[data-cy="companyNameLink"]');
    if (companyEl) result.company = companyEl.textContent.trim();
    const locationEl = root.querySelector('[data-cy="location"]');
    if (locationEl) result.location = locationEl.textContent.trim();
    const badges = Array.from(root.querySelectorAll('[data-cy="workArrangement"], .work-arrangement-badge')).map((el) => el.textContent.trim());
    if (badges.length > 0) {
      result.workArrangement = badges.join(" / ");
    }
    const employmentTypeEl = root.querySelector('[data-cy="employmentType"]');
    if (employmentTypeEl) result.employmentType = employmentTypeEl.textContent.trim();
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
      clone.querySelectorAll('.match-metrics, [data-cy="jobMatch"]').forEach((el) => el.remove());
      result.description = preserveHtmlText(clone.innerHTML);
    }
    const lists = extractStructuredLists(doc);
    if (lists.responsibilities?.length > 0) result.responsibilities = lists.responsibilities;
    if (lists.requirements?.must_have?.length > 0 || lists.requirements?.preferred?.length > 0) {
      result.requirements = lists.requirements;
    }
    const skillEls = doc.querySelectorAll('.skill-badge, [data-cy="skills"] li, [data-cy="skillsList"] .chip');
    const skillsSet = new Set(Array.from(skillEls).map((el) => el.textContent.trim()).filter(Boolean));
    if (skillsSet.size > 0) result.skills = Array.from(skillsSet);
    result.extras = {};
    const applyButton = doc.querySelector('apply-button-wc, [data-cy="applyButton"]');
    if (applyButton) {
      const applyUrl = applyButton.getAttribute("apply-url") || applyButton.getAttribute("href");
      if (applyUrl) {
        result.extras.apply_url = applyUrl;
        result.apply_url = applyUrl;
      }
    }
    const uuidMatch = url.match(/jobs\/detail\/([^/?]+)\/([^/?]+)/);
    if (uuidMatch) {
      result.externalJobId = uuidMatch[2];
      result.extras.dice_company_id = uuidMatch[1];
    }
    return result;
  }

  // extractors/linkedin.js
  function matchesLinkedIn(url, doc) {
    if (url.includes("linkedin.com")) return true;
    if (doc?.querySelector?.('[data-sdui-screen="SemanticJobDetails"], .jobs-details__main-content, .job-view-layout')) return true;
    return false;
  }
  function extractLinkedIn(doc, url) {
    const result = { confidence: "high", jobUrl: url, source: "LinkedIn", extras: {} };
    const detailPane = doc.querySelector('[data-sdui-screen="SemanticJobDetails"], .jobs-details__main-content, .job-view-layout');
    if (!detailPane) return null;
    const matchId = url.match(/view\/(\d+)/);
    if (matchId) result.externalJobId = matchId[1];
    const titleEl = detailPane.querySelector("h2.t-24, .job-details-jobs-unified-top-card__job-title, .top-card-layout__title");
    if (titleEl) result.jobTitle = titleEl.textContent.trim();
    const companyEl = detailPane.querySelector('.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link, a[href*="/company/"]');
    if (companyEl) result.company = companyEl.textContent.trim();
    const locationEl = detailPane.querySelector(".job-details-jobs-unified-top-card__primary-description-container span, .topcard__flavor--bullet");
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
    const insights = Array.from(detailPane.querySelectorAll(".job-details-jobs-unified-top-card__job-insight"));
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
    const descEl = detailPane.querySelector(".jobs-description__content, .jobs-description-content__text, .show-more-less-html__markup");
    if (descEl) {
      const clone = descEl.cloneNode(true);
      clone.querySelectorAll(".job-match-insights, .ext-injected, [data-extension], .job-details-jobs-unified-top-card__connections").forEach((el) => el.remove());
      result.description = preserveHtmlText(clone.innerHTML);
      const lists = extractStructuredLists(clone);
      if (lists.responsibilities?.length > 0) result.responsibilities = lists.responsibilities;
      if (lists.requirements?.must_have?.length > 0 || lists.requirements?.preferred?.length > 0) {
        result.requirements = lists.requirements;
      }
      if (lists.benefits?.length > 0) result.benefits = lists.benefits;
    }
    const skillsContainer = detailPane.querySelector(".job-details-how-you-match__skills-item-wrapper, .job-details-preferences-and-skills");
    if (skillsContainer) {
      const skills = Array.from(skillsContainer.querySelectorAll(".t-bold, li, a")).map((s) => s.textContent.trim()).filter(Boolean);
      if (skills.length > 0) {
        result.skills = Array.from(new Set(skills));
      }
    }
    return result;
  }

  // extractors/index.js
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
      capture_metadata: { captured_at: (/* @__PURE__ */ new Date()).toISOString(), extractor_confidence: "none" }
    };
    for (const item of candidates) {
      if (!item) continue;
      if (result.capture_metadata.extractor_confidence === "none" && item.confidence) {
        result.capture_metadata.extractor_confidence = item.confidence;
      }
      if (!result.job.title && item.jobTitle) result.job.title = item.jobTitle;
      if (!result.job.title && item.job?.title) result.job.title = item.job.title;
      if (!result.company.name && item.company) result.company.name = typeof item.company === "string" ? item.company : item.company.name;
      if (!result.location.text && item.location) result.location.text = typeof item.location === "string" ? item.location : item.location.text;
      if (!result.location.work_arrangement && item.workArrangement) {
        result.location.work_arrangement = item.workArrangement;
      }
      if (!result.location.work_arrangement && item.location?.work_arrangement) {
        result.location.work_arrangement = item.location.work_arrangement;
      }
      if (!result.employment.type && item.employmentType) result.employment.type = item.employmentType;
      if (!result.employment.type && item.employment?.type) result.employment.type = item.employment.type;
      const itemMin = item.salaryMin ?? item.compensation?.min;
      if (result.compensation.min === null && itemMin !== null && itemMin !== void 0) {
        result.compensation.min = itemMin;
      }
      const itemMax = item.salaryMax ?? item.compensation?.max;
      if (result.compensation.max === null && itemMax !== null && itemMax !== void 0) {
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
      const resp = item.responsibilities || [];
      if (resp.length > 0) {
        result.responsibilities = Array.from(/* @__PURE__ */ new Set([...result.responsibilities, ...resp]));
      }
      if (item.requirements) {
        if (Array.isArray(item.requirements) && item.requirements.length > 0) {
          result.requirements.must_have = Array.from(/* @__PURE__ */ new Set([...result.requirements.must_have, ...item.requirements]));
        } else if (typeof item.requirements === "object" && !Array.isArray(item.requirements)) {
          if (item.requirements.must_have?.length > 0) {
            result.requirements.must_have = Array.from(/* @__PURE__ */ new Set([...result.requirements.must_have, ...item.requirements.must_have]));
          }
          if (item.requirements.preferred?.length > 0) {
            result.requirements.preferred = Array.from(/* @__PURE__ */ new Set([...result.requirements.preferred, ...item.requirements.preferred]));
          }
        }
      }
      const skills = item.skills || [];
      if (skills.length > 0) {
        result.skills = Array.from(/* @__PURE__ */ new Set([...result.skills, ...skills]));
      }
      const benefits = item.benefits || [];
      if (benefits.length > 0) {
        result.benefits = Array.from(/* @__PURE__ */ new Set([...result.benefits, ...benefits]));
      }
      if (item.extras) {
        for (const [k, v] of Object.entries(item.extras)) {
          if (!result.extras[k]) {
            result.extras[k] = typeof v === "string" ? v : [];
          }
          if (Array.isArray(v)) {
            if (Array.isArray(result.extras[k])) {
              result.extras[k] = Array.from(/* @__PURE__ */ new Set([...result.extras[k], ...v]));
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
      const itemSrc = item.source?.platform || (typeof item.source === "string" ? item.source : null);
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
    if (!result.source.platform && result.source.url) {
      try {
        const parsed = new URL(result.source.url);
        result.source.platform = parsed.hostname.replace(/^www\./, "");
      } catch {
      }
    }
    return result;
  }
  function extractEmbeddedAppState(doc, pageUrl) {
    const nextDataScript = doc.getElementById("__NEXT_DATA__");
    if (!nextDataScript) return null;
    try {
      let traverse = function(obj, depth = 0) {
        if (depth > 8 || !obj || typeof obj !== "object" || foundJob) return;
        if (Array.isArray(obj)) {
          for (const item of obj) traverse(item, depth + 1);
          return;
        }
        const hasTitle = obj.title || obj.jobTitle || obj.role;
        const hasCompany = obj.company || obj.employer || obj.companyName;
        const hasDesc = obj.description || obj.jobDescription;
        if (hasTitle && (hasCompany || hasDesc)) {
          if (typeof hasTitle === "string" && hasTitle.length > 3) {
            const id = String(obj.id || obj.slug || obj.jobId || obj.guid || "");
            if (id && pageUrl && !pageUrl.includes(id)) {
              return;
            }
            foundJob = obj;
            return;
          }
        }
        for (const key of Object.keys(obj)) {
          if (/user|account|auth|session|profile/i.test(key)) continue;
          traverse(obj[key], depth + 1);
        }
      };
      const data = JSON.parse(nextDataScript.textContent);
      let foundJob = null;
      traverse(data);
      if (foundJob) {
        const result = { confidence: "app-state" };
        result.jobTitle = foundJob.title || foundJob.jobTitle || foundJob.role;
        if (foundJob.company) {
          result.company = typeof foundJob.company === "object" ? foundJob.company.name || "" : foundJob.company;
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
  function extractJobPosting(doc, pageUrl = "") {
    const candidates = [];
    try {
      if (matchesGreenhouse(pageUrl, doc)) {
        candidates.push(extractGreenhouse(doc, pageUrl));
      } else if (matchesLever(pageUrl, doc)) {
        candidates.push(extractLever(doc, pageUrl));
      } else if (matchesIndeed(pageUrl, doc)) {
        candidates.push(extractIndeed(doc, pageUrl));
      } else if (matchesHiringCafe(pageUrl, doc)) {
        candidates.push(extractHiringCafe(doc, pageUrl));
      } else if (matchesDice(pageUrl, doc)) {
        candidates.push(extractDice(doc, pageUrl));
      } else if (matchesLinkedIn(pageUrl, doc)) {
        candidates.push(extractLinkedIn(doc, pageUrl));
      }
    } catch (err) {
      console.error("ATS adapter extractor error:", err);
    }
    const embeddedState = extractEmbeddedAppState(doc, pageUrl);
    if (embeddedState) candidates.push(embeddedState);
    try {
      const jsonLdResult = extractJsonLd(doc, pageUrl);
      if (jsonLdResult) candidates.push(jsonLdResult);
    } catch (err) {
      console.error("JSON-LD extractor error:", err);
    }
    try {
      const generic = extractGeneric(doc, pageUrl);
      if (generic) candidates.push(generic);
    } catch (err) {
      console.error("Generic extractor error:", err);
    }
    return mergeCaptures(candidates, pageUrl);
  }

  // extractors/content-entry.js
  window.__jobquest_last_extracted = extractJobPosting(document, window.location.href);
  window.__jobquest_last_extracted;
})();

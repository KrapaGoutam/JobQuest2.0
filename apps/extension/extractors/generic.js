// JobQuest Capture Extension — Hardened Generic Meta & DOM Extractor

/**
 * Known job aggregator, job board, and ATS domains whose brand name
 * must NEVER be treated as the hiring company.
 */
export const AGGREGATOR_AND_BOARD_DOMAINS = [
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
  "angel.co",
]

/**
 * Obvious generic non-job titles and marketing phrases.
 */
const GENERIC_TITLE_PATTERNS = [
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
  /career opportunities/i,
]

export function cleanText(raw) {
  if (!raw) return ""
  return String(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
/**
 * Checks if a domain belongs to a known job board or aggregator.
 */
export function isJobAggregatorOrBoard(domain = "") {
  const norm = String(domain || "").toLowerCase().replace(/^www\./, "")
  return AGGREGATOR_AND_BOARD_DOMAINS.some(
    (b) => norm === b || norm.endsWith(`.${b}`),
  )
}

/**
 * Checks whether a candidate title string is a generic site title or slogan.
 */
export function isGenericTitle(title, siteBrand = "", domain = "") {
  if (!title) return true
  const clean = cleanText(title)
  if (clean.length < 3) return true

  for (const pat of GENERIC_TITLE_PATTERNS) {
    if (pat.test(clean)) return true
  }

  // Exact match to site brand or domain (e.g. "Tensor" on tensor.auto)
  if (siteBrand && clean.toLowerCase() === siteBrand.trim().toLowerCase()) {
    return true
  }
  if (domain) {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, "").split(".")[0]
    if (cleanDomain && clean.toLowerCase() === cleanDomain) {
      return true
    }
  }

  return false
}

/**
 * Parses title strings like "Role at Company" or "Company - Role".
 */
export function parseTitleString(titleStr) {
  if (!titleStr) return { title: "", company: "" }
  const clean = cleanText(titleStr)

  // Pattern: "Job Title at Company" or "Job Title @ Company"
  const atMatch = clean.match(/^(.+?)\s+(?:at|@)\s+([^-–|•]+)(?:[-–|•].*)?$/i)
  if (atMatch) {
    return { title: atMatch[1].trim(), company: atMatch[2].trim() }
  }

  // Pattern: "Company - Job Title" or "Job Title - Company"
  const splitMatch = clean.split(/\s+[-–|•]\s+/)
  if (splitMatch.length >= 2) {
    return { title: splitMatch[0].trim(), company: splitMatch[1].trim() }
  }

  return { title: clean, company: "" }
}

/**
 * Normalizes hostname into a clean company brand name.
 * e.g., "tensor.auto" -> "Tensor", "stripe.com" -> "Stripe"
 */
export function extractBrandFromHostname(hostname = "") {
  if (!hostname) return ""
  const clean = hostname.replace(/^www\./i, "").split(":")[0]
  if (isJobAggregatorOrBoard(clean)) return ""

  const parts = clean.split(".")
  if (parts.length >= 2) {
    const brand = parts[0]
    if (brand && brand.length >= 2) {
      return brand.charAt(0).toUpperCase() + brand.slice(1)
    }
  }
  return ""
}

/**
 * Extracts and ranks candidate job titles from the rendered DOM.
 */
export function extractDomHeading(doc, siteBrand = "", domain = "") {
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
    "[class*='posting'] h2",
  ]

  const scoredCandidates = []

  for (const selector of candidateSelectors) {
    const elements = doc.querySelectorAll(selector)
    for (const el of elements) {
      // Filter out hidden or navigation elements
      if (
        el.closest(
          "nav, header, footer, aside, .modal, [role='dialog'], [aria-hidden='true']",
        )
      ) {
        continue
      }
      const style = el.getAttribute("style") || ""
      if (style.includes("display: none") || style.includes("visibility: hidden")) {
        continue
      }

      const text = cleanText(el.textContent)
      if (!text || text.length < 3 || text.length > 150) continue
      if (isGenericTitle(text, siteBrand, domain)) continue

      let score = 0
      const tag = el.tagName.toLowerCase()
      if (tag === "h1") score += 20
      else if (tag === "h2") score += 10

      if (el.closest("main, article, [data-testid*='job'], [class*='job-header']")) {
        score += 20
      }

      const classAndId = `${el.className || ""} ${el.id || ""} ${el.getAttribute("data-testid") || ""}`.toLowerCase()
      if (/title|role|position|header/i.test(classAndId)) {
        score += 15
      }

      // Check for nearby metadata elements (location, salary, employment type)
      const container = el.parentElement
      if (container) {
        const containerText = (container.textContent || "").toLowerCase()
        if (/location|full-time|part-time|salary|\$|remote|hybrid|onsite/i.test(containerText)) {
          score += 15
        }
      }

      scoredCandidates.push({ text, score })
    }
  }

  if (scoredCandidates.length === 0) return ""

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score)
  return scoredCandidates[0].text
}

/**
 * Extracts company name from DOM, meta, or direct employer hostname.
 */
export function extractCompany(
  doc,
  pageUrl,
  jobTitle = "",
  parsedTitleCompany = "",
) {
  let hostname = ""
  try {
    hostname = new URL(pageUrl).hostname
  } catch {}

  const isAggregator = isJobAggregatorOrBoard(hostname)

  // 1. Look for explicit company badge/name in DOM
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
    "[class*='organization-name']",
  ]

  for (const selector of companySelectors) {
    const el = doc.querySelector(selector)
    if (!el) continue
    if (el.closest("nav, footer, aside, [role='dialog'], [aria-hidden='true']")) {
      continue
    }
    const val = cleanText(el.textContent)
    if (
      val &&
      val.length >= 2 &&
      val.length <= 100 &&
      val.toLowerCase() !== jobTitle.toLowerCase() &&
      !isGenericTitle(val)
    ) {
      // If aggregator, ensure the DOM company is not the aggregator itself
      if (isAggregator) {
        const aggBrand = hostname.replace(/^www\./i, "").split(".")[0].toLowerCase()
        if (val.toLowerCase().includes(aggBrand)) {
          continue
        }
      }
      return val
    }
  }

  // 2. Company parsed from title string (e.g. "SDET at GetInsured")
  if (parsedTitleCompany && !isGenericTitle(parsedTitleCompany)) {
    if (!isAggregator) {
      return parsedTitleCompany
    } else {
      const aggBrand = hostname.replace(/^www\./i, "").split(".")[0].toLowerCase()
      if (!parsedTitleCompany.toLowerCase().includes(aggBrand)) {
        return parsedTitleCompany
      }
    }
  }

  // 3. Direct employer site brand fallback (NEVER for aggregators/boards)
  if (!isAggregator) {
    const siteName =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || ""
    if (siteName && !isGenericTitle(siteName) && siteName.toLowerCase() !== jobTitle.toLowerCase()) {
      return cleanText(siteName)
    }

    const hostBrand = extractBrandFromHostname(hostname)
    if (hostBrand && hostBrand.toLowerCase() !== jobTitle.toLowerCase()) {
      return hostBrand
    }
  }

  return ""
}

/**
 * Extracts multiple or single locations from DOM.
 */
export function extractLocations(doc) {
  // First check if there is a list/container with multiple location items (e.g. Tensor)
  const listContainer = doc.querySelector(".locations-list, .locations, [class*='locations']")
  if (listContainer) {
    const items = listContainer.querySelectorAll(".location-item, li, span, div")
    const locs = []
    for (const item of items) {
      const t = cleanText(item.textContent)
      if (t && t.length >= 2 && t.length < 100 && !locs.includes(t)) {
        // Skip purely layout words
        if (!/locations?|remote|hybrid|onsite|full-time/i.test(t)) {
          locs.push(t)
        }
      }
    }
    if (locs.length > 0) {
      return locs.join("; ")
    }
  }

  // Check singular location elements
  const locSelectors = [
    "[data-testid*='location']",
    ".location-badge",
    ".location",
    ".job-location",
    "[class*='job-location']",
    "[class*='location-text']",
    "[class*='location']",
  ]

  for (const selector of locSelectors) {
    const el = doc.querySelector(selector)
    if (!el) continue
    if (el.closest("nav, footer, aside, [role='dialog'], [aria-hidden='true']")) {
      continue
    }
    const val = cleanText(el.textContent)
    if (val && val.length >= 2 && val.length < 120) {
      if (!/locations?|job title|apply/i.test(val)) {
        return val
      }
    }
  }

  return ""
}

/**
 * Extracts explicit work arrangement (Remote / Hybrid / Onsite).
 */
export function extractWorkArrangement(doc, location = "") {
  const arrangementSelectors = [
    "[class*='arrangement']",
    "[class*='workplace']",
    "[class*='work-type']",
    "[data-testid*='workplace']",
    "[data-testid*='arrangement']",
    ".workplace-arrangement",
    ".tags-row span",
    ".job-metadata span",
  ]

  for (const selector of arrangementSelectors) {
    const elements = doc.querySelectorAll(selector)
    for (const el of elements) {
      const val = cleanText(el.textContent).toLowerCase()
      if (val === "remote" || val.includes("fully remote") || val.includes("100% remote")) {
        return "Remote"
      }
      if (val === "hybrid" || val.includes("hybrid")) {
        return "Hybrid"
      }
      if (val === "onsite" || val === "on-site" || val.includes("in-office") || val.includes("on site")) {
        return "Onsite"
      }
    }
  }

  if (location) {
    const locLower = location.toLowerCase()
    if (locLower === "remote" || locLower.includes("remote") || locLower.includes("telecommute")) {
      return "Remote"
    }
    if (locLower === "hybrid" || locLower.includes("hybrid")) {
      return "Hybrid"
    }
    if (locLower === "onsite" || locLower.includes("on-site") || locLower.includes("in-office")) {
      return "Onsite"
    }
  }

  return ""
}

/**
 * Extracts employment type (Full-time, Part-time, Contract, Internship, Temporary).
 */
export function extractEmploymentType(doc) {
  const typeSelectors = [
    "[class*='employment']",
    "[class*='job-type']",
    "[class*='commitment']",
    "[data-testid*='employment']",
    ".employment-type",
    ".employment-time",
    ".tags-row span",
    ".job-metadata span",
  ]

  for (const selector of typeSelectors) {
    const elements = doc.querySelectorAll(selector)
    for (const el of elements) {
      const val = cleanText(el.textContent).toLowerCase()
      if (val.includes("full-time") || val.includes("full time")) return "Full-time"
      if (val.includes("part-time") || val.includes("part time")) return "Part-time"
      if (val.includes("contract") || val.includes("freelance")) return "Contract"
      if (val.includes("intern")) return "Internship"
      if (val.includes("temporary") || val.includes("temp")) return "Temporary"
    }
  }

  return ""
}

/**
 * Extracts salary range and min/max.
 */
export function extractSalary(doc) {
  const salarySelectors = [
    "[class*='salary']",
    "[class*='compensation']",
    "[class*='pay']",
    "[data-testid*='salary']",
    ".salary-comp",
    ".tags-row span",
  ]

  for (const selector of salarySelectors) {
    const elements = doc.querySelectorAll(selector)
    for (const el of elements) {
      const val = cleanText(el.textContent)
      const rangeMatch = val.match(
        /\$([\d,]+(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|\s*per\s*)[a-zA-Z]+)?\s*[-–]\s*\$([\d,]+(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|\s*per\s*)([a-zA-Z]+))?/i,
      )
      if (rangeMatch) {
        let min = Number(rangeMatch[1].replace(/,/g, "")) || null
        if (rangeMatch[2] && min !== null && min < 1000) min *= 1000

        let max = Number(rangeMatch[3].replace(/,/g, "")) || null
        if (rangeMatch[4] && max !== null && max < 1000) max *= 1000

        return {
          salaryMin: min,
          salaryMax: max,
          salaryCurrency: "USD",
          salaryRange: val,
        }
      }

      const singleMatch = val.match(
        /\$([\d,]+(?:\.\d+)?)\s*([kK])?(?:\s*(?:\/|\s*per\s*)([a-zA-Z]+))?/i,
      )
      if (singleMatch) {
        let min = Number(singleMatch[1].replace(/,/g, "")) || null
        if (singleMatch[2] && min !== null && min < 1000) min *= 1000
        return {
          salaryMin: min,
          salaryMax: min,
          salaryCurrency: "USD",
          salaryRange: val,
        }
      }
    }
  }

  return {
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: "",
    salaryRange: "",
  }
}

/**
 * Preserves structure (paragraphs, bullets, newlines) and decodes entities.
 */
export function preserveHtmlText(htmlStr) {
  if (!htmlStr) return "";
  return String(htmlStr)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?h[1-6][^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '') // strip remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n[ \t]+/g, '\n') // remove leading spaces on lines
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ newlines to 2
    .trim();
}

/**
 * Extracts job description content.
 */
export function extractDescription(doc) {
  const descSelectors = [
    "[class*='job-description']",
    "[class*='jobDescription']",
    "[class*='description-body']",
    "[data-testid*='description']",
    "#job-description",
    ".job-description",
    "article.job-description-body",
    "main section.job-description",
    "main article",
  ]

  for (const selector of descSelectors) {
    const el = doc.querySelector(selector)
    if (el) {
      const text = preserveHtmlText(el.innerHTML);
      if (text && text.length > 50) return text
    }
  }

  // Fallback to meta descriptions
  const ogDesc =
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || ""
  const metaDesc =
    doc.querySelector('meta[name="description"]')?.getAttribute("content") || ""
  return cleanText(ogDesc || metaDesc || "")
}

/**
 * Extracts structured lists from the job description area based on preceding headings.
 */
export function extractStructuredLists(doc) {
  const result = {
    responsibilities: [],
    requirements: { must_have: [], preferred: [] },
    skills: [],
    benefits: [],
    extras: {}
  }

  const containerSelectors = [
    "[class*='job-description']",
    "[class*='jobDescription']",
    "[class*='description-body']",
    "[data-testid*='description']",
    "#job-description",
    ".job-description",
    "article.job-description-body",
    "main section.job-description",
    "main article",
  ]

  let descContainer = null;
  for (const selector of containerSelectors) {
    const el = doc.querySelector(selector)
    if (el) {
      descContainer = el;
      break;
    }
  }

  const targetDoc = descContainer || doc;
  const headings = targetDoc.querySelectorAll('h1, h2, h3, h4, h5, h6, b, strong, p > strong');
  
  for (const heading of headings) {
    const rawText = cleanText(heading.textContent);
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
      // Possible unknown section
      if (!result.extras[rawText]) {
        result.extras[rawText] = [];
      }
      targetList = result.extras[rawText];
      isExtra = true;
    }

    if (targetList) {
      let next = heading.nextElementSibling;
      while (next && !['ul', 'ol'].includes(next.tagName.toLowerCase())) {
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(next.tagName.toLowerCase())) {
          break; // Stopped by another heading
        }
        next = next.nextElementSibling;
      }

      if (next && ['ul', 'ol'].includes(next.tagName.toLowerCase())) {
        const lis = next.querySelectorAll('li');
        for (const li of lis) {
          const liText = cleanText(li.textContent);
          if (liText && liText.length > 2) {
             if (!targetList.includes(liText)) {
                targetList.push(liText);
             }
          }
        }
      }
      
      // Cleanup empty extras
      if (isExtra && targetList.length === 0) {
        delete result.extras[rawText];
      }
    }
  }

  return result;
}

/**
 * Main Generic Extractor entry point.
 */
export function extractGeneric(doc, pageUrl = "") {
  let hostname = ""
  try {
    hostname = new URL(pageUrl).hostname
  } catch {}

  const siteName =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || ""
  const hostBrand = extractBrandFromHostname(hostname)
  const siteBrand = siteName || hostBrand

  // 1. Check rendered DOM heading (Priority 3: Semantic Job DOM)
  const domHeading = extractDomHeading(doc, siteBrand, hostname)

  // 2. Metadata title parsing (Priority 4/5)
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || ""
  const twitterTitle =
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content") || ""
  const docTitle = doc.title || ""
  const rawMetaTitle = ogTitle || twitterTitle || docTitle
  const parsedMeta = parseTitleString(rawMetaTitle)

  // Determine Job Title: Semantic DOM Heading strongly outranks site metadata
  let jobTitle = ""
  if (domHeading) {
    jobTitle = domHeading
  } else if (!isGenericTitle(parsedMeta.title, siteBrand, hostname)) {
    jobTitle = parsedMeta.title
  } else if (!isGenericTitle(rawMetaTitle, siteBrand, hostname)) {
    jobTitle = cleanText(rawMetaTitle)
  }

  // 3. Extract Company
  let company = extractCompany(doc, pageUrl, jobTitle, parsedMeta.company)

  // 4. Company / Title Cross-Check
  if (
    jobTitle &&
    company &&
    jobTitle.toLowerCase() === company.toLowerCase()
  ) {
    if (domHeading && domHeading.toLowerCase() !== company.toLowerCase()) {
      jobTitle = domHeading
    } else {
      jobTitle = ""
    }
  }

  if (!jobTitle && domHeading) {
    jobTitle = domHeading
  }

  // 5. Extract Details
  const location = extractLocations(doc)
  const workArrangement = extractWorkArrangement(doc, location)
  const employmentType = extractEmploymentType(doc)
  const salary = extractSalary(doc)
  const description = extractDescription(doc)
  
  // Extract Structured Lists
  const structuredLists = extractStructuredLists(doc)

  let source = hostname.replace(/^www\./i, "")

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
    confidence: "generic",
  }
}

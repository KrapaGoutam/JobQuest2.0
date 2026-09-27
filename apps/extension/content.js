// JobQuest Capture Extension — Content Script Runner
// Injected into the active tab on demand to extract job posting details.

;(() => {
  function cleanText(raw) {
    if (!raw) return ""
    return String(raw)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  function normalizeWorkArrangement(val, contextText = "") {
    const combined = `${val || ""} ${contextText || ""}`.toLowerCase()
    if (combined.includes("remote") || combined.includes("telecommute")) return "Remote"
    if (combined.includes("hybrid")) return "Hybrid"
    if (combined.includes("on-site") || combined.includes("onsite") || combined.includes("in-office"))
      return "Onsite"
    return ""
  }

  function normalizeEmploymentType(val) {
    if (!val) return ""
    const str = Array.isArray(val) ? val.join(" ") : String(val)
    const upper = str.toUpperCase()
    if (upper.includes("FULL_TIME") || upper.includes("FULL-TIME") || upper.includes("FULL TIME"))
      return "Full-time"
    if (upper.includes("PART_TIME") || upper.includes("PART-TIME") || upper.includes("PART TIME"))
      return "Part-time"
    if (upper.includes("CONTRACT") || upper.includes("FREELANCE")) return "Contract"
    if (upper.includes("INTERN")) return "Internship"
    if (upper.includes("TEMPORARY") || upper.includes("TEMP")) return "Temporary"
    return ""
  }

  function findJobPostings(obj, results = []) {
    if (!obj || typeof obj !== "object") return results
    if (Array.isArray(obj)) {
      for (const item of obj) findJobPostings(item, results)
      return results
    }
    const type = obj["@type"]
    if (
      type === "JobPosting" ||
      (Array.isArray(type) && type.includes("JobPosting")) ||
      (typeof type === "string" && type.endsWith("/JobPosting"))
    ) {
      results.push(obj)
    }
    if (obj["@graph"]) {
      findJobPostings(obj["@graph"], results)
    }
    return results
  }

  function extractJsonLd(doc, pageUrl) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
    const postings = []

    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || "{}")
        findJobPostings(parsed, postings)
      } catch {
        // ignore
      }
    }

    if (postings.length === 0) return null
    const job = postings[0]

    const jobTitle = cleanText(job.title || job.name || "")

    let company = ""
    if (job.hiringOrganization) {
      if (typeof job.hiringOrganization === "string") {
        company = cleanText(job.hiringOrganization)
      } else if (typeof job.hiringOrganization === "object") {
        company = cleanText(
          job.hiringOrganization.name || job.hiringOrganization.legalName || "",
        )
      }
    }

    let location = ""
    if (job.jobLocation) {
      const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation
      if (typeof loc === "string") {
        location = cleanText(loc)
      } else if (loc && loc.address) {
        if (typeof loc.address === "string") {
          location = cleanText(loc.address)
        } else if (typeof loc.address === "object") {
          const parts = [
            loc.address.addressLocality,
            loc.address.addressRegion,
            loc.address.addressCountry,
          ].filter(Boolean)
          location = parts.join(", ")
        }
      }
    }
    if (!location && job.applicantLocationRequirements) {
      location = cleanText(
        job.applicantLocationRequirements.name || job.applicantLocationRequirements,
      )
    }

    let workArrangement = ""
    if (
      job.jobLocationType === "TELECOMMUTE" ||
      String(job.jobLocationType || "").toUpperCase().includes("TELECOMMUTE")
    ) {
      workArrangement = "Remote"
    } else {
      workArrangement = normalizeWorkArrangement(location, `${jobTitle} ${job.description || ""}`)
    }

    const employmentType = normalizeEmploymentType(job.employmentType)

    let salaryMin = null
    let salaryMax = null
    let salaryCurrency = ""
    let salaryRange = ""

    const salaryObj = job.baseSalary || job.estimatedSalary
    if (salaryObj && typeof salaryObj === "object") {
      salaryCurrency = String(salaryObj.currency || "").toUpperCase()
      const val = salaryObj.value
      if (typeof val === "number") {
        salaryMin = val
        salaryMax = val
      } else if (val && typeof val === "object") {
        if (val.minValue !== undefined) salaryMin = Number(val.minValue) || null
        if (val.maxValue !== undefined) salaryMax = Number(val.maxValue) || null
        if (val.value !== undefined && salaryMin === null) {
          salaryMin = Number(val.value) || null
          salaryMax = salaryMin
        }
      }
      if (salaryMin !== null || salaryMax !== null) {
        const sym = salaryCurrency ? `${salaryCurrency} ` : "$"
        if (salaryMin !== null && salaryMax !== null && salaryMin !== salaryMax) {
          salaryRange = `${sym}${salaryMin.toLocaleString()} - ${sym}${salaryMax.toLocaleString()}`
        } else {
          salaryRange = `${sym}${(salaryMin || salaryMax).toLocaleString()}`
        }
      }
    }

    const description = cleanText(job.description || "")

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
      confidence: "jsonld",
    }
  }

  function extractGreenhouse(doc, pageUrl) {
    if (!/greenhouse\.io/i.test(pageUrl) && !doc.querySelector("#grnhse_app, .app-title")) {
      return null
    }

    const titleEl = doc.querySelector(
      ".app-title, #app-body h1.app-title, h1.job-title, .job-name, h1",
    )
    const jobTitle = cleanText(titleEl?.textContent || "")

    const companyEl = doc.querySelector(
      ".company-name, .logo-container img[alt], #header .company-name",
    )
    let company = cleanText(companyEl?.textContent || companyEl?.getAttribute("alt") || "")
    if (!company) {
      try {
        const m = new URL(pageUrl).pathname.match(/^\/([^/]+)\/jobs/i)
        if (m && m[1]) company = m[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      } catch {}
    }

    const locationEl = doc.querySelector(".location, .body--metadata, .job-location")
    const location = cleanText(locationEl?.textContent || "")

    let workArrangement = ""
    const fullLoc = location.toLowerCase()
    if (fullLoc.includes("remote")) workArrangement = "Remote"
    else if (fullLoc.includes("hybrid")) workArrangement = "Hybrid"
    else if (fullLoc.includes("on-site") || fullLoc.includes("onsite")) workArrangement = "Onsite"

    const descEl = doc.querySelector("#content, #app-body, .job-description")
    const description = cleanText(descEl?.textContent || "")

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
      confidence: "ats_greenhouse",
    }
  }

  function extractLever(doc, pageUrl) {
    if (!/jobs\.lever\.co/i.test(pageUrl) && !doc.querySelector(".posting-headline")) {
      return null
    }

    const titleEl = doc.querySelector(
      ".posting-headline h2, .posting-headline h1, h2.posting-headline",
    )
    const jobTitle = cleanText(titleEl?.textContent || "")

    const logoEl = doc.querySelector(".main-header-logo img")
    let company = cleanText(logoEl?.getAttribute("alt") || "")
    if (!company) {
      try {
        const m = new URL(pageUrl).pathname.match(/^\/([^/]+)/i)
        if (m && m[1]) company = m[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      } catch {}
    }

    const locationEl = doc.querySelector(".posting-categories .location, .location")
    const location = cleanText(locationEl?.textContent || "")

    const workplaceEl = doc.querySelector(".workplaceTypes, .workplace-type")
    const workplaceText = cleanText(workplaceEl?.textContent || "").toLowerCase()
    let workArrangement = ""
    const combLoc = `${location} ${workplaceText}`.toLowerCase()
    if (combLoc.includes("remote")) workArrangement = "Remote"
    else if (combLoc.includes("hybrid")) workArrangement = "Hybrid"
    else if (combLoc.includes("on-site") || combLoc.includes("onsite")) workArrangement = "Onsite"

    const commitmentEl = doc.querySelector(".posting-categories .commitment, .commitment")
    const commitmentText = cleanText(commitmentEl?.textContent || "").toLowerCase()
    let employmentType = ""
    if (commitmentText.includes("full-time") || commitmentText.includes("full time"))
      employmentType = "Full-time"
    else if (commitmentText.includes("part-time") || commitmentText.includes("part time"))
      employmentType = "Part-time"
    else if (commitmentText.includes("contract")) employmentType = "Contract"
    else if (commitmentText.includes("intern")) employmentType = "Internship"

    const descEl = doc.querySelector(".section.page-centered, .posting-page, #content")
    const description = cleanText(descEl?.textContent || "")

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
      confidence: "ats_lever",
    }
  }

  function extractIndeed(doc, pageUrl) {
    if (!/indeed\.com/i.test(pageUrl) && !doc.querySelector(".jobsearch-JobInfoHeader-title")) {
      return null
    }

    const titleEl = doc.querySelector(
      "h1.jobsearch-JobInfoHeader-title, [data-testid='simpler-jobTitle'], h1",
    )
    const jobTitle = cleanText(titleEl?.textContent || "")

    const companyEl = doc.querySelector(
      "[data-testid='inlineHeader-companyName'], .jobsearch-CompanyInfoContainer a, [data-company-name='true']",
    )
    const company = cleanText(companyEl?.textContent || "")

    const locationEl = doc.querySelector(
      "[data-testid='inlineHeader-companyLocation'], [data-testid='jobsearch-JobInfoHeader-companyLocation']",
    )
    const location = cleanText(locationEl?.textContent || "")

    let workArrangement = ""
    const combLoc = location.toLowerCase()
    if (combLoc.includes("remote")) workArrangement = "Remote"
    else if (combLoc.includes("hybrid")) workArrangement = "Hybrid"

    const salaryEl = doc.querySelector(
      "#salaryInfoAndJobType, [data-testid='attribute_snippet_testid']",
    )
    const salaryText = cleanText(salaryEl?.textContent || "")
    let salaryRange = ""
    let salaryMin = null
    let salaryMax = null
    const salaryMatch = salaryText.match(/\$([\d,]+)(?:\s*-\s*\$([\d,]+))?/)
    if (salaryMatch) {
      salaryMin = Number(salaryMatch[1].replace(/,/g, "")) || null
      if (salaryMatch[2]) {
        salaryMax = Number(salaryMatch[2].replace(/,/g, "")) || null
        salaryRange = `$${salaryMin?.toLocaleString()} - $${salaryMax?.toLocaleString()}`
      } else if (salaryMin) {
        salaryMax = salaryMin
        salaryRange = `$${salaryMin.toLocaleString()}`
      }
    }

    const descEl = doc.querySelector("#jobDescriptionText, .jobsearch-jobDescriptionText")
    const description = cleanText(descEl?.textContent || "")

    return {
      jobTitle,
      company,
      location,
      workArrangement,
      employmentType: "",
      salaryMin,
      salaryMax,
      salaryCurrency: "USD",
      salaryRange,
      description,
      jobUrl: pageUrl,
      source: "Indeed",
      confidence: "ats_indeed",
    }
  }

  const AGGREGATOR_AND_BOARD_DOMAINS = [
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

  function isJobAggregatorOrBoard(domain = "") {
    const norm = String(domain || "").toLowerCase().replace(/^www\./, "")
    return AGGREGATOR_AND_BOARD_DOMAINS.some(
      (b) => norm === b || norm.endsWith(`.${b}`),
    )
  }

  function isGenericTitle(title, siteBrand = "", domain = "") {
    if (!title) return true
    const clean = cleanText(title)
    if (clean.length < 3) return true

    for (const pat of GENERIC_TITLE_PATTERNS) {
      if (pat.test(clean)) return true
    }

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

  function parseTitleString(titleStr) {
    if (!titleStr) return { title: "", company: "" }
    const clean = cleanText(titleStr)

    const atMatch = clean.match(/^(.+?)\s+(?:at|@)\s+([^-–|•]+)(?:[-–|•].*)?$/i)
    if (atMatch) {
      return { title: atMatch[1].trim(), company: atMatch[2].trim() }
    }

    const splitMatch = clean.split(/\s+[-–|•]\s+/)
    if (splitMatch.length >= 2) {
      return { title: splitMatch[0].trim(), company: splitMatch[1].trim() }
    }

    return { title: clean, company: "" }
  }

  function extractBrandFromHostname(hostname = "") {
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
      "[class*='posting'] h2",
    ]

    const scoredCandidates = []

    for (const selector of candidateSelectors) {
      const elements = doc.querySelectorAll(selector)
      for (const el of elements) {
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
    scoredCandidates.sort((a, b) => b.score - a.score)
    return scoredCandidates[0].text
  }

  function extractCompanyFromDom(doc, pageUrl, jobTitle = "", parsedTitleCompany = "") {
    let hostname = ""
    try {
      hostname = new URL(pageUrl).hostname
    } catch {}

    const isAggregator = isJobAggregatorOrBoard(hostname)

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
        if (isAggregator) {
          const aggBrand = hostname.replace(/^www\./i, "").split(".")[0].toLowerCase()
          if (val.toLowerCase().includes(aggBrand)) {
            continue
          }
        }
        return val
      }
    }

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

  function extractGenericLocations(doc) {
    const listContainer = doc.querySelector(".locations-list, .locations, [class*='locations']")
    if (listContainer) {
      const items = listContainer.querySelectorAll(".location-item, li, span, div")
      const locs = []
      for (const item of items) {
        const t = cleanText(item.textContent)
        if (t && t.length >= 2 && t.length < 100 && !locs.includes(t)) {
          if (!/locations?|remote|hybrid|onsite|full-time/i.test(t)) {
            locs.push(t)
          }
        }
      }
      if (locs.length > 0) {
        return locs.join("; ")
      }
    }

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

  function extractGenericWorkArrangement(doc, location = "") {
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

  function extractGenericEmploymentType(doc) {
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

  function extractGenericSalary(doc) {
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

  function extractGenericDescription(doc) {
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
        const text = cleanText(el.textContent)
        if (text && text.length > 50) return text
      }
    }

    const ogDesc =
      doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || ""
    const metaDesc =
      doc.querySelector('meta[name="description"]')?.getAttribute("content") || ""
    return cleanText(ogDesc || metaDesc || "")
  }

  function extractGeneric(doc, pageUrl) {
    let hostname = ""
    try {
      hostname = new URL(pageUrl).hostname
    } catch {}

    const siteName =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || ""
    const hostBrand = extractBrandFromHostname(hostname)
    const siteBrand = siteName || hostBrand

    const domHeading = extractDomHeading(doc, siteBrand, hostname)

    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || ""
    const twitterTitle =
      doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content") || ""
    const docTitle = doc.title || ""
    const rawMetaTitle = ogTitle || twitterTitle || docTitle
    const parsedMeta = parseTitleString(rawMetaTitle)

    let jobTitle = ""
    if (domHeading) {
      jobTitle = domHeading
    } else if (!isGenericTitle(parsedMeta.title, siteBrand, hostname)) {
      jobTitle = parsedMeta.title
    } else if (!isGenericTitle(rawMetaTitle, siteBrand, hostname)) {
      jobTitle = cleanText(rawMetaTitle)
    }

    let company = extractCompanyFromDom(doc, pageUrl, jobTitle, parsedMeta.company)

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

    const location = extractGenericLocations(doc)
    const workArrangement = extractGenericWorkArrangement(doc, location)
    const employmentType = extractGenericEmploymentType(doc)
    const salary = extractGenericSalary(doc)
    const description = extractGenericDescription(doc)

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
      jobUrl: pageUrl,
      source,
      confidence: "generic",
    }
  }

  function extractAll(doc, pageUrl) {
    const candidates = []
    try {
      const jsonLd = extractJsonLd(doc, pageUrl)
      if (jsonLd) candidates.push(jsonLd)
    } catch {}

    try {
      const gh = extractGreenhouse(doc, pageUrl)
      if (gh) candidates.push(gh)
      const lever = extractLever(doc, pageUrl)
      if (lever) candidates.push(lever)
      const indeed = extractIndeed(doc, pageUrl)
      if (indeed) candidates.push(indeed)
    } catch {}

    try {
      const generic = extractGeneric(doc, pageUrl)
      if (generic) candidates.push(generic)
    } catch {}

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
      jobUrl: pageUrl,
      source: "",
      confidence: "none",
    }

    for (const item of candidates) {
      if (!item) continue
      if (result.confidence === "none" && item.confidence) result.confidence = item.confidence
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
      if (!result.source && item.source) result.source = item.source
    }

    if (!result.source && result.jobUrl) {
      try {
        result.source = new URL(result.jobUrl).hostname.replace(/^www\./, "")
      } catch {}
    }

    return result
  }

  const extracted = extractAll(document, window.location.href)
  window.__jobquest_last_extracted = extracted
  return extracted
})()

import { test, expect } from "vitest"
import { generateAIJobJson } from "../serializers/ai-job-json.js"

test("generateAIJobJson: handles extension extraction payload correctly", () => {
  const payload = {
    jobTitle: "Software Engineer",
    company: "Acme",
    salaryMin: 100000,
    salaryMax: 150000,
    responsibilities: ["Code", "Test"],
    requirements: ["Java", "SQL"],
    skills: ["React"],
    description: "Good job",
    confidence: "generic",
    captured_at: "2024-01-01T12:00:00Z"
  }
  
  const resultStr = generateAIJobJson(payload)
  const result = JSON.parse(resultStr)
  
  expect(result.schema_version).toBe("1.1")
  expect(result.job.title).toBe("Software Engineer")
  expect(result.company.name).toBe("Acme")
  expect(result.compensation.min).toBe(100000)
  expect(result.responsibilities).toEqual(["Code", "Test"])
  expect(result.requirements).toEqual({ must_have: ["Java", "SQL"], preferred: [] })
  expect(result.skills).toEqual(["React"])
  expect(result.description).toBe("Good job")

})

test("generateAIJobJson: handles web Application shape correctly", () => {
  const appData = {
    role_title: "Product Manager",
    company_name: "Globex",
    job_snapshot: {
      job_description: "Manage products",
      captured_at: "2024-01-01T12:00:00Z",
      raw_payload: {
        responsibilities: ["A", "B"],
        requirements: ["C", "D"],
        skills: ["E"],
        confidence: "jsonld"
      }
    }
  }
  
  const resultStr = generateAIJobJson(appData)
  const result = JSON.parse(resultStr)
  
  expect(result.job.title).toBe("Product Manager")
  expect(result.company.name).toBe("Globex")
  expect(result.responsibilities).toEqual(["A", "B"])
  expect(result.requirements).toEqual({ must_have: ["C", "D"], preferred: [] })
  expect(result.skills).toEqual(["E"])
  expect(result.description).toBe("Manage products")

})

test("generateAIJobJson: 2.1-PA Issue F pre-save Copy JSON requires no application ID, no DB save, and no existing DB record", () => {
  // Scenario 1: Freshly extracted page, unsaved, no JobQuest application ID, no database record
  const freshExtraction = {
    company: "Stripe",
    jobTitle: "Backend Lead",
    location: "Remote, US",
    workArrangement: "Remote",
    employmentType: "Full-time",
    jobUrl: "https://stripe.com/jobs/lead-101",
    source: "Company Website",
    salaryRange: "$190k - $240k",
    description: "Design and scale global payments infrastructure.",
    requirements: ["Distributed systems", "Go", "High availability"],
    confidence: "generic",
    captured_at: "2026-10-06T12:00:00Z"
  }

  // Explicitly confirm no ID or DB save artifact is present
  expect(freshExtraction.id).toBeUndefined()
  expect(freshExtraction.application_id).toBeUndefined()

  const jsonStr = generateAIJobJson(freshExtraction)
  const result = JSON.parse(jsonStr)

  expect(result.schema_version).toBe("1.1")
  expect(result.job.title).toBe("Backend Lead")
  expect(result.company.name).toBe("Stripe")
  expect(result.location.text).toBe("Remote, US")
  expect(result.location.work_arrangement).toBe("Remote")
  expect(result.employment.type).toBe("Full-time")
  expect(result.source.url).toBe("https://stripe.com/jobs/lead-101")
  expect(result.compensation.range_text).toBe("$190k - $240k")
  expect(result.description).toBe("Design and scale global payments infrastructure.")
  expect(result.requirements).toEqual({ must_have: ["Distributed systems", "Go", "High availability"], preferred: [] })

})

test("generateAIJobJson: 2.1-PA Issue F reflects visible form edits prior to saving", () => {
  // Scenario 2: Extracted data from page, then user edited the inputs in the UI
  const rawCaptured = {
    company: "Acme",
    jobTitle: "Software Engineer",
    location: "Austin, TX",
    jobUrl: "https://example.com/jobs/42",
    source: "LinkedIn",
    description: "Original job description",
    confidence: "jsonld"
  }

  // Simulating the user-edited fields merged in sidepanel.js click listener:
  const formEdits = {
    company: "Acme Corporation Inc.",
    jobTitle: "Staff Software Engineer",
    location: "Austin, TX (Hybrid)",
    workArrangement: "Hybrid",
    employmentType: "Full-time",
    salaryRange: "$160,000 - $190,000",
    jobUrl: "https://example.com/jobs/42?ref=direct",
    source: "Indeed"
  }

  const mergedCurrentData = {
    ...rawCaptured,
    company: formEdits.company || rawCaptured.company,
    jobTitle: formEdits.jobTitle || rawCaptured.jobTitle,
    location: formEdits.location || rawCaptured.location,
    workArrangement: formEdits.workArrangement || rawCaptured.workArrangement,
    employmentType: formEdits.employmentType || rawCaptured.employmentType,
    salaryRange: formEdits.salaryRange || rawCaptured.salaryRange,
    jobUrl: formEdits.jobUrl || rawCaptured.jobUrl,
    source: formEdits.source || rawCaptured.source,
  }

  const jsonStr = generateAIJobJson(mergedCurrentData)
  const result = JSON.parse(jsonStr)

  expect(result.schema_version).toBe("1.1")
  expect(result.company.name).toBe("Acme Corporation Inc.")
  expect(result.job.title).toBe("Staff Software Engineer")
  expect(result.location.text).toBe("Austin, TX (Hybrid)")
  expect(result.location.work_arrangement).toBe("Hybrid")
  expect(result.employment.type).toBe("Full-time")
  expect(result.compensation.range_text).toBe("$160,000 - $190,000")
  expect(result.source.platform).toBe("Indeed")
  expect(result.source.url).toBe("https://example.com/jobs/42?ref=direct")
  // Retained original extracted description from captured
  expect(result.description).toBe("Original job description")
})

test("generateAIJobJson: 2.1-PA Issue F works for already-known/captured job without requiring another save", () => {
  // Scenario 3: Page is already known / duplicate warning shown, but user wants to copy AI JSON
  const duplicatePageData = {
    company: "Netflix",
    jobTitle: "Senior UI Engineer",
    externalJobId: "netflix-9988",
    jobUrl: "https://jobs.netflix.com/jobs/9988",
    description: "Scale streaming interfaces",
    confidence: "generic",
    captured_at: "2026-10-06T10:00:00Z"
  }

  const jsonStr = generateAIJobJson(duplicatePageData)
  const result = JSON.parse(jsonStr)

  expect(result.schema_version).toBe("1.1")
  expect(result.company.name).toBe("Netflix")
  expect(result.job.title).toBe("Senior UI Engineer")
  expect(result.source.external_id).toBe("netflix-9988")
  expect(result.description).toBe("Scale streaming interfaces")
})


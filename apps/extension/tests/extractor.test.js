// JobQuest Capture Extension — Extractor Unit Tests

import { test } from "vitest"
import assert from "node:assert/strict"
import fs from "node:fs"
import { parseHTML } from "linkedom"

import { extractJsonLd } from "../extractors/jsonld.js"
import { extractGreenhouse } from "../extractors/greenhouse.js"
import { extractLever } from "../extractors/lever.js"
import { extractGeneric } from "../extractors/generic.js"
import { extractHiringCafe } from "../extractors/hiringcafe.js"
import { extractDice } from "../extractors/dice.js"
import { extractLinkedIn } from "../extractors/linkedin.js"
import { extractJobPosting } from "../extractors/index.js"

import { fileURLToPath } from "node:url"

function loadFixture(filename) {
  const filePath = fileURLToPath(new URL(`../fixtures/${filename}`, import.meta.url))
  const html = fs.readFileSync(filePath, "utf-8")
  const { document } = parseHTML(html)
  return document
}

test("JSON-LD extractor: accurately extracts structured schema.org JobPosting", () => {
  const doc = loadFixture("jsonld_job.html")
  const result = extractJsonLd(doc, "https://stripe.com/jobs/12345")

  assert.ok(result, "Result should not be null")
  assert.equal(result.jobTitle, "Staff Software Engineer")
  assert.equal(result.company, "Stripe")
  assert.equal(result.location, "South San Francisco, CA, US")
  assert.equal(result.workArrangement, "Remote")
  assert.equal(result.employmentType, "Full-time")
  assert.equal(result.salaryMin, 195000)
  assert.equal(result.salaryMax, 255000)
  assert.equal(result.salaryCurrency, "USD")
  assert.ok(result.salaryRange.includes("195,000"))
  assert.ok(result.description.includes("Stripe Billing"))
  assert.equal(result.confidence, "jsonld")
})
test("Greenhouse extractor: parses Greenhouse DOM selectors correctly", () => {
  const doc = loadFixture("greenhouse_job.html")
  const result = extractGreenhouse(
    doc,
    "https://boards.greenhouse.io/acmecorp/jobs/98765",
  )

  assert.ok(result, "Result should not be null")
  assert.equal(result.jobTitle, "Senior Frontend Engineer")
  assert.equal(result.company, "Acme Corporation")
  assert.equal(result.location, "San Francisco, CA (Hybrid)")
  assert.equal(result.workArrangement, "Hybrid")
  assert.ok(result.description.includes("build web applications"))
  assert.equal(result.source, "Greenhouse")
  assert.equal(result.confidence, "ats_greenhouse")
})

test("Lever extractor: parses Lever DOM selectors correctly", () => {
  const doc = loadFixture("lever_job.html")
  const result = extractLever(
    doc,
    "https://jobs.lever.co/globex/1111-2222-3333",
  )

  assert.ok(result, "Result should not be null")
  assert.equal(result.jobTitle, "Data Platform Engineer")
  assert.equal(result.company, "Globex Industries")
  assert.equal(result.location, "New York, NY")
  assert.equal(result.workArrangement, "Remote")
  assert.equal(result.employmentType, "Full-time")
  assert.ok(result.description.includes("streaming infrastructure"))
  assert.equal(result.source, "Lever")
  assert.equal(result.confidence, "ats_lever")
})

test("Generic extractor: handles non-job pages gracefully without fabricating data", () => {
  const doc = loadFixture("no_data_job.html")
  const result = extractGeneric(doc, "https://blog.example.com/posts/cloud-trends")

  assert.ok(result, "Result should not be null")
  assert.equal(result.salaryMin, null, "Salary must remain null when not present")
  assert.equal(result.salaryMax, null, "Salary must remain null when not present")
  assert.equal(result.salaryRange, "")
  assert.equal(result.workArrangement, "")
  assert.equal(result.confidence, "generic")
})

test("Orchestrator: cascades through priorities and returns clean capture object", () => {
  const jsonLdDoc = loadFixture("jsonld_job.html")
  const captured = extractJobPosting(
    jsonLdDoc,
    "https://stripe.com/jobs/12345?utm_source=linkedin",
  )

  assert.equal(captured.jobTitle, "Staff Software Engineer")
  assert.equal(captured.company, "Stripe")
  assert.equal(captured.workArrangement, "Remote")
  assert.equal(captured.confidence, "jsonld")
  assert.equal(
    captured.jobUrl,
    "https://stripe.com/jobs/12345?utm_source=linkedin",
  )
})

test("Generic extractor: accurately parses Tensor-style employer career page (title outranks site branding)", () => {
  const doc = loadFixture("tensor_career_job.html")
  const result = extractGeneric(doc, "https://www.tensor.auto/careers/fpga-engineer")

  assert.ok(result, "Result should not be null")
  // The actual H1 role must win over the site brand <title>Tensor</title>
  assert.equal(result.jobTitle, "FPGA Engineer: ISP")
  assert.equal(result.company, "Tensor")
  assert.equal(result.employmentType, "Full-time")
  // Multi-location preservation
  assert.ok(result.location.includes("San Jose, California, US"))
  assert.ok(result.location.includes("Singapore"))
  assert.ok(result.location.includes("Dubai, UAE"))
  assert.ok(result.location.includes("Barcelona, Spain"))
  assert.ok(result.description.includes("Image Signal Processing"))
  assert.equal(result.source, "tensor.auto")
  assert.equal(result.confidence, "generic")
})

test("Generic extractor: accurately parses aggregator page with misleading metadata (job content outranks platform brand)", () => {
  const doc = loadFixture("aggregator_jobright_job.html")
  const result = extractGeneric(doc, "https://jobright.ai/jobs/info/sdet-ai-testing-12345")

  assert.ok(result, "Result should not be null")
  // Must NOT capture "Jobright: Your AI Job Search Copilot" as job title
  assert.equal(result.jobTitle, "QA Automation Engineer (SDET) AI-Enhanced Testing")
  // Must NOT capture "Jobright AI" as hiring company
  assert.equal(result.company, "GetInsured")
  assert.equal(result.location, "Mountain View, CA")
  assert.equal(result.workArrangement, "Onsite")
  assert.equal(result.employmentType, "Full-time")
  assert.equal(result.salaryMin, 120000)
  assert.equal(result.salaryMax, 140000)
  assert.equal(result.salaryCurrency, "USD")
  assert.ok(result.salaryRange.includes("$120K/yr - $140K/yr"))
  assert.ok(result.description.includes("GetInsured is seeking an experienced SDET"))
  assert.equal(result.source, "jobright.ai")
  assert.equal(result.confidence, "generic")
})

test("Generic extractor: isGenericTitle identifies marketing slogans, platform brands, and non-job text", async () => {
  const { isGenericTitle } = await import("../extractors/generic.js")

  // Generic titles
  assert.equal(isGenericTitle("Jobs"), true)
  assert.equal(isGenericTitle("Careers"), true)
  assert.equal(isGenericTitle("Open Roles"), true)
  assert.equal(isGenericTitle("Home"), true)
  assert.equal(isGenericTitle("Search Jobs"), true)
  assert.equal(isGenericTitle("About Us"), true)

  // Marketing slogans
  assert.equal(isGenericTitle("Jobright: Your AI Job Search Copilot"), true)
  assert.equal(isGenericTitle("Your AI Job Search Copilot"), true)
  assert.equal(isGenericTitle("Find your dream job with AI copilot"), true)

  // Site brand collisions
  assert.equal(isGenericTitle("Tensor", "Tensor", "tensor.auto"), true)
  assert.equal(isGenericTitle("Jobright", "Jobright", "jobright.ai"), true)

  // Legitimate job titles must NOT be flagged as generic
  assert.equal(isGenericTitle("FPGA Engineer: ISP"), false)
  assert.equal(isGenericTitle("QA Automation Engineer (SDET) AI-Enhanced Testing"), false)
  assert.equal(isGenericTitle("Senior Product Manager"), false)
  assert.equal(isGenericTitle("Staff Software Engineer"), false)
})

test("Conflict priority: credible DOM H1 outranks site-level og:title and document.title", () => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Careers at Acme Corp</title>
  <meta property="og:title" content="Acme Careers: Explore our open roles">
</head>
<body>
  <header><h1>Acme Careers</h1></header>
  <main>
    <h1>Senior Reliability Engineer</h1>
    <p class="company-name">Acme Corp</p>
  </main>
</body>
</html>`
  const { document } = parseHTML(html)
  const result = extractGeneric(document, "https://acme.com/jobs/123")

  assert.equal(result.jobTitle, "Senior Reliability Engineer")
  assert.equal(result.company, "Acme Corp")
})

test("Conflict priority: job-board / aggregator brand is NEVER treated as hiring company", () => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Cool Job - Jobright AI</title>
  <meta property="og:site_name" content="Jobright AI">
</head>
<body>
  <main>
    <h1>Site Reliability Engineer</h1>
    <!-- No company specified on page -->
  </main>
</body>
</html>`
  const { document } = parseHTML(html)
  const result = extractGeneric(document, "https://jobright.ai/jobs/sre-456")

  assert.equal(result.jobTitle, "Site Reliability Engineer")
  // Because host is jobright.ai (aggregator), company must be blank rather than Jobright AI
  assert.equal(result.company, "")
})

test("Conflict priority: hidden headings, modal headings, and navigation are ignored", () => {
  const html = `<!DOCTYPE html>
<html>
<head><title>Job Post</title></head>
<body>
  <nav><h1>Navigation Menu</h1></nav>
  <div class="modal" role="dialog"><h1>Cookie Preferences</h1></div>
  <div style="display: none"><h1>Hidden SEO Title</h1></div>
  <main>
    <article>
      <h1>Lead Security Architect</h1>
      <span class="location">Remote</span>
    </article>
  </main>
</body>
</html>`
  const { document } = parseHTML(html)
  const result = extractGeneric(document, "https://example.com/jobs/789")

  assert.equal(result.jobTitle, "Lead Security Architect")
  assert.equal(result.workArrangement, "Remote")
})

test('Stale SPA Protection: Reject mismatched job ID in JSON-LD', () => {
  const doc = loadFixture('stale_spa.html');
  const result = extractJsonLd(doc, 'https://example.com/jobs/999');
  assert.equal(result, null, 'Should return null for stale SPA page');
});

test('HiringCafe extractor: quick view', () => {
  const doc = loadFixture('hiringcafe_quick.html');
  const result = extractHiringCafe(doc, 'https://hiringcafe.com/job/123');
  assert.ok(result);
  assert.equal(result.jobTitle, 'Software Engineer');
  assert.equal(result.company, 'Cafe Corp');
});

test('Dice extractor', () => {
  const doc = loadFixture('dice_job.html');
  const result = extractDice(doc, 'https://dice.com/jobs/123');
  assert.ok(result);
  assert.equal(result.jobTitle, 'Dice Job');
  assert.equal(result.company, 'Dice Corp');
  assert.equal(result.location, 'Remote, USA');
  assert.equal(result.workArrangement, 'Remote / On-site');
  assert.deepEqual(result.skills, ['JavaScript']);
});

test('LinkedIn extractor', () => {
  const doc = loadFixture('linkedin_job.html');
  const result = extractLinkedIn(doc, 'https://linkedin.com/jobs/view/123');
  assert.ok(result);
  assert.equal(result.jobTitle, 'LinkedIn Job');
  assert.equal(result.company, 'Linked Corp');
  assert.equal(result.location, 'San Francisco, CA');
  assert.equal(result.workArrangement, 'Remote');
  assert.equal(result.employmentType, 'Full-time');
  assert.equal(result.description, 'LI description');
  assert.deepEqual(result.skills, ['TypeScript']);
});

test('JSON-LD + DOM merge', () => {
  const doc = loadFixture('jsonld_job.html');
  doc.body.innerHTML += "<main><div class='job-description'><h2>Skills</h2><ul><li>Rust</li></ul></div></main>";
  const result = extractJobPosting(doc, 'https://stripe.com/jobs/12345');
  assert.equal(result.jobTitle, 'Staff Software Engineer');
  assert.ok(result.skills.includes('Rust'));
});

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
  
  expect(result.schema_version).toBe("1.0")
  expect(result.job.title).toBe("Software Engineer")
  expect(result.company.name).toBe("Acme")
  expect(result.compensation.min).toBe(100000)
  expect(result.responsibilities).toEqual(["Code", "Test"])
  expect(result.requirements).toEqual(["Java", "SQL"])
  expect(result.skills).toEqual(["React"])
  expect(result.description).toBe("Good job")
  expect(result.capture_metadata.extractor_confidence).toBe("generic")
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
  expect(result.requirements).toEqual(["C", "D"])
  expect(result.skills).toEqual(["E"])
  expect(result.description).toBe("Manage products")
  expect(result.capture_metadata.extractor_confidence).toBe("jsonld")
})

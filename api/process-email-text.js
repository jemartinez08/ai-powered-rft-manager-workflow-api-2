import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const axios = require("axios");

// ============================
// 🔹 Helper: Normalizar texto
// ============================
function normalizeText(text = "") {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .toUpperCase()
    .trim();
}

// ============================
// 🔹 Normalizar body
// ============================
function normalizeBody(text) {
  return text
    .replace(/\u00A0/g, " ") // NBSP → espacio normal
    .replace(/[–—]/g, "-"); // dashes raros → dash normal
}

//==============================
// Get Interviewers from SharePoint List
// =============================
async function getInterviewers() {
  const response = await axios.post(process.env.FLOW_URL);
  return response.data;
}

// ============================
// 🔹 Buscar interviewer
// ============================
function extractPerson(cleanBody, label) {
  const regex = new RegExp(
    `${label}:\\s*([A-Z0-9]+)\\s*-\\s*([^\\n\\r]+?)(?=\\s+\\w+:|\\n|$)`,
    "i",
  );

  const match = cleanBody.match(regex);

  if (!match) return null;

  return {
    key: normalizeText(match[1]),
    name: normalizeText(match[2]),
  };
}

async function findPeople(body) {
  const cleanBody = normalizeBody(body);

  // 🔹 Extraer ambos
  const interviewerExtracted = extractPerson(cleanBody, "Interviewer");
  const responsibleExtracted = extractPerson(cleanBody, "Responsible");

  if (!interviewerExtracted && !responsibleExtracted) return null;

  // 🔥 Obtener lista dinámica
  const response = await getInterviewers();

  if (!Array.isArray(response)) {
    throw new Error("Invalid response from interviewers service");
  }

  const interviewersList = response;

  // 🔹 Función de matching reutilizable
  const matchPerson = (person) => {
    if (!person) return null;

    return (
      interviewersList.find(
        (i) =>
          normalizeText(i.key) === person.key ||
          normalizeText(i.name) === person.name,
      ) || null
    );
  };

  return {
    interviewer: {
      extracted: interviewerExtracted,
      matched: matchPerson(interviewerExtracted),
    },
    responsible: {
      extracted: responsibleExtracted,
      matched: matchPerson(responsibleExtracted),
    },
  };
}

// ============================
// 🔹 PDF desde markdown
// ============================
async function generatePdfFromMarkdown(markdown) {
  const { marked } = await import("marked");

  const htmlContent = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            color: #222;
          }
          h1, h2, h3 {
            color: #111;
          }
          p {
            font-size: 14px;
            line-height: 1.6;
          }
          ul {
            margin-left: 20px;
          }
          strong {
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        ${marked.parse(markdown || "<p>No content</p>")}
      </body>
    </html>
  `;

  let browser;

  if (process.env.VERCEL) {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  } else {
    const puppeteerLocal = await import("puppeteer");

    browser = await puppeteerLocal.default.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }

  try {
    const page = await browser.newPage();

    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

// ============================
// 🔹 Handler principal
// ============================
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({
        success: false,
        error: "Missing subject or body",
      });
    }

    // ============================
    // 🔹 EXTRAER RFT ID
    // ============================
    const rftMatch = subject.match(/RFT\s*(\d+)/i);
    const rftId = rftMatch ? rftMatch[1] : null;

    // ============================
    // 🔹 EXTRAER INTERVIEWER
    // ============================
    const interviewerData = await findPeople(body);

    console.log("Interviewer Data:", interviewerData);

    // ============================
    // 🔹 PROMPT LLM (nuevo)
    // ============================
    const message = `
    Return ONLY valid JSON. No explanations.

    You are an expert technical recruiter assistant.

    Analyze the following email and extract structured hiring information.

    Additionally, generate a section of recommended interview questions tailored to the role.

    Email Subject:
    ${subject}

    Email Body:
    ${body}

    Rules:
    - Extract the role information with high accuracy
    - "profile_bullets" must contain concise bullet points
    - If English level is mentioned, include it as a bullet
    - "recommended_questions" MUST be an array of strings (plain text)
    - "recommended_questions_markdown" MUST be clean Markdown
    - Include both technical and behavioral questions
    - Do NOT include any text outside the JSON

    Expected JSON format:
    {
      "role": "",
      "specialty": "",
      "competency_level": "",
      "role_taxonomy": "",
      "responsible": "",
      "profile_bullets": [
        "",
        ""
      ],
      "recommended_questions": [
        "Question: ... | Validates: ... | Strong answer: ... | Red flags: ...",
        "Question: ... | Validates: ... | Strong answer: ... | Red flags: ..."
      ],
      "recommended_questions_markdown": "# Interview Questions\n\n## Technical\n- ...\n\n## Behavioral\n- ..."
    }
    `;

    // ============================
    // 🔹 LLM CALL
    // ============================
    const response = await fetch(process.env.LLM_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: process.env.LLM_PROJECT_ID,
        message,
        enable_memory: true,
      }),
    });

    const data = await response.json();

    const llmText = data?.message || data?.response || data?.output || "";

    // ============================
    // 🔹 PARSE JSON
    // ============================
    let parsedJSON;

    try {
      parsedJSON = JSON.parse(llmText);
    } catch {
      const jsonMatch = llmText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedJSON = JSON.parse(jsonMatch[0]);
      } else {
        console.error("LLM response parsing failed. Raw response:", llmText);
        throw new Error("Invalid JSON from LLM");
      }
    }

    // ============================
    // 🔹 GENERAR PDF
    // ============================
    const markdown =
      parsedJSON.recommended_questions_markdown ||
      (parsedJSON.recommended_questions || []).map((q) => `- ${q}`).join("\n");

    const pdfBuffer = await generatePdfFromMarkdown(markdown);
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    // eliminamos markdown del response
    delete parsedJSON.recommended_questions_markdown;

    // ============================
    // 🔹 RESPUESTA FINAL
    // ============================
    return res.status(200).json({
      success: true,
      input: {
        subject,
        bodyLength: body.length,
      },
      interviewer: interviewerData.interviewer || null,
      responsible: interviewerData.responsible || null,
      rft_id: rftId,
      llm_response: parsedJSON,
      // pdf: {
      //   fileName: `RFT_${rftId || "documento"}.pdf`,
      //   contentType: "application/pdf",
      //   data: pdfBase64,
      // },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: error.message,
    });
  }
}

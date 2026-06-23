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

// Clean unnecessary spaces around colons in the text
function normalizeColons(text) {
  return text.replace(/\s*:\s*/g, " : ");
}

// Clean unnecessary spaces around dashes in the text
function normalizeDashes(text) {
  return text.replace(/\s*-\s*/g, " - ");
}

// ============================
// 🔹 Seleccionar al interviewer utilizando AI
// ============================
async function selectInterviewer(interviewers, jobDescription) {
  if (!Array.isArray(interviewers) || interviewers.length === 0) {
    throw new Error("Interviewers array is required");
  }

  if (!jobDescription) {
    throw new Error("Job description is required");
  }

  // ============================
  // 🔹 STEP 1: SANITIZE DATA
  // ============================
  const sanitizedInterviewers = interviewers.map((item, index) => ({
    id: `interviewer${index + 1}`,
    role: item.role,
    specialty: item.specialty,
  }));

  // ============================
  // 🔹 STEP 2: CREATE SAFE MAP
  // ============================
  const interviewerMap = {};
  sanitizedInterviewers.forEach((item, index) => {
    interviewerMap[item.id.toLowerCase()] = interviewers[index];
  });

  // ============================
  // 🔹 STEP 3: BUILD PROMPT
  // ============================
  const systemPrompt = `
  You are an AI specialized in selecting the most suitable technical interviewer.

  STRICT OUTPUT:
  {
    "recommended_interviewer": "interviewerX"
  }

  Return ONLY JSON.
  `;

  const interviewersText = sanitizedInterviewers
    .map((i) => `${i.id}:\n- role: ${i.role}\n- specialty: ${i.specialty}`)
    .join("\n\n");

  const message = `
  ${systemPrompt}

  INTERVIEWERS:
  ${interviewersText}

  JOB DESCRIPTION:
  ${jobDescription}
  `;

  // ============================
  // 🔹 STEP 4: CALL LLM
  // ============================
  const response = await fetch(process.env.LLM_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project_id: "69b45bc46c8418ec85cbac46",
      message,
      enable_memory: true,
    }),
  });

  const data = await response.json();
  const llmText = data?.message || data?.response || data?.output || "";

  // ============================
  // 🔹 STEP 5: PARSE JSON
  // ============================
  let parsedJSON;

  try {
    parsedJSON = JSON.parse(llmText);
  } catch {
    const jsonMatch = llmText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedJSON = JSON.parse(jsonMatch[0]);
    } else {
      console.error("LLM response parsing failed:", llmText);
      throw new Error("Invalid JSON from LLM");
    }
  }

  // ============================
  // 🔹 STEP 6: NORMALIZE ID
  // ============================
  let selectedId = parsedJSON?.recommended_interviewer;

  if (!selectedId) {
    throw new Error("LLM did not return recommended_interviewer");
  }

  // Normalización fuerte
  selectedId = selectedId
    .toLowerCase()
    .replace(/\s+/g, "") // quita espacios
    .replace(/[^a-z0-9]/g, ""); // quita símbolos

  // ============================
  // 🔹 STEP 7: MATCH
  // ============================
  const selectedInterviewer = interviewerMap[selectedId];

  if (!selectedInterviewer) {
    console.error("Invalid ID from LLM:", selectedId);
    console.error("Available IDs:", Object.keys(interviewerMap));
    throw new Error("LLM returned an unknown interviewer");
  }

  // ============================
  // 🔹 STEP 8: RETURN ORIGINAL OBJECT
  // ============================
  return selectedInterviewer;
}

// ============================
// 🔹 Buscar interviewer
// ============================
function extractPerson(cleanBody, label) {
  const regex = new RegExp(
    `${label}\\s*:\\s*([A-Z0-9]+)\\s*-\\s*([^\\n\\r]+?)(?=\\s+\\w+\\s*:|\\n|$)`,
    "i",
  );

  cleanBody = normalizeColons(cleanBody);
  cleanBody = normalizeDashes(cleanBody);

  const match = cleanBody.match(regex);

  if (!match) return null;

  return {
    key: normalizeText(match[1]),
    name: normalizeText(match[2]),
  };
}

async function findPeople(body) {
  let cleanBody = normalizeBody(body);
  cleanBody = normalizeColons(cleanBody);
  cleanBody = normalizeDashes(cleanBody);

  const interviewersFinalList = [];

  // 🔹 Extraer ambos
  const interviewerExtracted = extractPerson(cleanBody, "Interviewer");
  const responsibleExtracted = extractPerson(cleanBody, "Responsible");
  const interviewer2Extracted = extractPerson(cleanBody, "Interviewer2");

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

  let haveFoundIUnterviewer = true;

  if (interviewerExtracted && !interviewer2Extracted) {
    const matchInterviewer = matchPerson(interviewerExtracted);
    if (matchInterviewer) {
      interviewersFinalList.push({
        extracted: interviewerExtracted,
        matched: matchInterviewer,
      });

      haveFoundIUnterviewer = true;
    } else {
      haveFoundIUnterviewer = false;
    }
  } else if (interviewerExtracted && interviewer2Extracted) {
    // Buscamos entrevistadores encontrados en la lista
    const matchInterviewer = matchPerson(interviewerExtracted);
    const matchInterviewer2 = matchPerson(interviewer2Extracted);

    if (matchInterviewer || matchInterviewer2) {
      interviewersFinalList.push({
        extracted: interviewerExtracted,
        matched: matchInterviewer,
      });
      interviewersFinalList.push({
        extracted: interviewer2Extracted,
        matched: matchInterviewer2,
      });

      haveFoundIUnterviewer = true;
    } else {
      // Definimos que no se encontro interviewer, para hacer peticion al llm
      haveFoundIUnterviewer = true;
    }
  }

  if (haveFoundIUnterviewer) {
    console.log(haveFoundIUnterviewer);
  } else {
    const aiSelectedInterviewer = await selectInterviewer(
      interviewersList,
      body,
    );
    interviewersFinalList.push({
      extracted: null,
      matched: aiSelectedInterviewer,
    });
  }

  const emails = interviewersFinalList
    .map((i) => i?.matched?.email?.trim())
    .filter(Boolean);

  const names = interviewersFinalList
    .map((i) => i?.matched?.name?.trim())
    .filter(Boolean);

  console.log(emails);

  const uniqueEmails = [...new Set(emails)];
  const uniqueNames = [...new Set(names)];

  return {
    interviewer_emails: uniqueEmails,
    interviewer_emails_string: uniqueEmails.join(";"),
    interviewer_names: uniqueNames,
    interviewer_names_string: uniqueNames.join(", "),

    interviewer:
      interviewersFinalList.length > 0 ? interviewersFinalList : null,

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

    console.log("Received email with subject:", subject);

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

    // ============================
    // 🔹 PROMPT LLM (nuevo)
    // ============================
    const message = `
    Return ONLY valid JSON. No explanations. No extra text before or after.

    You are an expert technical recruiter assistant.

    Analyze the following email and extract structured hiring information.

    Additionally, generate a section of recommended interview questions tailored to the role.

    Email Subject:
    ${subject}

    Email Body:
    ${body}

    STRICT RULES:
    - Output MUST be valid JSON (RFC 8259 compliant)
    - Do NOT truncate the response
    - Do NOT leave trailing commas
    - All strings MUST use double quotes
    - Escape quotes using \\" if needed
    - Do NOT include text outside JSON

    EXTRACTION RULES:
    - Extract role with high accuracy
    - Extract specialty, competency_level, role_taxonomy
    - responsible must be concise (1–2 lines max)

    PROFILE BULLETS:
    - Must be concise
    - Include English level if present

    RECOMMENDED QUESTIONS (CRITICAL):
    - MUST be a SINGLE OBJECT (NOT an array)
    - MUST contain EXACTLY these keys:
      question1, question2, question3, question4, question5

    - EACH key MUST map to an object:

    {
      "question": "",
      "validates": "",
      "strong_answer": "",
      "red_flags": ""
    }

    CONSTRAINTS:
    - Max ~20 words per field
    - No line breaks inside values
    - Do NOT return arrays
    - Do NOT merge fields into strings
    - Do NOT change key names

    MARKDOWN SECTION:
    - "recommended_questions_markdown" MUST be valid markdown
    - Include Technical and Behavioral sections
    - Keep concise

    FINAL VALIDATION (MANDATORY):
    Before responding, ensure:
    - JSON is complete and valid
    - No missing quotes
    - No trailing commas
    - recommended_questions has EXACTLY 5 keys (question1–question5)
    - Each contains all required fields
    - Can be parsed by JSON.parse()

    EXPECTED OUTPUT:
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
      "recommended_questions": {
        "question1": {
          "question": "",
          "validates": "",
          "strong_answer": "",
          "red_flags": ""
        }
      },
      "recommended_questions_markdown": "# Interview Questions\\n\\n## Technical\\n- ...\\n\\n## Behavioral\\n- ..."
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

    const responseBody = JSON.parse(await response.text());

    const dataResponse = responseBody;

    const parsedResponse = JSON.parse(dataResponse.response);

    const llmText = parsedResponse;

    console.log("LLM Text", llmText);

    // ============================
    // 🔹 PARSE JSON
    // ============================
    let parsedJSON;

    try {
      parsedJSON = llmText;
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
      interviewers: interviewerData || null,
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

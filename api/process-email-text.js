import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

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
// 🔹 Diccionario entrevistadores
// ============================
const interviewersDict = [
  {
    name: "Victor Hugo Ugalde Ruiz",
    email: "alguien@example.com",
    key: "VHUR",
  },
  {
    name: "Jesus Emmanuel Martinez Garcia",
    email: "je.martinez@softtek.com",
    key: "JEMG",
  },
  {
    name: "Leonel Navarro Segura",
    email: "leonel.navarro@softtek.com",
    key: "LNS",
  },
];

// ============================
// 🔹 Buscar interviewer
// ============================
function findInterviewer(body) {
  const match = body.match(/Interviewer:\s*([A-Z]+)\s*-\s*([^\n\r]+)/i);

  if (!match) return null;

  const keyRaw = match[1];
  const nameRaw = match[2];

  const key = normalizeText(keyRaw);
  const name = normalizeText(nameRaw);

  const found = interviewersDict.find(
    (i) => normalizeText(i.key) === key || normalizeText(i.name) === name,
  );

  return {
    extracted: {
      key,
      name,
    },
    matched: found || null,
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
    const interviewerData = findInterviewer(body);

    // ============================
    // 🔹 PROMPT LLM (nuevo)
    // ============================
    const message = `
Return ONLY valid JSON. No explanations.

Email Subject:
${subject}

Email Body:
${body}

Expected JSON format:
{
  "role": "",
  "specialty": "",
  "competency_level": "",
  "role_taxonomy": "",
  "responsible": "",
  "profile_bullets": [],
  "recommended_questions": "Markdown formatted interview questions"
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
        throw new Error("Invalid JSON from LLM");
      }
    }

    // ============================
    // 🔹 GENERAR PDF
    // ============================
    const markdown = parsedJSON.recommended_questions || "";

    const pdfBuffer = await generatePdfFromMarkdown(markdown);
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    // eliminamos markdown del response
    delete parsedJSON.recommended_questions;

    // ============================
    // 🔹 RESPUESTA FINAL
    // ============================
    return res.status(200).json({
      success: true,
      input: {
        subject,
        bodyLength: body.length,
      },
      interviewer:
        interviewerData?.matched || interviewerData?.extracted || null,
      rft_id: rftId,
      llm_response: parsedJSON,
      pdf: {
        fileName: `RFT_${rftId || "documento"}.pdf`,
        contentType: "application/pdf",
        data: pdfBase64,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: error.message,
    });
  }
}

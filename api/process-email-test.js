import mammoth from "mammoth";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { subject, body, file } = req.body;

    if (!subject || !body || !file) {
      return res.status(400).json({
        success: false,
        error: "Missing subject, body or file",
      });
    }

    // ---------------------------
    // 🧠 NORMALIZACIÓN BODY
    // ---------------------------
    const normalizedBody = body
      .replace(/\r\n/g, "\n")
      .replace(/\t/g, " ")
      .trim();

    // ---------------------------
    // 🧠 REGEX PARSING EMAIL
    // ---------------------------

    // RFT ID
    const rftMatch = subject.match(/RFT[\s\-_:]*?(\d{4,})/i);
    const rftNumber = rftMatch ? rftMatch[1] : null;

    // Candidate
    const candidateMatch = normalizedBody.match(
      /Candidate(?:\s*name)?\s*:\s*([^\n\r]+)/i,
    );
    const candidateName = candidateMatch ? candidateMatch[1].trim() : null;

    // Role (NUEVO)
    const roleMatch = normalizedBody.match(/Role\s*:\s*([^\n\r]+)/i);
    const role = roleMatch ? roleMatch[1].trim() : null;

    // Recommendation
    const recommendationMatch = normalizedBody.match(
      /Recommendation\s*:\s*([^\n\r]+)/i,
    );
    const recommendation = recommendationMatch
      ? recommendationMatch[1].trim()
      : null;

    // Notes
    const notesMatch = normalizedBody.match(
      /Notas?(?:\s+u\s+observaciones.*)?\s*:\s*([\s\S]*)/i,
    );

    let interviewerNotes = notesMatch ? notesMatch[1].trim() : null;

    if (interviewerNotes) {
      interviewerNotes = interviewerNotes
        .split(/\n[A-Z][a-zA-Z\s]+:/)[0]
        .trim();
    }

    const isValidForWorkflow =
      !!rftNumber && !!candidateName && !!recommendation;

    // ---------------------------
    // 📄 DOCX → TEXT
    // ---------------------------

    const buffer = Buffer.from(file, "base64");
    const result = await mammoth.extractRawText({ buffer });
    let text = result.value;

    text = text
      .replace(/\r\n/g, "\n")
      .replace(/Transcripci[oó]n/gi, "")
      .replace(/\d{1,2} de .*? \d{4},.*?\n/gi, "")
      .replace(/\n{2,}/g, "\n")
      .trim();

    // ---------------------------
    // 🧠 PARSEO CONVERSACIÓN
    // ---------------------------

    const segments = text.split(
      /(?=[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s]+?\s+\d{1,2}:\d{2})/,
    );

    const conversation = [];
    const speakerMap = {};
    let speakerIndex = 0;

    function getSpeaker(name) {
      name = name.trim();
      if (!speakerMap[name]) {
        speakerMap[name] = speakerIndex === 0 ? "I" : "C";
        speakerIndex++;
      }
      return speakerMap[name];
    }

    for (let segment of segments) {
      const match = segment.match(
        /^([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s]+?)\s+(\d{1,2}:\d{2})(.*)$/s,
      );

      if (!match) continue;

      let [, name, , content] = match;
      let speaker = getSpeaker(name);

      let cleaned = content
        .replace(/\d{1,2}:\d{2}/g, "")
        .replace(/\b(este|bueno|o sea|eh|mmm|ajá|pues)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (cleaned.length < 20) continue;

      conversation.push({ s: speaker, t: cleaned });
    }

    const cleanText = conversation
      .map((entry) => `${entry.s}: ${entry.t}`)
      .join(" ");

    // ---------------------------
    // 🤖 LLM (MEJORADO)
    // ---------------------------

    function smartTrim(text, maxLength) {
      if (text.length <= maxLength) return text;

      let trimmed = text.substring(0, maxLength);

      // corta en último punto o salto de línea
      const lastBreak = Math.max(
        trimmed.lastIndexOf("."),
        trimmed.lastIndexOf("\n"),
      );

      if (lastBreak > 0) {
        return trimmed.substring(0, lastBreak);
      }

      return trimmed;
    }

    const trimmedTranscript = smartTrim(cleanText, 9000);

    const llmPayload = `
    Role: ${role || "Unknown"}

    Transcript:
    ${trimmedTranscript}
    `;

    const llmResponse = await fetch(process.env.LLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        project_id: process.env.LLM_PROJECT_ID_INTERVIEWS,
        message: JSON.stringify(llmPayload),
      }),
    });

    const llmRaw = await llmResponse.json();

    console.log("LLM RAW RESPONSE:", llmRaw);

    // 🔥 Parse seguro del JSON del LLM
    let llmParsed;
    try {
      llmParsed = JSON.parse(llmRaw.response);
    } catch (e) {
      throw new Error("LLM did not return valid JSON");
    }

    const safeLLM = {
      InterviewRole: llmParsed.InterviewRole || role || "Unknown",
      overalScore: llmParsed.overalScore || "0",
      justification: llmParsed.justification || "No justification provided",
      ai_recommendation: llmParsed.ai_recommendation || "No Hire",
    };

    // ---------------------------
    // 📁 PDF
    // ---------------------------

    async function generatePdfFromMarkdown(markdown) {
      const { marked } = await import("marked");

      const htmlContent = `
        <html>
          <body>
            ${marked.parse(markdown || "<p>No content</p>")}
          </body>
        </html>
      `;

      let browser;

      if (process.env.VERCEL) {
        browser = await puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        });
      } else {
        const puppeteerLocal = await import("puppeteer");
        browser = await puppeteerLocal.default.launch({
          headless: "new",
        });
      }

      try {
        const page = await browser.newPage();
        await page.setContent(htmlContent);
        return await page.pdf({ format: "A4" });
      } finally {
        await browser.close();
      }
    }

    const pdfBuffer = await generatePdfFromMarkdown(llmParsed.markdownText);

    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    // ---------------------------
    // 🚀 RESPONSE FINAL
    // ---------------------------

    return res.status(200).json({
      success: true,

      emailParsed: {
        rftNumber,
        candidateName,
        recommendation,
        interviewerNotes,
        isValidForWorkflow,
      },

      pdf: {
        fileName: `Interview AI Analysis - RFT - ${rftNumber || "documento"}.pdf`,
        contentType: "application/pdf",
        data: pdfBase64,
      },

      llm: safeLLM,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: error.message,
    });
  }
}

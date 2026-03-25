import mammoth from "mammoth";

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { json } from "body-parser";

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
    const { subject, body, file } = req.body;

    if (!subject || !body || !file) {
      return res.status(400).json({
        success: false,
        error: "Missing subject, body or file",
      });
    }

    // base64 → buffer
    const buffer = Buffer.from(file, "base64");

    // extraer texto
    const result = await mammoth.extractRawText({ buffer });
    let text = result.value;

    // ---------------------------
    // 🧹 PRE-LIMPIEZA GLOBAL
    // ---------------------------

    text = text
      .replace(/\r\n/g, "\n")
      .replace(/Transcripci[oó]n/gi, "")
      .replace(/\d{1,2} de .*? \d{4},.*?\n/gi, "")
      .replace(/\n{2,}/g, "\n")
      .trim();

    // ---------------------------
    // 🧠 PARSEO
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
        .replace(/\b(o\s?k|okey|okay)\b/gi, "ok")
        .replace(
          /\b(este|bueno|o sea|eh|mmm|ajá|pues|entonces|literalmente|básicamente)\b/gi,
          "",
        )
        .replace(
          /\b(no te preocupes|vamos empezando|cuéntame un poquito|claro)\b/gi,
          "",
        )
        .replace(/\b(ok|yeah)\b/gi, "")
        .replace(/\b(\w+)\s+\1\b/gi, "$1")
        .replace(/\b(\w+)(,\s*\1)+/gi, "$1")
        .replace(/\b(\w+\s+\w+)\s+\1\b/gi, "$1")
        .replace(/\b(la|el|los|las)\s+(la|el|los|las)\b/gi, "$2")
        .replace(/[.,]\s*[.,]+/g, ".")
        .replace(/[.,]{2,}/g, ".")
        .replace(/\.\s+\./g, ".")
        .replace(/,\s*,+/g, ",")
        .replace(/\s+,/g, ",")
        .replace(/,\s+/g, ", ")
        .replace(/^[.,\s]+/, "")
        .replace(/\s+/g, " ")
        .trim();

      if (
        cleaned.length < 20 ||
        /^[^a-zA-Z0-9]+$/.test(cleaned) ||
        /^(ok|yeah|sí|no|vale|así es|correcto)$/i.test(cleaned)
      )
        continue;

      conversation.push({
        s: speaker,
        t: cleaned,
      });
    }

    // ---------------------------
    // 🧱 TEXTO LIMPIO
    // ---------------------------

    const cleanText = conversation
      .map((entry) => `${entry.s}: ${entry.t}`)
      .join(" ");

    // ---------------------------
    // ✂️ TRIM
    // ---------------------------

    const MAX_CHARS = 10000;
    let trimmedText = cleanText;

    if (cleanText.length > MAX_CHARS) {
      const excess = cleanText.length - MAX_CHARS;
      const cutStart = Math.floor(excess / 2);
      const cutEnd = excess - cutStart;

      trimmedText = cleanText.substring(cutStart, cleanText.length - cutEnd);
    }

    // ---------------------------
    // 🤖 LLAMADA AL LLM
    // ---------------------------

    console.log("env" + process.env.LLM_PROJECT_ID_INTERVIEWS);

    const llmResponse = await fetch(process.env.LLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        project_id: process.env.LLM_PROJECT_ID_INTERVIEWS,
        message: trimmedText,
        enable_memory: true,
      }),
    });

    const llmData = await llmResponse.json();

    // ---------------------------
    // 📁 PDF
    // ---------------------------

    async function generatePdfFromMarkdown(markdown) {

      const { marked } = await import("marked"); // ✅ aquí sí funciona

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

    // ---------------------------
    // 📄 GENERAR PDF
    // ---------------------------

    // Ajusta esto dependiendo de cómo venga tu LLM
    const markdown = llmData.response;

    console.log("Markdown length:", markdown.length);
    console.log("Markdown preview:", markdown.slice(0, 200));

    const pdfBuffer = await generatePdfFromMarkdown(markdown);
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    // ---------------------------
    // 📅 FECHA
    // ---------------------------

    const dateRegex =
      /\b\d{1,2} de [a-zA-Z]+ de \d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/;

    const dateMatch = text.match(dateRegex);
    const extractedDate = dateMatch ? dateMatch[0] : null;

    // ---------------------------
    // 🚀 RESPONSE FINAL
    // ---------------------------

    if (req.query.mode === "binary") {
      const finalBuffer = Buffer.from(pdfBuffer);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'inline; filename="resultado.pdf"');

      return res.status(200).send(finalBuffer);
    }

    // Default: JSON (Power Automate)
    return res.status(200).json({
      success: true,
      transcription: {
        date: extractedDate,
      },
      cleaned: {
        charSize: trimmedText.length,
      },
      pdf: {
        fileName: "resultado.pdf",
        contentType: "application/pdf",
        data: pdfBase64,
      },
      llm: llmData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: error.message,
    });
  }
}

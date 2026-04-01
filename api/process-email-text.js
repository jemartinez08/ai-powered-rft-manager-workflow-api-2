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
    name: "Jesus Emmanuel Martinez Garcia",
    email: "je.martinez@softtek.com",
    key: "JEMG",
  },
  {
    // ADPA1	Alberto de Jesus Paredes Aguilar	alberto.paredes@softtek.com
    name: "Alberto de Jesus Paredes Aguilar",
    email: "alberto.paredes@softtek.com",
    key: "ADPA1",
  },
  {
    // AGCB	Alvaro Gabriel Cortez Baños	alvaro.cortez@softtek.com
    name: "Alvaro Gabriel Cortez Baños",
    email: "alvaro.cortez@softtek.com",
    key: "AGCB",
  },
  {
    // AR1	Anjappa R	anjappa.r@softtek.com
    name: "Anjappa R",
    email: "anjappa.r@softtek.com",
    key: "AR1",
  },
  {
    // ARL2	Ariel Lara Pedraza	ariel.lara@softtek.com
    name: "Ariel Lara Pedraza",
    email: "ariel.lara@softtek.com",
    key: "ARL2",
  },
  {
    // CAML3	Carlos Alejandro Martínez López	carlos.martinezl@softtek.com
    name: "Carlos Alejandro Martínez López",
    email: "carlos.martinezl@softtek.com",
    key: "CAML3",
  },
  {
    // CAMR7	Cesar Armando Martinez Retama	cesar.martinezr@softtek.com
    name: "Cesar Armando Martinez Retama",
    email: "cesar.martinezr@softtek.com",
    key: "CAMR7",
  },
  {
    // CHKS	Chethan K	ckrishnashetty@softtek.com
    name: "Chethan K",
    email: "ckrishnashetty@softtek.com",
    key: "CHKS",
  },
  {
    // DNRA	Daniel Alberto Romo Alonso	daniel.romo@softtek.com
    name: "Daniel Alberto Romo Alonso",
    email: "daniel.romo@softtek.com",
    key: "DNRA",
  },
  {
    // DAVN1	Diana Alejandra Villar Nava	diana.villar@softtek.com
    name: "Diana Alejandra Villar Nava",
    email: "diana.villar@softtek.com",
    key: "DAVN1",
  },
  {
    // DIRF	Diana Angélica Cecilia Rodriguez Flores	dianaa.rodriguez@softtek.com
    name: "Diana Angélica Cecilia Rodriguez Flores",
    email: "dianaa.rodriguez@softtek.com",
    key: "DIRF",
  },
  {
    // EAMM4	Edith Alhelí Martínez Mata	editha.martinez@softtek.com
    name: "Edith Alhelí Martínez Mata",
    email: "editha.martinez@softtek.com",
    key: "EAMM4",
  },
  {
    // EBRM	Enrique Barba Ramírez	enrique.barba@softtek.com
    name: "Enrique Barba Ramírez",
    email: "enrique.barba@softtek.com",
    key: "EBRM",
  },
  {
    // HDMF	Héctor Darío Medina Franco	hector.medina@softtek.com
    name: "Héctor Darío Medina Franco",
    email: "hector.medina@softtek.com",
    key: "HDMF",
  },
  {
    // HESM	Hector Enrique Seañez Medina	hector.seanez@softtek.com
    name: "Hector Enrique Seañez Medina",
    email: "hector.seanez@softtek.com",
    key: "HESM",
  },
  {
    // JNAO	Juan Antonio Alonso Ordoñez	juan.alonso@softtek.com
    name: "Juan Antonio Alonso Ordoñez",
    email: "juan.alonso@softtek.com",
    key: "JNAO",
  },
  {
    // JNMM	Julio Noe Maldonado Martinez	julio.maldonado@softtek.com
    name: "Julio Noe Maldonado Martinez",
    email: "julio.maldonado@softtek.com",
    key: "JNMM",
  },
  {
    // LEMZ	Laura Elena Medina Zermeño	laura.medina@softtek.com
    name: "Laura Elena Medina Zermeño",
    email: "laura.medina@softtek.com",
    key: "LEMZ",
  },
  {
    // LENS	Leonel Navarro	leonel.navarro@softtek.com
    name: "Leonel Navarro",
    email: "leonel.navarro@softtek.com",
    key: "LENS",
  },
  {
    // LALH 	Luis Alberto Leyva 	luisa.leyva@softtek.com
    name: "Luis Alberto Leyva",
    email: "luisa.leyva@softtek.com",
    key: "LALH",
  },
  {
    // LJHO	Luis Javier Hernández Ortiz	luis.hernandez@softtek.com
    name: "Luis Javier Hernández Ortiz",
    email: "luis.hernandez@softtek.com",
    key: "LJHO",
  },
  {
    // MGLL	Maria Guadalupe Lopez Lopez	mariag.lopez@softtek.com
    name: "Maria Guadalupe Lopez Lopez",
    email: "mariag.lopez@softtek.com",
    key: "MGLL",
  },
  {
    // MISL	Martha Isabel Salgado Landeros	martha.salgado@softtek.com
    name: "Martha Isabel Salgado Landeros",
    email: "martha.salgado@softtek.com",
    key: "MISL",
  },
  {
    // MHEG2	Miguel Hernandez Guevara	m.hernandez@softtek.com
    name: "Miguel Hernandez Guevara",
    email: "m.hernandez@softtek.com",
    key: "MHEG2",
  },
  {
    // MPMC	Miguel Perez Milicua	miguel.milicua@softtek.com
    name: "Miguel Perez Milicua",
    email: "miguel.milicua@softtek.com",
    key: "MPMC",
  },
  {
    // MVAM1	Miguel Vazquez Martin del Campo	miguel.vazquezm@softtek.com
    name: "Miguel Vazquez Martin del Campo",
    email: "miguel.vazquezm@softtek.com",
    key: "MVAM1",
  },
  {
    // MHA1	Mohsin Hafeez	mohsin.hafeez@softtek.com
    name: "Mohsin Hafeez",
    email: "mohsin.hafeez@softtek.com",
    key: "MHA1",
  },
  {
    // PBLR	Pablo Alberto Loyola Romero	pablo.loyola@softtek.com
    name: "Pablo Alberto Loyola Romero",
    email: "pablo.loyola@softtek.com",
    key: "PBLR",
  },
  {
    // RGCH	Rangarao Chaganti	rangarao.chaganti@softtek.com
    name: "Rangarao Chaganti",
    email: "rangarao.chaganti@softtek.com",
    key: "RGCH",
  },
  {
    // RAFP1	Roberto Alejandro Farfan Peña	robertoa.farfan@softtek.com
    name: "Roberto Alejandro Farfan Peña",
    email: "robertoa.farfan@softtek.com",
    key: "RAFP1",
  },
  {
    // RERH	Roberto Erandi Rosas Huerta	roberto.rosas@softtek.com
    name: "Roberto Erandi Rosas Huerta",
    email: "roberto.rosas@softtek.com",
    key: "RERH",
  },
  {
    // RURM1	Roberto Ulises Rodríguez Miranda	robertou.rodriguez@softtek.com
    name: "Roberto Ulises Rodríguez Miranda",
    email: "robertou.rodriguez@softtek.com",
    key: "RURM1",
  },
  {
    // SART	Samuel Ramirez Tepetate	samuel.ramirez@softtek.com
    name: "Samuel Ramirez Tepetate",
    email: "samuel.ramirez@softtek.com",
    key: "SART",
  },
  {
    // SNCM	Sebastian Noe Contreras	sebastian.contreras@softtek.com
    name: "Sebastian Noe Contreras",
    email: "sebastian.contreras@softtek.com",
    key: "SNCM",
  },
  {
    // SHP1	Shabnam Panda	shabnam.panda@softtek.com
    name: "Shabnam Panda",
    email: "shabnam.panda@softtek.com",
    key: "SHP1",
  },
];

// ============================
// 🔹 Normalizar body
// ============================
function normalizeBody(text) {
  return text
    .replace(/\u00A0/g, " ") // NBSP → espacio normal
    .replace(/[–—]/g, "-"); // dashes raros → dash normal
}

// ============================
// 🔹 Buscar interviewer
// ============================
function findInterviewer(body) {
  const cleanBody = normalizeBody(body);

  const match = cleanBody.match(/Interviewer:\s*([A-Z0-9]+)\s*-\s*([^\n\r]+)/i);

  if (!match) return null;

  const keyRaw = match[1];
  const nameRaw = match[2];

  const key = normalizeText(keyRaw);
  const name = normalizeText(nameRaw);

  const found = interviewersDict.find(
    (i) => normalizeText(i.key) === key || normalizeText(i.name) === name,
  );

  return {
    extracted: { key, name },
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
      "profile_bullets": [],
      "recommended_questions": [],
      "recommended_questions_markdown": ""
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

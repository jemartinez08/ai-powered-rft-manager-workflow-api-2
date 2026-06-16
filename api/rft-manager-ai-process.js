// Archivo final: handler simple que delega toda la extracción al LLM.
// - No hay generación de PDF/markdown ni lógica de búsqueda local.
// - Entrada y salida mantienen la forma original.

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res
        .status(400)
        .json({ success: false, error: "Missing subject or body" });
    }

    // Extraer RFT id (igual que antes)
    const rftMatch = subject.match(/RFT\s*(\d+)/i);
    const rftId = rftMatch ? rftMatch[1] : null;

    // Construir prompt: enviamos subject y body completos al LLM y
    // esperamos el JSON final en la respuesta. Incluimos aquí la
    // estructura JSON exacta que esperamos para forzar una respuesta
    // que cumpla la forma requerida. RESPONDER SOLO CON JSON VÁLIDO.
    const message = `
        Return ONLY valid JSON. No explanations or extra text.

        You will receive an email subject and body. Build and return the
        final JSON object that this endpoint should include in the
        "llm_response" field. The JSON MUST match EXACTLY the following
        structure (valid RFC8259 JSON) and you must RETURN ONLY that JSON
        object without any additional text:

        EXPECTED_JSON_SCHEMA:
        {
        "role": "",
        "specialty": "",
        "competency_level": "",
        "role_taxonomy": "",
        "responsible": "",
        "profile_bullets": ["", ""],
        "recommended_questions": {
            "question1": {"question":"","validates":"","strong_answer":"","red_flags":""},
            "question2": {"question":"","validates":"","strong_answer":"","red_flags":""},
            "question3": {"question":"","validates":"","strong_answer":"","red_flags":""},
            "question4": {"question":"","validates":"","strong_answer":"","red_flags":""},
            "question5": {"question":"","validates":"","strong_answer":"","red_flags":""}
        },
        "recommended_questions_markdown": "",
        "interviewer_emails": [],
        "interviewer_emails_string": "",
        "interviewer_names": [],
        "interviewer_names_string": "",
        "interviewer": null
        }

        Email Subject:
        ${subject}

        Email Body:
        ${body}
        `;

    const response = await fetch(process.env.LLM_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: process.env.LLM_INTERVIEWER_SELECTOR,
        message,
        enable_memory: true,
      }),
    });

    console.log({
      project_id: process.env.LLM_INTERVIEWER_SELECTOR,
      message,
      enable_memory: true,
    });

    const data = await response.json();
    const llmText = data?.message || data?.response || data?.output || "";

    let parsedJSON;
    try {
      parsedJSON = JSON.parse(llmText);
    } catch {
      const jsonMatch = llmText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsedJSON = JSON.parse(jsonMatch[0]);
      else {
        console.error("LLM response parsing failed. Raw response:", llmText);
        throw new Error("Invalid JSON from LLM");
      }
    }

    return res.status(200).json({
      success: true,
      input: { subject, bodyLength: body.length },
      interviewers: parsedJSON.interviewer || null,
      responsible: parsedJSON.responsible || null,
      rft_id: rftId,
      llm_response: parsedJSON,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Server error", details: error.message });
  }
}

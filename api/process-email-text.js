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
    // 🔹 Prompt para el LLM
    // ============================
    const message = `
        Return ONLY valid JSON. No explanations.

        Email Subject:
        ${subject}

        Email Body:
        ${body}

        Expected JSON format:
        {
        "category": "",
        "priority": "",
        "summary": "",
        "action_required": true
        }
    `;

    // ============================
    // 🔹 Llamada a TU API LLM
    // ============================
    const response = await fetch(process.env.LLM_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: process.env.LLM_PROJECT_ID,
        // conversation_id: process.env.LLM_CONVERSATION_ID,
        message: message,
        enable_memory: true,
      }),
    });

    const data = await response.json();

    // ============================
    // 🔹 Ajusta esto según tu API
    // ============================
    const llmText =
      data?.message || // si tu API regresa { message: "..." }
      data?.response || // fallback común
      data?.output || // otro posible formato
      "";

    // ============================
    // 🔹 Parseo robusto de JSON
    // ============================
    let parsedJSON;

    try {
      parsedJSON = JSON.parse(llmText);
    } catch (err) {
      const jsonMatch = llmText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        parsedJSON = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("LLM did not return valid JSON");
      }
    }

    // ============================
    // 🔹 Respuesta final
    // ============================
    return res.status(200).json({
      success: true,
      input: {
        subject,
        bodyLength: body.length,
      },
      llm_response: parsedJSON,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: error.message,
    });
  }
}

import mammoth from "mammoth";

export default async function handler(req, res) {
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

    // convertir base64 → buffer
    const buffer = Buffer.from(file, "base64");

    // extraer texto del docx
    const result = await mammoth.extractRawText({ buffer });

    const text = result.value;

    // buscar fecha en el texto
    const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;
    const dateMatch = text.match(dateRegex);

    const extractedDate = dateMatch ? dateMatch[0] : null;

    console.log("Extracted Text:", text.substring(0, 500) + "..."); // mostrar solo los primeros 500 caracteres
    console.log("Extracted Date:", extractedDate);

    return res.status(200).json({
      success: true,
      receivedData: {
        subject,
        bodyLength: body.length,
        fileSizeBytes: buffer.length,
      },
      transcription: {
        date: extractedDate,
        text: text.substring(0, 500) + "...", // mostrar solo los primeros 500 caracteres
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

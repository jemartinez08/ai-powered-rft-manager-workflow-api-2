export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { subject, body, image } = req.body;

    // Validación básica
    if (!subject || !body) {
      return res.status(400).json({
        success: false,
        error: "Missing subject or body",
      });
    }

    // Verificación del attachment (opcional)
    let imageInfo = {
      received: false,
      format: null,
      sizeBytes: 0,
    };

    if (image) {
      // verificar que parece base64
      const isBase64 = typeof image === "string" && image.length > 50;

      if (isBase64) {
        const buffer = Buffer.from(image, "base64");

        imageInfo = {
          received: true,
          format: "base64",
          sizeBytes: buffer.length,
        };
      } else {
        imageInfo = {
          received: true,
          format: "unknown",
          sizeBytes: 0,
        };
      }
    }

    // Respuesta simulada de análisis
    const analysis = {
      summary: "Correo analizado correctamente",
      priority: "High",
      destinationEmail: "destino@empresa.com",
    };

    return res.status(200).json({
      success: true,
      receivedData: {
        subject,
        bodyLength: body.length,
        image: imageInfo,
      },
      analysis,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: error.message,
    });
  }
}

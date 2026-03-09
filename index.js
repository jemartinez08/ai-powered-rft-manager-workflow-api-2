const express = require("express");
const app = express();

app.use(express.json({ limit: "10mb" }));

app.post("/process-email", async (req, res) => {
  const { subject, body, image } = req.body;

  console.log("Received email:");
  console.log("Subject:", subject);
  console.log("Body:", body);
  console.log("Image size (bytes):", image ? Buffer.from(image, "base64").length : "No image");

  // Procesamiento
  const analysis = {
    summary: "Correo analizado correctamente",
    priority: "High",
    destinationEmail: "destino@empresa.com",
  };

  res.json({
    success: true,
    subject: subject,
    analysis: analysis,
  });
});

app.listen(3000, () => {
  console.log("API running");
});

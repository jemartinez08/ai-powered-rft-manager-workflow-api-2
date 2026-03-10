const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.post("/", async (req, res) => {
  const { subject, body, image } = req.body;

  console.log("Received email:");
  console.log("Subject:", subject);
  console.log("Body:", body);
  console.log(
    "Image size (bytes):",
    image ? Buffer.from(image, "base64").length : "No image"
  );

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

module.exports = app;
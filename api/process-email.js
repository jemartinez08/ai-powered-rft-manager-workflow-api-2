export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subject, body, image } = req.body;

  const analysis = {
    summary: "Correo analizado correctamente",
    priority: "High",
    destinationEmail: "destino@empresa.com",
  };

  res.status(200).json({
    success: true,
    subject,
    analysis
  });
}
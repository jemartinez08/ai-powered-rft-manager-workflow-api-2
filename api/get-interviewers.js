const axios = require("axios");

async function getInterviewers() {
  console.log("URL", process.env.FLOW_URL);
  const response = await axios.post(process.env.FLOW_URL);
  return response.data;
}

export default async function handler(req, res) {
  try {
    const interviewers = await getInterviewers();
    return res.status(200).json({ success: true, interviewers });
  } catch (error) {
    console.error("Error fetching interviewers:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch interviewers" });
  }
}

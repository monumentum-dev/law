const express = require("express");
const { createClient } = require("@sanity/client");
const app = express();
require("dotenv").config(); // Load environment variables from .env file

const port = 3000;

const sanity = createClient({
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET,
    useCdn: false,
    apiVersion: "2023-01-01",
  });


// Endpoint для проверки сервера
app.get("/ping", (req, res) => {
  res.json({ message: "Server is running! 🚀" });
});

// Endpoint для получения событий
app.get("/events", async (req, res) => {
    try {
      const query = `*[_type == "events"] { 
        title,
        date,
        description,
        backgroundImages,
        mapLink,
        category,
        attendees[]->{
          name,
          academicTitle,
          photoUrl
        }
      }`;
      
      const events = await sanity.fetch(query);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });
  
  // Запуск сервера
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
  

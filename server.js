const express = require("express");
const { createClient } = require("@sanity/client");
const app = express();
require("dotenv").config(); // Load environment variables from .env file
const multer = require("multer");
const twilio = require("twilio");
const cors = require("cors");
const session = require("express-session");
const crypto = require("crypto");

const port = 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(session({ secret: "secret-key", resave: false, saveUninitialized: true }));

const sanity = createClient({
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET,
    useCdn: false,
    apiVersion: "2023-01-01",
    token: process.env.SANITY_TOKEN,
  });

// Настройка multer для загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({ storage });


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

  app.post("/contacts", async (req, res) => {
    try {
      const { name, email, phone } = req.body;
  
      if (!name || !email || !phone) {
        return res.status(400).json({ error: "All fields are required" });
      }
  
      const doc = {
        _type: "contact",
        name,
        email,
        phone,
      };
  
      const result = await sanity.create(doc);
      res.status(201).json({ message: "Contact added successfully", data: result });
    } catch (error) {
      console.error("Error adding contact:", error);
      res.status(500).json({ error: "Failed to add contact" });
    }
  });

  // Endpoint для добавления контактов с файлами
  app.post("/clients", upload.array("files", 10), async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        if (!name || !email || !phone) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Загрузка файлов в Sanity
        const fileUploads = req.files.map(async (file) => {
            const asset = await sanity.assets.upload("file", file.buffer, { filename: file.originalname });
            return {
                _key: crypto.randomUUID(), // Генерация уникального ключа
                _type: "file",
                asset: { _type: "reference", _ref: asset._id }
            };
        });

        const uploadedFiles = await Promise.all(fileUploads);

        // Создание документа в Sanity
        const doc = {
            _type: "client",
            name,
            email,
            phone,
            files: uploadedFiles,
        };

        const result = await sanity.create(doc);
        res.status(201).json({ message: "Contact added successfully", data: result });
    } catch (error) {
        console.error("Error adding contact:", error);
        res.status(500).json({ error: "Failed to add contact" });
    }
});
  
  // Запуск сервера
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
  

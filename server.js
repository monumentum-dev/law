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

  const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// Настройка multer для загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({ storage });


// Endpoint для проверки сервера
app.get("/ping", (req, res) => {
  res.json({ message: "Server is running! 🚀" });
});

  // Endpoint для добавления контактов с файлами
  app.post("/clients", upload.array("files", 10), async (req, res) => {
    try {
        const { name,  phone } = req.body;
        if (!name || !phone) {
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

 // Endpoint для добавления контактов с ссылками
app.post("/links", async (req, res) => {
  try {
      const { name, phone, link } = req.body;
      if (!name || !phone || !link) {
          return res.status(400).json({ error: "All fields are required" });
      }

      // Создание документа в Sanity
      const doc = {
          _type: "link",
          name,
          phone,
          link,
      };

      const result = await sanity.create(doc);
      res.status(201).json({ message: "Link added successfully", data: result });
  } catch (error) {
      console.error("Error adding link:", error);
      res.status(500).json({ error: "Failed to add link" });
  }
});

// Endpoint для получения всех клиентов
app.get("/clients", async (req, res) => {
  try {
    const query = `*[_type == "client"] {
      _id,
      name,
      email,
      phone,
      files[]{
        _key,
        asset->{url}
      }
    }`;

    const clients = await sanity.fetch(query);
    res.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// Endpoint для отправки OTP
app.post("/send-otp", async (req, res) => {
  const { phone } = req.body;

  // Проверка наличия телефона
  if (!phone) {
    return res.status(400).json({ error: "Phone number required" });
  }

  // Валидация номера телефона через regex
  const phoneRegex = /^\+?\d{7,15}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: "Invalid phone number format" });
  }

  // Генерация 4-значного OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  
 
  

  try {
    //  отправлять OTP по SMS через Twilio   
    twilioClient.messages
    .create({
        body: `Your verification code is: ${otp}`,
        from: process.env.TWILIO_PHONE,
        to: phone
    })
    // .then(message => console.log(message.sid));

    // Создание документа в Sanity
    const doc = {
      _type: "otp",    
      otp,
      phone,     
  };

  const result = await sanity.create(doc);

  // Schedule OTP deletion after 60 seconds
  setTimeout(async () => {
    try {
      await sanity.delete(result._id);
      console.log(`OTP for ${phone} deleted from Sanity.`);
    } catch (error) {
      console.error("Failed to delete OTP:", error.message);
    }
  }, 600000);


  res.status(201).json({ message: "Contact added successfully", data: result.phone});
  } catch (error) {
    res.status(500).json({ error: "Failed to send OTP", details: error.message });
  }
});

// Endpoint для  алидации
app.post("/validation", async (req, res) => {
  const { phone, otp } = req.body;

  // Проверка наличия данных
  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone and OTP are required" });
  }

  try {
    // Запрос в Sanity, ищем запись с таким телефоном
    const query = `*[_type == "otp" && phone == $phone][0]`;
    const params = { phone };
    const otpRecord = await sanity.fetch(query, params);

    if (!otpRecord) {
      return res.status(400).json({ error: "OTP not found or expired" });
    }

    // Проверяем совпадение OTP
    if (otpRecord.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Удаляем запись после успешной проверки
    await sanity.delete(otpRecord._id);

    // Отправляем успешный ответ
    res.status(200).json({ message: "OTP validated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

  
  // Запуск сервера
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
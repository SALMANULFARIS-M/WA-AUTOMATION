// app.js
import express from "express";
import multer from "multer";
import session from "express-session";
import flash from "express-flash";
import parseExcel from "./utils/parseExcel.js";
import {
  startBot,
  pauseBot,
  resumeBot,
  stopBot,
  getBotStatus,
} from "./bot.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'flash_secret_key',
  resave: false,
  saveUninitialized: true
}));
app.use(flash());

const upload = multer({ dest: "uploads/" });

let contacts = [];
let message = "";
let imagePath = "";

app.get("/", (req, res) => {
  res.render("index", { messages: req.flash(), status: getBotStatus() });
});

app.post("/upload", upload.fields([{ name: "excel" }, { name: "image" }]), (req, res) => {
  try {
    const excelFile = req.files["excel"]?.[0];
    const imgFile = req.files["image"]?.[0];

    if (!excelFile) {
      req.flash("error", "Excel file is required.");
      return res.redirect("/");
    }

    contacts = parseExcel(excelFile.path);
    imagePath = imgFile?.path || null;
    message = req.body.message;

    if (!contacts.length) {
      req.flash("error", "No valid contacts found.");
      return res.redirect("/");
    }

    req.flash("success", "Files uploaded successfully.");
    res.redirect("/");
  } catch (err) {
    console.error(err);
    req.flash("error", "Upload failed.");
    res.redirect("/");
  }
});

app.post("/start", async (req, res) => {
  await startBot({ contacts, message, imagePath });
  res.redirect("/");
});
app.post("/pause", (req, res) => {
  pauseBot();
  res.redirect("/");
});
app.post("/resume", (req, res) => {
  resumeBot();
  res.redirect("/");
});
app.post("/stop", (req, res) => {
  stopBot();
  res.redirect("/");
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));

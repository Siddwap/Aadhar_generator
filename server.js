require("regenerator-runtime/runtime");

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { createCanvas, registerFont } = require("canvas");

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Register Hindi font for canvas
registerFont(path.join(__dirname, "fonts/NotoSansDevanagari-Regular.ttf"), {
  family: "Noto Sans Devanagari",
});

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Function to render Hindi/English text as image (wrapped)
function renderTextAsImage(text, fontFamily, fontSize = 14, maxWidth = 300) {
  const lines = [];
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontSize}px "${fontFamily}"`;

  const words = text.split(" ");
  let line = "";

  for (const word of words) {
    const testLine = line + word + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== "") {
      lines.push(line.trim());
      line = word + " ";
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());

  const lineHeight = fontSize + 6;
  const height = lines.length * lineHeight + 10;
  const finalCanvas = createCanvas(maxWidth + 20, height);
  const finalCtx = finalCanvas.getContext("2d");

  finalCtx.fillStyle = "#000";
  finalCtx.font = `${fontSize}px "${fontFamily}"`;

  lines.forEach((l, i) => {
    finalCtx.fillText(l, 10, lineHeight * (i + 1));
  });

  return finalCanvas.toBuffer("image/png");
}

function formatAadhaarNumber(aadhaar) {
  return aadhaar.replace(/(.{4})/g, "$1 ").trim();
}

app.post("/generate-report-card", upload.single("photo"), async (req, res) => {
  try {
    const {
      english_name,
      hindi_name,
      dob,
      fatherNameEnglish,
      fatherNameHindi,
      aadharNumber,
      addressHindi,
      addressEnglish,
    } = req.body;

    const photoPath = req.file.path;
    const formattedAadhar = formatAadhaarNumber(aadharNumber);
    const formattedDob = dob.split("-").reverse().join("/");

    const hindi_full_address = `आत्मज: ${fatherNameHindi}, ${addressHindi}`;
    const english_full_address = `S/O: ${fatherNameEnglish}, ${addressEnglish}`;

    const templateBytes = fs.readFileSync("template.pdf");
    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);

    // Embed English fonts
    const boldFont = await pdfDoc.embedFont(fs.readFileSync("fonts/GothamBold.ttf"));
    const mediumFont = await pdfDoc.embedFont(fs.readFileSync("fonts/GothamMedium.ttf"));

    // Embed photo
    const photoBytes = fs.readFileSync(photoPath);
    const photoImage = await pdfDoc.embedPng(photoBytes);
    const page = pdfDoc.getPage(0);

    page.drawImage(photoImage, {
      x: 43,
      y: 570,
      width: 120,
      height: 140,
    });

    // Hindi name image
    const hindiNameBuffer = renderTextAsImage(hindi_name, "Noto Sans Devanagari", 14, 300);
    const hindiNameImage = await pdfDoc.embedPng(hindiNameBuffer);
    page.drawImage(hindiNameImage, {
      x: 180,
      y: 690,
      width: 300,
      height: 30,
    });

    // English name
    page.drawText(english_name, {
      x: 190,
      y: 683,
      size: 12,
      font: mediumFont,
    });

    // DOB
    page.drawText(formattedDob, {
      x: 290,
      y: 662,
      size: 15,
      font: mediumFont,
    });

    // Aadhaar number
    page.drawText(formattedAadhar, {
      x: 180,
      y: 480,
      size: 25,
      font: boldFont,
    });
    page.drawText(formattedAadhar, {
      x: 190,
      y: 105,
      size: 25,
      font: boldFont,
    });

    // Hindi address image
    const hindiAddressBuffer = renderTextAsImage(hindi_full_address, "Noto Sans Devanagari", 13, 300);
    const hindiAddressImage = await pdfDoc.embedPng(hindiAddressBuffer);
    page.drawImage(hindiAddressImage, {
      x: 20,
      y: 280,
      width: 300,
      height: 60,
    });

    // English address image (multiline support)
    const englishAddressBuffer = renderTextAsImage(english_full_address, "Arial", 13, 300);
    const englishAddressImage = await pdfDoc.embedPng(englishAddressBuffer);
    page.drawImage(englishAddressImage, {
      x: 20,
      y: 210,
      width: 305,
      height: 50,
    });

    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBytes);

    fs.unlinkSync(photoPath);
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).send("Failed to generate PDF.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

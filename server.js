const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const User = require('./models/userschema');
const Report = require('./models/report');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

const authMiddleware = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization;
  if (!token) return res.redirect('/login');
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    req.user = data;
    next();
  } catch {
    res.redirect('/login');
  }
};

async function queryOllama(promptText) {
  return new Promise((resolve, reject) => {
    const cmd = `ollama run medicheck --prompt "${promptText.replace(/"/g, '\"')}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) return reject(stderr || error);
      resolve(stdout.trim());
    });
  });
}

app.get('/', (req, res) => res.redirect('/login'));

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await User.create({ name, email, password: hashedPassword, role });
    res.redirect('/login');
  } catch (err) {
    res.send('Email already exists');
  }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.send('Invalid credentials');
  }
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
  res.cookie('token', token).redirect('/dashboard');
});

app.get('/dashboard', authMiddleware, async (req, res) => {
  const reports = await Report.find({ userId: req.user.id });
  res.render('dashboard', { reports });
});

app.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const ext = path.extname(filePath).toLowerCase();
    let extractedText = '';

    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text;
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
      extractedText = text;
    } else {
      return res.send('Unsupported file format. Please upload PDF or image.');
    }

    const diagnosis = await queryOllama(extractedText);

    await Report.create({
      userId: req.user.id,
      fileName: req.file.filename,
      result: diagnosis,
    });

    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.send('Error processing the report or communicating with Ai.');
  }
});

app.listen(5000, () => console.log('Server running on http://localhost:5000'));
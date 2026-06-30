const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Allow all origins (safe for a public read API; tighten if needed)
app.use(cors());
app.options('*', cors());
app.use(express.json({ limit: '2mb' }));

// ── Cached MongoDB connection (required for Vercel serverless) ────────────────
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGO_URI, { bufferCommands: false });
  isConnected = true;
  console.log('MongoDB connected');
}

// Connect before every request
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    next(err);
  }
});

// ── Schema ──────────────────────────────────────────────────────────────────
const blogSchema = new mongoose.Schema(
  {
    title:       { type: String, default: '' },
    slug:        { type: String, default: '' },
    status:      { type: String, enum: ['draft', 'published'], default: 'draft' },
    publishedAt: { type: String, default: '' },
    author:      { type: String, default: '' },
    excerpt:     { type: String, default: '' },
    coverImage:  { type: String, default: '' },
    content:     { type: String, default: '' },
    tags:        { type: String, default: '' },
    theme: {
      mode:        { type: String, default: 'light' },
      fontHeading: { type: String, default: 'sans' },
      fontBody:    { type: String, default: 'sans' },
      accentColor: { type: String, default: '#000000' },
    },
    enableTableOfContents: { type: Boolean, default: false },
    enableDropCap:         { type: Boolean, default: false },
    enableNewsletter:      { type: Boolean, default: false },
    authorTwitter:  { type: String, default: '' },
    authorLinkedin: { type: String, default: '' },
  },
  { timestamps: true }
);

// Map MongoDB _id → id for the frontend
blogSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Blog = mongoose.model('Blog', blogSchema);

// ── Contact Schema ────────────────────────────────────────────────────────────
const contactSchema = new mongoose.Schema(
  {
    name:        { type: String, default: '' },
    company:     { type: String, default: '' },
    email:       { type: String, required: true },
    phone:       { type: String, default: '' },
    message:     { type: String, default: '' },
    status:      { type: String, enum: ['new', 'read', 'archived'], default: 'new' },
    submittedAt: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true }
);

contactSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Contact = mongoose.model('Contact', contactSchema);

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/blogs — list all posts
app.get('/api/blogs', async (_req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blogs/:id — single post
app.get('/api/blogs/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ error: 'Not found' });
    res.json(blog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blogs — create a post
app.post('/api/blogs', async (req, res) => {
  try {
    const { id, _id, ...data } = req.body;
    const blog = await Blog.create(data);
    res.status(201).json(blog);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/blogs/:id — update a post
app.put('/api/blogs/:id', async (req, res) => {
  try {
    const { id, _id, ...data } = req.body;
    await Blog.findByIdAndUpdate(req.params.id, data, { runValidators: true });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/blogs/:id — delete a post
app.delete('/api/blogs/:id', async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Subscriber Schema ─────────────────────────────────────────────────────────
const subscriberSchema = new mongoose.Schema(
  {
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    status:   { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
    joinedAt: { type: String, default: () => new Date().toISOString() },
    source:   { type: String, default: 'manual' },
    name:     { type: String, default: '' },
    company:  { type: String, default: '' },
    phone:    { type: String, default: '' },
    linkedin: { type: String, default: '' },
    twitter:  { type: String, default: '' },
    website:  { type: String, default: '' },
    notes:    { type: String, default: '' },
    tags:     [String],
    messageHistory: [{ date: String, subject: String }],
  },
  { timestamps: true }
);

subscriberSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// ── Subscriber Routes ─────────────────────────────────────────────────────────

// POST /api/subscribe — from main website
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const subscriber = await Subscriber.create({ email, source: 'newsletter' });
    res.status(201).json(subscriber);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Already subscribed' });
    res.status(400).json({ error: err.message });
  }
});

// GET /api/subscribers — list all (admin)
app.get('/api/subscribers', async (_req, res) => {
  try {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 });
    res.json(subscribers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscribers — add manually from admin
app.post('/api/subscribers', async (req, res) => {
  try {
    const { id, _id, ...data } = req.body;
    const subscriber = await Subscriber.create(data);
    res.status(201).json(subscriber);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Already subscribed' });
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/subscribers/:id — update subscriber
app.put('/api/subscribers/:id', async (req, res) => {
  try {
    const { id, _id, ...data } = req.body;
    await Subscriber.findByIdAndUpdate(req.params.id, data);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/subscribers/:id
app.delete('/api/subscribers/:id', async (req, res) => {
  try {
    await Subscriber.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Contact Routes ────────────────────────────────────────────────────────────

// POST /api/contact — from main website contact form
app.post('/api/contact', async (req, res) => {
  try {
    const { name, company, email, phone, message } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const contact = await Contact.create({ name, company, email, phone, message });
    res.status(201).json({ success: true, id: contact.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/contacts — list all (admin inbox)
app.get('/api/contacts', async (_req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/contacts/:id — update status (read, archived)
app.put('/api/contacts/:id', async (req, res) => {
  try {
    const { id, _id, ...data } = req.body;
    await Contact.findByIdAndUpdate(req.params.id, data);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id
app.delete('/api/contacts/:id', async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public Article Routes (for main website) ─────────────────────────────────

// GET /api/articles — all published posts
app.get('/api/articles', async (_req, res) => {
  try {
    const articles = await Blog.find({ status: 'published' }).sort({ createdAt: -1 });
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:id — single published post by id
app.get('/api/articles/:id', async (req, res) => {
  try {
    const article = await Blog.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start (local dev only — Vercel handles this automatically) ───────────────
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
}

module.exports = app;

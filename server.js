const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  /\.vercel\.app$/,
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(p => p.test(origin))) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '2mb' }));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => { console.error('MongoDB connection error:', err); process.exit(1); });

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
    name:    { type: String, default: '' },
    company: { type: String, default: '' },
    email:   { type: String, required: true },
    phone:   { type: String, default: '' },
    message: { type: String, default: '' },
  },
  { timestamps: true }
);

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
  { email: { type: String, required: true, unique: true, lowercase: true, trim: true } },
  { timestamps: true }
);
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// POST /api/subscribe
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const subscriber = await Subscriber.create({ email });
    res.status(201).json({ success: true, id: subscriber._id });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Already subscribed' });
    res.status(400).json({ error: err.message });
  }
});

// ── Contact Routes ────────────────────────────────────────────────────────────

// POST /api/contact — save a contact form submission
app.post('/api/contact', async (req, res) => {
  try {
    const { name, company, email, phone, message } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const contact = await Contact.create({ name, company, email, phone, message });
    res.status(201).json({ success: true, id: contact._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/contacts — list all submissions (admin use)
app.get('/api/contacts', async (_req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json(contacts);
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

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Health check
app.get('/', (req, res) => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  res.json({ status: 'El Hakim Backend OK', apiKey: hasKey ? 'SET' : 'MISSING' });
});

// Claude chat
app.post('/api/claude/chat', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt ?? 'Tu es El Hakim, un assistant médical expert pour les médecins algériens. Réponds en français médical clair et précis.',
      messages,
    });
    res.json({ content: response.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Claude image analysis
app.post('/api/claude/analyze-image', async (req, res) => {
  try {
    const { base64, mediaType, prompt } = req.body;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    });
    res.json({ content: response.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Medical news
app.get('/api/news/medical', (req, res) => {
  res.json([
    {
      id: '1',
      titre: 'Nouvelles recommandations HTA 2025',
      contenu: 'Les sociétés savantes internationales publient de nouvelles lignes directrices pour la prise en charge de l\'hypertension artérielle, avec un seuil d\'intervention abaissé à 130/80 mmHg.',
      source: 'ESC/ESH 2025',
      categorie: 'Cardiologie',
      date_publication: new Date().toISOString(),
    },
    {
      id: '2',
      titre: 'Résistance aux antibiotiques en Algérie',
      contenu: 'Une étude nationale révèle une augmentation de la résistance aux céphalosporines de 3ème génération dans les infections urinaires nosocomiales. Renforcement des protocoles d\'antibiothérapie recommandé.',
      source: 'MSPRH 2025',
      categorie: 'Infectiologie',
      date_publication: new Date().toISOString(),
    },
    {
      id: '3',
      titre: 'Programme national de vaccination 2025-2026',
      contenu: 'Le ministère de la santé annonce l\'intégration du vaccin antipneumococcique dans le calendrier vaccinal national pour les nourrissons de moins de 2 ans.',
      source: 'MSPRH',
      categorie: 'Pédiatrie',
      date_publication: new Date().toISOString(),
    },
  ]);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`El Hakim Backend running on port ${PORT}`));

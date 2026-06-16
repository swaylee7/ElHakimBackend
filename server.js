const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const anthropic = new Anthropic();

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'El Hakim Backend OK',
    apiKey: !!process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
    supabase: !!process.env.SUPABASE_URL ? 'SET' : 'MISSING (ajouter dans Railway Variables)',
  });
});

// Claude chat
app.post('/api/claude/chat', async (req, res) => {
  try {
    const { messages, system, systemPrompt } = req.body;
    const sysMsg = system ?? systemPrompt ?? 'Tu es El Hakim, un assistant médical expert pour les médecins algériens.';
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: sysMsg + ' Sois CONCIS : maximum 3-4 phrases ou 5 points. Pas d\'introduction ni de conclusion. Va droit au but.',
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
    const { image, base64, mediaType, prompt } = req.body;
    const imageData = image ?? base64;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text', text: prompt },
        ],
      }],
    });
    res.json({ content: response.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload chat media (photo or video) — uses service_role to bypass RLS
app.post('/api/upload/chat-media', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurés dans Railway' });
  try {
    const { base64, mimeType, senderId, fileName } = req.body;
    if (!base64 || !mimeType || !senderId) {
      return res.status(400).json({ error: 'base64, mimeType, senderId requis' });
    }

    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';
    const path = `${senderId}/${Date.now()}_${fileName ?? `media.${ext}`}`;
    const buffer = Buffer.from(base64, 'base64');

    const { error } = await supabase.storage
      .from('chat-media')
      .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    res.json({ url: urlData.publicUrl, path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Medical news
app.get('/api/news/medical', (req, res) => {
  res.json([
    { id: '1', titre: 'Nouvelles recommandations HTA 2025 — ESC/ESH', contenu: 'Les sociétés savantes internationales publient de nouvelles lignes directrices pour la prise en charge de l\'hypertension artérielle, avec un seuil d\'intervention abaissé à 130/80 mmHg pour les patients à haut risque cardiovasculaire. L\'association IEC + diurétique thiazidique reste la bithérapie de référence.', source: 'ESC/ESH 2025', categorie: 'Cardiologie', date_publication: new Date().toISOString(), image_url: null },
    { id: '2', titre: 'Résistance aux antibiotiques en Algérie — Alerte MSPRH', contenu: 'Une étude nationale révèle une augmentation de 34% de la résistance aux céphalosporines de 3ème génération dans les infections urinaires nosocomiales. Le MSPRH renforce les protocoles d\'antibiothérapie et recommande l\'antibiogramme systématique avant toute prescription en milieu hospitalier.', source: 'MSPRH 2025', categorie: 'Infectiologie', date_publication: new Date(Date.now() - 86400000).toISOString(), image_url: null },
    { id: '3', titre: 'Vaccin antipneumococcique intégré au calendrier national', contenu: 'Le ministère de la santé annonce l\'intégration du vaccin antipneumococcique conjugué 13-valent (PCV13) dans le calendrier vaccinal national pour les nourrissons de moins de 2 ans, à partir de janvier 2026. Trois doses à 2, 4 et 12 mois.', source: 'MSPRH', categorie: 'Pédiatrie', date_publication: new Date(Date.now() - 2 * 86400000).toISOString(), image_url: null },
    { id: '4', titre: 'Diabète type 2 : les inhibiteurs SGLT2 en première ligne', contenu: 'Nouvelles preuves confirmant les bénéfices cardiovasculaires et rénaux des inhibiteurs SGLT2. Les recommandations ADA 2025 les positionnent en deuxième ligne après la metformine, indépendamment du contrôle glycémique, pour les patients à haut risque CV.', source: 'ADA 2025', categorie: 'Endocrinologie', date_publication: new Date(Date.now() - 3 * 86400000).toISOString(), image_url: null },
    { id: '5', titre: 'IA diagnostique : performances égales aux radiologues', contenu: 'Une méta-analyse publiée dans The Lancet Digital Health confirme que les modèles d\'IA atteignent une sensibilité de 94% pour la détection du cancer du poumon sur TDM thoracique.', source: 'The Lancet Digital Health', categorie: 'Radiologie', date_publication: new Date(Date.now() - 4 * 86400000).toISOString(), image_url: null },
    { id: '6', titre: 'Insuffisance cardiaque à FE préservée : nouveautés', contenu: 'L\'essai EMPEROR-Preserved confirme le bénéfice de l\'empagliflozine dans l\'IC à FE préservée (HFpEF). Réduction de 21% des hospitalisations. L\'ESC intègre désormais les iSGLT2 dans ses recommandations HFpEF 2025.', source: 'ESC 2025', categorie: 'Cardiologie', date_publication: new Date(Date.now() - 5 * 86400000).toISOString(), image_url: null },
    { id: '7', titre: 'Migraine chronique : anticorps anti-CGRP remboursés', contenu: 'L\'ANSM annonce la prise en charge des anticorps monoclonaux anti-CGRP pour la migraine chronique réfractaire, après échec de 3 traitements de fond. En Algérie, une demande est en cours auprès de la DPM.', source: 'ANSM / SFN 2025', categorie: 'Neurologie', date_publication: new Date(Date.now() - 6 * 86400000).toISOString(), image_url: null },
    { id: '8', titre: 'Dépistage cancer du col utérin : passage au test HPV', contenu: 'Le programme national de dépistage envisage de remplacer le frottis cervico-vaginal par le test HPV-HR comme test primaire. Sensibilité supérieure (94% vs 72%) et intervalle de dépistage allongé à 5 ans.', source: 'MSPRH / OMS', categorie: 'Gynécologie', date_publication: new Date(Date.now() - 7 * 86400000).toISOString(), image_url: null },
  ]);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`El Hakim Backend running on port ${PORT}`));

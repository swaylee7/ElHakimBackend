const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const Parser = require('rss-parser');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const anthropic = new Anthropic();

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ─── RSS Parser ────────────────────────────────────────────────────────────────
const rssParser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
  timeout: 7000,
  headers: {
    'User-Agent': 'ElHakim Medical News Bot/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

// ─── 24 sources RSS — Algériennes en premier ───────────────────────────────────
const RSS_FEEDS = [
  // ① ALGÉRIE — Sources officielles et médias nationaux
  // medicalOnly: false = filtre médical appliqué (sites généralistes)
  { url: 'http://www.aps.dz/rss/sante',                                              source: 'APS Algérie',           priority: 1, medicalOnly: true  },
  { url: 'https://www.aps.dz/rss/sante',                                             source: 'APS Algérie',           priority: 1, medicalOnly: true  },
  { url: 'https://www.tsa-algerie.com/feed/',                                        source: 'TSA Algérie',           priority: 1, medicalOnly: false },
  { url: 'https://www.elwatan.com/feed/',                                            source: 'El Watan',              priority: 1, medicalOnly: false },
  { url: 'https://www.liberte-algerie.com/rss/',                                     source: 'Liberté Algérie',       priority: 1, medicalOnly: false },
  { url: 'https://www.algerie360.com/feed/',                                         source: 'Algérie 360',           priority: 1, medicalOnly: false },
  { url: 'https://www.dzbreaking.com/feed/',                                         source: 'DZ Breaking',           priority: 1, medicalOnly: false },

  // ② OMS & OFFICIELLES MONDIALES
  { url: 'https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml',             source: 'OMS Mondial',          priority: 2, medicalOnly: true },
  { url: 'https://www.afro.who.int/rss/news.xml',                                   source: 'OMS Afrique',          priority: 2, medicalOnly: true },
  { url: 'https://www.ecdc.europa.eu/sites/default/files/feeds/rss/news.rss',        source: 'ECDC Europe',          priority: 2, medicalOnly: true },
  { url: 'https://www.unicef.org/rss/feeds/news-releases.rss',                       source: 'UNICEF Santé',         priority: 2, medicalOnly: false },

  // ③ OFFICIELLES FRANÇAISES
  { url: 'https://www.has-sante.fr/jcms/jcms_a_15/fr/rss-toutes-les-actualites.xml',source: 'HAS France',           priority: 2, medicalOnly: true },
  { url: 'https://ansm.sante.fr/rss/actualites.rss',                                 source: 'ANSM France',          priority: 2, medicalOnly: true },
  { url: 'https://www.santepubliquefrance.fr/rss/actualites.rss',                    source: 'Santé Publique France', priority: 2, medicalOnly: true },

  // ④ MÉDIAS MÉDICAUX FRANCOPHONES
  { url: 'https://www.lemonde.fr/sante/rss_full.xml',                                source: 'Le Monde Santé',       priority: 3, medicalOnly: true },
  { url: 'https://sante.lefigaro.fr/sante/rss.xml',                                  source: 'Le Figaro Santé',      priority: 3, medicalOnly: true },
  { url: 'https://www.20minutes.fr/feeds/rss/actu/sante.xml',                        source: '20 Minutes Santé',     priority: 3, medicalOnly: true },
  { url: 'https://www.pourquoidocteur.fr/rss',                                       source: 'Pourquoi Docteur',     priority: 3, medicalOnly: true },
  { url: 'https://www.vidal.fr/rss/actualites.xml',                                  source: 'Vidal Pro',            priority: 3, medicalOnly: true },

  // ⑤ JOURNAUX MÉDICAUX FRANCOPHONES SUPPLÉMENTAIRES
  { url: 'https://www.jim.fr/rss/',                                                   source: 'JIM Pro',              priority: 3, medicalOnly: true },
  { url: 'https://www.egora.fr/rss.xml',                                             source: 'Egora',                priority: 3, medicalOnly: true },
  { url: 'https://www.allodocteurs.fr/rss.xml',                                      source: 'Allo Docteurs',        priority: 3, medicalOnly: true },
];

// ─── Détection de catégorie par mots-clés ──────────────────────────────────────
function detectCategorie(text) {
  const t = (text || '').toLowerCase();
  if (/cardio|cardiaque|infarctus|hta|hypertension|arythmie|coronaire|péricardite|insuffisance cardiaque/.test(t)) return 'Cardiologie';
  if (/diab|insuline|glyc|hba1c|sglt2|metformine|pancréas|glucos/.test(t)) return 'Diabétologie';
  if (/endocrin|thyroïde|hormones|surrénale|hypophyse|cortisol|métabolisme/.test(t)) return 'Endocrinologie';
  if (/antibio|bactérie|infection|sepsis|pneumonie|virus|covid|grippe|résistance antimicro|parasit|fièvre/.test(t)) return 'Infectiologie';
  if (/cancer|tumeur|oncol|chimioth|immunoth|carcinome|métastase|lymphome|leucémie|biopsie/.test(t)) return 'Oncologie';
  if (/neuro|avc|accident vasculaire|alzheimer|parkinson|épilepsie|migraine|sclérose|méningite|démence/.test(t)) return 'Neurologie';
  if (/pédiat|enfant|nourrisson|infantile|néonatal|pediatr|nouveau-né/.test(t)) return 'Pédiatrie';
  if (/vaccin|vaccination|immunis|immunisation/.test(t)) return 'Vaccination';
  if (/gynéco|obstétr|grossesse|utérus|ovaire|sein|maternité|accouchement|fertilité|ménopause/.test(t)) return 'Gynécologie';
  if (/pneumo|poumon|bpco|asthme|respiratoire|bronche|pleural|toux chronique/.test(t)) return 'Pneumologie';
  if (/derma|peau|psoriasis|eczéma|érythème|cutané|acné|mélanome/.test(t)) return 'Dermatologie';
  if (/ophtalmo|oeil|yeux|vision|rétine|glaucome|cataracte/.test(t)) return 'Ophtalmologie';
  if (/radio|imagerie|irm|scanner|échographie|tomodensitom|radiolog/.test(t)) return 'Radiologie';
  if (/chirurgie|opération|greffe|transplant|laparoscop/.test(t)) return 'Chirurgie';
  if (/psychiatr|psychol|dépression|anxiété|schizoph|bipol|santé mentale/.test(t)) return 'Psychiatrie';
  if (/ortho|fracture|os|articulation|ligament|vertèbre|rachis/.test(t)) return 'Orthopédie';
  if (/urgence|réanimation|rea|soins intensifs|trauma/.test(t)) return 'Urgences';
  return 'Général';
}

// ─── Filtre pertinence médicale (pour sites généralistes) ────────────────────
const MEDICAL_KW = /santé|médical|médecin|hôpital|clinique|traitement|maladie|vaccin|virus|bactér|chirurgie|thérapie|médicament|patient|docteur|infirmier|diagnostic|symptôme|épidémie|pandémie|cancer|diabète|hypertension|cardio|neuro|pneumo|pédia|gynéco|psychia|ortho|dermato|ophtalmo|urgence|soins|pharmacie|laboratoire|analyse médicale|examen médical|imagerie|radiologie|infectieux|chirurgical|vaccination|immunisation|antibiotiqu|pandémie|épidémio|pathologie|anatom|physiolog/;

function isMedical(text) {
  return MEDICAL_KW.test((text || '').toLowerCase());
}

// ─── Nettoyage du contenu RSS ─────────────────────────────────────────────────
function extractContent(item) {
  const raw = item.contentSnippet || item.summary || '';
  const cleaned = raw
    .replace(/<[^>]+>/g, '')        // strip HTML tags
    .replace(/LIRE\s*(L['']ARTICLE|\[\.\.\.?\]|LA SUITE)?/gi, '') // remove nav noise
    .replace(/\n{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (cleaned.length <= 500) return cleaned;
  const cut = cleaned.slice(0, 500);
  const last = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return last > 80 ? cut.slice(0, last + 1) : cut + '…';
}

// ─── Extraction de l'image depuis un item RSS ──────────────────────────────────
function extractImage(item) {
  if (item.enclosure?.url) {
    const u = item.enclosure.url;
    if (u.match(/\.(jpe?g|png|gif|webp)(\?.*)?$/i) || item.enclosure.type?.startsWith('image/')) return u;
  }
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  const html = item.contentEncoded || item.content || item.summary || '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m?.[1] && !m[1].endsWith('.gif')) return m[1];
  return null;
}

// ─── Cache mémoire (2 heures) ──────────────────────────────────────────────────
let newsCache = { articles: [], fetchedAt: 0 };
const CACHE_TTL = 2 * 60 * 60 * 1000;

async function fetchLiveNews() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const parsed = await rssParser.parseURL(feed.url);
      return { feed, items: parsed.items || [] };
    })
  );

  const collected = [];
  for (const prio of [1, 2, 3]) {
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { feed, items } = r.value;
      if (feed.priority !== prio) continue;
      const AGE_LIMIT_MS = feed.priority === 1 ? 90 * 864e5 : 60 * 864e5;
      for (const item of items.slice(0, 6)) {
        if (item.pubDate) {
          const age = Date.now() - new Date(item.pubDate).getTime();
          if (age > AGE_LIMIT_MS) continue;
        }
        const text = (item.title || '') + ' ' + (item.contentSnippet || item.summary || '');
        if (!feed.medicalOnly && !isMedical(text)) continue;
        collected.push({
          id: `rss-${Buffer.from(item.link || item.guid || item.title || String(Date.now())).toString('base64').slice(0, 22)}`,
          titre: (item.title || '').trim(),
          contenu: extractContent(item),
          source: feed.source,
          categorie: detectCategorie(text),
          date_publication: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          image_url: extractImage(item),
          link: item.link || item.guid || null,
        });
      }
    }
  }

  return collected;
}

// ─── Static fallback ───────────────────────────────────────────────────────────
const STATIC_ARTICLES = [
  { id: 's1', titre: 'Nouvelles recommandations HTA 2025 — ESC/ESH', contenu: 'Les sociétés savantes internationales publient de nouvelles lignes directrices pour la prise en charge de l\'hypertension artérielle, avec un seuil d\'intervention abaissé à 130/80 mmHg pour les patients à haut risque cardiovasculaire.', source: 'ESC/ESH 2025', categorie: 'Cardiologie', date_publication: new Date().toISOString(), image_url: null, link: null },
  { id: 's2', titre: 'Résistance aux antibiotiques en Algérie — Alerte MSPRH', contenu: 'Une étude nationale révèle une augmentation de 34% de la résistance aux céphalosporines de 3ème génération dans les infections urinaires nosocomiales.', source: 'MSPRH 2025', categorie: 'Infectiologie', date_publication: new Date(Date.now() - 86400000).toISOString(), image_url: null, link: null },
  { id: 's3', titre: 'Vaccin antipneumococcique intégré au calendrier national', contenu: 'Le ministère de la santé annonce l\'intégration du vaccin antipneumococcique conjugué 13-valent (PCV13) dans le calendrier vaccinal national pour les nourrissons de moins de 2 ans.', source: 'MSPRH', categorie: 'Vaccination', date_publication: new Date(Date.now() - 2 * 86400000).toISOString(), image_url: null, link: null },
  { id: 's4', titre: 'Diabète type 2 : les inhibiteurs SGLT2 en première ligne', contenu: 'Nouvelles preuves confirmant les bénéfices cardiovasculaires et rénaux des inhibiteurs SGLT2. Les recommandations ADA 2025 les positionnent en deuxième ligne après la metformine.', source: 'ADA 2025', categorie: 'Diabétologie', date_publication: new Date(Date.now() - 3 * 86400000).toISOString(), image_url: null, link: null },
  { id: 's5', titre: 'IA diagnostique : performances égales aux radiologues', contenu: 'Une méta-analyse publiée dans The Lancet Digital Health confirme que les modèles d\'IA atteignent une sensibilité de 94% pour la détection du cancer du poumon sur TDM thoracique.', source: 'The Lancet', categorie: 'Radiologie', date_publication: new Date(Date.now() - 4 * 86400000).toISOString(), image_url: null, link: null },
  { id: 's6', titre: 'Dépistage cancer du col utérin : passage au test HPV', contenu: 'Le programme national de dépistage envisage de remplacer le frottis cervico-vaginal par le test HPV-HR comme test primaire. Sensibilité supérieure (94% vs 72%) et intervalle de dépistage allongé à 5 ans.', source: 'MSPRH / OMS', categorie: 'Gynécologie', date_publication: new Date(Date.now() - 5 * 86400000).toISOString(), image_url: null, link: null },
  { id: 's7', titre: 'AVC ischémique : fenêtre de thrombolyse élargie à 4h30', contenu: 'Les nouvelles recommandations ESO 2025 élargissent la fenêtre thérapeutique de thrombolyse et permettent la thrombectomie mécanique jusqu\'à 24h pour les patients sélectionnés.', source: 'ESO 2025', categorie: 'Neurologie', date_publication: new Date(Date.now() - 6 * 86400000).toISOString(), image_url: null, link: null },
  { id: 's8', titre: 'BPCO : recommandations GOLD 2025 actualisées', contenu: 'Les recommandations GOLD 2025 introduisent une nouvelle classification basée sur les symptômes et le risque d\'exacerbations pour guider le traitement pharmacologique de la BPCO.', source: 'GOLD 2025', categorie: 'Pneumologie', date_publication: new Date(Date.now() - 7 * 86400000).toISOString(), image_url: null, link: null },
];

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'El Hakim Backend OK',
    apiKey: !!process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
    supabase: !!process.env.SUPABASE_URL ? 'SET' : 'MISSING',
    newsCache: newsCache.articles.length > 0
      ? `${newsCache.articles.length} articles (refreshed ${Math.round((Date.now() - newsCache.fetchedAt) / 60000)}min ago)`
      : 'empty',
  });
});

// ─── Claude chat ───────────────────────────────────────────────────────────────
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

// ─── Claude image analysis ─────────────────────────────────────────────────────
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

// ─── Upload chat media ─────────────────────────────────────────────────────────
app.post('/api/upload/chat-media', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'SUPABASE non configuré' });
  try {
    const { base64, mimeType, senderId, fileName } = req.body;
    if (!base64 || !mimeType || !senderId) return res.status(400).json({ error: 'base64, mimeType, senderId requis' });
    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';
    const path = `${senderId}/${Date.now()}_${fileName ?? `media.${ext}`}`;
    const buffer = Buffer.from(base64, 'base64');
    const { error } = await supabase.storage.from('chat-media').upload(path, buffer, { contentType: mimeType, upsert: false });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    res.json({ url: urlData.publicUrl, path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── News médicales — 24 sources RSS + fallback statique ──────────────────────
app.get('/api/news/medical', async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();

  if (!forceRefresh && now - newsCache.fetchedAt < CACHE_TTL && newsCache.articles.length > 0) {
    return res.json(newsCache.articles);
  }

  try {
    const live = await fetchLiveNews();
    // Toujours combiner live + statique ; live en premier (plus récent)
    const combined = [...live, ...STATIC_ARTICLES];
    const seen = new Set();
    const deduped = combined.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
    newsCache = { articles: deduped, fetchedAt: now };
    console.log(`News cache: ${live.length} live + ${STATIC_ARTICLES.length} static = ${deduped.length} total`);
    res.json(deduped);
  } catch (e) {
    console.error('News fetch error:', e.message);
    res.json(newsCache.articles.length > 0 ? newsCache.articles : STATIC_ARTICLES);
  }
});

// ─── Force refresh news cache ──────────────────────────────────────────────────
app.post('/api/news/refresh', async (req, res) => {
  newsCache = { articles: [], fetchedAt: 0 };
  res.json({ ok: true, message: 'Cache vidé — prochain appel /api/news/medical refetchera les RSS' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`El Hakim Backend running on port ${PORT}`));

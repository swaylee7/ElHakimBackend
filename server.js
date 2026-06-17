const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
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
  timeout: 8000,
  headers: {
    'User-Agent': 'ElHakim Medical News Bot/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

// ─── RSS Sources ───────────────────────────────────────────────────────────────
// lang: 'fr' = store as-is | 'en' = translate to FR | 'ar' = store native + translate to FR
const RSS_FEEDS = [
  // ① ALGÉRIE
  { url: 'https://www.tsa-algerie.com/feed/',                                                    source: 'TSA Algérie',           priority: 1, medicalOnly: false, lang: 'fr', limit: 25 },
  { url: 'https://www.algerie360.com/feed/',                                                     source: 'Algérie 360',           priority: 1, medicalOnly: false, lang: 'fr', limit: 25 },
  { url: 'https://www.elmoudjahid.com/fr/rss.xml',                                              source: 'El Moudjahid',          priority: 1, medicalOnly: false, lang: 'fr', limit: 20 },

  // ② OMS & ORGANISATIONS INTERNATIONALES
  { url: 'https://www.who.int/rss-feeds/news-english.xml',                                      source: 'WHO News',              priority: 1, medicalOnly: true,  lang: 'en', limit: 25 },
  { url: 'https://www.paho.org/en/rss-news',                                                    source: 'PAHO',                  priority: 2, medicalOnly: true,  lang: 'en', limit: 20 },
  { url: 'https://www.ecdc.europa.eu/en/rss-feeds/epidemiological-data',                        source: 'ECDC',                  priority: 2, medicalOnly: true,  lang: 'en', limit: 18 },

  // ③ MÉDIAS MÉDICAUX FRANCOPHONES (URLs actives)
  { url: 'https://www.lemonde.fr/sante/rss_full.xml',                                           source: 'Le Monde Santé',        priority: 2, medicalOnly: true,  lang: 'fr', limit: 25 },
  { url: 'https://www.egora.fr/rss.xml',                                                        source: 'Egora',                 priority: 2, medicalOnly: true,  lang: 'fr', limit: 20 },
  { url: 'https://www.allodocteurs.fr/rss.xml',                                                 source: 'Allo Docteurs',         priority: 2, medicalOnly: true,  lang: 'fr', limit: 20 },
  { url: 'https://www.pourquoidocteur.fr/feed',                                                 source: 'Pourquoi Docteur',      priority: 2, medicalOnly: true,  lang: 'fr', limit: 20 },
  { url: 'https://www.lequotidiendumedecin.fr/feed',                                            source: 'Le Quotidien du Médecin', priority: 2, medicalOnly: true, lang: 'fr', limit: 20 },
  { url: 'https://www.infirmiers.com/rss.xml',                                                  source: 'Infirmiers.com',        priority: 3, medicalOnly: true,  lang: 'fr', limit: 15 },
  { url: 'https://www.medscape.fr/rss/homeheadlines',                                           source: 'Medscape FR',           priority: 2, medicalOnly: true,  lang: 'fr', limit: 20 },
  { url: 'https://www.jim.fr/flux_rss/rss.xml',                                                 source: 'JIM Pro',               priority: 2, medicalOnly: true,  lang: 'fr', limit: 18 },

  // ④ SOURCES ANGLAISES (traduites)
  { url: 'https://www.medscape.com/rss/homeheadlines',                                          source: 'Medscape',              priority: 2, medicalOnly: true,  lang: 'en', limit: 25 },
  { url: 'https://feeds.feedburner.com/nejm/rss/current',                                      source: 'NEJM',                  priority: 2, medicalOnly: true,  lang: 'en', limit: 15 },
  { url: 'https://www.thelancet.com/rssfeed/lancet_online.xml',                                 source: 'The Lancet',            priority: 2, medicalOnly: true,  lang: 'en', limit: 15 },
  { url: 'https://jamanetwork.com/rss/site_3/67.xml',                                           source: 'JAMA',                  priority: 2, medicalOnly: true,  lang: 'en', limit: 15 },
  { url: 'https://www.bmj.com/rss/current.xml',                                                 source: 'BMJ',                   priority: 2, medicalOnly: true,  lang: 'en', limit: 15 },
  { url: 'https://pubmed.ncbi.nlm.nih.gov/rss/search/2GQ_w5CGm8GFocfFwNqGCW0UOFKuKBRqSmHEzA39NsPpIE_j0I/?limit=20&utm_campaign=pubmed-2&fc=20250101000000', source: 'PubMed Médecine', priority: 3, medicalOnly: true, lang: 'en', limit: 20 },

  // ⑤ SOURCES ARABES
  { url: 'https://www.aljazeera.net/rss/health.xml',                                            source: 'الجزيرة صحة',          priority: 1, medicalOnly: true,  lang: 'ar', limit: 20 },
  { url: 'https://arabic.cnn.com/health/rss',                                                   source: 'CNN عربي صحة',         priority: 2, medicalOnly: true,  lang: 'ar', limit: 18 },
  { url: 'https://www.bbc.com/arabic/topics/c2ldjl9lrzwt/rss.xml',                             source: 'BBC عربي صحة',         priority: 2, medicalOnly: true,  lang: 'ar', limit: 18 },
];

// ─── Détection catégorie (FR / EN / AR) ───────────────────────────────────────
function detectCategorie(text, lang = 'fr') {
  const t = (text || '');
  const tl = t.toLowerCase();

  if (lang === 'ar') {
    if (/قلب|ضغط الدم|ارتفاع الضغط|نبض|شريان/.test(t)) return 'Cardiologie';
    if (/سرطان|ورم|أورام/.test(t)) return 'Oncologie';
    if (/سكري|أنسولين|جلوكوز/.test(t)) return 'Diabétologie';
    if (/مخ|أعصاب|سكتة|الزهايمر|باركنسون/.test(t)) return 'Neurologie';
    if (/لقاح|تطعيم|تحصين/.test(t)) return 'Vaccination';
    if (/طفل|أطفال|رضيع/.test(t)) return 'Pédiatrie';
    if (/جراحة|عملية/.test(t)) return 'Chirurgie';
    if (/رئة|تنفس|ربو/.test(t)) return 'Pneumologie';
    if (/نساء|ولادة|حمل/.test(t)) return 'Gynécologie';
    if (/عدوى|بكتيريا|فيروس|مضاد حيوي/.test(t)) return 'Infectiologie';
    if (/جلد/.test(t)) return 'Dermatologie';
    if (/عيون|بصر/.test(t)) return 'Ophtalmologie';
    if (/نفسي|اكتئاب|قلق/.test(t)) return 'Psychiatrie';
    if (/طوارئ/.test(t)) return 'Urgences';
    return 'Général';
  }

  if (lang === 'en') {
    if (/cardio|heart|blood pressure|hypertension|arrhythmia|coronary|myocardial/.test(tl)) return 'Cardiologie';
    if (/cancer|tumor|oncol|chemo|carcinoma|lymphoma|leukemia|metastas/.test(tl)) return 'Oncologie';
    if (/diabet|insulin|glucose|glycemic|hba1c|sglt/.test(tl)) return 'Diabétologie';
    if (/neuro|stroke|alzheimer|parkinson|epilepsy|migraine|dementia|multiple sclerosis/.test(tl)) return 'Neurologie';
    if (/vaccine|vaccination|immunization|immunis/.test(tl)) return 'Vaccination';
    if (/pediatric|children|infant|neonatal|newborn/.test(tl)) return 'Pédiatrie';
    if (/surgery|surgical|operation|transplant|laparoscop/.test(tl)) return 'Chirurgie';
    if (/lung|pulmonary|copd|asthma|respiratory|pneumonia|bronchial/.test(tl)) return 'Pneumologie';
    if (/gynecol|obstetric|pregnancy|breast cancer|ovarian|uterus/.test(tl)) return 'Gynécologie';
    if (/antibiotic|infection|sepsis|bacteria|virus|covid|influenza|resistant/.test(tl)) return 'Infectiologie';
    if (/dermatol|skin|psoriasis|eczema|melanoma/.test(tl)) return 'Dermatologie';
    if (/ophthal|eye|vision|retina|glaucoma|cataract/.test(tl)) return 'Ophtalmologie';
    if (/radiol|imaging|mri|ct scan|ultrasound|x-ray/.test(tl)) return 'Radiologie';
    if (/psychiatry|mental health|depression|anxiety|schizophrenia|bipolar/.test(tl)) return 'Psychiatrie';
    if (/orthoped|fracture|bone|joint|spine|vertebr/.test(tl)) return 'Orthopédie';
    if (/emergency|trauma|icu|intensive care|resuscitation/.test(tl)) return 'Urgences';
    if (/endocrin|thyroid|hormone|adrenal|pituitary/.test(tl)) return 'Endocrinologie';
    return 'Général';
  }

  // FR (default)
  if (/cardio|cardiaque|infarctus|hta|hypertension|arythmie|coronaire|insuffisance cardiaque/.test(tl)) return 'Cardiologie';
  if (/diab|insuline|glyc|hba1c|sglt2|metformine|glucos/.test(tl)) return 'Diabétologie';
  if (/endocrin|thyroïde|hormones|surrénale|hypophyse|cortisol/.test(tl)) return 'Endocrinologie';
  if (/antibio|bactérie|infection|sepsis|pneumonie|virus|covid|grippe|résistance antimicro/.test(tl)) return 'Infectiologie';
  if (/cancer|tumeur|oncol|chimioth|immunoth|carcinome|métastase|lymphome|leucémie/.test(tl)) return 'Oncologie';
  if (/neuro|avc|alzheimer|parkinson|épilepsie|migraine|sclérose|méningite|démence/.test(tl)) return 'Neurologie';
  if (/pédiat|enfant|nourrisson|infantile|néonatal|nouveau-né/.test(tl)) return 'Pédiatrie';
  if (/vaccin|vaccination|immunis/.test(tl)) return 'Vaccination';
  if (/gynéco|obstétr|grossesse|utérus|ovaire|sein|maternité|fertilité|ménopause/.test(tl)) return 'Gynécologie';
  if (/pneumo|poumon|bpco|asthme|respiratoire|bronche/.test(tl)) return 'Pneumologie';
  if (/derma|peau|psoriasis|eczéma|cutané|acné|mélanome/.test(tl)) return 'Dermatologie';
  if (/ophtalmo|oeil|yeux|vision|rétine|glaucome|cataracte/.test(tl)) return 'Ophtalmologie';
  if (/radio|imagerie|irm|scanner|échographie/.test(tl)) return 'Radiologie';
  if (/chirurgie|opération|greffe|transplant/.test(tl)) return 'Chirurgie';
  if (/psychiatr|dépression|anxiété|schizoph|bipol|santé mentale/.test(tl)) return 'Psychiatrie';
  if (/ortho|fracture|os|articulation|vertèbre|rachis/.test(tl)) return 'Orthopédie';
  if (/urgence|réanimation|soins intensifs|trauma/.test(tl)) return 'Urgences';
  return 'Général';
}

// ─── Filtres pertinence médicale ───────────────────────────────────────────────
const MEDICAL_KW_FR = /santé|médical|médecin|hôpital|clinique|traitement|maladie|vaccin|virus|bactér|chirurgie|thérapie|médicament|patient|docteur|diagnostic|symptôme|épidémie|cancer|diabète|hypertension|cardio|neuro|pneumo|pédia|gynéco|psychia|ortho|dermato|urgence|soins|pharmacie|pathologie/;
const MEDICAL_KW_EN = /health|medical|medicine|disease|treatment|vaccine|surgery|doctor|hospital|clinical|drug|patient|therapy|cancer|diabetes|hypertension|cardio|neural|epidemi|infection|antibiotic|virus|bacteria|immune|pharma|diagnosis|symptom|pandemic/;
const MEDICAL_KW_AR = /صحة|طبي|مرض|علاج|دواء|لقاح|جراحة|مستشفى|طبيب|مريض|وباء|فيروس|سرطان|ضغط|قلب|سكري|مضاد حيوي|تشخيص/;

function isMedical(text, lang = 'fr') {
  const t = text || '';
  if (lang === 'ar') return MEDICAL_KW_AR.test(t);
  if (lang === 'en') return MEDICAL_KW_EN.test(t.toLowerCase());
  return MEDICAL_KW_FR.test(t.toLowerCase());
}

// ─── Nettoyage contenu RSS ─────────────────────────────────────────────────────
function extractContent(item, maxLen = 600) {
  const raw = item.contentSnippet || item.summary || item['content:encoded'] || '';
  const cleaned = raw
    .replace(/<[^>]+>/g, '')
    .replace(/LIRE\s*(L['']ARTICLE|\[\.\.\.?\]|LA SUITE)?/gi, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  const cut = cleaned.slice(0, maxLen);
  const last = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return last > 80 ? cut.slice(0, last + 1) : cut + '…';
}

// ─── Extraction image ──────────────────────────────────────────────────────────
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

// ─── Translation via Claude Haiku ─────────────────────────────────────────────
const translationCache = new Map();
const MAX_CACHE = 2000;

async function translateToFR(text, fromLang) {
  if (!text || text.length < 10) return text || '';
  const cacheKey = `${fromLang}:${text.slice(0, 60)}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

  const langLabel = fromLang === 'ar' ? 'arabe' : 'anglais';
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Traduis ce texte médical de l'${langLabel} vers le français. Réponds uniquement avec la traduction, sans aucun commentaire ni explication :\n\n${text.slice(0, 800)}`,
      }],
    });
    const translated = resp.content[0].text.trim();
    if (translationCache.size >= MAX_CACHE) {
      const firstKey = translationCache.keys().next().value;
      translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, translated);
    return translated;
  } catch {
    return text;
  }
}

// ─── Publication queue — 20 articles / sec (AR pre-translated before queuing) ──
const publicationQueue = [];
let isPublishing = false;

async function processPublicationQueue() {
  if (isPublishing || publicationQueue.length === 0 || !supabase) return;
  isPublishing = true;
  try {
    const batch = publicationQueue.splice(0, 20);
    const { error } = await supabase
      .from('actualites')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
    if (error) console.error('[QUEUE] Supabase error:', error.message);
    else console.log(`[QUEUE] Published ${batch.length} — ${publicationQueue.length} remaining`);
  } catch (e) {
    console.error('[QUEUE] Error:', e.message);
  } finally {
    isPublishing = false;
  }
}

setInterval(processPublicationQueue, 1000);

// ─── Cleanup: delete articles > 45 days ───────────────────────────────────────
async function cleanupOldArticles() {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('actualites').delete().lt('date_publication', cutoff);
    console.log(`[CLEANUP] Removed articles older than 45 days`);
  } catch (e) {
    console.error('[CLEANUP]', e.message);
  }
}

setInterval(cleanupOldArticles, 24 * 60 * 60 * 1000);

// ─── Cache mémoire ─────────────────────────────────────────────────────────────
let newsCache = { articles: [], fetchedAt: 0 };
const CACHE_TTL = 2 * 60 * 60 * 1000;

// ─── Fetch all RSS sources ─────────────────────────────────────────────────────
async function fetchLiveNews() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const parsed = await rssParser.parseURL(feed.url);
      return { feed, items: parsed.items || [] };
    })
  );

  // Log which feeds succeeded / failed
  RSS_FEEDS.forEach((feed, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') console.log(`[RSS] OK  (${r.value.items.length} items) ${feed.source}`);
    else console.log(`[RSS] FAIL ${feed.source} — ${r.reason?.message || r.reason}`);
  });

  const collected = [];
  const seenIds = new Set();

  for (const prio of [1, 2, 3]) {
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { feed, items } = r.value;
      if (feed.priority !== prio) continue;
      const limit = feed.limit ?? 10;

      for (const item of items.slice(0, limit)) {

        const titleText  = (item.title || '').trim();
        const contentText = extractContent(item);
        const combinedText = `${titleText} ${contentText}`;

        if (!feed.medicalOnly && !isMedical(combinedText, feed.lang)) continue;

        const id = `rss-${crypto.createHash('md5').update(
          item.link || item.guid || titleText || String(Date.now())
        ).digest('hex').slice(0, 20)}`;

        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const article = {
          id,
          titre:            titleText,
          contenu:          contentText,
          source:           feed.source,
          categorie:        detectCategorie(combinedText, feed.lang),
          date_publication: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          image_url:        extractImage(item),
          link:             item.link || item.guid || null,
          langue_source:    feed.lang,
          est_traduit:      false,
        };

        // Set multilingual fields based on source language
        if (feed.lang === 'fr') {
          article.titre_fr   = titleText;
          article.contenu_fr = contentText;
        } else if (feed.lang === 'en') {
          article.titre_en   = titleText;
          article.contenu_en = contentText;
          article._lang      = 'en'; // Signal: needs translation
        } else if (feed.lang === 'ar') {
          article.titre_ar   = titleText;
          article.contenu_ar = contentText;
          article._lang      = 'ar'; // Signal: needs translation
        }

        collected.push(article);
      }
    }
  }

  return collected;
}

// ─── Static fallback ───────────────────────────────────────────────────────────
const STATIC_ARTICLES = [
  { id: 's1', titre: 'Nouvelles recommandations HTA 2025 — ESC/ESH', titre_fr: 'Nouvelles recommandations HTA 2025 — ESC/ESH', contenu: "Les sociétés savantes ESC/ESH publient de nouvelles lignes directrices pour la prise en charge de l'hypertension artérielle, avec un seuil abaissé à 130/80 mmHg.", contenu_fr: "Les sociétés savantes ESC/ESH publient de nouvelles lignes directrices pour la prise en charge de l'hypertension artérielle, avec un seuil abaissé à 130/80 mmHg.", source: 'ESC/ESH 2025', categorie: 'Cardiologie', date_publication: new Date().toISOString(), image_url: null, link: null, langue_source: 'fr', est_traduit: false },
  { id: 's2', titre: 'Résistance aux antibiotiques en Algérie — Alerte MSPRH', titre_fr: 'Résistance aux antibiotiques en Algérie — Alerte MSPRH', contenu: 'Une étude nationale révèle une augmentation de 34% de la résistance aux céphalosporines de 3ème génération dans les infections urinaires nosocomiales.', contenu_fr: 'Une étude nationale révèle une augmentation de 34% de la résistance aux céphalosporines de 3ème génération dans les infections urinaires nosocomiales.', source: 'MSPRH 2025', categorie: 'Infectiologie', date_publication: new Date(Date.now() - 86400000).toISOString(), image_url: null, link: null, langue_source: 'fr', est_traduit: false },
  { id: 's3', titre: 'Vaccin antipneumococcique intégré au calendrier national', titre_fr: 'Vaccin antipneumococcique intégré au calendrier national', contenu: "Le ministère de la santé annonce l'intégration du vaccin PCV13 dans le calendrier vaccinal national pour les nourrissons de moins de 2 ans.", contenu_fr: "Le ministère de la santé annonce l'intégration du vaccin PCV13 dans le calendrier vaccinal national pour les nourrissons de moins de 2 ans.", source: 'MSPRH', categorie: 'Vaccination', date_publication: new Date(Date.now() - 2 * 86400000).toISOString(), image_url: null, link: null, langue_source: 'fr', est_traduit: false },
  { id: 's4', titre: 'Diabète type 2 : les inhibiteurs SGLT2 en 2025', titre_fr: 'Diabète type 2 : les inhibiteurs SGLT2 en 2025', contenu: 'Nouvelles preuves confirmant les bénéfices cardiovasculaires et rénaux des inhibiteurs SGLT2. Les recommandations ADA 2025 les positionnent en deuxième ligne après la metformine.', contenu_fr: 'Nouvelles preuves confirmant les bénéfices cardiovasculaires et rénaux des inhibiteurs SGLT2. Les recommandations ADA 2025 les positionnent en deuxième ligne après la metformine.', source: 'ADA 2025', categorie: 'Diabétologie', date_publication: new Date(Date.now() - 3 * 86400000).toISOString(), image_url: null, link: null, langue_source: 'fr', est_traduit: false },
  { id: 's5', titre: 'IA diagnostique : performances égales aux radiologues', titre_fr: 'IA diagnostique : performances égales aux radiologues', contenu: 'Une méta-analyse publiée dans The Lancet Digital Health confirme que les modèles d\'IA atteignent une sensibilité de 94% pour la détection du cancer du poumon sur TDM thoracique.', contenu_fr: 'Une méta-analyse publiée dans The Lancet Digital Health confirme que les modèles d\'IA atteignent une sensibilité de 94% pour la détection du cancer du poumon sur TDM thoracique.', source: 'The Lancet', categorie: 'Radiologie', date_publication: new Date(Date.now() - 4 * 86400000).toISOString(), image_url: null, link: null, langue_source: 'fr', est_traduit: false },
  { id: 's6', titre: 'Dépistage cancer du col utérin : passage au test HPV', titre_fr: 'Dépistage cancer du col utérin : passage au test HPV', contenu: 'Le programme national de dépistage envisage de remplacer le frottis cervico-vaginal par le test HPV-HR. Sensibilité supérieure (94% vs 72%) et intervalle allongé à 5 ans.', contenu_fr: 'Le programme national de dépistage envisage de remplacer le frottis cervico-vaginal par le test HPV-HR. Sensibilité supérieure (94% vs 72%) et intervalle allongé à 5 ans.', source: 'MSPRH / OMS', categorie: 'Gynécologie', date_publication: new Date(Date.now() - 5 * 86400000).toISOString(), image_url: null, link: null, langue_source: 'fr', est_traduit: false },
  { id: 's7', titre: 'AVC ischémique : fenêtre de thrombolyse élargie à 4h30', titre_fr: 'AVC ischémique : fenêtre de thrombolyse élargie à 4h30', contenu: "Les nouvelles recommandations ESO 2025 élargissent la fenêtre thérapeutique et permettent la thrombectomie mécanique jusqu'à 24h pour les patients sélectionnés.", contenu_fr: "Les nouvelles recommandations ESO 2025 élargissent la fenêtre thérapeutique et permettent la thrombectomie mécanique jusqu'à 24h pour les patients sélectionnés.", source: 'ESO 2025', categorie: 'Neurologie', date_publication: new Date(Date.now() - 6 * 86400000).toISOString(), image_url: null, link: null, langue_source: 'fr', est_traduit: false },
  { id: 's8', titre: 'BPCO : recommandations GOLD 2025 actualisées', titre_fr: 'BPCO : recommandations GOLD 2025 actualisées', contenu: 'Les recommandations GOLD 2025 introduisent une nouvelle classification basée sur les symptômes et le risque d\'exacerbations pour guider le traitement pharmacologique de la BPCO.', contenu_fr: 'Les recommandations GOLD 2025 introduisent une nouvelle classification basée sur les symptômes et le risque d\'exacerbations pour guider le traitement pharmacologique de la BPCO.', source: 'GOLD 2025', categorie: 'Pneumologie', date_publication: new Date(Date.now() - 7 * 86400000).toISOString(), image_url: null, link: null, langue_source: 'fr', est_traduit: false },
];

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'El Hakim Backend OK',
    apiKey:    !!process.env.ANTHROPIC_API_KEY    ? 'SET' : 'MISSING',
    supabase:  !!process.env.SUPABASE_URL          ? 'SET' : 'MISSING',
    queue:     `${publicationQueue.length} articles pending`,
    newsCache: newsCache.articles.length > 0
      ? `${newsCache.articles.length} articles (${Math.round((Date.now() - newsCache.fetchedAt) / 60000)}min ago)`
      : 'empty',
  });
});

// ─── Claude chat (legacy non-streaming) ────────────────────────────────────────
app.post('/api/claude/chat', async (req, res) => {
  try {
    const { messages, system, systemPrompt } = req.body;
    const sysMsg = system ?? systemPrompt ?? 'Tu es El Hakim, un assistant médical expert pour les médecins algériens.';
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: sysMsg + ' Sois CONCIS : maximum 3-4 phrases ou 5 points. Pas d\'introduction ni de conclusion.',
      messages,
    });
    res.json({ content: response.content[0].text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Claude chat streaming (SSE) ───────────────────────────────────────────────
app.post('/api/claude/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const { messages, system, plan } = req.body;
  const sysMsg = system ?? 'Tu es El Hakim, un assistant médical expert pour les médecins algériens.';
  // Model selection by plan (Haiku for standard, Sonnet for paid plans)
  const model = (plan === 'argent' || plan === 'premium')
    ? 'claude-sonnet-4-6'
    : 'claude-haiku-4-5-20251001';

  try {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 1500,
      system: sysMsg,
      messages,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// ─── Claude image analysis ─────────────────────────────────────────────────────
app.post('/api/claude/analyze-image', async (req, res) => {
  try {
    const { image, base64, mediaType, prompt } = req.body;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image ?? base64 } },
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
    const ext  = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';
    const path = `${senderId}/${Date.now()}_${fileName ?? `media.${ext}`}`;
    const { error } = await supabase.storage.from('chat-media').upload(path, Buffer.from(base64, 'base64'), { contentType: mimeType });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    res.json({ url: urlData.publicUrl, path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── News médicales ────────────────────────────────────────────────────────────
app.get('/api/news/medical', async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  const now = Date.now();

  if (!forceRefresh && now - newsCache.fetchedAt < CACHE_TTL && newsCache.articles.length > 0) {
    return res.json(newsCache.articles);
  }

  try {
    const live = await fetchLiveNews();
    // Strip internal _lang flag before sending to clients
    const clean = live.map(a => { const c = { ...a }; delete c._lang; return c; });
    const combined = [...clean, ...STATIC_ARTICLES];
    const seen = new Set();
    const deduped = combined.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
    newsCache = { articles: deduped, fetchedAt: now };
    console.log(`[API] News: ${live.length} live + ${STATIC_ARTICLES.length} static = ${deduped.length} total`);
    res.json(deduped);
  } catch (e) {
    console.error('[API] News error:', e.message);
    res.json(newsCache.articles.length > 0 ? newsCache.articles : STATIC_ARTICLES);
  }
});

// ─── Force refresh ─────────────────────────────────────────────────────────────
app.post('/api/news/refresh', async (req, res) => {
  newsCache = { articles: [], fetchedAt: 0 };
  res.json({ ok: true });
});

// ─── Cron: fetch RSS → publication queue every 30 min ─────────────────────────
async function cronFetchAndEnqueue() {
  if (!supabase) return;
  try {
    const live = await fetchLiveNews();
    console.log(`[CRON] fetchLiveNews returned ${live.length} articles`);
    if (live.length === 0) {
      console.log('[CRON] No RSS articles fetched — all feeds may be unavailable');
      return;
    }

    // Check which IDs already exist in Supabase (avoid re-queuing)
    const ids = live.map(a => a.id);
    const { data: existing, error: selectErr } = await supabase
      .from('actualites')
      .select('id')
      .in('id', ids);
    if (selectErr) console.warn('[CRON] ID-check error (non-fatal):', selectErr.message);
    const existingIds = new Set((existing ?? []).map(r => r.id));
    console.log(`[CRON] ${existingIds.size} already in DB, ${live.length - existingIds.size} new`);

    // Only queue articles not yet in DB
    const newArticles = live.filter(a => !existingIds.has(a.id));

    if (newArticles.length === 0) {
      console.log(`[CRON] No new articles — pool is up to date`);
    } else {
      // FR articles → publish immediately (no translation needed)
      const frArticles = newArticles.filter(a => !a._lang);
      const arArticles = newArticles.filter(a => a._lang === 'ar');

      if (frArticles.length > 0) {
        const clean = frArticles.map(a => { const c = { ...a }; delete c._lang; return c; });
        const { error } = await supabase.from('actualites').upsert(clean, { onConflict: 'id', ignoreDuplicates: true });
        if (error) console.error('[CRON] FR error:', error.message);
        else console.log(`[CRON] Published ${frArticles.length} FR immediately`);
      }

      // AR articles → publier en arabe natif (pas de traduction)
      if (arArticles.length > 0) {
        const clean = arArticles.map(a => { const c = { ...a }; delete c._lang; return c; });
        const { error } = await supabase.from('actualites').upsert(clean, { onConflict: 'id', ignoreDuplicates: true });
        if (error) console.error('[CRON] AR error:', error.message);
        else console.log(`[CRON] Published ${arArticles.length} AR articles immediately`);
      }
    }

    // Update memory cache (without internal flags)
    const clean = live.map(a => { const c = { ...a }; delete c._lang; return c; });
    const combined = [...clean, ...STATIC_ARTICLES];
    const seen = new Set();
    newsCache = {
      articles: combined.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; }),
      fetchedAt: Date.now(),
    };
  } catch (e) {
    console.error('[CRON] Error:', e.message);
  }
}

// Startup sequence — delay 45s to let PostgREST finish reloading its schema cache
cleanupOldArticles();
setTimeout(async () => {
  console.log('[CRON] Starting initial fetch...');
  await cronFetchAndEnqueue();
}, 45000);
setInterval(cronFetchAndEnqueue, 12 * 60 * 60 * 1000); // Every 12h

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`El Hakim Backend running on port ${PORT}`));

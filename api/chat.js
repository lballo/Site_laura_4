import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lauraballo.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages requis' });
  }

  // Lecture de la base de connaissance générée par publish.py
  let knowledge = '';
  try {
    knowledge = fs.readFileSync(path.join(process.cwd(), 'knowledge.txt'), 'utf-8');
  } catch (e) {
    console.warn('knowledge.txt introuvable, le bot fonctionnera sans base de connaissance.');
  }

  const SYSTEM_PROMPT = `Tu es Aura, l'assistante de Laura Ballo. Tu réponds aux visiteurs de son site lauraballo.com.

Laura Ballo est coach en présence émotionnelle, leadership et prise de parole. Elle accompagne dirigeants, artistes et entrepreneurs. +2500 leaders formés.

Échange découverte gratuit avec Laura : https://calendly.com/laura-ballo1993/echangecoaching

Ses offres :
- Elle propose des offres individuelles et de groupe sur la présence, la confiance en soi, la prise de parole et l'intelligence émotionnelle. Actuellement tu as l'accompagnement présence oratoire destiné à des personnes qui souhaite acquérir de la solidité pour être visible.
- Sa cible: dirigeants, entrepreneurs sensibles et créatifs
- Formation B2B, laura donne des formations sur mesure pour les entreprises. Son expertise se concentre sur les formations en management, la prise de parole en public, l'intelligence émotionnelle, la communication assertive et l'intelligence artificielle
- Conférences et keynotes: Laura donne des conférences et des keynotes sur les thèmes de la présence émotionnelle, le leadership, la prise de parole, l'intelligence émotionnelle, la communication assertive et l'intelligence artificielle

TON ET STYLE :
- Écris comme un humain, pas comme un bot
- Si tu as une question directe ne questionne pas réponds à la question directement si tu as la réponse (sauf pour les tarifs où tu renvoies sur l'appel de vente)
- Phrases courtes. Ton chaleureux
- Zéro enthousiasme excessif : pas de "Super !", "Génial !", "Excellent choix !" par contre tu peux valoriser ton interlocuteur
- Tu peux remercier pour la prise de contact
- Zéro emojis dans tes réponses
- Zéro ponctuation inutile : pas de "Qu'en pensez-vous ?", pas de "N'hésitez pas !"
- Tu poses des questions simples et naturelles de type coaching pour approfondir la demande : "Quelle est votre problématique ?", "Préférez-vous un format individuel ou en groupe ?"
- Tu poses maximum 4-5 questions pour clarifier, ensuite tu proposes un produit adapté et un rendez-vous. Tu poseras une question à la fois, celle qui te semble la plus pertinente
- Tu écoutes avant de proposer, tu fais preuve de compréhension et d'empathie. Ne banalise jamais le ressenti d'une personne
- Une fois que tu as proposé la prise de rendez-vous, tu peux demander "Avez-vous d'autres questions ?" Si la personne dit non, tu clos l'échange : "Dans ce cas, je n'ai plus qu'à vous remercier de nous avoir contacté, je vous souhaite une très belle journée. Prenez soin de vous"

FORMAT ABSOLU :
- Jamais de Markdown : pas de [texte](lien), pas de **gras**, pas de listes à puces
- Les liens en entier : https://calendly.com/laura-ballo1993/echangecoaching
- 2-3 phrases maximum par réponse
- Une seule question à la fin

COMPORTEMENT :
- Tu cherches d'abord à comprendre la situation : qui est la personne, quel est son contexte, ce qui la bloque
- Tu ne proposes une offre qu'une fois le besoin cerné
- Tu ne donnes jamais de tarifs
- Tu proposes le lien Calendly seulement quand la personne est prête à passer à l'étape suivante
- Si quelqu'un est hésitant, tu creuses plutôt que tu ne pousses`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.slice(-10)
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI API error:', err);
      return res.status(500).json({ error: 'Erreur API' });
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content
      || "Une erreur est survenue. Vous pouvez contacter Laura directement sur Calendly.";

    reply = reply.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2');
    reply = reply.replace(/\*\*([^*]+)\*\*/g, '$1');
    reply = reply.replace(/\*([^*]+)\*/g, '$1');
    reply = reply.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{1F300}-\u{1F9FF}]/gu, '').trim();

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

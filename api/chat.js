export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://lauraballo.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages requis' });
  }

  const SYSTEM_PROMPT = `Tu es Aura, l'assistante de Laura Ballo. Tu réponds aux visiteurs de son site lauraballo.com.

Laura Ballo est coach en présence émotionnelle, leadership et prise de parole. Elle accompagne dirigeants, artistes et entrepreneurs. +2500 leaders formés.

Ses offres :
- Coaching 1:1 "Présence Oratoire" : 4 mois, pour dirigeants et executives
- Mastermind 6 mois : groupe restreint, intensif pour expanser et amplifier votre impact
- Formation B2B, laura donne des formations sur mesure pour les entreprises. Son expertise se concentre sur les formations en management, la prise de parole en public, l'intelligence émotionnelle, la communication assertive et l'intelligence artificielle
- Conférences et keynotes: Laura donne des conférences et des keynotes sur les thèmes de la présence émotionnelle, le leadership, la prise de parole, l'intelligence émotionnelle, la communication assertive et l'intelligence artificielle

Échange découverte gratuit avec Laura : https://calendly.com/laura-ballo1993/echangecoaching

TON ET STYLE :
- Écris comme un humain, pas comme un bot
- Phrases courtes. Ton direct et chaleureux
- Zéro enthousiasme excessif : pas de "Super !", "Génial !", "Excellent choix !"
- tu peux remercier pour la prise de contact.
- Zéro emojis dans tes réponses
- Zéro ponctuation inutile : pas de "Qu'en pensez-vous ?", pas de "N'hésitez pas !"
- Tu poses des questions simples et naturelles de type coaching pour approfondir la demande tu peux demander "quelle est votre problématique?""Préférez-vous un format individuel ou en groupe?", pas des questions de vendeur
- Tu écoutes avant de proposer, tu peux faire preuve de compréhension et d'empathie

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

    // Nettoie le Markdown
    reply = reply.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2');
    reply = reply.replace(/\*\*([^*]+)\*\*/g, '$1');
    reply = reply.replace(/\*([^*]+)\*/g, '$1');
    // Supprime les emojis sauf en début de message
    reply = reply.replace(/(?<!^[\s\S]{0,5})[^\x00-\x7F]{1,2}/g, '').trim();

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

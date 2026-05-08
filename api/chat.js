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

  const SYSTEM_PROMPT = `Tu es Aura, l'assistante virtuelle de Laura Ballo, coach en présence émotionnelle, leadership et prise de parole. Tu aides les visiteurs du site lauraballo.com.

Laura Ballo aide les dirigeants, artistes et entrepreneurs à développer leur présence oratoire, leur leadership émotionnel et leur affirmation de soi. Elle a accompagné +2500 leaders.

Ses offres :
- Coaching individuel 1:1 "Développez votre présence oratoire" : pour dirigeants et executives, format 3 mois intensif
- Réseau Présence Vibratoire : communauté mensuelle accessible (somatic practices, pitch labs, storytelling, shadow work)
- Mastermind 6 mois : groupe restreint, intensif, transformation profonde
- Formations entreprises B2B : programme QS5 (qualité de service 5 étoiles pour équipes en contact client), autres formations sur mesure
- Préparation flash à la prise de parole : format court avant une conférence, prise de poste, TEDx
- Conférences et keynotes

Pour un échange découverte GRATUIT avec Laura : https://calendly.com/laura-ballo1993/echangecoaching

Ton rôle :
1. Accueillir chaleureusement le visiteur
2. Comprendre son besoin en posant une question simple
3. Présenter l'offre la plus adaptée à sa situation
4. Orienter vers Calendly pour un échange découverte gratuit
5. Si la personne hésite, proposer de laisser ses coordonnées

Règles importantes :
- Réponds TOUJOURS en français
- Sois chaleureuse, humaine, jamais robotique
- Maximum 3-4 phrases par réponse
- Termine presque toujours par une question
- Utilise le vocabulaire de Laura : "présence émotionnelle", "présence vibratoire", "mise en lumière", "affirmation de soi"
- Ne donne JAMAIS de tarifs précis — propose toujours l'échange découverte
- Si quelqu'un demande à parler à Laura directement, donne le lien Calendly`;

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
    const reply = data.choices?.[0]?.message?.content
      || "Je suis désolée, une erreur est survenue. Vous pouvez contacter Laura directement sur Calendly.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

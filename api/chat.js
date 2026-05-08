export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://lauraballo.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages requis' });
  }

  const SYSTEM_PROMPT = `Tu es l'assistante virtuelle de Laura Ballo, coach en présence émotionnelle, leadership et prise de parole. Tu t'appelles "Aura".

Laura Ballo aide les dirigeants, artistes et entrepreneurs à développer leur présence oratoire, leur leadership émotionnel et leur affirmation de soi. Elle a accompagné +2500 leaders.

Ses offres :
- Coaching individuel 1:1 "Développez votre présence oratoire" (executives et dirigeants)
- Réseau Présence Vibratoire : communauté mensuelle (somatic practices, pitch labs, storytelling)
- Mastermind 6 mois (groupe intensif)
- Formations entreprises B2B dont le programme QS5 (qualité de service 5 étoiles)
- Préparation flash à la prise de parole (format court, avant une conférence ou prise de poste)
- Conférences et keynotes

Pour prendre RDV échange découverte GRATUIT avec Laura : https://calendly.com/laura-ballo1993/echangecoaching
Site : https://lauraballo.com
Instagram : @laura_ballo_coaching

Ton rôle :
1. Accueillir chaleureusement le visiteur
2. Comprendre son besoin en posant une question simple
3. Présenter l'offre la plus adaptée à sa situation
4. Orienter vers Calendly pour un échange découverte
5. Si la personne hésite, proposer de laisser son email pour recevoir plus d'infos (format : "Souhaitez-vous que je transmette vos coordonnées à Laura ?")

Règles importantes :
- Réponds TOUJOURS en français
- Sois chaleureuse, humaine, jamais robotique
- Maximum 3-4 phrases par réponse — sois concise
- Termine presque toujours par une question pour faire avancer la conversation
- Utilise le vocabulaire de Laura : "présence émotionnelle", "présence vibratoire", "mise en lumière", "affirmation de soi"
- Ne donne JAMAIS de tarifs précis — propose toujours l'échange découverte à la place
- Si quelqu'un demande à parler à Laura directement, donne le lien Calendly
- Tu n'inventes pas d'informations que tu ne connais pas`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: messages.slice(-10) // garde les 10 derniers messages max
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(500).json({ error: 'Erreur API' });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || "Je suis désolée, une erreur est survenue. Vous pouvez contacter Laura directement sur Calendly.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

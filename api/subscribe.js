export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', 'https://lauraballo.com');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

    // Variables d'environnement Vercel
    const apiKey = process.env.CONVERTKIT_API_KEY;
    const formId = process.env.CONVERTKIT_FORM_ID;

    if (!apiKey || !formId) {
        return res.status(500).json({ error: 'Configuration manquante' });
    }

    const { email, first_name, fields } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email requis' });
    }

    try {
        const response = await fetch(
            `https://api.convertkit.com/v3/forms/${formId}/subscribe`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey, email, first_name, fields })
            }
        );

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Erreur serveur' });
    }
}
